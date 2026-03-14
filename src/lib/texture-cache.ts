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

/**
 * キャッシュからテクスチャを取得。未キャッシュなら generator で生成しキャッシュ。
 * 返却テクスチャは wrapS/wrapT = RepeatWrapping 設定済み。
 *
 * 注意: repeat はテクスチャごとではなく壁の長さに応じて異なるため、
 * 呼び出し側で clone() してから repeat を設定すること。
 */
export function getCachedTexture(
  key: string,
  generator: () => HTMLCanvasElement,
): THREE.CanvasTexture {
  const existing = textureCache.get(key);
  if (existing) return existing;

  const canvas = generator();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  textureCache.set(key, texture);
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
    return;
  }
  for (const [key, tex] of textureCache) {
    if (key.startsWith(keyPrefix)) {
      tex.dispose();
      textureCache.delete(key);
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
  /** ノーマルマップを使用するか（low では省略） */
  useNormalMap: boolean;
}

/** 品質レベルに応じたテクスチャ解像度を返す */
export function getTextureResolution(
  qualityLevel: 'high' | 'medium' | 'low',
): TextureResolution {
  switch (qualityLevel) {
    case 'high':
      return { wall: 512, floor: 1024, normal: 512, roughness: 512, useNormalMap: true };
    case 'medium':
      return { wall: 256, floor: 512, normal: 256, roughness: 256, useNormalMap: true };
    case 'low':
      return { wall: 128, floor: 256, normal: 128, roughness: 128, useNormalMap: false };
  }
}
