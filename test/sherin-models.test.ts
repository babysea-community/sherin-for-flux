import { describe, expect, it } from 'vitest';

import {
  BYOK_INFERENCE_PROVIDER_ID,
  BYOK_INFERENCE_PROVIDER_LABEL,
  DEFAULT_MODEL_ID,
  MODEL_IDS,
  MODEL_OPTIONS,
  getDefaultModelIdForInferenceProvider,
  getModelIdsForInferenceProvider,
  getModelOptionsForInferenceProvider,
} from '@/lib/app-config';
import { resolveBabySeaModelIdentifier } from '@/lib/inference/babysea/models';
import {
  resolveBflModelConfig,
  resolveBflProviderModel,
} from '@/lib/inference/bfl/models';

const BFL_MODEL_EXPECTATIONS = [
  {
    id: 'bfl/flux-1.1-pro',
    label: 'Flux 1.1 Pro',
    providerModel: 'flux-pro-1.1',
  },
  {
    id: 'bfl/flux-1.1-pro-ultra',
    label: 'Flux 1.1 Pro Ultra',
    providerModel: 'flux-pro-1.1-ultra',
  },
  {
    id: 'bfl/flux-2-flex',
    label: 'Flux 2 Flex',
    providerModel: 'flux-2-flex',
  },
  {
    id: 'bfl/flux-2-klein-4b',
    label: 'Flux 2 Klein 4b',
    providerModel: 'flux-2-klein-4b',
  },
  {
    id: 'bfl/flux-2-klein-9b',
    label: 'Flux 2 Klein 9b',
    providerModel: 'flux-2-klein-9b',
  },
  {
    id: 'bfl/flux-2-max',
    label: 'Flux 2 Max',
    providerModel: 'flux-2-max',
  },
  {
    id: 'bfl/flux-2-pro',
    label: 'Flux 2 Pro',
    providerModel: 'flux-2-pro',
  },
] as const;

describe('Sherin model registry', () => {
  it('derives provider model options from the central registry', () => {
    expect(BYOK_INFERENCE_PROVIDER_ID).toBe('bfl');
    expect(BYOK_INFERENCE_PROVIDER_LABEL).toBe('Black Forest Labs');
    expect(getModelOptionsForInferenceProvider('babysea')).toEqual(
      MODEL_OPTIONS,
    );
    expect(getModelIdsForInferenceProvider('babysea')).toEqual(MODEL_IDS);
    expect(getModelIdsForInferenceProvider('bfl')).toEqual(MODEL_IDS);
    expect(getDefaultModelIdForInferenceProvider('babysea')).toBe(
      DEFAULT_MODEL_ID,
    );
    expect(getDefaultModelIdForInferenceProvider('bfl')).toBe(DEFAULT_MODEL_ID);
  });

  it('registers BFL image models across the Studio providers', () => {
    expect(MODEL_IDS).toEqual(BFL_MODEL_EXPECTATIONS.map((model) => model.id));

    for (const model of BFL_MODEL_EXPECTATIONS) {
      expect(MODEL_OPTIONS.find((option) => option.id === model.id)).toEqual({
        id: model.id,
        label: model.label,
      });
      expect(resolveBabySeaModelIdentifier(model.id)).toBe(model.id);
      expect(resolveBflProviderModel(model.id)).toBe(model.providerModel);
    }
  });

  it('keeps BFL models image-only with explicit image/video limits', () => {
    expect(resolveBflModelConfig('bfl/flux-1.1-pro')).toMatchObject({
      inputImageLimit: 0,
      inputVideoLimit: 0,
      kind: 'image',
      outputContentType: 'image/jpeg',
      outputFormats: ['jpeg', 'png', 'webp'],
      supportsImageInput: false,
      supportsVideoInput: false,
    });
    expect(resolveBflModelConfig('bfl/flux-2-flex')).toMatchObject({
      inputImageLimit: 8,
      inputVideoLimit: 0,
      kind: 'image',
      outputContentType: 'image/jpeg',
      outputFormats: ['jpeg', 'png', 'webp'],
      supportsVideoInput: false,
    });
    expect(resolveBflModelConfig('bfl/flux-1.1-pro-ultra')).toMatchObject({
      inputImageLimit: 0,
      kind: 'image',
      ratios: expect.arrayContaining(['1:1', '16:9']),
      supportsImageInput: false,
      supportsVideoInput: false,
    });
  });
});
