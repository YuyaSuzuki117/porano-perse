/**
 * gemini-client.ts
 *
 * Gemini client (Google AI Studio free tier only)
 * - Model: gemini-2.0-flash-lite (stable, free, fast)
 * - Singleton pattern
 * - responseMimeType: 'application/json' for structured output
 * - 50s timeout to stay within Vercel's 60s limit
 */

import { GoogleGenAI } from '@google/genai'

// Singleton
let _client: GoogleGenAI | null = null

function getClient(): GoogleGenAI | null {
  if (_client) return _client

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  _client = new GoogleGenAI({ apiKey })
  return _client
}

/** Primary model — gemini-2.0-flash-lite (free, stable, no thinking) */
const MODEL_PRIMARY = 'gemini-2.0-flash-lite'
/** Fallback model — gemini-2.0-flash */
const MODEL_FALLBACK = 'gemini-2.0-flash'

/** Timeout for API calls (50s to stay under Vercel's 60s) */
const API_TIMEOUT_MS = 50_000

export function isGeminiAvailable(): boolean {
  return !!getClient()
}

/** Helper: wrap a promise with AbortSignal-based timeout */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Gemini API timeout (${ms}ms)`)), ms)
    promise
      .then((v) => { clearTimeout(timer); resolve(v) })
      .catch((e) => { clearTimeout(timer); reject(e) })
  })
}

/** Generate with automatic model fallback */
async function callGenerate(
  client: GoogleGenAI,
  model: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contents: any,
  config: Record<string, unknown>
): Promise<string> {
  try {
    const response = await withTimeout(
      client.models.generateContent({ model, contents, config }),
      API_TIMEOUT_MS
    )
    return response.text ?? ''
  } catch (err) {
    // If primary model fails, try fallback
    if (model === MODEL_PRIMARY) {
      console.warn(`[GeminiClient] ${MODEL_PRIMARY} failed, falling back to ${MODEL_FALLBACK}:`, err)
      const response = await withTimeout(
        client.models.generateContent({ model: MODEL_FALLBACK, contents, config }),
        API_TIMEOUT_MS
      )
      return response.text ?? ''
    }
    throw err
  }
}

/** Text-only generation */
export async function generateText(params: {
  systemPrompt: string
  userPrompt: string
  maxOutputTokens?: number
  temperature?: number
}): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('Gemini client not available — set GEMINI_API_KEY')

  return callGenerate(client, MODEL_PRIMARY, params.userPrompt, {
    systemInstruction: params.systemPrompt,
    maxOutputTokens: params.maxOutputTokens ?? 200,
    temperature: params.temperature ?? 0,
    responseMimeType: 'application/json',
  })
}

/** Multimodal generation (image + text) */
export async function generateWithImage(params: {
  systemPrompt: string
  userPrompt: string
  imageBase64: string
  mimeType: string
  maxOutputTokens?: number
  temperature?: number
}): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('Gemini client not available — set GEMINI_API_KEY')

  return callGenerate(
    client,
    MODEL_PRIMARY,
    [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
          { text: params.userPrompt },
        ],
      },
    ],
    {
      systemInstruction: params.systemPrompt,
      maxOutputTokens: params.maxOutputTokens ?? 200,
      temperature: params.temperature ?? 0,
      responseMimeType: 'application/json',
    }
  )
}

/** Image generation model — gemini-2.0-flash-exp (free, supports image output) */
const MODEL_IMAGE_GEN = 'gemini-2.0-flash-exp'

/** Timeout for image generation (longer — 55s) */
const IMAGE_GEN_TIMEOUT_MS = 55_000

/**
 * Generate a photorealistic perse image from a 3D screenshot.
 * Uses gemini-2.0-flash-exp with responseModalities: ['TEXT', 'IMAGE']
 */
export async function generatePerseImage(params: {
  screenshotBase64: string
  mimeType: string
  style: string
  additionalPrompt?: string
}): Promise<{ imageBase64: string; imageMimeType: string; description: string }> {
  const client = getClient()
  if (!client) throw new Error('Gemini client not available — set GEMINI_API_KEY')

  const styleLabel = params.style || 'フォトリアル'
  const additionalInstructions = params.additionalPrompt
    ? `\n追加指示: ${params.additionalPrompt}`
    : ''

  const prompt = `あなたはプロの建築パースアーティストです。
入力された3D店舗レイアウトのスクリーンショットを基に、${styleLabel}スタイルの完成パースイメージを生成してください。

要件:
- 入力画像の間取り・家具配置を忠実に反映
- リアルな照明・影・反射を追加
- 壁・床・天井に適切な素材テクスチャを適用
- 観葉植物・小物等の装飾を自然に追加
- 人物は含めない
- 商業施設の完成予想図として使えるクオリティ${additionalInstructions}

この画像を高品質な完成パースイメージに変換してください。`

  try {
    const response = await withTimeout(
      client.models.generateContent({
        model: MODEL_IMAGE_GEN,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: params.mimeType, data: params.screenshotBase64 } },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          temperature: 0.8,
        },
      }),
      IMAGE_GEN_TIMEOUT_MS
    )

    // Parse response — extract image and text parts
    let imageBase64 = ''
    let imageMimeType = 'image/png'
    let description = ''

    const parts = response.candidates?.[0]?.content?.parts
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data
          imageMimeType = part.inlineData.mimeType ?? 'image/png'
        }
        if (part.text) {
          description += part.text
        }
      }
    }

    if (!imageBase64) {
      // Fallback: try text property
      const text = response.text ?? ''
      if (text) description = text
      throw new Error('画像の生成に失敗しました。モデルがテキストのみを返しました。')
    }

    return { imageBase64, imageMimeType, description }
  } catch (err) {
    if (err instanceof Error && err.message.includes('画像の生成に失敗')) {
      throw err
    }
    console.error('[GeminiClient] Image generation failed:', err)
    throw new Error(`パースイメージの生成に失敗しました: ${err instanceof Error ? err.message : '不明なエラー'}`)
  }
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
