# n8n PDF→DXF ハイブリッドパイプライン設計書

## 1. 概要

ルールベース抽出 (`pdf-extract-vectors.py`) と AI抽出 (`pdf-to-json-gemini.py`) を並列実行し、
それぞれの強みを活かしてマージすることで、PDF→DXF変換精度を向上させる。

### 各手法の強み/弱み

| 項目 | ルールベース (PyMuPDF+OpenCV) | AI (Gemini Vision) |
|------|------|------|
| 壁座標 | **正確** (ベクター直接抽出) | 不正確 (画像推定) |
| 部屋名 | 部分的 (テキスト検出のみ) | **正確** (文脈理解) |
| 什器検出 | 限定的 (形状ベース) | **優秀** (意味理解) |
| 建具分類 | 良好 (パターンマッチ) | **良好** (図面記号理解) |
| 複雑形状 | 苦手 (L字/凸字) | やや苦手 (座標精度低) |
| 処理速度 | **高速** (~5秒) | 低速 (~30-60秒) |
| コスト | 無料 | 無料枠内 (gemini-2.5-flash) |

### マージ戦略
- **壁座標**: ルールベース優先 (ベクター精度が圧倒的)
- **部屋名**: AI優先 (文脈理解が正確)
- **什器**: AI優先 (名前+用途理解)、座標はルールベースで補正
- **建具**: ルールベース優先 (位置精度)、タイプ分類はAIで補完

## 2. n8n セットアップ

### 推奨: Docker (このPCで実行)

```bash
# Docker Desktop が既にインストール済み
docker run -d \
  --name n8n \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  -v C:/Users/y-suz/porano-perse:/data/porano-perse \
  -e N8N_SECURE_COOKIE=false \
  -e EXECUTIONS_MODE=regular \
  -e NODE_FUNCTION_ALLOW_EXTERNAL=true \
  -e GENERIC_TIMEZONE=Asia/Tokyo \
  n8nio/n8n
```

**重要な設定**:
- `-v C:/Users/y-suz/porano-perse:/data/porano-perse`: プロジェクトディレクトリをマウント
- Execute Command ノードでホストのPythonスクリプトを実行するため、ボリュームマウントが必須
- n8n v2.0以降は Execute Command がデフォルト無効 → 環境変数 `N8N_NODES_INCLUDE=n8n-nodes-base.executeCommand` で有効化

### 代替: npm (Dockerなし)

```bash
# Node.js 24.x がインストール済み
npx n8n
# → http://localhost:5678 でアクセス
```

npm版の場合、Pythonスクリプトはホスト上で直接実行できるのでボリュームマウント不要。

### 推奨はnpm版
- Docker版はコンテナ内にPyMuPDF/OpenCV/Pillowのインストールが追加で必要
- npm版ならホストのPython環境をそのまま使える
- このPCにはPython 3.11.1 + 必要ライブラリが既にある

```bash
# n8nをグローバルインストール (1回だけ)
npm install -g n8n

# 起動
n8n start
```

## 3. ワークフロー設計

### フロー図

```
┌─────────────┐
│  PDF入力     │  (手動トリガー or Webhook)
│  ファイルパス │
└──────┬──────┘
       │
       ├──────────────────────────┐
       │                         │
       ▼                         ▼
┌──────────────┐      ┌──────────────────┐
│ ルールベース  │      │ AI抽出            │
│ Execute Cmd  │      │ Execute Cmd       │
│ pdf-extract- │      │ pdf-to-json-      │
│ vectors.py   │      │ gemini.py         │
└──────┬───────┘      └──────┬────────────┘
       │                      │
       ▼                      ▼
┌──────────────┐      ┌──────────────────┐
│ JSON読み込み  │      │ JSON読み込み      │
│ (rule.json)  │      │ (ai.json)        │
└──────┬───────┘      └──────┬────────────┘
       │                      │
       └──────────┬───────────┘
                  │
                  ▼
         ┌────────────────┐
         │ マージ          │
         │ merge-          │
         │ extractions.py  │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ DXF生成        │
         │ gen-dxf.py     │
         │ --json merged  │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ 比較画像生成    │
         │ compare-pdf-   │
         │ dxf.py         │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ 品質スコア算出  │
         │ (Code Node)    │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ ダッシュボード   │
         │ data.js 更新   │
         └────────────────┘
```

