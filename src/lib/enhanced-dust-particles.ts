/**
 * Enhanced particle configuration for quality-dependent dust system.
 * Implements Tyndall-effect light scattering and spatial clustering.
 */

export interface DustParticleConfig {
  count: number;
  minSize: number;
  maxSize: number;
  // Light scattering
  scatterIntensity: number; // how much particles glow near light sources
  scatterColor: string;
  // Motion
  riseSpeed: number;
  driftSpeed: number;
  turbulence: number; // 0-1, random motion intensity
  // Clustering
  windowClusterBoost: number; // multiplier near windows
  lightClusterBoost: number; // multiplier near lights
}

export const DUST_CONFIGS: Record<string, DustParticleConfig> = {
  draft: {
    count: 30,
    minSize: 0.006,
    maxSize: 0.012,
    scatterIntensity: 0,
    scatterColor: '#ffffff',
    riseSpeed: 0.0002,
    driftSpeed: 0.0001,
    turbulence: 0.1,
    windowClusterBoost: 1.0,
    lightClusterBoost: 1.0,
  },
  standard: {
    count: 120,
    minSize: 0.006,
    maxSize: 0.014,
    scatterIntensity: 0.3,
    scatterColor: '#FFF8E0',
    riseSpeed: 0.0003,
    driftSpeed: 0.00015,
    turbulence: 0.3,
    windowClusterBoost: 1.5,
    lightClusterBoost: 1.3,
  },
  cinema: {
    count: 300,
    minSize: 0.005,
    maxSize: 0.016,
    scatterIntensity: 0.6,
    scatterColor: '#FFF5D0',
    riseSpeed: 0.0003,
    driftSpeed: 0.0002,
    turbulence: 0.5,
    windowClusterBoost: 2.0,
    lightClusterBoost: 1.8,
  },
  ultra: {
    count: 500,
    minSize: 0.004,
    maxSize: 0.018,
    scatterIntensity: 0.9,
    scatterColor: '#FFFBE8',
    riseSpeed: 0.00025,
    driftSpeed: 0.0002,
    turbulence: 0.6,
    windowClusterBoost: 2.5,
    lightClusterBoost: 2.0,
  },
};

/**
 * Return the dust config for a given quality level.
 * Falls back to 'standard' if the key is not recognised.
 */
export function getDustConfig(quality: string): DustParticleConfig {
  return DUST_CONFIGS[quality] ?? DUST_CONFIGS['standard'];
}

/**
 * Calculate particle brightness based on proximity to light sources.
 * Returns a 0-1 multiplier for particle opacity / emissive intensity.
 *
 * Uses inverse-square falloff with a small bias term to avoid division by
 * zero and to soften the near-field peak (Tyndall-effect approximation).
 */
export function calculateLightScatter(
  particlePos: [number, number, number],
  lightPositions: [number, number, number][],
  config: DustParticleConfig
): number {
  if (config.scatterIntensity <= 0 || lightPositions.length === 0) {
    return 0;
  }

  let totalScatter = 0;

  for (const lightPos of lightPositions) {
    const dx = particlePos[0] - lightPos[0];
    const dy = particlePos[1] - lightPos[1];
    const dz = particlePos[2] - lightPos[2];
    const distSq = dx * dx + dy * dy + dz * dz;

    // Inverse square falloff with 0.1 bias to prevent infinity at dist=0
    totalScatter += config.scatterIntensity / (distSq + 0.1);
  }

  // Clamp to 0-1
  return Math.min(1, Math.max(0, totalScatter));
}
