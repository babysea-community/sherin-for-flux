import {
  getModel as getSemanticLadyModel,
  type SemanticLadyField,
  type SemanticLadyModel,
} from 'semantic-lady';

const BFL_SEMANTIC_PROVIDER_ID = 'black-forest-labs';
const MODEL_LABEL_COLLATOR = new Intl.Collator('en', {
  ignorePunctuation: true,
  numeric: true,
  sensitivity: 'base',
});

export const BFL_PROVIDER_ID = 'bfl' as const;
export const BFL_PROVIDER_LABEL = 'Black Forest Labs';
export const BFL_PROVIDER_KEYWORD = 'black-forest-labs';

const BFL_MODEL_ID_VALUES = [
  'bfl/flux-1.1-pro',
  'bfl/flux-1.1-pro-ultra',
  'bfl/flux-2-flex',
  'bfl/flux-2-klein-4b',
  'bfl/flux-2-klein-9b',
  'bfl/flux-2-max',
  'bfl/flux-2-pro',
] as const;

export type BflModelId = (typeof BFL_MODEL_ID_VALUES)[number];

export const BFL_MODEL_IDS = [...BFL_MODEL_ID_VALUES] as [
  BflModelId,
  ...BflModelId[],
];

export const BFL_MODEL_OPTIONS = BFL_MODEL_IDS.map((id) => ({
  id,
  label: semanticModelLabel(id),
})).sort(compareBflModelOptions) as Array<{ id: BflModelId; label: string }>;

export const BFL_DEFAULT_MODEL_ID: BflModelId =
  BFL_MODEL_IDS.find((model) => model === 'bfl/flux-1.1-pro') ??
  BFL_MODEL_IDS[0] ??
  'bfl/flux-1.1-pro';
export const BFL_MODEL_ID_PREFIX = `${BFL_PROVIDER_ID}/`;

const BFL_SEMANTIC_MODELS = BFL_MODEL_IDS.map(getBflSemanticModel);

export type BflDimensionRatio = string;
export type BflRatio = string;

export const BFL_RATIO_OPTIONS = uniqueStrings(
  BFL_SEMANTIC_MODELS.flatMap((model) =>
    enumStrings(getField(model, 'generation_aspect_ratio')),
  ),
);
export const BFL_OUTPUT_FORMATS = uniqueStrings(
  BFL_SEMANTIC_MODELS.flatMap((model) =>
    enumStrings(getField(model, 'generation_output_format')),
  ),
);
export type BflOutputFormat = (typeof BFL_OUTPUT_FORMATS)[number];

export const BFL_DEFAULT_RATIO =
  firstStringDefault('generation_aspect_ratio') ??
  BFL_RATIO_OPTIONS[0] ??
  '1:1';
export const BFL_DEFAULT_OUTPUT_FORMAT =
  firstStringDefault('generation_output_format') ??
  BFL_OUTPUT_FORMATS[0] ??
  'jpeg';
export const BFL_RESOLUTION_OPTIONS = uniqueStrings(
  BFL_SEMANTIC_MODELS.flatMap((model) =>
    enumStrings(getField(model, 'generation_resolution')),
  ),
);
export type BflResolution = (typeof BFL_RESOLUTION_OPTIONS)[number];
export const BFL_DEFAULT_RESOLUTION = firstStringDefault(
  'generation_resolution',
) as BflResolution | undefined;

export type BflModelConfig = {
  providerModel: string;
  schema: readonly SemanticLadyField[];
  kind: 'image';
  workflows: readonly string[];
  inputImageLimit: number;
  requiresImageInput: boolean;
  supportsImageInput: boolean;
  inputVideoLimit: 0;
  requiresVideoInput: false;
  supportsVideoInput: false;
  outputFormats: readonly BflOutputFormat[];
  outputContentType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp';
  ratios: readonly string[];
  defaultRatio: string;
  resolutions: readonly string[];
  defaultResolution?: string;
  promptSupported: boolean;
  promptRequired: boolean;
  supportsModeration: boolean;
  seed?: {
    max: number;
    min: number;
  };
};

