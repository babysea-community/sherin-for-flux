import {
  BFL_MODEL_CONFIGS,
  hasBflModelConfig,
  type BflModelId,
} from './family';

export { BFL_MODEL_CONFIGS, type BflModelConfig } from './family';

export function resolveBflModelConfig(model: string) {
  if (!hasBflModelConfig(model)) {
    throw new Error(`Black Forest Labs does not support model ${model}.`);
  }

  return BFL_MODEL_CONFIGS[model];
}

export function resolveBflProviderModel(model: BflModelId) {
  return resolveBflModelConfig(model).providerModel;
}
