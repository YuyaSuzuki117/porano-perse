import * as THREE from 'three';

/* ─── モジュールスコープ LRUキャッシュ (ジオメトリ/マテリアル) ────── */

/**
 * LRUキャッシュ: 最大サイズを超えたら最も古いエントリをdispose()して削除。
 * メモリリーク防止のためdisposable THREE.jsオブジェクトに特化。
 */
export class LRUCache<T extends { dispose: () => void }> {
  private cache = new Map<string, T>();
  constructor(private maxSize: number) {}

  get(key: string): T | undefined {
    const val = this.cache.get(key);
    if (val !== undefined) {
      // アクセス順を更新（削除→再挿入で末尾へ移動）
      this.cache.delete(key);
      this.cache.set(key, val);
    }
    return val;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    // maxSize超過時に最古エントリをdispose
    while (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        const oldest = this.cache.get(firstKey);
        this.cache.delete(firstKey);
        oldest?.dispose();
      }
    }
  }

  clear(): void {
    this.cache.forEach((val) => val.dispose());
    this.cache.clear();
  }
}

/** ジオメトリLRUキャッシュ: 最大200エントリ */
const geometryCache = new LRUCache<THREE.BufferGeometry>(200);

export function getCachedGeometry(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const geo = factory();
  geometryCache.set(key, geo);
  return geo;
}

/** マテリアルLRUキャッシュ: 最大100エントリ */
const materialCache = new LRUCache<THREE.Material>(100);

export function getCachedStandardMaterial(
  key: string,
  props: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  const existing = materialCache.get(key);
  if (existing) return existing as THREE.MeshStandardMaterial;
  const mat = new THREE.MeshStandardMaterial(props);
  materialCache.set(key, mat);
  return mat;
}

export function getCachedPhysicalMaterial(
  key: string,
  props: THREE.MeshPhysicalMaterialParameters,
): THREE.MeshPhysicalMaterial {
  const existing = materialCache.get(key);
  if (existing) return existing as THREE.MeshPhysicalMaterial;
  const mat = new THREE.MeshPhysicalMaterial(props);
  materialCache.set(key, mat);
  return mat;
}

/** キャッシュクリーンアップ関数（コンポーネントアンマウント時に呼び出し可能） */
export function cleanupFurnitureCaches(): void {
  geometryCache.clear();
  materialCache.clear();
}
