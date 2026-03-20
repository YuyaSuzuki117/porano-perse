# /deliverable-pack — 納品パッケージ作成

案件のレンダリング結果をクライアント向けに整理・パッケージ化する。

## 引数
- `$ARGUMENTS` — `<案件名> [--format folder|pdf|zip]`。デフォルトは `folder`。

## 手順

### Step 1: レンダリング結果の収集
- `output/projects/<案件名>/renders/final/` を優先
- final がなければ `renders/draft/` を使用（警告付き）
- ファイル名から部屋名・カメラアングルを推定

### Step 2: ファイル整理
- クライアント向けファイル名に変換: `<部屋名>_<アングル>.png`
- タイムスタンプ・ハッシュを除去

### Step 3: フォーマット別処理

**folder の場合:**
```
output/projects/<案件名>/deliverables/<日付>/
├── <部屋名A>/
│   ├── メイン.png
│   ├── カウンター側.png
│   └── 窓側.png
├── <部屋名B>/
│   └── ...
└── 概要.txt
```

**pdf の場合:**
- Python (Pillow + reportlab) で全レンダリングを1つのPDFに
- 表紙: 案件名・クライアント名・日付
- 各ページ: 部屋名 + レンダリング画像

**zip の場合:**
- folder と同じ構造をZIPに圧縮

### Step 4: 完了報告
- 出力パス、総ファイル数、合計サイズを報告

### Step 5: 知見記録（lessons-learned）
- `output/projects/<案件名>/lessons.md` を作成
- 以下をユーザーと対話して記録:
  - **業種タグ** (バー/カフェ/ホストクラブ/飲食店/オフィス/サロン等)
  - **うまくいったこと** (マテリアル/カメラ/モデル等)
  - **失敗・手戻り** (原因と対策)
  - **再利用できるもの** (スタイルJSON/カスタムモデル/カメラ座標)
  - **次の同業種案件への申し送り**
- 再利用可能なマテリアル設定は `.claude/rules/material-recipes.md` に追記
- 新規カスタムモデルは `scripts/blender/models/` のカタログに反映
