/**
 * POST /api/ai/analyze-photo
 *
 * 参考写真からインテリアスタイルを分析するAPIエンドポイント
 * リクエスト: { image: string (base64), mimeType: string, businessType?: string }
 * レスポンス: StyleAnalysis JSON
 */

import { NextRequest, NextResponse } from 'next/server'
import { isGeminiAvailable } from '@/lib/gemini-client'
import { analyzeStyleFromPhoto } from '@/lib/ai-style-analyzer'

/** Base64画像の最大サイズ（約10MB） */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

/** 許可するMIMEタイプ */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(request: NextRequest) {
  // Gemini API キー未設定チェック
  if (!isGeminiAvailable()) {
    return NextResponse.json(
      { error: 'AI機能は現在利用できません。GEMINI_API_KEY を設定してください。' },
      { status: 503 }
    )
  }

  try {
    const body = await request.json()
    const { image, mimeType, businessType } = body as {
      image?: string
      mimeType?: string
      businessType?: string
    }

    // バリデーション: 必須パラメータ
    if (!image || !mimeType) {
      return NextResponse.json(
        { error: 'image (base64) と mimeType は必須です。' },
        { status: 400 }
      )
    }

    // バリデーション: MIMEタイプ
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: `対応していない画像形式です。対応形式: ${ALLOWED_MIME_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // バリデーション: 画像サイズ
    if (image.length > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: '画像サイズが大きすぎます（上限: 10MB）。' },
        { status: 400 }
      )
    }

    // スタイル分析実行
    const result = await analyzeStyleFromPhoto(image, mimeType, businessType)

    if (!result) {
      return NextResponse.json(
        { error: 'スタイル分析に失敗しました。別の写真で再試行してください。' },
        { status: 422 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[API] analyze-photo エラー:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました。' },
      { status: 500 }
    )
  }
}
