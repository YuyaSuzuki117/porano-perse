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
