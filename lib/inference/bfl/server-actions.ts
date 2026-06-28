import 'server-only';

import { Buffer } from 'node:buffer';

import { getOptionalEnv, getOptionalPositiveIntEnv } from '@/lib/utils/env';

import { BFL_PROVIDER_ID, type BflModelConfig } from './family';
import { resolveBflModelConfig } from './models';
import { assertBflSemanticParams } from './semantic-lady';
import type {
  InferenceByokParams,
  InferenceProvider,
  InferenceRequest,
  InferenceResult,
} from '../types';

const DEFAULT_BFL_BASE_URL = 'https://api.bfl.ai';
const POLL_INTERVAL_MS = 1_500;
const DEFAULT_POLL_TIMEOUT_MS = 45_000;
const POLL_TIMEOUT_MS =
  getOptionalPositiveIntEnv('INFERENCE_POLL_TIMEOUT_MS') ??
  DEFAULT_POLL_TIMEOUT_MS;
const REQUEST_TIMEOUT_MS = 20_000;
const BFL_SAMPLE_URL_TTL_MS = 10 * 60 * 1000;
const DEFAULT_BFL_SAFETY_TOLERANCE = 2;
const MAX_BFL_IMAGE_PROMPT_BYTES = 10 * 1024 * 1024;

type BflRequestParams = {
  guidance?: number;
  height?: number;
  imagePrompt?: string;
  imagePromptStrength?: number;
  moderation?: boolean;
  promptExtend?: boolean;
  raw?: boolean;
  seed?: number;
  steps?: number;
  width?: number;
};

type BflSubmitResponse = {
  id?: string;
  polling_url?: string;
};

type BflPollResponse = {
  status: string;
  result?: { sample?: string };
};

export function isBflConfigured() {
  return Boolean(readBflApiKey());
}

