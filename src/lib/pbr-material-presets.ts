import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Advanced PBR Material Preset System
// Cinema-grade physical material properties for MeshPhysicalMaterial
// ---------------------------------------------------------------------------

export interface AdvancedPBRPreset {
  // Iridescence (rainbow metallic shimmer)
  iridescence?: number; // 0-1
  iridescenceIOR?: number; // 1.0-2.33
  iridescenceThicknessRange?: [number, number]; // nm

  // Clearcoat (varnish/lacquer layer)
  clearcoat?: number; // 0-1
  clearcoatRoughness?: number; // 0-1

  // Sheen (fabric micro-fiber sheen)
  sheen?: number; // 0-1
  sheenRoughness?: number; // 0-1
  sheenColor?: string;

  // Anisotropy (brushed metal, silk)
  anisotropy?: number; // 0-1
  anisotropyRotation?: number; // radians

  // Dispersion (chromatic separation in glass)
  dispersion?: number; // 0-5

  // Subsurface (light penetration)
  transmission?: number; // 0-1
  thickness?: number; // 0-10
  attenuationColor?: string;
  attenuationDistance?: number;
}

export type MaterialCategory =
  | 'wood'
  | 'metal'
  | 'fabric'
  | 'leather'
  | 'glass'
  | 'plastic'
  | 'stone'
  | 'ceramic';

// ---------------------------------------------------------------------------
// Cinema-grade PBR presets per material category
// ---------------------------------------------------------------------------

const PBR_PRESETS: Record<MaterialCategory, AdvancedPBRPreset> = {
  wood: {
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
    sheen: 0.05,
    sheenRoughness: 0.5,
    sheenColor: '#8B7355',
  },

  metal: {
    iridescence: 0.1,
    iridescenceIOR: 1.8,
    iridescenceThicknessRange: [100, 400],
    anisotropy: 0.3,
    anisotropyRotation: 0,
    clearcoat: 0.1,
    clearcoatRoughness: 0.05,
  },

  fabric: {
    sheen: 0.6,
    sheenRoughness: 0.4,
    sheenColor: '#CCCCCC', // overridden by style color at runtime
  },

  leather: {
    clearcoat: 0.15,
    clearcoatRoughness: 0.3,
    sheen: 0.2,
    sheenRoughness: 0.6,
    sheenColor: '#5C4033',
  },

  glass: {
    dispersion: 0.5,
    iridescence: 0.05,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [100, 300],
    transmission: 0.9,
    thickness: 0.5,
    attenuationColor: '#ffffff',
    attenuationDistance: 2.0,
  },

  plastic: {
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
    sheen: 0.0,
  },

  stone: {
    clearcoat: 0.05,
    clearcoatRoughness: 0.4,
    sheen: 0.0,
    anisotropy: 0.0,
  },

  ceramic: {
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
    sheen: 0.0,
    iridescence: 0.02,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [200, 500],
  },
};

// ---------------------------------------------------------------------------
// Wet surface modifier
// Multiplies roughness by 0.3 and boosts environment map intensity.
// ---------------------------------------------------------------------------

export interface WetModifier {
  roughnessMultiplier: number;
  envMapIntensityBoost: number;
}

const WET_MODIFIER: WetModifier = {
  roughnessMultiplier: 0.3,
  envMapIntensityBoost: 1.5,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve the advanced PBR preset for a given material category.
 */
export function getAdvancedPBR(category: MaterialCategory): AdvancedPBRPreset {
  return { ...PBR_PRESETS[category] };
}

/**
 * Apply cinema-grade PBR properties to a MeshPhysicalMaterial in-place.
 */
export function applyAdvancedPBR(
  material: THREE.MeshPhysicalMaterial,
  category: MaterialCategory,
): void {
  const preset = PBR_PRESETS[category];

  // Iridescence
  if (preset.iridescence !== undefined) {
    material.iridescence = preset.iridescence;
  }
  if (preset.iridescenceIOR !== undefined) {
    material.iridescenceIOR = preset.iridescenceIOR;
  }
  if (preset.iridescenceThicknessRange !== undefined) {
    material.iridescenceThicknessRange = preset.iridescenceThicknessRange;
  }

  // Clearcoat
  if (preset.clearcoat !== undefined) {
    material.clearcoat = preset.clearcoat;
  }
  if (preset.clearcoatRoughness !== undefined) {
    material.clearcoatRoughness = preset.clearcoatRoughness;
  }

  // Sheen
  if (preset.sheen !== undefined) {
    material.sheen = preset.sheen;
  }
  if (preset.sheenRoughness !== undefined) {
    material.sheenRoughness = preset.sheenRoughness;
  }
  if (preset.sheenColor !== undefined) {
    material.sheenColor = new THREE.Color(preset.sheenColor);
  }

  // Anisotropy
  if (preset.anisotropy !== undefined) {
    material.anisotropy = preset.anisotropy;
  }
  if (preset.anisotropyRotation !== undefined) {
    material.anisotropyRotation = preset.anisotropyRotation;
  }

  // Dispersion
  if (preset.dispersion !== undefined) {
    material.dispersion = preset.dispersion;
  }

  // Subsurface / Transmission
  if (preset.transmission !== undefined) {
    material.transmission = preset.transmission;
  }
  if (preset.thickness !== undefined) {
    material.thickness = preset.thickness;
  }
  if (preset.attenuationColor !== undefined) {
    material.attenuationColor = new THREE.Color(preset.attenuationColor);
  }
  if (preset.attenuationDistance !== undefined) {
    material.attenuationDistance = preset.attenuationDistance;
  }

  material.needsUpdate = true;
}

/**
 * Apply a wet-surface modifier to a MeshPhysicalMaterial.
 * `wetness` ranges from 0 (dry) to 1 (fully wet).
 */
export function applyWetModifier(
  material: THREE.MeshPhysicalMaterial,
  wetness: number,
): void {
  const clampedWetness = Math.max(0, Math.min(1, wetness));

  // Lerp roughness toward wet value
  const wetRoughness = material.roughness * WET_MODIFIER.roughnessMultiplier;
  material.roughness = THREE.MathUtils.lerp(
    material.roughness,
    wetRoughness,
    clampedWetness,
  );

  // Boost environment map intensity
  const baseIntensity = material.envMapIntensity ?? 1.0;
  material.envMapIntensity = THREE.MathUtils.lerp(
    baseIntensity,
    baseIntensity * WET_MODIFIER.envMapIntensityBoost,
    clampedWetness,
  );

  material.needsUpdate = true;
}
