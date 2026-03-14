/**
 * タイルテクスチャ ↔ FloorMesh 統合ヘルパー
 *
 * tile-grout-generator.ts のタイルテクスチャ生成関数と
 * FloorMesh.tsx のスタイル別フロアパターンを接続する。
 *
 * 統合ポイント:
 * - FloorMesh.tsx: useFloorTexture 内でスタイルに応じたテクスチャ取得に利用
 * - tile-grout-generator.ts: TileGroutConfig を各スタイル用にプリセット化
 * - types/scene.ts: StylePreset 型のスタイル名を入力として受け付ける
 */

import {
  TileGroutConfig,
  generateTileTexture,
  generateTileNormalMap,
  generateTileRoughnessMap,
} from '@/lib/tile-grout-generator';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** タイルフロア用テクスチャセット */
export interface TileFloorTextures {
  /** ディフューズ（アルベド）マップ */
  map: HTMLCanvasElement;
  /** 法線マップ（凹凸表現） */
  normalMap: HTMLCanvasElement;
  /** ラフネスマップ（光沢制御） */
  roughnessMap: HTMLCanvasElement;
}

// ---------------------------------------------------------------------------
// スタイル別タイル設定マップ
// ---------------------------------------------------------------------------

/**
 * スタイル名 → TileGroutConfig のマッピング
 *
 * タイル系スタイルのみ定義。
 * 木質フロア系（japanese, cafe, scandinavian, retro）は null を返す。
 */
const TILE_STYLE_CONFIGS: Record<string, TileGroutConfig | null> = {
  // --- タイル系スタイル ---

  /** メディカル: 白い正方形タイル、目立たない目地 */
  medical: {
    tileSize: 8,
    groutWidth: 0.015,
    groutColor: '#e8e4e0',
    tileColor: '#f5f3f0',
    tileVariation: 0.08,
    groutDepth: 0.3,
    pattern: 'grid',
  },

  /** モダン: 大判グレータイル、細い目地 */
  modern: {
    tileSize: 4,
    groutWidth: 0.01,
    groutColor: '#9a9590',
    tileColor: '#b8b2aa',
    tileVariation: 0.12,
    groutDepth: 0.4,
    pattern: 'grid',
  },

  /** インダストリアル: コンクリート調タイル、太い目地 */
  industrial: {
    tileSize: 6,
    groutWidth: 0.04,
    groutColor: '#706860',
    tileColor: '#9e9588',
    tileVariation: 0.2,
    groutDepth: 0.7,
    pattern: 'brick',
  },

  /** ミニマル: 白い大判タイル、ヘアライン目地 */
  minimal: {
    tileSize: 3,
    groutWidth: 0.008,
    groutColor: '#e0ddd8',
    tileColor: '#f0ede8',
    tileVariation: 0.05,
    groutDepth: 0.2,
    pattern: 'grid',
  },

  /** ラグジュアリー: 大理石調タイル、金色がかった目地 */
  luxury: {
    tileSize: 4,
    groutWidth: 0.012,
    groutColor: '#c8b898',
    tileColor: '#e8e0d4',
    tileVariation: 0.15,
    groutDepth: 0.35,
    pattern: 'grid',
  },

  // --- 木質フロア系スタイル（タイル不使用 → null） ---
  japanese: null,
  cafe: null,
  scandinavian: null,
  retro: null,
};

// ---------------------------------------------------------------------------
// メインAPI
// ---------------------------------------------------------------------------

/**
 * スタイル名に基づいてタイルフロア用テクスチャセットを取得
 *
 * タイル系スタイル（medical, modern, industrial, minimal, luxury）の場合、
 * tile-grout-generator の各関数でテクスチャを生成して返す。
 *
 * 木質フロア系スタイル（japanese, cafe, scandinavian, retro）の場合、
 * null を返す。呼び出し元で既存の木目テクスチャ処理にフォールバックすること。
 *
 * 未知のスタイル名も null を返す（安全なフォールバック）。
 *
 * @param styleName - StylePreset のスタイル名（例: 'modern', 'japanese'）
 * @param size - テクスチャ解像度（正方形ピクセル数、例: 512, 1024, 2048）
 * @returns テクスチャセット、またはタイル非対応スタイルの場合 null
 *
 * 統合ポイント:
 * - FloorMesh.tsx の useFloorTexture フック内で呼び出し、
 *   戻り値が null でなければタイルテクスチャとして適用する。
 * - キャッシュは tile-grout-generator.ts 内部で管理されるため、
 *   同一パラメータでの再呼び出しは即座にキャッシュヒットする。
 *
 * 使用例（FloorMesh.tsx 統合時）:
 * ```ts
 * const tileTextures = getTileFloorTextures(style.name, floorTexSize);
 * if (tileTextures) {
 *   // タイルテクスチャを使用
 *   const map = new THREE.CanvasTexture(tileTextures.map);
 *   const normalMap = new THREE.CanvasTexture(tileTextures.normalMap);
 *   const roughnessMap = new THREE.CanvasTexture(tileTextures.roughnessMap);
 * } else {
 *   // 既存の木目テクスチャ処理にフォールバック
 * }
 * ```
 */
export function getTileFloorTextures(
  styleName: string,
  size: number,
): TileFloorTextures | null {
  // スタイルに対応する設定を取得
  const config = TILE_STYLE_CONFIGS[styleName];

  // 未定義のスタイルまたは木質フロア系 → null
  if (config === null || config === undefined) {
    return null;
  }

  // tile-grout-generator の各関数でテクスチャを生成
  const map = generateTileTexture(config, size);
  const normalMap = generateTileNormalMap(config, size);
  const roughnessMap = generateTileRoughnessMap(config, size);

  return { map, normalMap, roughnessMap };
}