export function createBflProvider(): InferenceProvider {
  const apiKey = requireBflApiKey();
  const baseUrl = resolveBflBaseUrl();

  return {
    id: BFL_PROVIDER_ID,
    label: 'Black Forest Labs',
    submitPolicy: { maxSubmitAttemptsWithoutProviderId: 2 },
    extractProviderGenerationId(metadata) {
      const value = metadata.bfl_request_id;

      return typeof value === 'string' && value.length > 0 ? value : null;
    },
    prepareRequest({ formData, request }) {
      const modelConfig = resolveBflModelConfig(request.model);
      const params = readBflParamsFromFormData(formData, modelConfig);
      const preparedRequest = {
        ...request,
        byokParams: params,
        outputFormat: includesString(
          modelConfig.outputFormats,
          request.outputFormat,
        )
          ? request.outputFormat
          : (modelConfig.outputFormats[0] ?? request.outputFormat),
        ratio: modelConfig.ratios.includes(request.ratio)
          ? request.ratio
          : modelConfig.defaultRatio,
        resolution: modelConfig.defaultResolution,
      };
      const resolvedParams = resolveBflParams(params, modelConfig);
      const semanticParams = createBflSemanticParams(
        preparedRequest,
        resolvedParams,
        modelConfig,
      );

      assertBflSemanticParams(request.model, semanticParams);
      assertBflRequestMatchesModelConfig(
        preparedRequest,
        modelConfig,
        resolvedParams,
      );

      return {
        inputImageLimit: modelConfig.inputImageLimit,
        inputVideoLimit: modelConfig.inputVideoLimit,
        request: preparedRequest,
      };
    },
    async generate(
      request: InferenceRequest,
      options,
    ): Promise<InferenceResult> {
      const modelConfig = resolveBflModelConfig(request.model);
      const params = resolveBflParams(request.byokParams, modelConfig);
      const semanticParams = createBflSemanticParams(
        request,
        params,
        modelConfig,
      );

      assertBflSemanticParams(request.model, semanticParams);
      assertBflRequestMatchesModelConfig(request, modelConfig, params);

      const resumeRequestId = options?.providerGenerationId ?? null;

      if (resumeRequestId) {
        const pollingUrl = resolveBflResumePollingUrl(
          baseUrl,
          resumeRequestId,
          options?.resumeMetadata,
        );
        const bflMetadata = createBflMetadata({
          modelConfig,
          params,
          pollingUrl,
          request,
          requestId: resumeRequestId,
          resumed: true,
        });

        await options?.onStarted?.(bflMetadata);

        const polled = await pollBfl(pollingUrl, apiKey);
        const remoteUrl = firstBflOutput(polled);

        return {
          providerId: BFL_PROVIDER_ID,
          remoteUrl,
          contentType: contentTypeForBflOutputFormat(request.outputFormat),
          metadata: {
            ...bflMetadata,
            bfl_remote_url: remoteUrl,
            bfl_remote_url_expires_at: new Date(
              Date.now() + BFL_SAMPLE_URL_TTL_MS,
            ).toISOString(),
            bfl_status: polled.status,
          },
        };
      }

      await options?.onPreSubmit?.({
        sherin_model_id: request.model,
        sherin_provider: BFL_PROVIDER_ID,
        sherin_stage: 'provider_submitting',
        bfl_model_endpoint: modelConfig.providerModel,
      });

      const submitResponse = await fetch(
        `${baseUrl}/v1/${encodeURIComponent(modelConfig.providerModel)}`,
        {
          method: 'POST',
          headers: bflHeaders(apiKey),
          body: JSON.stringify(
            createBflRequestBody(request, modelConfig, params),
          ),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      if (!submitResponse.ok) {
        throw await buildBflHttpError('BFL request', submitResponse);
      }

      const submitJson = (await submitResponse.json()) as BflSubmitResponse;

      if (!submitJson.id) {
        throw new Error('BFL response did not include an id.');
      }

      const pollingUrl = validateBflPollingUrl(submitJson.polling_url);

      if (!pollingUrl) {
        throw new Error('BFL response did not include a polling_url.');
      }

      const bflMetadata = createBflMetadata({
        modelConfig,
        params,
        pollingUrl,
        request,
        requestId: submitJson.id,
        resumed: false,
      });

      await options?.onStarted?.(bflMetadata);

      const polled = await pollBfl(pollingUrl, apiKey);
      const remoteUrl = firstBflOutput(polled);

      return {
        providerId: BFL_PROVIDER_ID,
        remoteUrl,
        contentType: contentTypeForBflOutputFormat(request.outputFormat),
        metadata: {
          ...bflMetadata,
          bfl_remote_url: remoteUrl,
          bfl_remote_url_expires_at: new Date(
            Date.now() + BFL_SAMPLE_URL_TTL_MS,
          ).toISOString(),
          bfl_status: polled.status,
        },
      };
    },
  };
}

function readBflParamsFromFormData(
  formData: FormData,
  config: BflModelConfig,
): InferenceRequest['byokParams'] {
  const params: InferenceRequest['byokParams'] = {};

  if (hasBflSchemaField(config, 'generation_guidance')) {
    assignNumberParam(
      params,
      'generation_guidance',
      firstFormValue(formData, ['generation_guidance', 'byok_guidance_scale']),
    );
  }

  if (hasBflSchemaField(config, 'generation_height')) {
    assignNumberParam(
      params,
      'generation_height',
      firstFormValue(formData, ['generation_height', 'byok_height']),
    );
  }

  assignBase64ImagePromptParam(
    params,
    firstFormValue(formData, ['byok_image_prompt', 'generation_image_prompt']),
  );

  if (hasBflSchemaField(config, 'generation_image_prompt_strength')) {
    assignNumberParam(
      params,
      'generation_image_prompt_strength',
      formData.get('generation_image_prompt_strength'),
    );
  }

  if (hasBflSchemaField(config, 'generation_moderation')) {
    const moderation = readOptionalBoolean(
      formData.get('generation_moderation'),
    );

    if (moderation !== undefined) {
      params.generation_moderation = moderation;
    }
  }

  if (hasBflSchemaField(config, 'generation_prompt_extend')) {
    const promptExtend = readOptionalBoolean(
      firstFormValue(formData, [
        'generation_prompt_extend',
        'byok_prompt_upsampling',
      ]),
    );

    if (promptExtend !== undefined) {
      params.generation_prompt_extend = promptExtend;
    }
  }

  if (hasBflSchemaField(config, 'generation_raw')) {
    const raw = readOptionalBoolean(
      firstFormValue(formData, ['generation_raw', 'byok_raw']),
    );

    if (raw !== undefined) {
      params.generation_raw = raw;
    }
  }

  if (hasBflSchemaField(config, 'generation_seed')) {
    assignNumberParam(
      params,
      'generation_seed',
      firstFormValue(formData, ['generation_seed', 'byok_seed']),
    );
  }

  if (hasBflSchemaField(config, 'generation_steps')) {
    assignNumberParam(
      params,
      'generation_steps',
      firstFormValue(formData, [
        'generation_steps',
        'byok_num_inference_steps',
      ]),
    );
  }

  if (hasBflSchemaField(config, 'generation_width')) {
    assignNumberParam(
      params,
      'generation_width',
      firstFormValue(formData, ['generation_width', 'byok_width']),
    );
  }

  return params;
}

function resolveBflParams(
  params: InferenceByokParams,
  config: BflModelConfig,
): BflRequestParams {
  return {
    guidance: hasBflSchemaField(config, 'generation_guidance')
      ? readOptionalNumber(params.generation_guidance)
      : undefined,
    height: hasBflSchemaField(config, 'generation_height')
      ? (readOptionalNumber(params.generation_height) ??
        numberDefault(fieldByName(config, 'generation_height')))
      : undefined,
    imagePrompt: readOptionalBase64ImagePrompt(params.imagePrompt),
    imagePromptStrength: hasBflSchemaField(
      config,
      'generation_image_prompt_strength',
    )
      ? readOptionalNumber(params.generation_image_prompt_strength)
      : undefined,
    moderation: hasBflSchemaField(config, 'generation_moderation')
      ? readOptionalBoolean(params.generation_moderation)
      : undefined,
    promptExtend: hasBflSchemaField(config, 'generation_prompt_extend')
      ? (readOptionalBoolean(params.generation_prompt_extend) ??
        booleanDefault(fieldByName(config, 'generation_prompt_extend')) ??
        false)
      : undefined,
    raw: hasBflSchemaField(config, 'generation_raw')
      ? (readOptionalBoolean(params.generation_raw) ?? false)
      : undefined,
    seed: hasBflSchemaField(config, 'generation_seed')
      ? readOptionalNumber(params.generation_seed)
      : undefined,
    steps: hasBflSchemaField(config, 'generation_steps')
      ? readOptionalNumber(params.generation_steps)
      : undefined,
    width: hasBflSchemaField(config, 'generation_width')
      ? (readOptionalNumber(params.generation_width) ??
        numberDefault(fieldByName(config, 'generation_width')))
      : undefined,
  };
}

function hasBflSchemaField(config: BflModelConfig, name: string) {
  return config.schema.some((field) => field.name === name);
}

function fieldByName(config: BflModelConfig, name: string) {
  return config.schema.find((field) => field.name === name);
}

function createBflRequestBody(
  request: InferenceRequest,
  config: BflModelConfig,
  params: BflRequestParams,
) {
  const body: Record<string, unknown> = {
    output_format: request.outputFormat,
    prompt: request.prompt,
    safety_tolerance: safetyToleranceForBflRequest(config, params),
  };

  if (hasBflSchemaField(config, 'generation_aspect_ratio')) {
    body.aspect_ratio = request.ratio;
  }

  if (hasBflSchemaField(config, 'generation_width')) {
    body.width = params.width;
  }

  if (hasBflSchemaField(config, 'generation_height')) {
    body.height = params.height;
  }

  if (params.seed !== undefined) {
    body.seed = params.seed;
  }

  if (params.imagePromptStrength !== undefined) {
    body.image_prompt_strength = params.imagePromptStrength;
  }

  if (params.promptExtend !== undefined) {
    body.prompt_upsampling = params.promptExtend;
  }

  if (params.guidance !== undefined) {
    body.guidance = params.guidance;
  }

  if (params.steps !== undefined) {
    body.steps = params.steps;
  }

  if (params.raw !== undefined) {
    body.raw = params.raw;
  }

  if (params.imagePrompt !== undefined) {
    body.image_prompt = params.imagePrompt;
  }

  assignBflInputFiles(body, request, config);

  return body;
}

function assignBflInputFiles(
  body: Record<string, unknown>,
  request: InferenceRequest,
  config: BflModelConfig,
) {
  if (request.inputFiles.length === 0) {
    return;
  }

  if (isBflFlux1Endpoint(config.providerModel)) {
    return;
  }

  for (let index = 0; index < request.inputFiles.length; index += 1) {
    body[index === 0 ? 'input_image' : `input_image_${index + 1}`] =
      request.inputFiles[index];
  }
}

function createBflSemanticParams(
  request: InferenceRequest,
  params: BflRequestParams,
  config: BflModelConfig,
) {
  const semanticParams: Record<string, unknown> = {
    generation_output_format: request.outputFormat,
  };

  if (config.promptSupported) {
    semanticParams.generation_prompt = request.prompt;
  }

  if (hasBflSchemaField(config, 'generation_aspect_ratio')) {
    semanticParams.generation_aspect_ratio = request.ratio;
  }

  if (params.guidance !== undefined) {
    semanticParams.generation_guidance = params.guidance;
  }

  if (params.height !== undefined) {
    semanticParams.generation_height = params.height;
  }

  if (params.imagePromptStrength !== undefined) {
    semanticParams.generation_image_prompt_strength =
      params.imagePromptStrength;
  }

  if (params.moderation !== undefined) {
    semanticParams.generation_moderation = params.moderation;
  }

  if (params.promptExtend !== undefined) {
    semanticParams.generation_prompt_extend = params.promptExtend;
  }

  if (params.raw !== undefined) {
    semanticParams.generation_raw = params.raw;
  }

  if (params.seed !== undefined) {
    semanticParams.generation_seed = params.seed;
  }

  if (params.steps !== undefined) {
    semanticParams.generation_steps = params.steps;
  }

  if (params.width !== undefined) {
    semanticParams.generation_width = params.width;
  }

  if (request.inputFiles.length > 0) {
    semanticParams.generation_input_image_file = request.inputFiles;
  }

  return semanticParams;
}

function assertBflRequestMatchesModelConfig(
  request: InferenceRequest,
  config: BflModelConfig,
  params: BflRequestParams,
) {
  if (!includesString(config.outputFormats, request.outputFormat)) {
    throw new Error(
      `Black Forest Labs model ${request.model} does not support output format ${request.outputFormat}.`,
    );
  }

  if (
    hasBflSchemaField(config, 'generation_aspect_ratio') &&
    !includesString(config.ratios, request.ratio)
  ) {
    throw new Error(
      `Black Forest Labs model ${request.model} does not support ${request.ratio}.`,
    );
  }

  if (params.imagePrompt && !isBflFlux1Endpoint(config.providerModel)) {
    throw new Error(
      `Black Forest Labs model ${request.model} does not support base64 image prompts.`,
    );
  }

  if (config.requiresImageInput && request.inputFiles.length === 0) {
    throw new Error(
      `Black Forest Labs model ${request.model} requires an input image URL.`,
    );
  }

  if (!config.supportsImageInput && request.inputFiles.length > 0) {
    throw new Error(
      isBflFlux1Endpoint(config.providerModel)
        ? `Black Forest Labs model ${request.model} only accepts base64 image prompts. Uploaded or linked input images are not supported in Sherin.`
        : `Black Forest Labs model ${request.model} does not support input images.`,
    );
  }

  if (request.inputFiles.length > config.inputImageLimit) {
    throw new Error(
      `Black Forest Labs model ${request.model} supports at most ${config.inputImageLimit} input image URLs.`,
    );
  }
}

function createBflMetadata({
  modelConfig,
  params,
  pollingUrl,
  request,
  requestId,
  resumed,
}: {
  modelConfig: BflModelConfig;
  params: BflRequestParams;
  pollingUrl: string;
  request: InferenceRequest;
  requestId: string;
  resumed: boolean;
}) {
  return {
    sherin_model_id: request.model,
    sherin_stage: 'inference_started',
    bfl_request_id: requestId,
    bfl_model_endpoint: modelConfig.providerModel,
    bfl_aspect_ratio: request.ratio,
    ...(params.width !== undefined ? { bfl_width: params.width } : {}),
    ...(params.height !== undefined ? { bfl_height: params.height } : {}),
    ...(request.resolution ? { bfl_resolution: request.resolution } : {}),
    bfl_input_file_count: request.inputFiles.length,
    bfl_prompt_upsampling: params.promptExtend ?? null,
    bfl_guidance_scale: params.guidance ?? null,
    bfl_num_inference_steps: params.steps ?? null,
    bfl_raw: params.raw ?? null,
    bfl_seed: params.seed ?? null,
    bfl_image_prompt_provided: Boolean(params.imagePrompt),
    bfl_safety_tolerance: safetyToleranceForBflRequest(modelConfig, params),
    bfl_output_format: request.outputFormat,
    bfl_polling_url: pollingUrlForMetadata(pollingUrl),
    ...(resumed ? { bfl_resumed: true } : {}),
  };
}

async function pollBfl(pollingUrl: string, apiKey: string) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastStatus = 'Pending';

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const response = await fetch(pollingUrl, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-key': apiKey,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw await buildBflHttpError('BFL polling', response);
    }

    const json = (await response.json()) as BflPollResponse;
    lastStatus = json.status;

    if (json.status === 'Ready') {
      return json;
    }

    if (json.status === 'Error' || json.status === 'Failed') {
      throw new Error(`BFL generation failed with status: ${json.status}`);
    }
  }

  throw buildBflPollTimeoutError(lastStatus);
}

