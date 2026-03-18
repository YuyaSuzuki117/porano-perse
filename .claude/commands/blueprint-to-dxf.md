# /blueprint-to-dxf — 図面→DXF 一気通貫変換

図面画像またはPDFからDXFファイルを自動生成するパイプライン。
**PDFはベクター直接抽出を優先**し、Gemini Visionは補助に使用する。

## 引数
- `$ARGUMENTS` — 図面ファイルパス (画像 or PDF)。省略時はプロジェクト内 `input/` を探索。

## 手順

### Step 1: 入力ファイル確認
- 引数のファイルが存在するか確認
- 拡張子で判定: `.pdf` → Step 2A（ベクター抽出優先）, 画像 → Step 2B（Gemini Vision）

### Step 2A: PDFベクター直接抽出（最優先）
PDFからベクターデータを直接抽出する。AI推測より遥かに高精度。
```bash
python scripts/pdf-extract-vectors.py <pdf_path> -o output/blueprint-analysis/<project>.json --pretty
```
- 抽出結果のconfidenceを確認:
  - 0.7以上 → Step 3へ進む
  - 0.7未満 → スキャンPDFの可能性大。Step 2Bへフォールバック
- `--debug`で詳細ログを確認し、見落としがないか検証
- warningsがある場合は内容を確認し、必要ならGemini補完（Step 2C）

### Step 2B: Gemini Vision で図面解析（フォールバック）
画像ファイルまたはスキャンPDFの場合に使用。
- 画像を読み込んでGemini Vision API (gemini-2.5-flash) に送信
- 抽出する項目:
  - 部屋寸法（幅×奥行×天井高、mm単位）
  - 壁の位置（start/end座標）
  - 開口部（ドア・窓の位置/サイズ/タイプ: swing/sliding/folding/opening）
  - 造作物（カウンター・棚等）
  - 仕上げ情報（床・壁・天井の素材）
- `.claude/rules/blueprint-to-perse.md` のルールに従う
- `.claude/rules/pdf-to-dxf-extraction.md` の2パスプロトコル厳守
- 推定値には `"estimated": true` を付与
- 出力JSONは新フォーマット（walls[].openings[]形式）で生成

### Step 2C: ハイブリッド補完（オプション）
ベクター抽出でwarningsが出た場合:
- 室名の認識漏れ → Geminiで画像から室名を補完
- 什器の種類判定 → Geminiで画像から什器名を補完
- 天井高情報 → 展開図をGeminiで読み取り補完
- 補完結果をJSONにマージ

### Step 3: JSON検証
- 返却されたJSONの構造を検証
- 必須フィールドの存在確認
- 2パスプロトコルに基づく検証:
  - 全室面積合計 ≈ 建物面積
  - 壁数 → N室を囲む閉多角形になるか
  - 建具数: Pass1カウント = スクリプト内カウント
  - 什器数: Pass1カウント = スクリプト内カウント
- 寸法の妥当性チェック（壁長 0.3m〜30m）
- 問題があれば報告して停止

### Step 4: ezdxf でDXF生成
```bash
python scripts/gen-dxf.py --json <output_json_path> -o <output_dxf_path>
```
- 新フォーマット対応: 多角形部屋、引戸、折戸、開口
- レイヤー: 壁/壁芯/建具/什器/寸法/仕上げ/室名/設備/補助

### Step 5: DXF品質検証
```bash
python scripts/validate-dxf.py <output_dxf_path>
```
- 90%以上 → Step 6へ
- 70-89% → 警告を報告、修正可能な項目を提示
- 70%未満 → 原因を分析し、JSON修正 → Step 4再実行

### Step 6: 出力と報告
- JSON → `output/blueprint-analysis/<project_name>.json`
- DXF → `output/drawings/<project_name>.dxf`
- メタJSON → `output/drawings/<project_name>.dxf.meta.json`
- 完了報告:
  - 抽出方法（ベクター直接 / Gemini Vision / ハイブリッド）
  - 信頼度スコア
  - 部屋数、壁数、開口部数（タイプ別）、什器数
  - DXF検証スコア
  - 警告事項・推定値の有無

## 新フォーマット JSON 構造

```json
{
  "source": "pdf-extract | gemini-vision | hybrid",
  "confidence": 0.95,
  "project_name": "案件名",
  "room": {"width_mm": 8000, "depth_mm": 6000, "ceiling_height_mm": 2700},
  "walls": [
    {
      "id": "W1",
      "start_x_mm": 0, "start_y_mm": 0,
      "end_x_mm": 8000, "end_y_mm": 0,
      "thickness_mm": 120,
      "type": "exterior",
      "openings": [
        {"type": "door", "position_mm": 1500, "width_mm": 900, "swing": "left"},
        {"type": "sliding_door", "position_mm": 3000, "width_mm": 1800, "panels": 2},
        {"type": "window", "position_mm": 5000, "width_mm": 1800, "sill_mm": 800}
      ]
    }
  ],
  "rooms": [
    {"name": "客席", "wall_ids": ["W1","W2","W3"], "area_m2": 20, "center_mm": [4000, 3000]}
  ],
  "fixtures": [
    {"name": "カウンター", "x_mm": 1200, "y_mm": 5400, "width_mm": 2400, "depth_mm": 600}
  ],
  "dimensions_extracted": [
    {"p1_mm": [0,0], "p2_mm": [8000,0], "value_mm": 8000}
  ],
  "finishes": [
    {"部位": "床", "仕上げ": "フローリング", "品番": "WD-001"}
  ]
}
```

## 注意事項
- AI API は `gemini-2.5-flash` (無料枠) を使用
- PDFベクター抽出は無料（API不要）
- 寸法線がない場合はドアサイズ（幅900mm×高2100mm）を基準に推定
- エラー発生時は具体的な修正方法を提示
