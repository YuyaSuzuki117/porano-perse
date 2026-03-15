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