function firstBflOutput(response: BflPollResponse) {
  const remoteUrl = response.result?.sample;

  if (typeof remoteUrl !== 'string' || !remoteUrl.startsWith('https://')) {
    throw new Error('BFL returned no signed sample URL.');
  }

  return remoteUrl;
}

function bflHeaders(apiKey: string) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-key': apiKey,
  };
}

async function buildBflHttpError(label: string, response: Response) {
  const body = await safeText(response);
  const error = new Error(
    `${label} failed (${response.status}): ${body}`,
  ) as Error & {
    statusCode?: number;
    retryAfterSeconds?: number | null;
    isTransient?: boolean;
  };
  error.statusCode = response.status;
  error.retryAfterSeconds = parseRetryAfter(
    response.headers.get('retry-after'),
  );
  error.isTransient =
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    (response.status >= 500 && response.status < 600);
  return error;
}

function buildBflPollTimeoutError(lastStatus: string) {
  const error = new Error(
    `BFL generation timed out within this worker invocation (last status: ${lastStatus}).`,
  );
  error.name = 'TimeoutError';
  return error;
}

function readBflApiKey() {
  return getOptionalEnv('BFL_API_KEY');
}

function requireBflApiKey() {
  const apiKey = readBflApiKey();

  if (!apiKey) {
    throw new Error('BFL_API_KEY is required for Black Forest Labs inference.');
  }

  return apiKey;
}

