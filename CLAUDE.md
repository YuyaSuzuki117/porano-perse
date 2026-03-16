# CLAUDE.md — Porano Perse（3D店舗パースツール）

## 0. Bootstrap (起動直後に必ず実施)
1. `git log --oneline -n 8` で直近の変更を確認
2. auto-memory (`~/.claude/projects/C--Users-LENOVO/memory/blender-pipeline.md`) を参照
3. セッション状態ファイルがあれば確認: `memory/porano-perse-session.md`
4. dev server: `npm run dev`（ポート3001）

## 1. コンテキスト管理 (最重要 — 全ルールに優先)

このプロジェクトは **216ファイル / 大規模3D+Blenderコードベース**。
コンテキスト溢れ = セッション即死。以下を厳守。

### 1.1 ファイル読み込み制限
| 対象 | ルール |
|------|--------|
| 1セッション合計 | メインコンテキスト **10ファイル以内** |
| 500行超ファイル | `limit` パラメータで必要行のみ |
| `useEditorStore.ts` (~1,275行) | **絶対に全読み禁止** → `/store-inspect` コマンド使用 |
| `gen-glb.mjs` (~1,500行) | 必要セクションのみ |
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
9. **AI モデル標準:** `gemini-2.5-flash`（生成）/ `gemini-embedding-001`（Embedding）。有料のみモデルは使用禁止。
10. **Blender = バッチ専用:** Blenderスクリプトはバックグラウンド実行のみ（GUI不使用）。

## 3. Project Structure
```
src/                         -- Next.js アプリ (216ファイル)
├── app/                     -- ページ (App Router)
│   ├── page.tsx             -- メインエディタ（図面+3D分割表示）
│   ├── editor/[id]/         -- 個別編集ページ
│   ├── scene/[id]/          -- シーン表示ページ
│   └── api/                 -- API Routes
│       ├── ai/              -- Gemini AI (分析/提案/画像生成)
│       └── erp/             -- ERP連携 (エクスポート/見積)
├── components/
│   ├── three/               -- 3Dコンポーネント (R3F) [72ファイル]
│   │   ├── furniture/       -- 家具ジオメトリ・テクスチャキャッシュ
│   │   └── (効果/可視化/カメラ/マテリアル等)
│   ├── floor-plan/          -- 2D図面エディタ (Canvas) [3ファイル]
│   ├── ui/                  -- UIパネル [45ファイル]
│   ├── layout/              -- ヘッダー等
│   ├── pwa/                 -- PWA (InstallPrompt, ServiceWorker)
│   └── pixel-editor/        -- ピクセルエディタ
├── stores/                  -- Zustand状態管理 (4ストア)
├── hooks/                   -- カスタムフック (8個)
├── lib/                     -- ユーティリティ [52ファイル]
├── data/                    -- 静的データ (家具107種/スタイル9種/テンプレート19種)
└── types/                   -- TypeScript型定義

scripts/                     -- Blender パイプライン
├── gen-glb.mjs              -- GLBモデル生成 (~1,500行)
├── template-to-json.ts      -- TS→JSON変換
├── render-template.py       -- 個別テンプレートレンダリング
├── render-batch.py          -- バッチレンダリング (19×9)
├── blender-setup.py         -- Blenderセットアップ
├── export-cafe-blender.py   -- カフェテンプレート→.blend
└── blender/                 -- Pythonモジュール群
    ├── core.py              -- シーン初期化・メッシュ作成
    ├── room_builder.py      -- 壁・床・天井構築
    ├── furniture_importer.py -- GLBインポート・配置
    ├── lighting.py          -- 3点照明セットアップ
    ├── cameras.py           -- カメラプリセット
    ├── renderer.py          -- Cycles レンダラー制御
    ├── style_applicator.py  -- マテリアルスタイル適用
    ├── materials/           -- PBR 6種 (wood/metal/fabric/glass/wall/floor)
    └── models/              -- カスタムモデル (cafe_chair/cafe_table)

output/                      -- Blenderレンダリング出力 (.blend/.png)
public/models/               -- GLBモデル (107ファイル)
e2e/                         -- Playwright E2Eテスト (6ファイル)
supabase/migrations/         -- DBマイグレーション
```

## 4. Commands
| コマンド | 用途 |
|---------|------|
| `npm run dev` | 開発サーバー (port 3001) |
| `npm run build` | 本番ビルド |
| `npm run test` | Vitest ユニットテスト |
| `npm run test:e2e` | Playwright E2Eテスト |
| `npx tsc --noEmit` | 型チェック |
| `npm run lint` | ESLint |
| `npx vercel --prod` | デプロイ（ユーザー確認必須） |
| `node scripts/gen-glb.mjs` | GLBモデル生成 |

