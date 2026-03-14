import { StylePreset, StyleConfig } from '@/types/scene';

// 各スタイルの特徴を際立たせた色設定
export const STYLE_PRESETS: Record<StylePreset, StyleConfig> = {
  japanese: {
    name: 'japanese',
    nameJa: '和風',
    wallColor: '#F5E6D0',       // 土壁色
    floorColor: '#B8A84C',      // 畳の黄緑
    floorTexture: 'tatami',
    ceilingColor: '#F0EBE0',
    accentColor: '#8B4513',
    ambientIntensity: 0.7,
    spotlightIntensity: 1.2,
    spotlightColor: '#FFE0A0',  // 暖色の行灯風
    hemisphereSkyColor: '#FFF5E0',
    hemisphereGroundColor: '#8B7D3C',
    furniturePalette: { primary: '#8B6914', secondary: '#C4A97D', accent: '#2E4A30', metal: '#4A3728', fabric: '#D4C5A0' },
    furnitureRoughness: 0.78,   // 漆器: やや光沢のある木
    furnitureMetalness: 0.02,   // 漆の微かな映り込み
    woodType: 'walnut',
    fabricType: 'linen',
    metalFinish: 'matte',
  },
  modern: {
    name: 'modern',
    nameJa: 'モダン',
    wallColor: '#F8F8FF',       // 白基調
    floorColor: '#3A3A4A',      // ダークタイル
    floorTexture: 'tile',
    ceilingColor: '#FFFFFF',
    accentColor: '#2196F3',     // ブルーアクセント
    ambientIntensity: 0.8,
    spotlightIntensity: 1.5,
    spotlightColor: '#F0F4FF',  // やや青白い光
    hemisphereSkyColor: '#E8F0FF',
    hemisphereGroundColor: '#4A4A5A',
    furniturePalette: { primary: '#404040', secondary: '#808080', accent: '#2196F3', metal: '#C0C0C0', fabric: '#E0E0E0' },
    furnitureRoughness: 0.4,
    furnitureMetalness: 0.05,
    woodType: 'ash',
    fabricType: 'linen',
    metalFinish: 'polished',
  },
  cafe: {
    name: 'cafe',
    nameJa: 'カフェ',
    wallColor: '#FFF0E0',       // 暖かいベージュ
    floorColor: '#7A5A28',      // 濃い木目
    floorTexture: 'wood',
    ceilingColor: '#FFF5E6',
    accentColor: '#C87941',     // レンガ色アクセント
    ambientIntensity: 0.6,
    spotlightIntensity: 1.0,
    spotlightColor: '#FFD090',  // 暖色の間接照明
    hemisphereSkyColor: '#FFE8C8',
    hemisphereGroundColor: '#6B4A20',
    furniturePalette: { primary: '#6B3A2A', secondary: '#D4A76A', accent: '#8B6914', metal: '#8B7355', fabric: '#C8A882' },
    furnitureRoughness: 0.6,
    furnitureMetalness: 0.05,
    woodType: 'oak',
    fabricType: 'canvas',
    metalFinish: 'brass',
  },
  industrial: {
    name: 'industrial',
    nameJa: 'インダストリアル',
    wallColor: '#C0C0C8',       // コンクリートグレー
    floorColor: '#707078',      // ダークコンクリート
    floorTexture: 'concrete',
    ceilingColor: '#A0A0A8',
    accentColor: '#FF6B35',     // メタルオレンジ
    ambientIntensity: 0.5,
    spotlightIntensity: 1.8,
    spotlightColor: '#FFF0D0',  // 工業用照明
    hemisphereSkyColor: '#D0D0D8',
    hemisphereGroundColor: '#606068',
    furniturePalette: { primary: '#505050', secondary: '#707070', accent: '#FF6B35', metal: '#A0A0A0', fabric: '#808080' },
    furnitureRoughness: 0.75,   // コンクリート・鉄のマット感
    furnitureMetalness: 0.3,    // 金属パーツの映り込み強化
    woodType: 'oak',
    fabricType: 'canvas',
    metalFinish: 'oxidized',
  },
  minimal: {
    name: 'minimal',
    nameJa: 'ミニマル',
    wallColor: '#FAFAFA',
    floorColor: '#E0D8D0',      // ライトウッド
    floorTexture: 'wood',
    ceilingColor: '#FFFFFF',
    accentColor: '#333333',
    ambientIntensity: 0.8,
    spotlightIntensity: 1.0,
    spotlightColor: '#FFFFFF',
    hemisphereSkyColor: '#F5F5F5',
    hemisphereGroundColor: '#D0C8C0',
    furniturePalette: { primary: '#F0F0F0', secondary: '#D0D0D0', accent: '#333333', metal: '#E0E0E0', fabric: '#F5F5F5' },
    furnitureRoughness: 0.6,
    furnitureMetalness: 0.05,
    woodType: 'ash',
    fabricType: 'linen',
    metalFinish: 'matte',
  },
  luxury: {
    name: 'luxury',
    nameJa: 'ラグジュアリー',
    wallColor: '#2A1F1F',       // ダークウッド
    floorColor: '#E8E0D8',      // 白〜グレー大理石
    floorTexture: 'marble',
    ceilingColor: '#1E1818',
    accentColor: '#C9A84C',     // ゴールドアクセント
    ambientIntensity: 0.4,
    spotlightIntensity: 2.0,
    spotlightColor: '#FFD700',  // ゴールド照明
    hemisphereSkyColor: '#3A2A1A',
    hemisphereGroundColor: '#0A0808',
    furniturePalette: { primary: '#3D1F0A', secondary: '#6B3A2A', accent: '#C9B037', metal: '#D4AF37', fabric: '#4A0E2E' },
    furnitureRoughness: 0.25,   // 大理石・漆仕上げの光沢
    furnitureMetalness: 0.18,   // 深い映り込み
    woodType: 'mahogany',
    fabricType: 'velvet',
    metalFinish: 'polished',
  },
  scandinavian: {
    name: 'scandinavian',
    nameJa: '北欧',
    wallColor: '#F5F0E8',       // ナチュラルホワイト
    floorColor: '#C8B896',      // ライトオーク
    floorTexture: 'wood',
    ceilingColor: '#FAFAF5',
    accentColor: '#5B8C5A',     // モスグリーン
    ambientIntensity: 0.75,
    spotlightIntensity: 1.1,
    spotlightColor: '#FFF5E0',
    hemisphereSkyColor: '#F0EDE5',
    hemisphereGroundColor: '#B0A080',
    furniturePalette: { primary: '#E8D5B5', secondary: '#F0E6D3', accent: '#4A7C59', metal: '#B8B8B8', fabric: '#F5E6CC' },
    furnitureRoughness: 0.6,
    furnitureMetalness: 0.05,
    woodType: 'birch',
    fabricType: 'tweed',
    metalFinish: 'brushed',
  },
  retro: {
    name: 'retro',
    nameJa: 'レトロ',
    wallColor: '#E8D8C0',       // セピア調
    floorColor: '#6B4423',      // チェリーウッド
    floorTexture: 'checkerboard',
    ceilingColor: '#F0E8D8',
    accentColor: '#C04030',     // レトロレッド
    ambientIntensity: 0.55,
    spotlightIntensity: 1.3,
    spotlightColor: '#FFD890',
    hemisphereSkyColor: '#F0E0C0',
    hemisphereGroundColor: '#5A3A1A',
    furniturePalette: { primary: '#8B4513', secondary: '#D2691E', accent: '#FF6347', metal: '#CD853F', fabric: '#DEB887' },
    furnitureRoughness: 0.6,
    furnitureMetalness: 0.05,
    woodType: 'teak',
    fabricType: 'canvas',
    metalFinish: 'brass',
  },
  medical: {
    name: 'medical',
    nameJa: 'メディカル',
    wallColor: '#F0F4F8',       // 清潔感のある白
    floorColor: '#D0D8E0',      // 淡いグレータイル
    floorTexture: 'linoleum',
    ceilingColor: '#FFFFFF',
    accentColor: '#2E86AB',     // メディカルブルー
    ambientIntensity: 0.85,
    spotlightIntensity: 1.6,
    spotlightColor: '#F8FCFF',  // 昼白色
    hemisphereSkyColor: '#EEF2F6',
    hemisphereGroundColor: '#B0B8C0',
    furniturePalette: { primary: '#E8E8E8', secondary: '#FFFFFF', accent: '#4A90D9', metal: '#D0D0D0', fabric: '#F0F0F0' },
    furnitureRoughness: 0.3,
    furnitureMetalness: 0.0,
    woodType: 'pine',
    fabricType: 'linen',
    metalFinish: 'matte',
  },
};
