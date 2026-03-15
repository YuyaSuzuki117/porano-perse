/**
 * POST /api/ai/generate-perse-image
 *
 * 3Dスクリーンショットからフォトリアルなパースイメージを生成するAPIエンドポイント
 * Model: gemini-2.0-flash-exp (Google AI Studio free tier, image generation capable)
 *
 * Request:  { image: string (base64), mimeType?: string, style?: string, additionalPrompt?: string }
 * Response: { imageBase64: string, imageMimeType: string, description: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { isGeminiAvailable, generatePerseImage } from '@/lib/gemini-client'

/** Base64画像の最大サイズ（約10MB） */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

/** 許可するMIMEタイプ */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** スタイルラベルマップ */
const STYLE_LABELS: Record<string, string> = {
  photorealistic: 'フォトリアル',
  sketch: 'スケッチ風',
  watercolor: '水彩画風',
  modern: 'モダン',
  japanese: '和風',
  industrial: 'インダストリアル',
  scandinavian: '北欧',
  luxury: 'ラグジュアリー',
  cafe: 'カフェ風',
  minimal: 'ミニマル',
  natural: 'ナチュラル',
  warm: '暖かみのある',
  cool: 'クールモダン',
}

export async function POST(request: NextRequest) {
  // Gemini API キー未設定チェック
  if (!isGeminiAvailable()) {
    return NextResponse.json(
      { error: 'AIアシスト機能は現在利用できません（APIキー未設定）' },
      { status: 503 }
    )
  }

  let body: { image?: string; mimeType?: string; style?: string; additionalPrompt?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です' }, { status: 400 })
  }

  const { image, mimeType = 'image/png', style = 'photorealistic', additionalPrompt } = body

  // バリデーション
  if (!image || typeof image !== 'string') {
    return NextResponse.json({ error: '画像データが必要です' }, { status: 400 })
  }
  if (image.length > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: '画像サイズが大きすぎます（最大10MB）' }, { status: 400 })
  }
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json(
      { error: `対応していない画像形式です。対応形式: ${ALLOWED_MIME_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const styleLabel = STYLE_LABELS[style] ?? style
    const result = await generatePerseImage({
      screenshotBase64: image,
      mimeType,
      style: styleLabel,
      additionalPrompt,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[generate-perse-image] Error:', err)
    const message = err instanceof Error ? err.message : 'パースイメージの生成に失敗しました'
    const status = message.includes('timeout') ? 504 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
