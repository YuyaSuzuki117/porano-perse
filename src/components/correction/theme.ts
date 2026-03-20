/**
 * 補正キャンバス テーマ定数
 * 全ハードコード色・定数を一元管理
 */

// --- レイアウト定数 ---
/** ルーラーの幅/高さ (px) */
export const RULER_SIZE = 20;

/** クリック判定距離の基準 (mm相当、zoom/scaleで調整して使う) */
export const HIT_THRESHOLD_PX = 10;

/** オートフィット時のパディング (px) */
export const AUTOFIT_PADDING = 80;

/** オートフィット時の最大ズーム */
export const AUTOFIT_MAX_ZOOM = 3;

/** Ctrl+0 リセット時のパディング */
export const FIT_ALL_PADDING = 120;

// --- テーマカラー ---
export const theme = {
  // キャンバス背景
  canvasBg: '#1a1a2e',

  // グリッド
  gridMinor: 'rgba(74, 106, 138, 0.12)',
  gridMajor: 'rgba(74, 106, 138, 0.3)',

  // 部屋ポリゴン
  room: {
    fillNormal: 'rgba(74, 144, 217, 0.1)',
    fillNormalHover: 'rgba(74, 144, 217, 0.25)',
    fillLowConf: 'rgba(239, 68, 68, 0.15)',
    fillLowConfHover: 'rgba(239, 68, 68, 0.3)',
    fillMedConf: 'rgba(245, 158, 11, 0.15)',
    fillMedConfHover: 'rgba(245, 158, 11, 0.3)',
    strokeNormal: '#4a90d9',
    strokeLowConf: '#ef4444',
    strokeMedConf: '#f59e0b',
  },

  // 壁線
  wall: {
    stroke: '#8ba4c4',
    strokeSelected: '#f97316',
    endpointFill: '#f97316',
    endpointStroke: '#fff',
  },

  // 寸法線
  dimension: {
    bgFill: 'rgba(13, 27, 42, 0.85)',
    textFill: '#8ba4c4',
  },

  // 什器
  fixture: {
    strokeNormal: '#22c55e80',
    strokeSelected: '#4ade80',
  },

  // 室名ラベル
  label: {
    nameNormal: '#4a90d9',
    nameUnknown: '#ef4444',
    areaNormal: '#6b8ab5',
  },

  // 頂点ハンドル
  vertex: {
    fillNormal: '#4a90d9',
    fillActive: '#f59e0b',
    innerFill: '#ffffff',
    outerStroke: '#0d1b2a',
  },

  // 選択ハイライト
  highlight: {
    stroke: '#f59e0b',
  },

  // 部屋追加 描画中
  addRoom: {
    stroke: '#22c55e',
    closingStroke: 'rgba(34, 197, 94, 0.3)',
    firstPointFill: '#f59e0b',
    pointFill: '#22c55e',
    pointStroke: '#0d1b2a',
    textFill: '#22c55e',
  },

  // 壁追加 描画中
  wallAdd: {
    pointFill: '#f97316',
    pointStroke: '#0d1b2a',
    lineStroke: '#f97316',
    textFill: '#f97316',
  },

  // 測定線
  measure: {
    pointFill: '#e879f9',
    pointStroke: '#0d1b2a',
    lineStroke: '#e879f9',
    bgFill: 'rgba(13, 27, 42, 0.9)',
    borderStroke: '#e879f9',
    textFill: '#e879f9',
    previewStroke: 'rgba(232, 121, 249, 0.5)',
    previewText: 'rgba(232, 121, 249, 0.7)',
  },

  // スナップインジケータ
  snap: {
    vertexStroke: '#f59e0b',
    endpointStroke: '#4ade80',
    midpointStroke: '#38bdf8',
    gridStroke: 'rgba(74, 144, 217, 0.5)',
  },

  // ルーラー
  ruler: {
    bgFill: 'rgba(13, 27, 42, 0.92)',
    textFill: '#4a6a8a',
    tickMajor: '#6b8ab5',
    tickMinor: '#3a5a7a',
    borderStroke: '#1e3a5f',
    markerFill: '#f59e0b',
  },

  // UI (ツールチップ、座標表示等)
  ui: {
    tooltipBg: '#0d1b2a',
    tooltipBorder: '#1e3a5f',
    tooltipText: '#c8d8e8',
    coordText: '#6b8ab5',
    snapBadge: '#f59e0b',
    hintText: '#6b8ab5',
  },
} as const;

/** テーマ型 */
export type Theme = typeof theme;
