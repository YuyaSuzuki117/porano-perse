import { FurnitureType, StylePreset } from '@/types/scene';

/** 家具セット内の個別アイテム定義 */
export interface FurnitureSetItem {
  type: FurnitureType;
  name: string;
  offsetX: number;       // 部屋中心からの相対X位置
  offsetZ: number;       // 部屋中心からの相対Z位置
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

/** 家具セット定義 */
export interface FurnitureSet {
  id: string;
  name: string;          // 日本語名
  description: string;   // セットの説明
  icon: string;
  items: FurnitureSetItem[];
  recommendedStyles: StylePreset[];  // 推奨スタイル
}

// ============================================================
// 単品セット（既存 — 追加配置用）
// ============================================================

export const FURNITURE_SETS: FurnitureSet[] = [
  {
    id: 'table_4chairs',
    name: '4人テーブル',
    description: '四角テーブルと椅子4脚のダイニングセット',
    icon: '🍽️',
    recommendedStyles: ['cafe', 'japanese', 'scandinavian', 'retro'],
    items: [
      { type: 'table_square', name: '四角テーブル', offsetX: 0, offsetZ: 0, rotation: [0, 0, 0], scale: [0.8, 0.75, 0.8], color: '#A0522D' },
      { type: 'chair', name: '椅子', offsetX: 0, offsetZ: -0.55, rotation: [0, 0, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      { type: 'chair', name: '椅子', offsetX: 0, offsetZ: 0.55, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      { type: 'chair', name: '椅子', offsetX: -0.55, offsetZ: 0, rotation: [0, Math.PI / 2, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      { type: 'chair', name: '椅子', offsetX: 0.55, offsetZ: 0, rotation: [0, -Math.PI / 2, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
    ],
  },
  {
    id: 'table_2chairs',
    name: '2人テーブル',
    description: '丸テーブルと椅子2脚のカフェセット',
    icon: '☕',
    recommendedStyles: ['cafe', 'scandinavian', 'minimal'],
    items: [
      { type: 'table_round', name: '丸テーブル', offsetX: 0, offsetZ: 0, rotation: [0, 0, 0], scale: [0.7, 0.75, 0.7], color: '#A0522D' },
      { type: 'chair', name: '椅子', offsetX: 0, offsetZ: -0.5, rotation: [0, 0, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      { type: 'chair', name: '椅子', offsetX: 0, offsetZ: 0.5, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
    ],
  },
  {
    id: 'counter_3stools',
    name: 'カウンター+3席',
    description: 'カウンターとスツール3脚のバーセット',
    icon: '🪵',
    recommendedStyles: ['cafe', 'industrial', 'retro'],
    items: [
      { type: 'counter', name: 'カウンター', offsetX: 0, offsetZ: 0, rotation: [0, 0, 0], scale: [2.4, 1.1, 0.5], color: '#8B6914' },
      { type: 'stool', name: 'スツール', offsetX: -0.8, offsetZ: 0.6, rotation: [0, 0, 0], scale: [0.35, 0.7, 0.35], color: '#333' },
      { type: 'stool', name: 'スツール', offsetX: 0, offsetZ: 0.6, rotation: [0, 0, 0], scale: [0.35, 0.7, 0.35], color: '#333' },
      { type: 'stool', name: 'スツール', offsetX: 0.8, offsetZ: 0.6, rotation: [0, 0, 0], scale: [0.35, 0.7, 0.35], color: '#333' },
    ],
  },
  {
    id: 'sofa_table',
    name: 'ソファ+テーブル',
    description: 'ソファとローテーブルのリビングセット',
    icon: '🛋️',
    recommendedStyles: ['modern', 'luxury', 'scandinavian'],
    items: [
      { type: 'sofa', name: 'ソファ', offsetX: 0, offsetZ: -0.5, rotation: [0, 0, 0], scale: [1.8, 0.8, 0.8], color: '#8B7355' },
      { type: 'table_square', name: 'ローテーブル', offsetX: 0, offsetZ: 0.5, rotation: [0, 0, 0], scale: [0.9, 0.4, 0.5], color: '#A0522D' },
    ],
  },
  {
    id: 'waiting_area',
    name: '待合コーナー',
    description: 'ベンチ2台と小テーブル・観葉植物の待合セット',
    icon: '🏥',
    recommendedStyles: ['medical', 'modern', 'minimal'],
    items: [
      { type: 'bench', name: 'ベンチ', offsetX: -0.9, offsetZ: 0, rotation: [0, 0, 0], scale: [1.5, 0.45, 0.4], color: '#4682B4' },
      { type: 'bench', name: 'ベンチ', offsetX: 0.9, offsetZ: 0, rotation: [0, 0, 0], scale: [1.5, 0.45, 0.4], color: '#4682B4' },
      { type: 'table_round', name: '小テーブル', offsetX: 0, offsetZ: 0, rotation: [0, 0, 0], scale: [0.5, 0.45, 0.5], color: '#DEB887' },
      { type: 'plant', name: '観葉植物', offsetX: 0, offsetZ: 0.8, rotation: [0, 0, 0], scale: [0.4, 0.8, 0.4], color: '#228B22' },
    ],
  },
  {
    id: 'salon_station',
    name: '美容室セット',
    description: 'ミラー・施術台・サロンチェアの美容ステーション',
    icon: '💇',
    recommendedStyles: ['modern', 'luxury', 'minimal'],
    items: [
      { type: 'mirror', name: '大型ミラー', offsetX: 0, offsetZ: -0.6, rotation: [0, 0, 0], scale: [0.8, 1.4, 0.05], color: '#C0C0C0' },
      { type: 'counter', name: '施術台', offsetX: 0, offsetZ: -0.3, rotation: [0, 0, 0], scale: [1.0, 0.8, 0.5], color: '#333333' },
      { type: 'chair', name: 'サロンチェア', offsetX: 0, offsetZ: 0.3, rotation: [0, Math.PI, 0], scale: [0.55, 0.9, 0.55], color: '#1A1A1A' },
    ],
  },
  {
    id: 'fitness_corner',
    name: 'フィットネスセット',
    description: 'トレーニングベンチ・ミラー・ラックのジムコーナー',
    icon: '🏋️',
    recommendedStyles: ['industrial', 'modern'],
    items: [
      { type: 'bench', name: 'トレーニングベンチ', offsetX: 0, offsetZ: 0, rotation: [0, 0, 0], scale: [1.2, 0.5, 0.4], color: '#333333' },
      { type: 'mirror', name: 'ウォールミラー', offsetX: 0, offsetZ: -1.0, rotation: [0, 0, 0], scale: [1.5, 1.8, 0.05], color: '#D0D0D0' },
      { type: 'shelf', name: 'ダンベルラック', offsetX: 1.2, offsetZ: 0, rotation: [0, -Math.PI / 2, 0], scale: [0.6, 1.0, 0.4], color: '#444444' },
    ],
  },
  {
    id: 'boutique_display',
    name: 'ブティック陳列',
    description: 'ガラスケース・ハンガーラック・植物のディスプレイセット',
    icon: '👗',
    recommendedStyles: ['luxury', 'modern', 'minimal'],
    items: [
      { type: 'display_case', name: 'ガラスケース', offsetX: 0, offsetZ: 0, rotation: [0, 0, 0], scale: [1.2, 1.0, 0.5], color: '#B8D4E3' },
      { type: 'coat_rack', name: 'ハンガーラック', offsetX: 1.2, offsetZ: 0, rotation: [0, 0, 0], scale: [0.5, 1.6, 0.5], color: '#C9A84C' },
      { type: 'plant', name: '観葉植物', offsetX: -0.8, offsetZ: 0.6, rotation: [0, 0, 0], scale: [0.35, 0.7, 0.35], color: '#228B22' },
    ],
  },
];

// ============================================================
// 店舗タイプ別一括配置セット（部屋全体を家具で埋める）
// ============================================================

export const STORE_FURNITURE_SETS: FurnitureSet[] = [
  {
    id: 'store_cafe',
    name: 'カフェ基本',
    description: 'テーブル2台・椅子4脚・カウンター・レジの基本カフェレイアウト',
    icon: '☕',
    recommendedStyles: ['cafe', 'scandinavian', 'retro'],
    items: [
      // カウンター（奥壁側）
      { type: 'counter', name: 'カウンター', offsetX: 0, offsetZ: -2.5, rotation: [0, 0, 0], scale: [2.4, 1.1, 0.5], color: '#8B6914' },
      // レジ（カウンター右端）
      { type: 'register', name: 'レジカウンター', offsetX: 1.8, offsetZ: -2.5, rotation: [0, 0, 0], scale: [0.6, 1.0, 0.5], color: '#333333' },
      // テーブル1（左手前）
      { type: 'table_square', name: 'テーブル', offsetX: -1.5, offsetZ: 0.5, rotation: [0, 0, 0], scale: [0.8, 0.75, 0.8], color: '#A0522D' },
      { type: 'chair', name: '椅子', offsetX: -1.5, offsetZ: -0.05, rotation: [0, 0, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      { type: 'chair', name: '椅子', offsetX: -1.5, offsetZ: 1.05, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      // テーブル2（右手前）
      { type: 'table_square', name: 'テーブル', offsetX: 1.5, offsetZ: 0.5, rotation: [0, 0, 0], scale: [0.8, 0.75, 0.8], color: '#A0522D' },
      { type: 'chair', name: '椅子', offsetX: 1.5, offsetZ: -0.05, rotation: [0, 0, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      { type: 'chair', name: '椅子', offsetX: 1.5, offsetZ: 1.05, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      // 観葉植物（入口横）
      { type: 'plant', name: '観葉植物', offsetX: -2.5, offsetZ: 2.0, rotation: [0, 0, 0], scale: [0.5, 1.2, 0.5], color: '#228B22' },
    ],
  },
  {
    id: 'store_restaurant',
    name: 'レストラン',
    description: 'テーブル4台・椅子8脚・カウンターのレストランレイアウト',
    icon: '🍴',
    recommendedStyles: ['japanese', 'luxury', 'modern', 'retro'],
    items: [
      // カウンター（奥壁）
      { type: 'counter', name: 'カウンター', offsetX: 0, offsetZ: -3.0, rotation: [0, 0, 0], scale: [3.0, 1.1, 0.5], color: '#8B6914' },
      // テーブル1（左奥）
      { type: 'table_square', name: 'テーブル', offsetX: -2.0, offsetZ: -1.0, rotation: [0, 0, 0], scale: [0.8, 0.75, 0.8], color: '#A0522D' },
      { type: 'chair', name: '椅子', offsetX: -2.0, offsetZ: -1.55, rotation: [0, 0, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      { type: 'chair', name: '椅子', offsetX: -2.0, offsetZ: -0.45, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      // テーブル2（右奥）
      { type: 'table_square', name: 'テーブル', offsetX: 2.0, offsetZ: -1.0, rotation: [0, 0, 0], scale: [0.8, 0.75, 0.8], color: '#A0522D' },
      { type: 'chair', name: '椅子', offsetX: 2.0, offsetZ: -1.55, rotation: [0, 0, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      { type: 'chair', name: '椅子', offsetX: 2.0, offsetZ: -0.45, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      // テーブル3（左手前）
      { type: 'table_round', name: '丸テーブル', offsetX: -2.0, offsetZ: 1.5, rotation: [0, 0, 0], scale: [0.7, 0.75, 0.7], color: '#A0522D' },
      { type: 'chair', name: '椅子', offsetX: -2.0, offsetZ: 1.0, rotation: [0, 0, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      { type: 'chair', name: '椅子', offsetX: -2.0, offsetZ: 2.0, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      // テーブル4（右手前）
      { type: 'table_round', name: '丸テーブル', offsetX: 2.0, offsetZ: 1.5, rotation: [0, 0, 0], scale: [0.7, 0.75, 0.7], color: '#A0522D' },
      { type: 'chair', name: '椅子', offsetX: 2.0, offsetZ: 1.0, rotation: [0, 0, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
      { type: 'chair', name: '椅子', offsetX: 2.0, offsetZ: 2.0, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#654321' },
    ],
  },
  {
    id: 'store_office',
    name: 'オフィス',
    description: 'デスク4台・椅子4脚・収納棚2台のオフィスレイアウト',
    icon: '🏢',
    recommendedStyles: ['modern', 'minimal', 'scandinavian'],
    items: [
      // デスク×4（2列2行）
      { type: 'desk', name: 'デスク', offsetX: -1.5, offsetZ: -1.0, rotation: [0, 0, 0], scale: [1.2, 0.75, 0.6], color: '#A0896C' },
      { type: 'chair', name: 'オフィスチェア', offsetX: -1.5, offsetZ: -0.2, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#333333' },
      { type: 'desk', name: 'デスク', offsetX: 1.5, offsetZ: -1.0, rotation: [0, 0, 0], scale: [1.2, 0.75, 0.6], color: '#A0896C' },
      { type: 'chair', name: 'オフィスチェア', offsetX: 1.5, offsetZ: -0.2, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#333333' },
      { type: 'desk', name: 'デスク', offsetX: -1.5, offsetZ: 1.5, rotation: [0, 0, 0], scale: [1.2, 0.75, 0.6], color: '#A0896C' },
      { type: 'chair', name: 'オフィスチェア', offsetX: -1.5, offsetZ: 2.3, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#333333' },
      { type: 'desk', name: 'デスク', offsetX: 1.5, offsetZ: 1.5, rotation: [0, 0, 0], scale: [1.2, 0.75, 0.6], color: '#A0896C' },
      { type: 'chair', name: 'オフィスチェア', offsetX: 1.5, offsetZ: 2.3, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#333333' },
      // 収納棚×2（壁際）
      { type: 'shelf', name: '収納棚', offsetX: -3.0, offsetZ: -2.5, rotation: [0, Math.PI / 2, 0], scale: [1.2, 1.8, 0.4], color: '#DEB887' },
      { type: 'shelf', name: '収納棚', offsetX: 3.0, offsetZ: -2.5, rotation: [0, -Math.PI / 2, 0], scale: [1.2, 1.8, 0.4], color: '#DEB887' },
    ],
  },
  {
    id: 'store_salon_clinic',
    name: '美容室/医院',
    description: '施術台2台・カウンター・待合椅子3脚・棚の医療/美容レイアウト',
    icon: '💇‍♀️',
    recommendedStyles: ['medical', 'modern', 'minimal', 'luxury'],
    items: [
      // 受付カウンター（入口近く）
      { type: 'reception_desk', name: 'レセプションカウンター', offsetX: 0, offsetZ: 2.0, rotation: [0, Math.PI, 0], scale: [2.0, 1.1, 0.8], color: '#F5F0E8' },
      // 施術ステーション1（左壁側）
      { type: 'mirror', name: 'ミラー', offsetX: -2.5, offsetZ: -1.5, rotation: [0, Math.PI / 2, 0], scale: [0.8, 1.4, 0.05], color: '#C0C0C0' },
      { type: 'counter', name: '施術台', offsetX: -2.0, offsetZ: -1.5, rotation: [0, Math.PI / 2, 0], scale: [1.0, 0.8, 0.5], color: '#333333' },
      { type: 'chair', name: '施術チェア', offsetX: -1.2, offsetZ: -1.5, rotation: [0, -Math.PI / 2, 0], scale: [0.55, 0.9, 0.55], color: '#1A1A1A' },
      // 施術ステーション2（右壁側）
      { type: 'mirror', name: 'ミラー', offsetX: 2.5, offsetZ: -1.5, rotation: [0, -Math.PI / 2, 0], scale: [0.8, 1.4, 0.05], color: '#C0C0C0' },
      { type: 'counter', name: '施術台', offsetX: 2.0, offsetZ: -1.5, rotation: [0, -Math.PI / 2, 0], scale: [1.0, 0.8, 0.5], color: '#333333' },
      { type: 'chair', name: '施術チェア', offsetX: 1.2, offsetZ: -1.5, rotation: [0, Math.PI / 2, 0], scale: [0.55, 0.9, 0.55], color: '#1A1A1A' },
      // 待合椅子×3（手前）
      { type: 'bench', name: '待合ベンチ', offsetX: -1.2, offsetZ: 0.8, rotation: [0, 0, 0], scale: [1.0, 0.45, 0.4], color: '#4682B4' },
      { type: 'bench', name: '待合ベンチ', offsetX: 0, offsetZ: 0.8, rotation: [0, 0, 0], scale: [1.0, 0.45, 0.4], color: '#4682B4' },
      { type: 'bench', name: '待合ベンチ', offsetX: 1.2, offsetZ: 0.8, rotation: [0, 0, 0], scale: [1.0, 0.45, 0.4], color: '#4682B4' },
      // 棚（奥壁）
      { type: 'shelf', name: '棚', offsetX: 0, offsetZ: -3.0, rotation: [0, 0, 0], scale: [1.5, 1.8, 0.4], color: '#DEB887' },
    ],
  },
  {
    id: 'store_retail',
    name: '物販店',
    description: '棚4台・レジカウンター・コートラックの物販レイアウト',
    icon: '🛍️',
    recommendedStyles: ['modern', 'luxury', 'industrial', 'scandinavian'],
    items: [
      // レジカウンター（入口横）
      { type: 'register', name: 'レジカウンター', offsetX: 2.5, offsetZ: 2.0, rotation: [0, -Math.PI / 2, 0], scale: [0.6, 1.0, 0.5], color: '#333333' },
      // 棚×4（壁沿い左右）
      { type: 'shelf', name: '陳列棚', offsetX: -2.8, offsetZ: -2.0, rotation: [0, Math.PI / 2, 0], scale: [1.5, 1.8, 0.4], color: '#DEB887' },
      { type: 'shelf', name: '陳列棚', offsetX: -2.8, offsetZ: 0, rotation: [0, Math.PI / 2, 0], scale: [1.5, 1.8, 0.4], color: '#DEB887' },
      { type: 'shelf', name: '陳列棚', offsetX: 2.8, offsetZ: -2.0, rotation: [0, -Math.PI / 2, 0], scale: [1.5, 1.8, 0.4], color: '#DEB887' },
      { type: 'shelf', name: '陳列棚', offsetX: 2.8, offsetZ: 0, rotation: [0, -Math.PI / 2, 0], scale: [1.5, 1.8, 0.4], color: '#DEB887' },
      // ショーケース（中央）
      { type: 'display_case', name: 'ショーケース', offsetX: 0, offsetZ: -1.0, rotation: [0, 0, 0], scale: [1.5, 1.2, 0.6], color: '#B8D4E3' },
      // コートラック（衣類用）
      { type: 'coat_rack', name: 'ハンガーラック', offsetX: -1.0, offsetZ: 1.5, rotation: [0, 0, 0], scale: [0.5, 1.7, 0.5], color: '#333333' },
      { type: 'coat_rack', name: 'ハンガーラック', offsetX: 1.0, offsetZ: 1.5, rotation: [0, 0, 0], scale: [0.5, 1.7, 0.5], color: '#333333' },
    ],
  },
  {
    id: 'store_bar',
    name: 'バー/居酒屋',
    description: 'カウンター・ハイテーブル・棚のバーレイアウト',
    icon: '🍸',
    recommendedStyles: ['industrial', 'luxury', 'retro', 'japanese'],
    items: [
      // メインカウンター（奥壁沿い）
      { type: 'counter', name: 'バーカウンター', offsetX: 0, offsetZ: -2.5, rotation: [0, 0, 0], scale: [3.5, 1.1, 0.6], color: '#4A2810' },
      // カウンタースツール×4
      { type: 'stool', name: 'バースツール', offsetX: -1.2, offsetZ: -1.7, rotation: [0, 0, 0], scale: [0.35, 0.7, 0.35], color: '#333' },
      { type: 'stool', name: 'バースツール', offsetX: -0.4, offsetZ: -1.7, rotation: [0, 0, 0], scale: [0.35, 0.7, 0.35], color: '#333' },
      { type: 'stool', name: 'バースツール', offsetX: 0.4, offsetZ: -1.7, rotation: [0, 0, 0], scale: [0.35, 0.7, 0.35], color: '#333' },
      { type: 'stool', name: 'バースツール', offsetX: 1.2, offsetZ: -1.7, rotation: [0, 0, 0], scale: [0.35, 0.7, 0.35], color: '#333' },
      // ハイテーブル×2
      { type: 'bar_table', name: 'ハイテーブル', offsetX: -1.5, offsetZ: 1.0, rotation: [0, 0, 0], scale: [0.6, 1.1, 0.6], color: '#333333' },
      { type: 'bar_table', name: 'ハイテーブル', offsetX: 1.5, offsetZ: 1.0, rotation: [0, 0, 0], scale: [0.6, 1.1, 0.6], color: '#333333' },
      // バック棚（酒瓶ディスプレイ）
      { type: 'shelf', name: 'ボトル棚', offsetX: 0, offsetZ: -3.2, rotation: [0, 0, 0], scale: [2.0, 2.0, 0.35], color: '#4A2810' },
    ],
  },
  {
    id: 'store_bakery',
    name: 'ベーカリー/パン屋',
    description: 'ショーケース・陳列棚・レジ・イートインの小規模パン屋',
    icon: '🥐',
    recommendedStyles: ['cafe', 'scandinavian', 'retro'],
    items: [
      // ショーケース（入口正面）
      { type: 'display_case', name: 'パンショーケース', offsetX: 0, offsetZ: -1.0, rotation: [0, 0, 0], scale: [2.0, 1.0, 0.6], color: '#B8D4E3' },
      // 陳列棚（壁沿い）
      { type: 'shelf', name: 'パン陳列棚', offsetX: -2.5, offsetZ: -1.5, rotation: [0, Math.PI / 2, 0], scale: [1.5, 1.5, 0.5], color: '#C8A882' },
      { type: 'shelf', name: 'パン陳列棚', offsetX: -2.5, offsetZ: 0.5, rotation: [0, Math.PI / 2, 0], scale: [1.5, 1.5, 0.5], color: '#C8A882' },
      // レジ
      { type: 'register', name: 'レジカウンター', offsetX: 2.0, offsetZ: -1.5, rotation: [0, -Math.PI / 2, 0], scale: [0.6, 1.0, 0.5], color: '#333333' },
      // イートインテーブル
      { type: 'table_round', name: 'イートインテーブル', offsetX: 1.5, offsetZ: 1.5, rotation: [0, 0, 0], scale: [0.6, 0.75, 0.6], color: '#A0522D' },
      { type: 'chair', name: '椅子', offsetX: 1.5, offsetZ: 1.0, rotation: [0, 0, 0], scale: [0.4, 0.8, 0.4], color: '#654321' },
      { type: 'chair', name: '椅子', offsetX: 1.5, offsetZ: 2.0, rotation: [0, Math.PI, 0], scale: [0.4, 0.8, 0.4], color: '#654321' },
    ],
  },
  {
    id: 'store_coworking',
    name: 'コワーキング',
    description: 'ワークデスク・ソファ・本棚のコワーキングスペース',
    icon: '💻',
    recommendedStyles: ['modern', 'industrial', 'scandinavian', 'minimal'],
    items: [
      // 長テーブル（共有ワークスペース）
      { type: 'desk', name: '共有デスク', offsetX: 0, offsetZ: -1.0, rotation: [0, 0, 0], scale: [2.5, 0.75, 0.8], color: '#A0896C' },
      { type: 'chair', name: 'ワークチェア', offsetX: -0.8, offsetZ: -0.2, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#333333' },
      { type: 'chair', name: 'ワークチェア', offsetX: 0.8, offsetZ: -0.2, rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45], color: '#333333' },
      { type: 'chair', name: 'ワークチェア', offsetX: -0.8, offsetZ: -1.8, rotation: [0, 0, 0], scale: [0.45, 0.85, 0.45], color: '#333333' },
      { type: 'chair', name: 'ワークチェア', offsetX: 0.8, offsetZ: -1.8, rotation: [0, 0, 0], scale: [0.45, 0.85, 0.45], color: '#333333' },
      // リラックスコーナー
      { type: 'sofa', name: 'ソファ', offsetX: -2.0, offsetZ: 1.5, rotation: [0, Math.PI / 4, 0], scale: [1.5, 0.8, 0.7], color: '#5B8C5A' },
      { type: 'table_round', name: 'サイドテーブル', offsetX: -1.0, offsetZ: 2.0, rotation: [0, 0, 0], scale: [0.5, 0.45, 0.5], color: '#A0522D' },
      // 本棚（壁際）
      { type: 'bookcase', name: '本棚', offsetX: 2.5, offsetZ: -2.5, rotation: [0, -Math.PI / 2, 0], scale: [0.9, 2.0, 0.35], color: '#8B6914' },
      // 観葉植物
      { type: 'plant', name: '観葉植物', offsetX: 2.5, offsetZ: 1.5, rotation: [0, 0, 0], scale: [0.5, 1.2, 0.5], color: '#228B22' },
    ],
  },
  {
    id: 'store_japanese_restaurant',
    name: '和食店/居酒屋',
    description: '座敷風テーブル・カウンター・のれん掛けの和風レイアウト',
    icon: '🏮',
    recommendedStyles: ['japanese', 'retro'],
    items: [
      // カウンター（奥）
      { type: 'counter', name: '木製カウンター', offsetX: 0, offsetZ: -2.8, rotation: [0, 0, 0], scale: [3.0, 1.0, 0.5], color: '#6B3A2A' },
      // カウンタースツール
      { type: 'stool', name: 'スツール', offsetX: -1.0, offsetZ: -2.0, rotation: [0, 0, 0], scale: [0.35, 0.6, 0.35], color: '#4A3728' },
      { type: 'stool', name: 'スツール', offsetX: 0, offsetZ: -2.0, rotation: [0, 0, 0], scale: [0.35, 0.6, 0.35], color: '#4A3728' },
      { type: 'stool', name: 'スツール', offsetX: 1.0, offsetZ: -2.0, rotation: [0, 0, 0], scale: [0.35, 0.6, 0.35], color: '#4A3728' },
      // 座卓1（左）
      { type: 'table_square', name: '座卓', offsetX: -2.0, offsetZ: 0.5, rotation: [0, 0, 0], scale: [1.0, 0.35, 0.7], color: '#6B3A2A' },
      // 座卓2（右）
      { type: 'table_square', name: '座卓', offsetX: 2.0, offsetZ: 0.5, rotation: [0, 0, 0], scale: [1.0, 0.35, 0.7], color: '#6B3A2A' },
      // パーティション（個室風仕切り）
      { type: 'partition', name: '仕切り', offsetX: 0, offsetZ: 0.5, rotation: [0, 0, 0], scale: [0.1, 1.5, 0.05], color: '#C4A97D' },
      // 棚（酒/食器）
      { type: 'shelf', name: '食器棚', offsetX: -3.0, offsetZ: -2.5, rotation: [0, Math.PI / 2, 0], scale: [1.0, 1.8, 0.35], color: '#6B3A2A' },
      // 植物
      { type: 'plant', name: '竹', offsetX: 3.0, offsetZ: 2.0, rotation: [0, 0, 0], scale: [0.4, 1.5, 0.4], color: '#2E6B30' },
    ],
  },
];

/** 全セット統合（単品セット＋店舗セット） */
export const ALL_FURNITURE_SETS: FurnitureSet[] = [...FURNITURE_SETS, ...STORE_FURNITURE_SETS];
