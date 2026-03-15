---
paths:
  - "src/lib/gemini-*.ts"
  - "src/app/api/ai/**/*.ts"
alwaysApply: true
---

# AI API ルール（無料枠厳守）

## 使用可能モデル（Google AI Studio 無料枠）
| モデル | 用途 | 制限 |
|--------|------|------|
| `gemini-2.5-flash` | テキスト/Vision/JSON生成 | RPD制限あり |
| `gemini-2.5-flash-image` | 画像生成 (Nano Banana) | 無料枠要確認 |
| `gemini-embedding-001` | テキスト Embedding | 無料 |

## 禁止モデル（有料のみ — ユーザー確認なしに使用禁止）
- Imagen 4（全バリアント）
- Veo 3 / Veo 3.1（動画生成）
- Gemini 3.1 Pro Preview
- Gemini 3 Pro Image Preview
- Gemini 2.5 Computer Use

## API呼び出しルール
- `temperature: 0` — 分類・抽出タスク
- `temperature: 0.7` — 創造的提案（レイアウト提案等）
- `responseMimeType: 'application/json'` — 構造化出力は必ずJSON mode
- `maxOutputTokens` — 必要最小限に設定（コスト/レート節約）
- 画像入力: 最大5MB、推奨1MB以下にリサイズ

## エラーハンドリング
- API未設定時: 機能を無効化し、UIに「AI機能にはAPIキー設定が必要」と表示
- レート制限: リトライせずユーザーに通知
- フォールバック: AI無しでも基本機能は全て動作すること（Graceful Degradation）

## 環境変数
```
GEMINI_API_KEY=          # Google AI Studio 無料APIキー
```