function resolveBflBaseUrl() {
  const value = getOptionalEnv('BFL_API_BASE_URL') ?? DEFAULT_BFL_BASE_URL;

  return normalizeBflApiBaseUrl(value);
}

export function normalizeBflApiBaseUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('BFL_API_BASE_URL must be a valid URL.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('BFL_API_BASE_URL must use HTTPS.');
  }

  if (!isBflApiHost(url.hostname)) {
    throw new Error('BFL_API_BASE_URL must be a BFL API host.');
  }

  url.pathname = url.pathname.replace(/\/+$/g, '');

  if (url.pathname === '/v1') {
    url.pathname = '';
  }

  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
}

export function validateBflPollingUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('BFL polling_url must be a valid URL.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('BFL polling_url must use HTTPS.');
  }

  if (!isBflApiHost(url.hostname)) {
    throw new Error('BFL polling_url must be a BFL API host.');
  }

  url.hash = '';

  return url.toString();
}

function resolveBflResumePollingUrl(
  baseUrl: string,
  requestId: string,
  metadata: Record<string, unknown> | null | undefined,
) {
  const storedPollingUrl = getResumeBflPollingUrl(metadata, requestId);

  return storedPollingUrl ?? buildBflPollingUrl(baseUrl, requestId);
}

function getResumeBflPollingUrl(
  metadata: Record<string, unknown> | null | undefined,
  requestId: string,
) {
  const value = metadata?.bfl_polling_url;

  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  try {
    const url = new URL(value);
    url.searchParams.set('id', requestId);

    return validateBflPollingUrl(url.toString());
  } catch {
    return null;
  }
}

