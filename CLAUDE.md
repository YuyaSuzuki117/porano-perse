# CLAUDE.md — Porano Perse（3D店舗パースツール）

## 0. Bootstrap (起動直後に必ず実施)
1. `git log --oneline -n 8` で直近の変更を確認
2. auto-memory (`~/.claude/projects/C--Users-LENOVO/memory/porano-perse.md`) を参照
3. セッション状態ファイルがあれば確認: `memory/porano-perse-session.md`
4. dev server: `npm run dev`（ポート3001）

## 1. コンテキスト管理 (最重要 — 全ルールに優先)

このプロジェクトは **200+ファイル / 大規模3Dコードベース**。
コンテキスト溢れ = セッション即死。以下を厳守。

### 1.1 ファイル読み込み制限
| 対象 | ルール |
|------|--------|
| 1セッション合計 | メインコンテキスト **10ファイル以内** |
| 500行超ファイル | `limit` パラメータで必要行のみ |
| `useEditorStore.ts` (~2000行) | **絶対に全読み禁止** → `/store-inspect` コマンド使用 |
| `node_modules/`, `.next/`, `.claude/worktrees/` | 読まない |

### 1.2 エージェント委任（大量操作は必ず委任）
| タスク | 委任先 |
|--------|--------|
| コード調査・探索 | Explore エージェント |
| マルチファイル分析 | general-purpose エージェント |
| 10ファイル以上の変更 | worktree 隔離エージェント（5ファイル/エージェント目安） |
| ビルド・型チェック | バックグラウンド実行 |
| 並列可能な独立タスク | 複数エージェント同時起動 |

### 1.3 出力スリム化
- 長い分析結果 → メモリファイルに書き出し、コンテキストに残さない
- ツール結果が100行超 → 要約してから次のステップへ
- git操作: `--oneline -n 8` 等で最小限に

### 1.4 セッション継続性
- 機能完了ごとに完了報告 → ユーザーの `/clear` 判断を待つ
- 大タスク開始前: メモリファイルに計画保存（`/context-save`）
- 中断復帰: `git log` + メモリ参照で状態復元

## 2. Iron Rules (鉄のルール)
1. **Language:** 思考・説明・報告は**全て日本語**。コミットメッセージのみ英語。
2. **No Guessing:** 推測禁止。確認してから実装。
3. **Deploy制限:** デプロイ前に必ずユーザー確認。
4. **3D = クライアントサイド:** Three.js / React Three Fiber のみ。
5. **テクスチャ:** Canvas APIによるプロシージャル生成を基本。実画像はSupabase Storage。
6. **LINE BOT発言禁止** — 通知はapp_notifications（ERP内）のみ。
7. **ストア全読み禁止** — useEditorStore.ts は `/store-inspect` 経由のみ。
8. **AI API = 無料枠厳守:** Google AI Studio 無料APIキーのみ使用。有料API/課金モデルは必ずユーザー確認後。
9. **AI モデル標準:** `gemini-2.5-flash`（生成）/ `gemini-embedding-001`（Embedding）。有料のみモデル（Imagen 4, Veo, Gemini Pro有料版等）は使用禁止。

## 3. Project Structure
```
src/
├── app/              -- ページ (Next.js App Router)
│   ├── page.tsx      -- メインエディタ（図面+3D分割表示）
│   ├── editor/[id]/  -- 個別編集ページ
│   └── scene/[id]/   -- シーン表示ページ
├── components/
│   ├── three/        -- 3Dコンポーネント (R3F) [80+ファイル]
│   │   └── furniture/ -- 家具ジオメトリ・テクスチャキャッシュ
│   ├── floor-plan/   -- 2D図面エディタ (Canvas)
│   ├── ui/           -- UIパネル [60+ファイル]
│   ├── layout/       -- ヘッダー等
│   ├── pwa/          -- PWA (InstallPrompt, ServiceWorker)
│   └── pixel-editor/ -- ピクセルエディタ
├── stores/           -- Zustand状態管理 (useEditorStore ~2000行)
├── hooks/            -- カスタムフック (8個)
├── lib/              -- ユーティリティ [52+ファイル]
├── data/             -- 静的データ (家具/スタイル/テンプレート/仕上げ材/設備)
└── types/            -- TypeScript型定義
```

## 4. Commands
| コマンド | 用途 |
|---------|------|
| `npm run dev` | 開発サーバー (port 3001) |
| `npm run build` | 本番ビルド |
| `npx tsc --noEmit` | 型チェック |
| `npm run lint` | ESLint |
| `npx vercel --prod` | デプロイ（ユーザー確認必須） |
| `node scripts/gen-glb.mjs` | GLBモデル生成 |