### ノード詳細

#### Node 1: Manual Trigger
- タイプ: Manual Trigger
- パラメータ: `pdf_path` (PDFファイルの絶対パス), `project_name` (案件名), `page` (ページ番号, デフォルト0)

#### Node 2a: ルールベース抽出 (並列)
```bash
python scripts/pdf-extract-vectors.py "{{ $json.pdf_path }}" \
  -o "output/blueprint-analysis/{{ $json.project_name }}_rule.json" \
  --page {{ $json.page || 0 }} --pretty
```
- タイムアウト: 30秒
- 出力: `output/blueprint-analysis/<project>_rule.json`

#### Node 2b: AI抽出 (並列)
```bash
GEMINI_API_KEY=AIzaSyDM72iBLf6MPuPcwLiCDjQpNR8qZnqOMFc \
python scripts/pdf-to-json-gemini.py "{{ $json.pdf_path }}" \
  -o "output/blueprint-analysis/{{ $json.project_name }}_ai.json" \
  --page {{ $json.page || 0 }}
```
- タイムアウト: 120秒 (API応答待ち)
- 出力: `output/blueprint-analysis/<project>_ai.json`

#### Node 3: マージ
```bash
python scripts/merge-extractions.py \
  "output/blueprint-analysis/{{ $json.project_name }}_rule.json" \
  "output/blueprint-analysis/{{ $json.project_name }}_ai.json" \
  -o "output/blueprint-analysis/{{ $json.project_name }}_merged.json"
```
- 出力: `output/blueprint-analysis/<project>_merged.json`

#### Node 4: DXF生成
```bash
python scripts/gen-dxf.py \
  --json "output/blueprint-analysis/{{ $json.project_name }}_merged.json" \
  -o "output/drawings/{{ $json.project_name }}_merged.dxf"
```

#### Node 5: 比較画像生成
```bash
python scripts/compare-pdf-dxf.py \
  "{{ $json.pdf_path }}" \
  "output/drawings/{{ $json.project_name }}_merged.dxf" \
  -o "output/drawings/{{ $json.project_name }}_comparison.png" \
  --page {{ $json.page || 0 }}
```

#### Node 6: 品質スコア算出 (Code Node - JavaScript)
マージ済みJSONから以下を計算:
- 壁閉合率 (閉じたループを形成する壁の割合)
- 部屋名付与率 (名前のある部屋 / 全部屋)
- 什器検出率 (主要什器の有無)
- 面積整合性 (部屋面積合計 vs 外形面積)

#### Node 7: ダッシュボード更新 (Code Node - JavaScript)
`docs/data.js` の `ANALYSIS_DATA` を更新。

## 4. マージロジック詳細

### 4.1 壁のマージ

**基本方針**: ルールベースの壁座標を採用

1. ルールベースの壁リスト (`walls[]`) をベースとする
2. AIの壁リストは座標精度が低いため、座標自体は使わない
3. AIの壁から得られる `type` (exterior/interior/partition) 情報で、
   ルールベースの壁タイプを補完

### 4.2 部屋のマージ

**基本方針**: ルールベースのポリゴン + AIの部屋名

1. ルールベースの `rooms[]` から `polygon_mm` と `area_m2` を採用
2. AIの `rooms[]` から `name` と `center_mm` を取得
3. AIの部屋中心点がルールベースのどのポリゴン内にあるかで対応付け
4. 対応が見つからない場合:
   - 最近傍ポリゴンに割り当て (距離閾値: 500mm以内)
   - それでも見つからない場合は `name: "不明"` のまま

### 4.3 什器のマージ

**基本方針**: AI優先、座標をルールベースで補正

1. AIの `fixtures[]` をベースとする (名前/用途が正確)
2. ルールベースにも什器検出がある場合:
   - AI什器の座標近傍 (1000mm以内) にルールベース什器があれば、座標を差し替え
   - ルールベースにしかない什器は追加
3. 重複除去: 同名什器が近接 (500mm以内) にある場合は1つにマージ

### 4.4 建具 (Openings) のマージ

**基本方針**: ルールベースの位置 + AIのタイプ分類

