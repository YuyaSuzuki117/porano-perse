# /blueprint-to-dxf — 図面→DXF 一気通貫変換

図面画像またはPDFからDXFファイルを自動生成するパイプライン。

## 引数
- `$ARGUMENTS` — 図面ファイルパス (画像 or PDF)。省略時はプロジェクト内 `input/` を探索。

## 手順

### Step 1: 入力ファイル確認
- 引数のファイルが存在するか確認
- PDF → 画像変換が必要か判定（拡張子で判断）
- PDFの場合: `python -c "from pdf2image import convert_from_path; ..."` で画像化

### Step 2: Gemini Vision で図面解析
- 画像を読み込んでGemini Vision APIに送信
- 抽出する項目:
  - 部屋寸法（幅×奥行×天井高、mm単位）
  - 壁の位置（start/end座標）
  - 開口部（ドア・窓の位置/サイズ/タイプ）
  - 造作物（カウンター・棚等）
  - 仕上げ情報（床・壁・天井の素材）
- `.claude/rules/blueprint-to-perse.md` のルールに従う
- 推定値には `"estimated": true` を付与

### Step 3: JSON検証
- 返却されたJSONの構造を検証
- 必須フィールドの存在確認
- 寸法の妥当性チェック（壁長 0.3m〜30m）
- 問題があれば報告して停止

### Step 4: ezdxf でDXF生成
```bash
python scripts/gen-dxf.py --json <output_json_path> -o <output_dxf_path>
```
- レイヤー: 壁/壁芯/建具/什器/寸法/仕上げ/室名/設備/補助

### Step 5: 出力と報告
- JSON → `output/blueprint-analysis/<project_name>.json`
- DXF → `output/drawings/<project_name>.dxf`
- 完了報告: 部屋数、壁数、開口部数、警告事項

## 注意事項
- AI API は `gemini-2.5-flash` (無料枠) を使用
- 寸法線がない場合はドアサイズ（幅900mm×高2100mm）を基準に推定
- エラー発生時は具体的な修正方法を提示