## 5. Tech Stack
- **フレームワーク:** Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- **3D:** Three.js 0.183 / React Three Fiber 9 / Drei 10 / Postprocessing 3
- **AI:** Google Gemini (gemini-2.5-flash / gemini-embedding-001) — 無料枠のみ
- **状態:** Zustand 5
- **出力:** jsPDF + html2canvas + QRCode
- **DB:** Supabase（DB + Storage + Auth）
- **自動化:** n8n (VPS 162.43.54.216) — バッチ処理・Webhook
- **ホスティング:** Vercel
- **PWA:** Service Worker + manifest.json

## 5.1 AI機能 (Google AI Studio 無料枠)
| 機能 | モデル | 用途 |
|------|--------|------|
| スタイル分析 | gemini-2.5-flash (Vision) | 参考写真→スタイル・色彩・素材を分析 |
| レイアウト提案 | gemini-2.5-flash (JSON mode) | 業種+面積→最適家具配置を提案 |
| パースイメージ生成 | gemini-2.5-flash-image (Nano Banana) | 完成イメージ画像を生成 |
| 仕様書データ抽出 | gemini-2.5-flash (Vision+PDF) | 図面/仕様書→構造化データ |

### 有料にすると大きく変わるポイント（要ユーザー確認）
| 有料機能 | コスト | インパクト |
|---------|--------|-----------|
| Imagen 4 (Ultra) | $0.06/枚 | フォトリアルなパースイメージ（Nano Banana比で大幅品質向上） |
| Gemini 2.5 Pro | 有料のみ高レート | 複雑な間取り分析の精度向上 |
| Veo 3 (動画生成) | 有料 | ウォークスルー動画の自動生成（革命的だが高額） |

## 6. Architecture Decisions
- **2D/3D同期**: Zustand `useEditorStore` が Single Source of Truth。WallSegment[]を共有。
- **座標系**: 2D (x,y) → 3D (x=横, y=高さ, z=奥行)。2DのyとzをSwap。
- **壁データ**: WallSegment[]ベース。矩形部屋も壁4枚として表現。
- **家具**: GLB (46種, scripts/gen-glb.mjs生成) + プリミティブフォールバック。
- **テクスチャ**: Canvas APIプロシージャル生成（コストゼロ）。
- **品質レベル**: デフォルト 'medium'（モバイルWebGLクラッシュ防止）。
- **壁透過**: カメラ角度ベース自動透過 (WallMeshGroup.tsx)。
- **3D→2D禁止**: 変更は常に2D図面 → 3Dシーンの一方向。

## 7. Slash Commands (カスタム)
| コマンド | 用途 |
|---------|------|
| `/3d-component` | 新規3Dコンポーネント作成 |
| `/style-add` | 新インテリアスタイル追加 |
| `/deploy` | Vercelデプロイ（プリフライト付き） |
| `/perf-check` | 3Dパフォーマンス診断 |
| `/visual-test` | Playwright ビジュアルテスト |
| `/quality-check` | 全品質チェック（型+lint+build） |
| `/refactor` | 安全なリファクタリング |
| `/glb-gen` | GLBモデル生成/更新 |
| `/context-save` | セッション状態をメモリに保存 |
| `/store-inspect` | ストアの指定セクションだけ安全に読む |

## 8. MCP Servers
| MCP | 用途 |
|-----|------|
| **Playwright** | ビジュアルテスト・デプロイ後検証 |
| **Context7** | Three.js/R3F/Drei/Zustand ドキュメント参照 |
| **Sequential Thinking** | 複雑な3D数学・座標変換の段階的推論 |

## 9. Design Rules (.claude/rules/)
| ルール | 対象 |
|--------|------|
| `three-components.md` | 3Dコンポーネント設計・パフォーマンス |
| `zustand-stores.md` | ストア命名・セレクタ必須 |
| `floor-plan.md` | 2D図面エディタ・座標系 |
| `performance.md` | WebGLメモリ管理・モバイル制約 |
| `context-management.md` | コンテキスト管理（常時適用） |
| `data-catalog.md` | 家具/テンプレート/スタイルの追加手順 |

## 10. 関連プロジェクト
- **Porano ERP**: `C:/Users/LENOVO/.gemini/Porano/` — 将来API連携予定
- **GitHub**: `YuyaSuzuki117/porano-perse`
- **本番**: https://porano-perse.vercel.app
