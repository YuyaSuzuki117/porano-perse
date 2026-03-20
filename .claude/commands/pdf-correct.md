---
description: PDF図面から部屋情報を抽出し、視覚的に補正してDXFを出力する自動パイプライン
---

PDF図面を自動で「抽出→テキスト照合→視覚確認→補正→DXF出力」してください。

**入力:** $ARGUMENTS
（形式: `<PDFパス>` または `<PDFパス> <ページ番号>`。ページ番号省略時は0）

## 変数の準備
- `{pdf}` = PDFファイルパス
- `{page}` = ページ番号（デフォルト: 0）
- `{name}` = PDFファイル名から拡張子を除いた名前（スペースはアンダースコアに置換）
- 出力ディレクトリ: `output/blueprint-analysis/` と `output/drawings/`（なければ作成）

## Step 1: JSON抽出
```bash
python scripts/pdf-extract-vectors.py "{pdf}" -o "output/blueprint-analysis/{name}.json" --page {page} --pretty
```
抽出結果のサマリー（部屋数、不明室数）を報告。

## Step 2: PDFテキスト抽出（精度向上の鍵）
PDFからテキスト情報を直接抽出し、正確な室名を把握する:
```python
import fitz
doc = fitz.open(r'{pdf}')
page = doc[{page}]
blocks = page.get_text('dict')['blocks']
seen = set()
for b in blocks:
    if 'lines' in b:
        for l in b['lines']:
            for s in l['spans']:
                t = s['text'].strip()
                if t and t not in seen:
                    seen.add(t)
                    print(f'{s["origin"][0]:.0f},{s["origin"][1]:.0f}  {t}')
```
このテキスト一覧から以下を特定:
- **室名**: 「○卓」「WC」「EV」「PS」「ENT」「BR」等の室名テキスト
- **面積**: 「○○㎡」の面積表記と位置
- **設備**: 什器・設備名（カウンター、冷蔵庫、シンク等）
- **寸法**: 寸法線の数値

## Step 3: オーバーレイ画像生成
```bash
python scripts/visual-correct.py render "output/blueprint-analysis/{name}.json" "{pdf}" -o "output/drawings/{name}_visual.png"
```

## Step 4: 画像+テキスト照合で分析
`output/drawings/{name}_visual.png` をReadツールで読み込み、**Step 2のテキスト情報と照合**して判断:
- **不明室（赤）**: 部屋番号と、PDFテキストから特定される正確な室名をリストアップ
- **誤名称**: 自動検出された名前がPDFテキストと異なる部屋 → 正しい名前に修正
- **誤検出候補**: 0.5m2未満で意味のない領域 → 削除候補
- **マージ候補**: 隣接する同名の部屋 → マージ候補

**重要:** 推測で室名を付けない。PDFに書かれている正式な室名（○卓、S-WC、G-WC①等）を使う。

分析結果を表形式で報告してからStep 5へ進む。

## Step 5: 修正適用
分析結果に基づいて修正コマンドを組み立てて実行:
```bash
PYTHONIOENCODING=utf-8 python scripts/visual-correct.py fix "output/blueprint-analysis/{name}.json" \
  --set "番号:名前" --set "番号:名前" ... \
  --delete 番号 --delete 番号 ... \
  --merge "番号,番号" ... \
  -o "output/blueprint-analysis/{name}_corrected.json"
```
**注意:** `--set` は `action='append'` なので各引数ごとに `--set` を繰り返す。
日本語テキストは `PYTHONIOENCODING=utf-8` を付けて実行する。

## Step 6: 確認ループ
修正後の確認画像を生成:
```bash
python scripts/visual-correct.py render "output/blueprint-analysis/{name}_corrected.json" "{pdf}" -o "output/drawings/{name}_visual_fixed.png"
```
Readツールで確認画像を読み込み:
- まだ不明室（赤）が残っていれば → Step 4-5 を繰り返す（入力JSONは `{name}_corrected.json` を使う）
- 全て解決していれば → Step 7 へ

## Step 7: DXF出力
```bash
python scripts/gen-dxf.py --json "output/blueprint-analysis/{name}_corrected.json" -o "output/drawings/{name}.dxf"
```

## Step 8: 結果報告
以下を報告:
- 総部屋数と名前付き率
- 修正内容の一覧（設定・削除・マージ）
- 出力DXFパス
- 修正済みJSONパス

## 注意事項
- テキスト出力のcp932エンコーディング問題あり → 必ず `PYTHONIOENCODING=utf-8` を付ける
- m2表記を使用（²記号は使わない）
- 画像内の部屋番号（丸数字の数字）でfixコマンドを指定する
- 色の意味: 青=高信頼度(>=80%), 黄=中信頼度(50-79%), 赤=低信頼度/不明(<50%)
- 修正判断に迷ったらユーザーに確認する
- 室名は必ずPDFテキストに基づく正式名称を使う（推測名は最終手段）
