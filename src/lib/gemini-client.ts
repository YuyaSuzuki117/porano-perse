/**
 * gemini-client.ts
 *
 * Gemini クライアント（Google AI Studio 無料枠専用）
 * - モデル: gemini-2.5-flash
 * - シングルトンパターンでクライアントを管理
 * - responseMimeType: 'application/json' でJSON出力を強制
 * - temperature デフォルト 0（オプションで変更可能）
 */

import { GoogleGenAI } from '@google/genai'

// シングルトンインスタンス
let _client: GoogleGenAI | null = null

/** クライアントを取得（未設定なら null） */
function getClient(): GoogleGenAI | null {
  if (_client) return _client

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  _client = new GoogleGenAI({ apiKey })
  return _client
}

/** 使用モデル: gemini-2.5-flash（最新・無料枠対応） */
const MODEL = 'gemini-2.5-flash'

/** Gemini API が利用可能かチェック */
export function isGeminiAvailable(): boolean {
  return !!getClient()
}

/** テキストのみで生成 */
export async function generateText(params: {
  systemPrompt: string
  userPrompt: string
  maxOutputTokens?: number
  temperature?: number
}): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('Gemini client not available — GEMINI_API_KEY を設定してください')

  const response = await client.models.generateContent({
    model: MODEL,
    contents: params.userPrompt,
    config: {
      systemInstruction: params.systemPrompt,
      maxOutputTokens: params.maxOutputTokens ?? 200,
      temperature: params.temperature ?? 0,
      topK: 1,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  return response.text ?? ''
}

/** 画像付きで生成 */
export async function generateWithImage(params: {
  systemPrompt: string
  userPrompt: string
  imageBase64: string
  mimeType: string
  maxOutputTokens?: number
  temperature?: number
}): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('Gemini client not available — GEMINI_API_KEY を設定してください')

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
          { text: params.userPrompt },
        ],
      },
    ],
    config: {
      systemInstruction: params.systemPrompt,
      maxOutputTokens: params.maxOutputTokens ?? 200,
      temperature: params.temperature ?? 0,
      topK: 1,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  return response.text ?? ''
}

/**
 * JSON抽出（responseMimeType='application/json' + 正規表現フォールバック）
 * Gemini が返すテキストからJSON部分を安全に抽出する
 */
export function extractJson<T>(text: string): T | null {
  if (!text) return null

  // 1. 直接パース（responseMimeType: 'application/json' の場合、クリーンなJSONが返る）
  try {
    return JSON.parse(text) as T
  } catch {
    // フォールバックへ
  }

  // 2. 配列JSONの抽出を試行
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as T
    } catch {
      // フォールバックへ
    }
  }

  // 3. オブジェクトJSONの抽出を試行
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]) as T
    } catch {
      // 抽出失敗
    }
  }

  return null
}
