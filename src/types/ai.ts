/**
 * ai.ts
 *
 * AI関連の型定義
 * スタイル分析・レイアウト提案で使用する共通型
 */

/** 参考写真から抽出されたインテリアスタイル分析結果 */
export interface StyleAnalysis {
  /** インテリアスタイル分類 */
  style:
    | 'modern'
    | 'japanese'
    | 'industrial'
    | 'scandinavian'
    | 'natural'
    | 'luxury'
    | 'retro'
    | 'cafe'
    | 'minimal'
  /** 分類の確信度 (0-1) */
  confidence: number
  /** 抽出されたカラーパレット */
  colors: {
    /** メインカラー (hex) */
    primary: string
    /** サブカラー (hex) */
    secondary: string
    /** アクセントカラー (hex) */
    accent: string
  }
  /** 使用されている素材 */
  materials: (
    | 'wood'
    | 'concrete'
    | 'metal'
    | 'fabric'
    | 'glass'
    | 'stone'
    | 'leather'
  )[]
  /** 照明の色温度傾向 */
  lighting: 'warm' | 'neutral' | 'cool'
  /** 空間の雰囲気（日本語1行） */
  atmosphere: string
  /** 推奨家具カテゴリ */
  furnitureSuggestions: string[]
  /** 推定予算レンジ */
  estimatedBudgetRange: {
    /** 最低予算（万円） */
    min: number
    /** 最高予算（万円） */
    max: number
  }
}

/** AI提案の家具配置アイテム */
export interface LayoutFurnitureItem {
  /** 家具カテゴリ（furniture.ts のカテゴリに準拠） */
  type: string
  /** 日本語名 */
  name: string
  /** X座標（メートル、部屋原点から） */
  x: number
  /** Z座標（メートル、部屋原点から） */
  z: number
  /** 回転角（ラジアン） */
  rotation: number
  /** 幅（メートル） */
  width: number
  /** 奥行き（メートル） */
  depth: number
}

/** レイアウト提案1パターン分 */
export interface LayoutSuggestion {
  /** レイアウト名（日本語） */
  layoutName: string
  /** レイアウトの説明 */
  description: string
  /** 配置する家具一覧 */
  furniture: LayoutFurnitureItem[]
  /** この配置が最適な理由（日本語） */
  reasoning: string
  /** 推定座席数/収容人数 */
  capacityEstimate: number
  /** 動線スコア (0-100) */
  flowScore: number
}

/** 業種タイプ */
export type BusinessType =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'office'
  | 'shop'
  | 'salon'
  | 'clinic'