### 4.1 Blender パイプライン
```bash
# JSON生成
npx tsx scripts/template-to-json.ts --template=rt_small_cafe --style=cafe

# レンダリング（Blender 5.0 バックグラウンド）
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/render-template.py \
  -- output/scene-json/rt_small_cafe.json --quality=preview --camera=main

# バッチレンダリング（全テンプレート×スタイル）
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/render-batch.py
```

## 5. Tech Stack
- **フレームワーク:** Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- **3D (Web):** Three.js 0.183 / React Three Fiber 9 / Drei 10 / Postprocessing 3
- **3D (Offline):** Blender 5.0.1 (Cycles) + Python API
- **AI:** Google Gemini (gemini-2.5-flash / gemini-embedding-001) — 無料枠のみ
- **状態:** Zustand 5
- **出力:** jsPDF + html2canvas + QRCode
- **DB:** Supabase（DB + Storage + Auth）
- **テスト:** Vitest (unit) + Playwright (E2E)
- **ホスティング:** Vercel
- **PWA:** Service Worker + manifest.json

### 5.1 AI機能 (Google AI Studio 無料枠)
| 機能 | モデル | 用途 |
|------|--------|------|
| スタイル分析 | gemini-2.5-flash (Vision) | 参考写真→スタイル・色彩・素材を分析 |
| レイアウト提案 | gemini-2.5-flash (JSON mode) | 業種+面積→最適家具配置を提案 |
| パースイメージ生成 | gemini-2.5-flash-image | 完成イメージ画像を生成 |
| 仕様書データ抽出 | gemini-2.5-flash (Vision+PDF) | 図面/仕様書→構造化データ |

### 5.2 Blender レンダラー
- **エンジン:** Cycles（EEVEE→切替済み）
- **GPU自動検出:** CUDA → OPTIX → CPU フォールバック
- **デノイズ:** OpenImageDenoise
- **品質:** preview(32samples ~40s) / draft(64) / production(256)
- **Blender 5.0 API注意:** `handle_left_type`(非handle_type_left), 自動タイル(tile_x/y廃止)

### 5.3 パース生成の優先順位
初回パース生成は **建築の箱を先に固める**。家具は後から差し替え。
1. **最優先:** 天井・壁・床・建具をしっかり作る（図面があれば寸法厳守）
2. **後回し:** 家具はプレースホルダーでOK（後から単体モデリングして差替え）
3. **禁止:** 余計な線や物を入れない（後から練る）
詳細: `.claude/rules/perse-generation-priority.md`

## 6. Architecture Decisions
- **2D/3D同期**: Zustand `useEditorStore` が Single Source of Truth。WallSegment[]を共有。
- **座標系**: 2D (x,y) → 3D (x=横, y=高さ, z=奥行)。2DのyとzをSwap。
- **壁データ**: WallSegment[]ベース。矩形部屋も壁4枚として表現。
- **家具**: GLB (107種, scripts/gen-glb.mjs生成) + プリミティブフォールバック。
- **テクスチャ**: Canvas APIプロシージャル生成（コストゼロ）。
- **品質レベル**: デフォルト 'medium'（モバイルWebGLクラッシュ防止）。
- **壁透過**: カメラ角度ベース自動透過 (WallMeshGroup.tsx)。
- **3D→2D禁止**: 変更は常に2D図面 → 3Dシーンの一方向。
- **Blenderパイプライン**: template-to-json.ts → scene.json → render-template.py → Blender → .blend/.png

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
| `/blender-render` | Blenderレンダリング実行 |
| `/context-save` | セッション状態をメモリに保存 |
| `/store-inspect` | ストアの指定セクションだけ安全に読む |

## 8. MCP Servers
| MCP | 用途 |
|-----|------|
| **Playwright** | ビジュアルテスト・デプロイ後検証 |
| **Context7** | Three.js/R3F/Drei/Zustand/Blender ドキュメント参照 |
| **Sequential Thinking** | 複雑な3D数学・座標変換の段階的推論 |

## 9. Design Rules (.claude/rules/)
| ルール | 対象 |
|--------|------|
| `context-management.md` | コンテキスト管理（常時適用・最重要） |
| `three-components.md` | 3Dコンポーネント設計・パフォーマンス |
| `zustand-stores.md` | ストア命名・セレクタ必須 |
| `floor-plan.md` | 2D図面エディタ・座標系 |
| `performance.md` | WebGLメモリ管理・モバイル制約 |
| `data-catalog.md` | 家具/テンプレート/スタイルの追加手順 |
| `ai-api.md` | Gemini API無料枠ルール |
| `blender-pipeline.md` | Blender Pythonスクリプト規約 |

## 10. 関連プロジェクト
- **Porano ERP**: `C:/Users/LENOVO/.gemini/Porano/` — 将来API連携予定
- **GitHub**: `YuyaSuzuki117/porano-perse`
- **本番**: https://porano-perse.vercel.app
