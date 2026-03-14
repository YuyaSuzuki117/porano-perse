export type RenderQualityPreset = 'draft' | 'standard' | 'cinema' | 'ultra';

export interface RenderQualityConfig {
  // Renderer
  pixelRatio: number;
  antialias: boolean;
  msaaSamples: number;

  // Shadows
  shadowMapSize: number;
  contactShadowResolution: number;
  shadowBlurSamples: number;

  // Textures
  textureSize: number;
  normalMapSize: number;

  // PostProcessing
  ssaoSamples: number;
  bloomEnabled: boolean;
  dofEnabled: boolean;
  chromaticAberration: boolean;
  filmGrain: boolean;
  smaa: boolean;

  // Particles
  dustParticleCount: number;

  // Geometry
  furnitureSmoothness: number;
  cylinderSegments: number;

  // Lighting
  maxDownlights: number;
  pointLightShadows: boolean;

  nameJa: string;
  nameEn: string;
  description: string;
}

export const RENDER_QUALITY_PRESETS: Record<RenderQualityPreset, RenderQualityConfig> = {
  draft: {
    pixelRatio: 1.0,
    antialias: false,
    msaaSamples: 0,
    shadowMapSize: 1024,
    contactShadowResolution: 512,
    shadowBlurSamples: 4,
    textureSize: 256,
    normalMapSize: 256,
    ssaoSamples: 0,
    bloomEnabled: false,
    dofEnabled: false,
    chromaticAberration: false,
    filmGrain: false,
    smaa: false,
    dustParticleCount: 30,
    furnitureSmoothness: 1,
    cylinderSegments: 6,
    maxDownlights: 4,
    pointLightShadows: false,
    nameJa: 'ドラフト',
    nameEn: 'Draft',
    description: 'ドラフト — 最速プレビュー',
  },
  standard: {
    pixelRatio: 1.5,
    antialias: true,
    msaaSamples: 0,
    shadowMapSize: 2048,
    contactShadowResolution: 1024,
    shadowBlurSamples: 8,
    textureSize: 1024,
    normalMapSize: 1024,
    ssaoSamples: 16,
    bloomEnabled: true,
    dofEnabled: false,
    chromaticAberration: false,
    filmGrain: false,
    smaa: true,
    dustParticleCount: 100,
    furnitureSmoothness: 3,
    cylinderSegments: 16,
    maxDownlights: 12,
    pointLightShadows: false,
    nameJa: 'スタンダード',
    nameEn: 'Standard',
    description: 'スタンダード — バランス重視',
  },
  cinema: {
    pixelRatio: 2.0,
    antialias: true,
    msaaSamples: 4,
    shadowMapSize: 4096,
    contactShadowResolution: 2048,
    shadowBlurSamples: 16,
    textureSize: 2048,
    normalMapSize: 2048,
    ssaoSamples: 48,
    bloomEnabled: true,
    dofEnabled: true,
    chromaticAberration: true,
    filmGrain: true,
    smaa: true,
    dustParticleCount: 250,
    furnitureSmoothness: 6,
    cylinderSegments: 32,
    maxDownlights: 20,
    pointLightShadows: true,
    nameJa: 'シネマ',
    nameEn: 'Cinema',
    description: 'シネマ — 映画品質',
  },
  ultra: {
    pixelRatio: 2.5,
    antialias: true,
    msaaSamples: 8,
    shadowMapSize: 8192,
    contactShadowResolution: 4096,
    shadowBlurSamples: 32,
    textureSize: 2048,
    normalMapSize: 2048,
    ssaoSamples: 64,
    bloomEnabled: true,
    dofEnabled: true,
    chromaticAberration: true,
    filmGrain: true,
    smaa: true,
    dustParticleCount: 500,
    furnitureSmoothness: 8,
    cylinderSegments: 48,
    maxDownlights: 30,
    pointLightShadows: true,
    nameJa: 'ウルトラ',
    nameEn: 'Ultra',
    description: 'ウルトラ — 最高品質',
  },
};

export function getRenderQualityConfig(preset: RenderQualityPreset): RenderQualityConfig {
  return RENDER_QUALITY_PRESETS[preset];
}
