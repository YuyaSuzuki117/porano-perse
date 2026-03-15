/**
 * ai-style-analyzer.ts
 *
 * 参考写真からインテリアスタイルを分析する機能
 * Gemini 2.5 Flash のマルチモーダル機能を活用し、
 * 写真から色彩・素材・照明・雰囲気を抽出する
 */

import type { StyleAnalysis } from '@/types/ai'
import { generateWithImage, extractJson } from './gemini-client'

/** 業種別の追加プロンプト */
const BUSINESS_TYPE_CONTEXT: Record<string, string> = {
  restaurant: '飲食店（レストラン）向けの提案を重視してください。衛生面・厨房動線・客席レイアウトを考慮。',
  cafe: 'カフェ向けの提案を重視してください。居心地の良さ・滞在時間・SNS映えを考慮。',
  bar: 'バー向けの提案を重視してください。照明演出・カウンター配置・大人の雰囲気を考慮。',
  office: 'オフィス向けの提案を重視してください。生産性・集中とコミュニケーションのバランスを考慮。',
  shop: '物販店舗向けの提案を重視してください。商品の見せ方・回遊動線・VMDを考慮。',
  salon: '美容サロン向けの提案を重視してください。リラックス感・施術スペース・プライバシーを考慮。',
  clinic: 'クリニック向けの提案を重視してください。清潔感・安心感・待合スペースの快適性を考慮。',
}

/** スタイル分析用のシステムプロンプト */
function buildSystemPrompt(businessType?: string): string {
  const basePrompt = `あなたは日本の店舗内装デザインの専門家です。
写真から内装スタイル・色彩・素材・照明を正確に分析してください。

以下のJSON形式で出力してください:
{
  "style": "modern" | "japanese" | "industrial" | "scandinavian" | "natural" | "luxury" | "retro" | "cafe" | "minimal",
  "confidence": 0〜1の数値,
  "colors": {
    "primary": "#hex形式のメインカラー",
    "secondary": "#hex形式のサブカラー",
    "accent": "#hex形式のアクセントカラー"
  },
  "materials": ["wood", "concrete", "metal", "fabric", "glass", "stone", "leather" から該当するものを選択],
  "lighting": "warm" | "neutral" | "cool",
  "atmosphere": "空間の雰囲気を日本語1行で記述",
  "furnitureSuggestions": ["推奨する家具カテゴリを日本語で3〜5個"],
  "estimatedBudgetRange": {
    "min": 最低予算（万円、整数）,
    "max": 最高予算（万円、整数）
  }
}

分析のポイント:
- 色は写真から実際に見える色を抽出（推測ではなく観察に基づく）
- 素材は質感から判断（光沢・マット・テクスチャに注目）
- 照明は色温度と明るさの両方を考慮
- 予算は日本の店舗内装の相場に基づいて推定（坪単価ベース）
- 家具は写真のスタイルに合うものを提案`

  if (businessType && BUSINESS_TYPE_CONTEXT[businessType]) {
    return `${basePrompt}\n\n${BUSINESS_TYPE_CONTEXT[businessType]}`
  }

  return basePrompt
}

/**
 * 参考写真からインテリアスタイルを分析
 *
 * @param imageBase64 - Base64エンコードされた画像データ
 * @param mimeType - 画像のMIMEタイプ（image/jpeg, image/png 等）
 * @param businessType - 業種（任意、指定するとその業種に合わせた提案に調整）
 * @returns スタイル分析結果、失敗時は null
 */
export async function analyzeStyleFromPhoto(
  imageBase64: string,
  mimeType: string,
  businessType?: string
): Promise<StyleAnalysis | null> {
  try {
    const userPrompt = businessType
      ? `この店舗写真のインテリアスタイルを分析してください。業種: ${businessType}`
      : 'この店舗写真のインテリアスタイルを分析してください。'

    const rawText = await generateWithImage({
      systemPrompt: buildSystemPrompt(businessType),
      userPrompt,
      imageBase64,
      mimeType,
      maxOutputTokens: 500,
      temperature: 0.3,
    })

    const result = extractJson<StyleAnalysis>(rawText)
    if (!result) {
      console.error('[StyleAnalyzer] JSON抽出失敗:', rawText.slice(0, 200))
      return null
    }

    // バリデーション: 必須フィールドの存在確認
    if (!result.style || !result.colors || typeof result.confidence !== 'number') {
      console.error('[StyleAnalyzer] 必須フィールド不足:', result)
      return null
    }

    // confidence を 0-1 にクランプ
    result.confidence = Math.max(0, Math.min(1, result.confidence))

    return result
  } catch (error) {
    console.error('[StyleAnalyzer] 分析エラー:', error)
    return null
  }
}