function buildBflPollingUrl(baseUrl: string, requestId: string) {
  const url = new URL('/v1/get_result', `${baseUrl}/`);
  url.searchParams.set('id', requestId);

  const pollingUrl = validateBflPollingUrl(url.toString());

  if (!pollingUrl) {
    throw new Error('Could not build BFL polling URL.');
  }

  return pollingUrl;
}

function pollingUrlForMetadata(value: string) {
  const url = new URL(value);
  url.hash = '';

  return url.toString();
}

function safetyToleranceForBflRequest(
  config: BflModelConfig,
  params: BflRequestParams,
) {
  if (params.moderation === true) {
    return 0;
  }

  if (params.moderation === false) {
    return isBflFlux2Endpoint(config.providerModel) ? 5 : 5;
  }

  return DEFAULT_BFL_SAFETY_TOLERANCE;
}

function isBflFlux1Endpoint(endpoint: string) {
  const normalized = endpoint.toLowerCase();

  return (
    normalized.startsWith('flux-pro-1.1') || normalized.startsWith('flux-1.1')
  );
}

function isBflFlux2Endpoint(endpoint: string) {
  return endpoint.toLowerCase().startsWith('flux-2');
}

export function isBflApiHost(hostname: string) {
  const host = hostname.toLowerCase();

  return /^api(?:[.-][a-z0-9-]+)*\.bfl\.ai$/.test(host);
}

