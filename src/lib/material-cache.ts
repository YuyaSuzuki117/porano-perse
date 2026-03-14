/**
 * マテリアルキャッシュプール
 *
 * 同色・同パラメータのマテリアルを共有し、GPU上のマテリアルインスタンス数を削減。
 * 家具で多用される meshStandardMaterial / meshPhysicalMaterial / meshBasicMaterial を対象。
 */
import * as THREE from 'three';

// ─── Standard Material Cache ───────────────────────────────────
const standardCache = new Map<string, THREE.MeshStandardMaterial>();

export function getCachedStandardMaterial(params: {
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}): THREE.MeshStandardMaterial {
  const key = `std-${params.color}-${params.roughness}-${params.metalness}-${params.emissive ?? ''}-${params.emissiveIntensity ?? 0}-${params.transparent ?? false}-${params.opacity ?? 1}-${params.side ?? THREE.FrontSide}`;
  const existing = standardCache.get(key);
  if (existing) return existing;

  const mat = new THREE.MeshStandardMaterial({
    color: params.color,
    roughness: params.roughness,
    metalness: params.metalness,
    emissive: params.emissive || undefined,
    emissiveIntensity: params.emissiveIntensity || 0,
    transparent: params.transparent || false,
    opacity: params.opacity ?? 1,
    side: params.side ?? THREE.FrontSide,
  });
  standardCache.set(key, mat);
  return mat;
}

// ─── Basic Material Cache ──────────────────────────────────────
const basicCache = new Map<string, THREE.MeshBasicMaterial>();

export function getCachedBasicMaterial(params: {
  color: string;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  side?: THREE.Side;
}): THREE.MeshBasicMaterial {
  const key = `basic-${params.color}-${params.transparent ?? false}-${params.opacity ?? 1}-${params.depthWrite ?? true}-${params.side ?? THREE.FrontSide}`;
  const existing = basicCache.get(key);
  if (existing) return existing;

  const mat = new THREE.MeshBasicMaterial({
    color: params.color,
    transparent: params.transparent || false,
    opacity: params.opacity ?? 1,
    depthWrite: params.depthWrite ?? true,
    side: params.side ?? THREE.FrontSide,
  });
  basicCache.set(key, mat);
  return mat;
}

// ─── Shared Geometry Constants ─────────────────────────────────
// 頻繁に使用されるジオメトリをモジュールレベルで共有

/** 選択リングジオメトリ (外径/内径は scale で調整) */
export const SHARED_RING_GEOMETRY = new THREE.RingGeometry(0.4, 0.5, 32);

/** LOD用ボックスジオメトリ (スケールで調整) */
export const LOD_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

/** 円柱ジオメトリ (脚など) seg=8 */
export const LEG_CYLINDER_GEO_8 = new THREE.CylinderGeometry(1, 1, 1, 8);
/** 円柱ジオメトリ seg=12 */
export const LEG_CYLINDER_GEO_12 = new THREE.CylinderGeometry(1, 1, 1, 12);

// ─── キャッシュ統計 ──────────────────────────────────────────────
export function getMaterialCacheStats() {
  return {
    standard: standardCache.size,
    basic: basicCache.size,
  };
}

// ─── キャッシュクリア ────────────────────────────────────────────
export function clearMaterialCache(): void {
  standardCache.forEach((m) => m.dispose());
  standardCache.clear();
  basicCache.forEach((m) => m.dispose());
  basicCache.clear();
}
