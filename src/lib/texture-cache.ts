/**
 * テクスチャキャッシュユーティリティ
 *
 * スタイル名+色のキーでCanvas生成テクスチャをキャッシュし、
 * 同一パラメータの壁/床/天井でテクスチャインスタンスを共有する。
 * これにより、壁ごとに毎回Canvas描画+テクスチャ生成が走るのを防ぐ。
 */
import * as THREE from 'three';

/** キャッシュ本体 */
const textureCache = new Map<string, THREE.CanvasTexture>();
/** LRU用アクセス順序追跡 */
const accessOrder: string[] = [];
/** キャッシュ上限（テクスチャ数） — モバイルWebGL制限を考慮 */
const MAX_CACHE_SIZE = 64;

/** LRUキャッシュのアクセス記録を更新 */
function touchCacheEntry(key: string): void {
  const idx = accessOrder.indexOf(key);
  if (idx >= 0) accessOrder.splice(idx, 1);
  accessOrder.push(key);
}

/** LRU追放: 古いエントリを削除してメモリを解放 */
function evictIfNeeded(): void {
  while (textureCache.size >= MAX_CACHE_SIZE && accessOrder.length > 0) {
    const oldest = accessOrder.shift()!;
    const tex = textureCache.get(oldest);
    if (tex) {
      tex.dispose();
      textureCache.delete(oldest);
    }
  }
}

/**
 * キャッシュからテクスチャを取得。未キャッシュなら generator で生成しキャッシュ。
 * 返却テクスチャは wrapS/wrapT = RepeatWrapping 設定済み。
 * LRU追放機構により、上限(64)を超えたらアクセスが最も古いテクスチャを自動解放。
 *
 * 注意: repeat はテクスチャごとではなく壁の長さに応じて異なるため、
 * 呼び出し側で clone() してから repeat を設定すること。
 */
export function getCachedTexture(
  key: string,
  generator: () => HTMLCanvasElement,
): THREE.CanvasTexture {
  const existing = textureCache.get(key);
  if (existing) {
    touchCacheEntry(key);
    return existing;
  }

  // 上限到達時にLRU追放
  evictIfNeeded();

  const canvas = generator();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  textureCache.set(key, texture);
  touchCacheEntry(key);
  return texture;
}

/**
 * キャッシュを無効化（テクスチャも dispose）。
 * keyPrefix を指定すると、そのプレフィックスに一致するエントリのみ削除。
 * 省略時は全エントリを削除。
 */
export function invalidateTextureCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    textureCache.forEach((t) => t.dispose());
    textureCache.clear();
    accessOrder.length = 0;
    return;
  }
  for (const [key, tex] of textureCache) {
    if (key.startsWith(keyPrefix)) {
      tex.dispose();
      textureCache.delete(key);
      const idx = accessOrder.indexOf(key);
      if (idx >= 0) accessOrder.splice(idx, 1);
    }
  }
}

/** 現在のキャッシュエントリ数を返す（デバッグ用） */
export function getTextureCacheSize(): number {
  return textureCache.size;
}

/* ─── 品質レベル別テクスチャ解像度 ─────────────────────────────── */

export interface TextureResolution {
  /** 壁テクスチャ解像度 */
  wall: number;
  /** 床テクスチャ解像度 */
  floor: number;
  /** ノーマルマップ解像度 */
  normal: number;
  /** ラフネスマップ解像度 */
  roughness: number;
  /** 家具テクスチャ解像度 */
  furniture: number;
  /** ノーマルマップを使用するか（low では省略） */
  useNormalMap: boolean;
}

/** 品質レベルに応じたテクスチャ解像度を返す */
export function getTextureResolution(
  qualityLevel: 'high' | 'medium' | 'low',
): TextureResolution {
  switch (qualityLevel) {
    case 'high':
      return { wall: 2048, floor: 2048, normal: 2048, roughness: 1024, furniture: 2048, useNormalMap: true };
    case 'medium':
      return { wall: 2048, floor: 2048, normal: 512, roughness: 512, furniture: 1024, useNormalMap: true };
    case 'low':
      return { wall: 512, floor: 512, normal: 256, roughness: 256, furniture: 512, useNormalMap: false };
  }
}
