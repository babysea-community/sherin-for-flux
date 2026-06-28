import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBflProvider,
  isBflApiHost,
  normalizeBflApiBaseUrl,
  validateBflPollingUrl,
} from '@/lib/inference/bfl/server-actions';
import type { InferenceRequest } from '@/lib/inference/types';

const PNG_BASE64_IMAGE_PROMPT =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

describe('BFL provider', () => {
  beforeEach(() => {
    process.env.BFL_API_KEY = 'bfl_test_key';
    delete process.env.BFL_API_BASE_URL;
    delete process.env.INFERENCE_POLL_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('submits FLUX 1.1 Pro Ultra with aspect ratio and raw mode', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn();

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'req_ultra',
            polling_url: 'https://api.bfl.ai/v1/get_result?id=req_ultra',
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: { sample: 'https://assets.example.com/ultra.png' },
            status: 'Ready',
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const generationPromise = createBflProvider().generate(
      createRequest({
        byokParams: { generation_raw: true },
        model: 'bfl/flux-1.1-pro-ultra',
        outputFormat: 'png',
        ratio: '21:9',
      }),
    );

    await vi.advanceTimersByTimeAsync(1_500);

    const result = await generationPromise;
    const [submitUrl, submitInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const submitBody = JSON.parse(String(submitInit.body)) as Record<
      string,
      unknown
    >;

    expect(submitUrl).toBe('https://api.bfl.ai/v1/flux-pro-1.1-ultra');
    expect(submitBody).toMatchObject({
      aspect_ratio: '21:9',
      output_format: 'png',
      prompt: 'A clean regression image',
      prompt_upsampling: false,
      raw: true,
      safety_tolerance: 2,
    });
    expect(submitBody).not.toHaveProperty('width');
    expect(submitBody).not.toHaveProperty('height');
    expect(submitBody).not.toHaveProperty('image_prompt');
    expect(result.remoteUrl).toBe('https://assets.example.com/ultra.png');
  });

  it('normalizes Semantic Lady generation fields into the BFL request body', async () => {
    vi.useFakeTimers();

    const fetchMock = mockReadyBflFetch('req_semantic');

    vi.stubGlobal('fetch', fetchMock);

    const generationPromise = createBflProvider().generate(
      createRequest({
        byokParams: {
          generation_image_prompt_strength: 0.4,
          generation_moderation: true,
          generation_prompt_extend: true,
          generation_raw: true,
          generation_seed: 123,
        },
        model: 'bfl/flux-1.1-pro-ultra',
        outputFormat: 'png',
        ratio: '16:9',
      }),
    );

    await vi.advanceTimersByTimeAsync(1_500);
    await generationPromise;

    const [, submitInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const submitBody = JSON.parse(String(submitInit.body)) as Record<
      string,
      unknown
    >;

    expect(submitBody).toMatchObject({
      aspect_ratio: '16:9',
      image_prompt_strength: 0.4,
      prompt_upsampling: true,
      raw: true,
      safety_tolerance: 0,
      seed: 123,
    });
  });

  it('maps Semantic Lady moderation off to babychain-compatible BFL safety tolerance', async () => {
    vi.useFakeTimers();

    const fetchMock = mockReadyBflFetch('req_moderation_off');

    vi.stubGlobal('fetch', fetchMock);

    const generationPromise = createBflProvider().generate(
      createRequest({
        byokParams: { generation_moderation: false },
      }),
    );

    await vi.advanceTimersByTimeAsync(1_500);
    await generationPromise;

    const [, submitInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const submitBody = JSON.parse(String(submitInit.body)) as Record<
      string,
      unknown
    >;

    expect(submitBody.safety_tolerance).toBe(5);
  });

  it('prepares BYOK form params only when supported Semantic Lady form values are present', async () => {
    const provider = createBflProvider();

    await expect(
      prepareRequest(provider, createRequest({ model: 'bfl/flux-1.1-pro' })),
    ).resolves.toMatchObject({
      inputImageLimit: 0,
      request: { byokParams: {} },
    });

    await expect(
      prepareRequest(provider, createRequest({ model: 'bfl/flux-2-pro' })),
    ).resolves.toMatchObject({ request: { byokParams: {} } });

    await expect(
      prepareRequest(provider, createRequest({ model: 'bfl/flux-2-flex' })),
    ).resolves.toMatchObject({ request: { byokParams: {} } });

    const formData = new FormData();
    formData.set('generation_prompt_extend', 'true');
    formData.set('generation_raw', 'true');

    await expect(
      prepareRequest(
        provider,
        createRequest({
          model: 'bfl/flux-1.1-pro-ultra',
          ratio: '16:9',
        }),
        { formData },
      ),
    ).resolves.toMatchObject({
      request: {
        byokParams: { generation_prompt_extend: true, generation_raw: true },
      },
    });
  });

  it('prepares base64 image prompts from BYOK form data', async () => {
    const provider = createBflProvider();
    const formData = new FormData();

    formData.set(
      'byok_image_prompt',
      `data:image/png;base64,${PNG_BASE64_IMAGE_PROMPT}`,
    );

    await expect(
      prepareRequest(provider, createRequest({ model: 'bfl/flux-1.1-pro' }), {
        formData,
      }),
    ).resolves.toMatchObject({
      request: { byokParams: { imagePrompt: PNG_BASE64_IMAGE_PROMPT } },
    });
  });

  it('rejects FLUX 1.x generic input images because image_prompt is base64-only', async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createBflProvider().generate(
        createRequest({
          inputFiles: ['https://assets.example.com/source.png'],
          model: 'bfl/flux-1.1-pro',
        }),
      ),
    ).rejects.toThrow('only accepts base64 image prompts');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps FLUX 2 input image URLs to BFL numbered input image fields', async () => {
    vi.useFakeTimers();

    const fetchMock = mockReadyBflFetch('req_flux_2_images');

    vi.stubGlobal('fetch', fetchMock);

    const generationPromise = createBflProvider().generate(
      createRequest({
        inputFiles: [
          'https://assets.example.com/source-1.png',
          'https://assets.example.com/source-2.png',
        ],
        model: 'bfl/flux-2-pro',
      }),
    );

    await vi.advanceTimersByTimeAsync(1_500);
    await generationPromise;

    const [, submitInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const submitBody = JSON.parse(String(submitInit.body)) as Record<
      string,
      unknown
    >;

    expect(submitBody.input_image).toBe(
      'https://assets.example.com/source-1.png',
    );
    expect(submitBody.input_image_2).toBe(
      'https://assets.example.com/source-2.png',
    );
    expect(submitBody).not.toHaveProperty('image_prompt');
  });

  it('resumes polling without resubmitting direct provider work', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: { sample: 'https://assets.example.com/resumed.png' },
          status: 'Ready',
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    const onPreSubmit = vi.fn();
    const onStarted = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    const generationPromise = createBflProvider().generate(createRequest(), {
      onPreSubmit,
      onStarted,
      providerGenerationId: 'req_resume',
    });

    await vi.advanceTimersByTimeAsync(1_500);

    const result = await generationPromise;
    const [pollUrl, pollInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pollUrl).toBe('https://api.bfl.ai/v1/get_result?id=req_resume');
    expect(pollInit.method).toBe('GET');
    expect(onPreSubmit).not.toHaveBeenCalled();
    expect(onStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        bfl_request_id: 'req_resume',
        bfl_resumed: true,
      }),
    );
    expect(result.remoteUrl).toBe('https://assets.example.com/resumed.png');
  });

  it('maps FLUX 1.x base64 image prompts to BFL image_prompt', async () => {
    vi.useFakeTimers();

    const fetchMock = mockReadyBflFetch('req_flux_1_base64');

    vi.stubGlobal('fetch', fetchMock);

    const generationPromise = createBflProvider().generate(
      createRequest({
        byokParams: { imagePrompt: PNG_BASE64_IMAGE_PROMPT },
        model: 'bfl/flux-1.1-pro',
      }),
    );

    await vi.advanceTimersByTimeAsync(1_500);
    await generationPromise;

    const [, submitInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const submitBody = JSON.parse(String(submitInit.body)) as Record<
      string,
      unknown
    >;

    expect(submitBody.image_prompt).toBe(PNG_BASE64_IMAGE_PROMPT);
    expect(submitBody).not.toHaveProperty('input_image');
  });

  it('rejects base64 image prompts for FLUX 2 URL-input models', async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createBflProvider().generate(
        createRequest({
          byokParams: { imagePrompt: PNG_BASE64_IMAGE_PROMPT },
          model: 'bfl/flux-2-pro',
        }),
      ),
    ).rejects.toThrow('does not support base64 image prompts');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects input files above the selected BFL model limit', async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createBflProvider().generate(
        createRequest({
          inputFiles: Array.from(
            { length: 9 },
            (_unusedValue, index) =>
              `https://assets.example.com/input-${index}.png`,
          ),
          model: 'bfl/flux-2-pro',
        }),
      ),
    ).rejects.toThrow('supports at most 8 input image URLs');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores stale legacy safety tolerance params outside the selected BFL schema', async () => {
    vi.useFakeTimers();

    const fetchMock = mockReadyBflFetch('req_legacy_safety_tolerance');

    vi.stubGlobal('fetch', fetchMock);

    const generationPromise = createBflProvider().generate(
      createRequest({
        byokParams: { safetyTolerance: 6 },
        model: 'bfl/flux-2-pro',
      }),
    );

    await vi.advanceTimersByTimeAsync(1_500);
    await generationPromise;

    const [, submitInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const submitBody = JSON.parse(String(submitInit.body)) as Record<
      string,
      unknown
    >;

    expect(submitBody.safety_tolerance).toBe(2);
  });

  it('rejects output formats unsupported by direct BFL', async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createBflProvider().generate(
        createRequest({
          outputFormat: 'jpg',
        }),
      ),
    ).rejects.toThrow('does not support output format jpg');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts BFL API shard hosts for returned polling URLs', () => {
    expect(
      validateBflPollingUrl(
        'https://api.eu1.bfl.ai/v1/get_result?id=request-123#ignored',
      ),
    ).toBe('https://api.eu1.bfl.ai/v1/get_result?id=request-123');
  });

  it('rejects non-API BFL delivery hosts for polling URLs', () => {
    expect(isBflApiHost('delivery-eu.bfl.ai')).toBe(false);
    expect(() =>
      validateBflPollingUrl('https://delivery-eu.bfl.ai/result.png'),
    ).toThrow('BFL polling_url must be a BFL API host.');
  });

  it('normalizes BFL API base URLs with an optional v1 path', () => {
    expect(normalizeBflApiBaseUrl('https://api.us.bfl.ai/v1')).toBe(
      'https://api.us.bfl.ai',
    );
  });
});

function createRequest(
  overrides: Partial<InferenceRequest> = {},
): InferenceRequest {
  return {
    babyseaSpecificParams: {},
    byokParams: {
      promptUpsampling: false,
      raw: false,
      safetyTolerance: 2,
    },
    inputFiles: [],
    model: 'bfl/flux-1.1-pro',
    outputFormat: 'jpeg',
    outputNumber: 1,
    prompt: 'A clean regression image',
    providerOrder: 'fastest',
    ratio: '1:1',
    ...overrides,
  };
}

function mockReadyBflFetch(requestId: string) {
  return vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: requestId,
          polling_url: `https://api.bfl.ai/v1/get_result?id=${requestId}`,
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: { sample: `https://assets.example.com/${requestId}.png` },
          status: 'Ready',
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
}

async function prepareRequest(
  provider: ReturnType<typeof createBflProvider>,
  request: InferenceRequest,
  options: { formData?: FormData } = {},
) {
  if (!provider.prepareRequest) {
    throw new Error('BFL provider does not expose prepareRequest.');
  }

  return await provider.prepareRequest({
    formData: options.formData ?? new FormData(),
    request,
  });
}
