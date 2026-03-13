# CLAUDE.md — Porano Perse（3D店舗パースツール）

## 0. Bootstrap (起動直後に必ず実施)
1. `git log --oneline -n 8` で直近の変更を確認
2. auto-memory (`~/.claude/projects/C--Users-LENOVO/memory/MEMORY.md`) を参照
3. dev server: `npm run dev`（ポート3001）

## 1. コンテキスト管理 (最重要)
コンテキスト溢れは作業停止に直結する。以下を厳守:

### 1.1 エージェント委任ルール
- **調査・探索**: Explore エージェントに委任（結果だけ受け取る）
- **マルチファイル分析**: general-purpose エージェントに委任
- **コード変更**: 10ファイル以上の変更はエージェント（worktree隔離）に分割委任
- **テスト実行**: バックグラウンドで実行し結果だけ確認
- メインコンテキストでの大量ファイル読み込み禁止（1セッション10ファイル以内推奨）

### 1.2 ファイル読み込み制限
- 大ファイル（500行超）は `limit` パラメータで必要な行のみ読む
- `node_modules`, `.next`, `tmp/` は読まない

### 1.3 作業サイクル
- 1機能/1タスク完了ごとに完了報告 → ユーザーが `/clear` 判断
- 並列可能な独立タスクは Agent tool で並列実行
- 長い分析結果はメモリファイルに書き出し、コンテキストに残さない

## 2. Iron Rules (鉄のルール)
1. **Language:** 思考・説明・報告は**全て日本語**。コミットメッセージのみ英語。
2. **No Guessing:** 推測禁止。確認してから実装。
3. **Deploy制限:** デプロイ前に必ずユーザー確認。
4. **3D = クライアントサイド:** Three.js / React Three Fiber のみ。AI画像生成API禁止（コストゼロ方針）。
5. **テクスチャ:** Canvas APIによるプロシージャル生成を基本。実画像はSupabase Storage。
6. **LINE BOT発言禁止** — 通知はapp_notifications（ERP内）のみ。

## 3. Project Structure
```
src/
├── app/           -- ページ (Next.js App Router)
│   └── page.tsx   -- メインエディタ（図面+3D分割表示）
├── components/
│   ├── three/     -- 3Dコンポーネント (R3F)
│   ├── floor-plan/ -- 2D図面エディタ (Canvas)
│   ├── ui/        -- UIパネル
│   └── layout/    -- ヘッダー等
├── stores/        -- Zustand 状態管理
├── lib/           -- ユーティリティ (geometry等)
├── data/          -- 静的データ (スタイル/家具カタログ)
└── types/         -- TypeScript型定義
```

## 4. Commands
- **Dev:** `npm run dev` (port 3001)
- **Build:** `npm run build`
- **Type Check:** `npx tsc --noEmit`
- **Lint:** `npm run lint`
- **Deploy:** `npx vercel --prod` (ユーザー確認必須)

## 5. Tech Stack
- Next.js (App Router) + TypeScript + Tailwind CSS
- Three.js / React Three Fiber / Drei
- Zustand（状態管理）
- Supabase（将来: DB + Storage + Auth）
- Vercel（ホスティング）

## 6. Architecture Decisions
- **2D/3D同期**: Zustandの `useEditorStore` が Single Source of Truth。WallSegment[]を共有。
- **座標系**: 2D (x,y) → 3D (x=横, y=高さ, z=奥行)。2DのyとzをSwap。
- **壁データ**: WallSegment[]ベース。矩形部屋も壁4枚として表現。
- **家具**: プリミティブジオメトリ（将来glTF対応予定）。

## 7. 関連プロジェクト
- **Porano ERP**: `C:/Users/LENOVO/.gemini/Porano/` — 将来API連携予定
- **GitHub**: 未設定（設定時に更新）
