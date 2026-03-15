/**
 * ai-layout-suggester.ts
 *
 * 業種と部屋サイズから最適な家具レイアウトを提案する機能
 * 3パターン（効率重視/快適重視/デザイン重視）を生成し、
 * 日本の建築基準に準拠した配置を行う
 *
 * v2: layout-rules.ts の業種別ルール・距離制約・動線分析を統合
 */

import type { LayoutSuggestion, BusinessType } from '@/types/ai'
import { generateText, extractJson } from './gemini-client'
import {
  buildLayoutRulesPrompt,
  validateAndFixLayout,
  calculateLayoutQuality,
  BUSINESS_FURNITURE_RULES,
} from './layout-rules'
import type { LayoutQualityScore } from './layout-rules'

/** レイアウト提案のリクエストパラメータ */
export interface LayoutSuggestParams {
  /** 業種 */
  businessType: BusinessType | string
  /** 部屋の幅（メートル） */
  roomWidth: number
  /** 部屋の奥行き（メートル） */
  roomDepth: number
  /** インテリアスタイル（任意） */
  style?: string
  /** 追加要件（自由テキスト） */
  requirements?: string
  /** 希望座席数（任意） */
  seatCount?: number
}

/** スコア付きレイアウト提案 */
export interface ScoredLayoutSuggestion extends LayoutSuggestion {
  /** 品質スコア */
  qualityScore: LayoutQualityScore
}

/** 業種ごとの代表的な家具構成 */
const BUSINESS_FURNITURE_GUIDE: Record<string, string> = {
  restaurant:
    'テーブル（2人用/4人用）、椅子、カウンター、レジ台、棚、パーティション。厨房エリアは含めず客席エリアのみ。',
  cafe:
    'カフェテーブル、ソファ席、カウンター席、スツール、本棚、レジ台、ディスプレイ棚。',
  bar:
    'バーカウンター、ハイスツール、ローテーブル、ソファ、棚（ボトルラック）、氷冷蔵庫スペース。',
  office:
    'デスク、オフィスチェア、ミーティングテーブル、本棚、キャビネット、ホワイトボード。',
  shop:
    '陳列棚、ディスプレイテーブル、レジカウンター、フィッティングルーム、ストック棚。',
  salon:
    'セットチェア、シャンプー台、待合ソファ、レセプション台、鏡台、ワゴン。',
  clinic:
    '診察デスク、診察ベッド、待合椅子、受付カウンター、カーテンレール、キャビネット。',
}

/** レイアウト提案用のシステムプロンプト */
function buildSystemPrompt(params: LayoutSuggestParams): string {
  const furnitureGuide =
    BUSINESS_FURNITURE_GUIDE[params.businessType] ||
    'テーブル、椅子、カウンター、棚など業種に合った家具を配置してください。'

  const area = params.roomWidth * params.roomDepth
  const tsubo = area / 3.3

  // 業種別配置ルールの注入
  const layoutRules = buildLayoutRulesPrompt(
    params.businessType as string,
    params.roomWidth,
    params.roomDepth,
  )

  // 業種別の必須家具情報
  const rules = BUSINESS_FURNITURE_RULES[params.businessType as string]
  const requiredFurnitureNote = rules
    ? `\n### 必須家具（必ず含めること）\n${rules.required.map((f) => `- ${f}`).join('\n')}`
    : ''

  return `あなたは日本の店舗レイアウト設計の専門家です。
指定された業種と部屋サイズに基づき、最適な家具レイアウトを3パターン提案してください。

## 部屋情報
- 幅: ${params.roomWidth}m × 奥行き: ${params.roomDepth}m
- 面積: ${area.toFixed(1)}m²（約${tsubo.toFixed(1)}坪）
- 業種: ${params.businessType}
${params.style ? `- スタイル: ${params.style}` : ''}
${params.requirements ? `- 追加要件: ${params.requirements}` : ''}
${params.seatCount ? `- 希望座席数: ${params.seatCount}人` : ''}

## 代表的な家具
${furnitureGuide}
${requiredFurnitureNote}
${layoutRules}

## 配置ルール（厳守）
1. 壁から最低0.3m離す（家具の端が壁に接触しない）
2. 通路幅は最低0.8m確保（日本の建築基準・車椅子対応）
3. テーブル間の間隔は最低0.6m確保
4. 椅子を引くスペースとして背面に0.5m確保
5. 避難経路を必ず1つ以上確保（入口から最も遠い席まで直線的にアクセス可能）
6. 入口正面には大型家具を置かない（動線遮断防止）
7. 家具同士が重ならないよう座標を計算
8. x座標は 0 〜 ${params.roomWidth}m、z座標は 0 〜 ${params.roomDepth}m の範囲内
9. rotation はラジアン（0, Math.PI/2, Math.PI, 3*Math.PI/2 のいずれか推奨）
10. 入口は z=0m の中央付近と想定

## 3パターン
1. 効率重視: 座席数・収容人数を最大化。回転率重視。
2. 快適重視: ゆとりある配置。滞在時間・満足度重視。
3. デザイン重視: 見栄え・空間演出重視。SNS映え・ブランディング考慮。

## 出力形式（JSON配列）
[
  {
    "layoutName": "効率重視レイアウト",
    "description": "レイアウトの説明",
    "furniture": [
      {
        "type": "家具カテゴリ英語名",
        "name": "日本語名",
        "x": X座標(m),
        "z": Z座標(m),
        "rotation": 回転角(ラジアン),
        "width": 幅(m),
        "depth": 奥行き(m)
      }
    ],
    "reasoning": "この配置が最適な理由（日本語）",
    "capacityEstimate": 推定収容人数,
    "flowScore": 動線スコア(0-100)
  }
]

重要: 必ず3パターン返してください。家具のtypeは英語（table, chair, counter, shelf, sofa, desk, partition, register, stool, mirror, reception_desk, sink, fridge, display_case, bench, plant 等）で統一。`
}