export type BflBabySeaModelConfig = {
  identifier: BflModelId;
  inputMediaLimit: number;
  outputFormatMap: Partial<Record<string, string>>;
  providerOrderOptions?: readonly string[];
};

const BFL_BABYSEA_PROVIDER_ORDER_OPTIONS = [
  'fastest',
  'bfl, replicate, fal',
] as const;
const BFL_FLUX_2_INPUT_IMAGE_LIMITS: Record<string, number> = {
  'bfl/flux-2-flex': 8,
  'bfl/flux-2-klein-4b': 4,
  'bfl/flux-2-klein-9b': 4,
  'bfl/flux-2-max': 8,
  'bfl/flux-2-pro': 8,
};

export const BFL_MODEL_CONFIGS = Object.fromEntries(
  BFL_MODEL_IDS.map((model) => [model, createBflModelConfig(model)]),
) as Record<BflModelId, BflModelConfig>;

export const BFL_BABYSEA_MODEL_CONFIGS = Object.fromEntries(
  BFL_MODEL_IDS.map((model) => [model, createBflBabySeaModelConfig(model)]),
) as Record<BflModelId, BflBabySeaModelConfig>;

export const SHERIN_BYOK_FAMILY = {
  babySeaModelConfigs: BFL_BABYSEA_MODEL_CONFIGS,
  defaultGenerationGuidance: 5,
  defaultGenerationSteps: 50,
  defaultModelId: BFL_DEFAULT_MODEL_ID,
  defaultOutputFormat: BFL_DEFAULT_OUTPUT_FORMAT,
  defaultRatio: BFL_DEFAULT_RATIO,
  defaultResolution: BFL_DEFAULT_RESOLUTION,
  defaultSafetyTolerance: 2,
  modelConfigs: BFL_MODEL_CONFIGS,
  modelIdPrefix: BFL_MODEL_ID_PREFIX,
  modelIds: BFL_MODEL_IDS,
  modelOptions: BFL_MODEL_OPTIONS,
  outputFormats: BFL_OUTPUT_FORMATS,
  providerId: BFL_PROVIDER_ID,
  providerKeyword: BFL_PROVIDER_KEYWORD,
  providerLabel: BFL_PROVIDER_LABEL,
  ratioOptions: BFL_RATIO_OPTIONS,
  resolutionOptions: BFL_RESOLUTION_OPTIONS,
} as const;

export function hasBflModelConfig(model: string): model is BflModelId {
  return model in BFL_MODEL_CONFIGS;
}

export const hasProviderModelConfig = hasBflModelConfig;

export function getBflSemanticModel(
  modelIdentifier: BflModelId,
): SemanticLadyModel {
  const model = getSemanticLadyModel(modelIdentifier);

  if (!model || model.provider !== BFL_SEMANTIC_PROVIDER_ID) {
    throw new Error(
      `Semantic Lady does not define Black Forest Labs model ${modelIdentifier}.`,
    );
  }

  return model;
}

function semanticModelLabel(modelIdentifier: BflModelId) {
  return getBflSemanticModel(modelIdentifier).uiName;
}

function compareBflModelOptions(
  left: { id: BflModelId; label: string },
  right: { id: BflModelId; label: string },
) {
  return (
    modelKindRank(getBflSemanticModel(left.id).kind) -
      modelKindRank(getBflSemanticModel(right.id).kind) ||
    MODEL_LABEL_COLLATOR.compare(left.label, right.label) ||
    MODEL_LABEL_COLLATOR.compare(left.id, right.id)
  );
}

function modelKindRank(kind: SemanticLadyModel['kind']) {
  return kind === 'image' ? 0 : 1;
}