function assignNumberParam(
  params: InferenceRequest['byokParams'],
  key: string,
  value: unknown,
) {
  const parsed = readOptionalNumber(value);

  if (parsed !== undefined) {
    params[key] = parsed;
  }
}

function assignBase64ImagePromptParam(
  params: InferenceRequest['byokParams'],
  value: unknown,
) {
  const imagePrompt = readOptionalBase64ImagePrompt(value);

  if (imagePrompt !== undefined) {
    params.imagePrompt = imagePrompt;
  }
}

function readOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function readOptionalBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

function readOptionalBase64ImagePrompt(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const dataUrlMatch = trimmed.match(
    /^data:image\/(?:gif|jpe?g|png|webp);base64,(?<data>[\s\S]+)$/i,
  );
  const base64 = (dataUrlMatch?.groups?.data ?? trimmed).replace(/\s+/g, '');

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new Error('BFL image prompt must be a base64 encoded image.');
  }

  const decoded = Buffer.from(base64, 'base64');

  if (
    decoded.byteLength <= 0 ||
    decoded.byteLength > MAX_BFL_IMAGE_PROMPT_BYTES
  ) {
    throw new Error('BFL image prompt must be 10 MB or smaller.');
  }

  return base64;
}

function firstFormValue(formData: FormData, names: readonly string[]) {
  for (const name of names) {
    const value = formData.get(name);

    if (typeof value === 'string' && value.trim().length === 0) {
      continue;
    }

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function numberDefault(field: SemanticField | undefined) {
  return typeof field?.default === 'number' ? field.default : undefined;
}

function booleanDefault(field: SemanticField | undefined) {
  return typeof field?.default === 'boolean' ? field.default : undefined;
}

type SemanticField = BflModelConfig['schema'][number];

function includesString(values: readonly string[], value: string) {
  return values.some((candidate) => candidate === value);
}

function contentTypeForBflOutputFormat(format: string) {
  switch (format) {
    case 'gif':
      return 'image/gif';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'jpeg':
    case 'jpg':
    default:
      return 'image/jpeg';
  }
}

function parseRetryAfter(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds), 600);
  }

  const dateMs = Date.parse(value);

  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.min(600, Math.ceil((dateMs - Date.now()) / 1000)));
  }

  return null;
}

async function safeText(response: Response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