1. ルールベースの壁ごとの `openings[]` をベースとする
2. AIの建具情報からタイプ分類を補完:
   - ルールベースが `opening` (不明) → AIの分類を採用
   - ルールベースが具体的タイプを持つ → そのまま維持
3. AIにしかない建具:
   - 対応する壁上に追加 (壁との距離計算で最寄り壁を特定)

### 4.5 矛盾解決ルール

| 矛盾の種類 | 解決策 |
|-----------|--------|
| 壁本数が大きく異なる | ルールベース優先 (ベクター直接) |
| 部屋数が異なる | 多い方を採用 (見落とし防止) |
| 什器名が矛盾 | AI優先 (意味理解) |
| 面積が 20%以上乖離 | 警告フラグ + ルールベース採用 |
| 建具タイプが矛盾 | AI優先 (図面記号理解) |

## 5. 品質スコア算出

100点満点で以下の配点:

| 項目 | 配点 | 計算方法 |
|------|------|---------|
| 壁閉合率 | 30点 | 閉ループ壁 / 全壁 * 30 |
| 部屋名付与率 | 20点 | 名前あり部屋 / 全部屋 * 20 |
| 什器検出率 | 15点 | 検出什器 / 期待什器 * 15 |
| 建具全数 | 15点 | 検出建具 / 期待建具 * 15 |
| 面積整合性 | 10点 | 1 - |合計面積 - 外形面積| / 外形面積 * 10 |
| マージ信頼度 | 10点 | ルール/AI一致項目 / 全項目 * 10 |

## 6. ファイル構成

```
porano-perse/
├── n8n/
│   └── pdf-to-dxf-workflow.json    ← n8nインポート用ワークフロー
├── scripts/
│   ├── merge-extractions.py         ← マージスクリプト (新規)
│   ├── pdf-extract-vectors.py       ← ルールベース (既存)
│   ├── pdf-to-json-gemini.py        ← AI抽出 (既存)
│   ├── gen-dxf.py                   ← DXF生成 (既存)
│   └── compare-pdf-dxf.py           ← 比較 (既存)
├── docs/
│   ├── n8n-pipeline-design.md       ← この設計書
│   ├── data.js                      ← ダッシュボードデータ
│   └── index.html                   ← ダッシュボードUI
└── output/
    └── blueprint-analysis/
        ├── <project>_rule.json      ← ルールベース結果
        ├── <project>_ai.json        ← AI結果
        └── <project>_merged.json    ← マージ結果
```

## 7. 実行手順

### 初回セットアップ

```bash
# 1. n8n インストール (npm版推奨)
npm install -g n8n

# 2. n8n 起動
n8n start
# → http://localhost:5678

# 3. ワークフローインポート
# ブラウザで http://localhost:5678 を開く
# Settings → Import from File → n8n/pdf-to-dxf-workflow.json を選択

# 4. 手動テスト (n8nなしでも可)
python scripts/pdf-extract-vectors.py input.pdf -o output/blueprint-analysis/test_rule.json --pretty
GEMINI_API_KEY=AIzaSyDM72iBLf6MPuPcwLiCDjQpNR8qZnqOMFc python scripts/pdf-to-json-gemini.py input.pdf -o output/blueprint-analysis/test_ai.json
python scripts/merge-extractions.py output/blueprint-analysis/test_rule.json output/blueprint-analysis/test_ai.json -o output/blueprint-analysis/test_merged.json
python scripts/gen-dxf.py --json output/blueprint-analysis/test_merged.json -o output/drawings/test_merged.dxf
python scripts/compare-pdf-dxf.py input.pdf output/drawings/test_merged.dxf -o output/drawings/test_comparison.png
```

### 日常運用

1. n8n UIで「Execute Workflow」をクリック
2. `pdf_path` にPDFファイルパスを入力
3. `project_name` に案件名を入力
4. 実行 → 自動で並列抽出→マージ→DXF→比較→スコア算出

## 8. 今後の拡張

- **Webhook トリガー**: LINE BOTからPDFが送られた時に自動実行
- **バッチ処理**: 複数PDFの一括処理
- **履歴管理**: 同一案件の改善履歴をダッシュボードに蓄積
- **閾値アラート**: 品質スコアが一定以下の場合に通知
- **Blender連携**: マージ済みJSON→Blenderパース自動生成 (render-from-dxf.py)