function createBflBabySeaModelConfig(model: BflModelId): BflBabySeaModelConfig {
  const config = BFL_MODEL_CONFIGS[model];
  const semanticModel = getBflSemanticModel(model);
  const inputImage = getField(semanticModel, 'generation_input_image_file');
  const inputImageLimit =
    BFL_FLUX_2_INPUT_IMAGE_LIMITS[model] ?? (inputImage ? 1 : 0);

  return {
    identifier: model,
    inputMediaLimit: Math.max(inputImageLimit, config.inputVideoLimit),
    outputFormatMap: { jpeg: 'jpg' },
    ...(model === BFL_DEFAULT_MODEL_ID
      ? { providerOrderOptions: BFL_BABYSEA_PROVIDER_ORDER_OPTIONS }
      : {}),
  };
}

function createBflModelConfig(model: BflModelId): BflModelConfig {
  const semanticModel = getBflSemanticModel(model);
  const aspectRatio = getField(semanticModel, 'generation_aspect_ratio');
  const outputFormat = getField(semanticModel, 'generation_output_format');
  const seed = getField(semanticModel, 'generation_seed');
  const imageInput = getField(semanticModel, 'generation_input_image_file');
  const inputImageLimit = inputImageLimitForBflModel(model, imageInput);
  const outputFormats = enumStrings(outputFormat) as BflOutputFormat[];
  const ratios = enumStrings(aspectRatio);
  const defaultOutputFormat =
    stringDefault(outputFormat) ??
    outputFormats[0] ??
    BFL_DEFAULT_OUTPUT_FORMAT;

  return {
    providerModel: semanticModel.providerModel,
    schema: semanticModel.schema,
    kind: 'image',
    workflows: semanticModel.workflows,
    inputImageLimit,
    requiresImageInput: inputImageLimit > 0 && Boolean(imageInput?.required),
    supportsImageInput: inputImageLimit > 0,
    inputVideoLimit: 0,
    requiresVideoInput: false,
    supportsVideoInput: false,
    outputFormats,
    outputContentType: contentTypeForBflOutputFormat(defaultOutputFormat),
    ratios: ratios.length > 0 ? ratios : [BFL_DEFAULT_RATIO],
    defaultRatio: stringDefault(aspectRatio) ?? ratios[0] ?? BFL_DEFAULT_RATIO,
    resolutions: enumStrings(getField(semanticModel, 'generation_resolution')),
    defaultResolution: stringDefault(
      getField(semanticModel, 'generation_resolution'),
    ),
    promptSupported: Boolean(getField(semanticModel, 'generation_prompt')),
    promptRequired: Boolean(
      getField(semanticModel, 'generation_prompt')?.required,
    ),
    supportsModeration: Boolean(
      getField(semanticModel, 'generation_moderation'),
    ),
    seed: seed
      ? {
          max: numberBound(seed.max, 4_294_967_295),
          min: numberBound(seed.min, 0),
        }
      : undefined,
  };
}

export function isBflFlux2Model(model: string): model is BflModelId {
  return (
    getSemanticLadyModel(model)?.providerModel.startsWith('flux-2') ?? false
  );
}

function inputImageLimitForBflModel(
  model: BflModelId,
  inputImage: SemanticLadyField | undefined,
) {
  if (isBflFlux1Model(model)) {
    return 0;
  }

  return BFL_FLUX_2_INPUT_IMAGE_LIMITS[model] ?? (inputImage ? 1 : 0);
}

function isBflFlux1Model(model: BflModelId) {
  return model === 'bfl/flux-1.1-pro' || model === 'bfl/flux-1.1-pro-ultra';
}

function getField(model: SemanticLadyModel, name: string) {
  return model.schema.find((field) => field.name === name);
}

function enumStrings(field: SemanticLadyField | undefined) {
  return (field?.enum ?? []).filter(
    (value): value is string => typeof value === 'string',
  );
}

function stringDefault(field: SemanticLadyField | undefined) {
  return typeof field?.default === 'string' ? field.default : undefined;
}

function numberBound(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function firstStringDefault(fieldName: string) {
  for (const model of BFL_SEMANTIC_MODELS) {
    const value = stringDefault(getField(model, fieldName));

    if (value) {
      return value;
    }
  }

  return undefined;
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
