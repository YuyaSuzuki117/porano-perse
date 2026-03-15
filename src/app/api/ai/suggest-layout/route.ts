/**
 * POST /api/ai/suggest-layout
 *
 * 業種と部屋サイズから最適な家具レイアウトを提案するAPIエンドポイント
 * リクエスト: { businessType, roomWidth, roomDepth, style?, requirements? }
 * レスポンス: LayoutSuggestion[] JSON
 */

import { NextRequest, NextResponse } from 'next/server'
import { isGeminiAvailable } from '@/lib/gemini-client'
import { suggestLayout } from '@/lib/ai-layout-suggester'

/** 部屋サイズの許容範囲（メートル） */
const MIN_ROOM_SIZE = 1
const MAX_ROOM_SIZE = 100

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
    const {
      businessType,
      roomWidth: rawRoomWidth,
      roomDepth: rawRoomDepth,
      width: rawWidth,
      depth: rawDepth,
      style,
      requirements,
      seatCount,
    } = body as {
      businessType?: string
      roomWidth?: number
      roomDepth?: number
      width?: number
      depth?: number
      style?: string
      requirements?: string
      seatCount?: number
    }
    // フロントは width/depth で送る場合があるため両方対応
    const roomWidth = rawRoomWidth ?? rawWidth
    const roomDepth = rawRoomDepth ?? rawDepth

    // バリデーション: 必須パラメータ
    if (!businessType || roomWidth == null || roomDepth == null) {
      return NextResponse.json(
        { error: 'businessType, roomWidth, roomDepth は必須です。' },
        { status: 400 }
      )
    }

    // バリデーション: 数値チェック
    if (typeof roomWidth !== 'number' || typeof roomDepth !== 'number') {
      return NextResponse.json(
        { error: 'roomWidth と roomDepth は数値で指定してください。' },
        { status: 400 }
      )
    }

    // バリデーション: サイズ範囲
    if (
      roomWidth < MIN_ROOM_SIZE ||
      roomWidth > MAX_ROOM_SIZE ||
      roomDepth < MIN_ROOM_SIZE ||
      roomDepth > MAX_ROOM_SIZE
    ) {
      return NextResponse.json(
        { error: `部屋サイズは ${MIN_ROOM_SIZE}m 〜 ${MAX_ROOM_SIZE}m の範囲で指定してください。` },
        { status: 400 }
      )
    }

    // バリデーション: requirements の長さ制限
    if (requirements && requirements.length > 500) {
      return NextResponse.json(
        { error: '追加要件は500文字以内で入力してください。' },
        { status: 400 }
      )
    }

    // レイアウト提案実行
    const suggestions = await suggestLayout({
      businessType,
      roomWidth,
      roomDepth,
      style,
      requirements,
      seatCount,
    })

    if (!suggestions || suggestions.length === 0) {
      return NextResponse.json(
        { error: 'レイアウト提案の生成に失敗しました。条件を変更して再試行してください。', debug: 'suggestLayout returned null' },
        { status: 422 }
      )
    }

    return NextResponse.json(suggestions)
  } catch (error) {
    console.error('[API] suggest-layout エラー:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました。', debug: String(error) },
      { status: 500 }
    )
  }
}
