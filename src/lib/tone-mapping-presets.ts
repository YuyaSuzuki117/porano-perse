import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tone Mapping Preset System
// Visual mood presets for renderer and postprocessing configuration
// ---------------------------------------------------------------------------

export type ToneMappingPreset = 'aces' | 'reinhard' | 'cinematic' | 'neutral' | 'agx';

export interface ToneMappingConfig {
  toneMapping: THREE.ToneMapping;
  exposure: number;
  saturationBoost: number; // for postprocessing HueSaturation
  contrastBoost: number; // for postprocessing BrightnessContrast
  bloomMultiplier: number; // multiply bloom intensity
  description: string; // Japanese description
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

export const TONE_MAPPING_PRESETS: Record<ToneMappingPreset, ToneMappingConfig> = {
  aces: {
    toneMapping: THREE.ACESFilmicToneMapping,
    exposure: 1.0,
    saturationBoost: 0.05,
    contrastBoost: 0.08,
    bloomMultiplier: 1.0,
    description: '映画品質（デフォルト）',
  },

  reinhard: {
    toneMapping: THREE.ReinhardToneMapping,
    exposure: 1.1,
    saturationBoost: 0.0,
    contrastBoost: 0.05,
    bloomMultiplier: 0.8,
    description: '自然な露出',
  },

  cinematic: {
    toneMapping: THREE.ACESFilmicToneMapping,
    exposure: 0.9,
    saturationBoost: 0.1,
    contrastBoost: 0.15,
    bloomMultiplier: 1.3,
    description: 'シネマティック（高コントラスト）',
  },

  neutral: {
    toneMapping: THREE.LinearToneMapping,
    exposure: 1.2,
    saturationBoost: 0.0,
    contrastBoost: 0.0,
    bloomMultiplier: 0.6,
    description: 'ニュートラル（色忠実）',
  },

  agx: {
    toneMapping: THREE.AgXToneMapping,
    exposure: 1.0,
    saturationBoost: 0.03,
    contrastBoost: 0.1,
    bloomMultiplier: 1.1,
    description: 'AgX（最新映画標準）',
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve the tone mapping configuration for a given preset.
 */
export function getToneMappingConfig(preset: ToneMappingPreset): ToneMappingConfig {
  return { ...TONE_MAPPING_PRESETS[preset] };
}