/**
 * 業種と部屋サイズから最適な家具レイアウトを3パターン提案
 * v2: 業種別ルール注入、重なり検出・壁衝突修正、品質スコア付き
 *
 * @param params - 業種・部屋サイズ・スタイル・追加要件
 * @returns スコア付きレイアウト提案3パターン、失敗時は null
 */
export async function suggestLayout(
  params: LayoutSuggestParams
): Promise<ScoredLayoutSuggestion[] | null> {
  // 入力バリデーション
  if (params.roomWidth <= 0 || params.roomDepth <= 0) {
    console.error('[LayoutSuggester] 部屋サイズが不正:', params.roomWidth, params.roomDepth)
    return null
  }

  if (params.roomWidth > 100 || params.roomDepth > 100) {
    console.error('[LayoutSuggester] 部屋サイズが大きすぎます（100m超）')
    return null
  }

  try {
    const userPrompt = `${params.businessType}の店舗レイアウトを提案してください。部屋: ${params.roomWidth}m × ${params.roomDepth}m${params.seatCount ? `、希望座席数: ${params.seatCount}人` : ''}${params.requirements ? `。要件: ${params.requirements}` : ''}`

    const rawText = await generateText({
      systemPrompt: buildSystemPrompt(params),
      userPrompt,
      maxOutputTokens: 4000,
      temperature: 0.7,
    })

    const suggestions = extractJson<LayoutSuggestion[]>(rawText)
    if (!suggestions || !Array.isArray(suggestions)) {
      console.error('[LayoutSuggester] JSON抽出失敗:', rawText.slice(0, 300))
      return null
    }

    // バリデーション + 修正 + スコア計算
    const scored: ScoredLayoutSuggestion[] = suggestions.map((suggestion) => {
      // 基本バリデーション（範囲外除外）
      const filtered: LayoutSuggestion = {
        ...suggestion,
        furniture: suggestion.furniture.filter((item) => {
          const inBounds =
            item.x >= -0.5 &&
            item.x <= params.roomWidth + 0.5 &&
            item.z >= -0.5 &&
            item.z <= params.roomDepth + 0.5
          if (!inBounds) {
            console.warn(
              `[LayoutSuggester] 範囲外の家具を除外: ${item.name} (x=${item.x}, z=${item.z})`
            )
          }
          return inBounds
        }),
        flowScore: Math.max(0, Math.min(100, suggestion.flowScore ?? 50)),
        capacityEstimate: Math.max(1, Math.round(suggestion.capacityEstimate ?? 1)),
      }

      // 壁衝突修正 + 重なり除去
      const validated = validateAndFixLayout(filtered, params.roomWidth, params.roomDepth)

      // 品質スコア計算
      const qualityScore = calculateLayoutQuality(
        validated,
        params.roomWidth,
        params.roomDepth,
        params.businessType as string,
      )

      return {
        ...validated,
        qualityScore,
      }
    })

    // スコア順にソート（高い順）
    scored.sort((a, b) => b.qualityScore.total - a.qualityScore.total)

    return scored
  } catch (error) {
    console.error('[LayoutSuggester] 提案エラー:', error)
    throw error
  }
}
