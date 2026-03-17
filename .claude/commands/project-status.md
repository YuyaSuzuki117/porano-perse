# /project-status — 案件進捗ダッシュボード

指定案件（またはカレントプロジェクト）のパイプライン進捗を一覧表示する。

## 引数
- `$ARGUMENTS` — 案件名 or パス。省略時は `output/projects/` 内の全案件を一覧。

## 手順

### Step 1: 案件の特定
- 引数があれば `output/projects/<案件名>/` を確認
- 引数なしなら `output/projects/` 内のフォルダを全列挙

### Step 2: パイプライン各段階をチェック

各案件について以下を確認し、テーブル形式で報告:

| 段階 | チェック内容 | ステータス表示 |
|------|-------------|---------------|
| 入力 | `input/blueprints/` にファイルがあるか | ファイル数・形式 |
| 分析 | `analysis/` にJSONがあるか | 部屋数・最終更新 |
| DXF | `dxf/` にDXFがあるか | ファイル数・最終更新 |
| Blender | `blender/` に.blendがあるか | シーン数・最終更新 |
| レンダー | `renders/` に画像があるか | draft/final各枚数 |
| 納品 | `deliverables/` にパッケージがあるか | 有無・日付 |

### Step 3: 整合性チェック
- JSONがDXFより新しい場合 → 「DXF再生成推奨」と警告
- DXFが.blendより新しい場合 → 「Blenderシーン更新推奨」と警告
- config.json の status フィールドを更新

### Step 4: 次のアクション提案
- 欠けている段階に対応するコマンドを提案
- 例: 「DXFがありません → `/blueprint-to-dxf` を実行してください」
