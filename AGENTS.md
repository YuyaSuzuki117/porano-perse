# AGENTS.md — PDF→DXF パイプライン改善ガイド

このドキュメントはCodex/AIエージェントが PDF→DXF 改善作業を引き継ぐためのガイドです。

## 現在の状態 (test10, 2026-03-18)

| 指標 | 値 | 目標 |
|------|-----|------|
| 壁セグメント | 31本 | 20-25本 |
| 部屋数 | 47室 | - |
| 名前あり部屋 | 25室 | 35+ |
| 不明部屋 | 22室 | 10以下 |
| area=0部屋 | 0 (解消済み) | 0 |
| 什器 | 14個 | 30+ |
| パイプラインスコア | 60/100 | 70+ |

## プロジェクト構成

```
scripts/
├── pdf-extract-vectors.py   # PDF→JSON抽出 (PyMuPDF+OpenCV, ~3700行) ★メイン修正対象
├── gen-dxf.py               # JSON→DXF変換
├── compare-pdf-dxf.py       # 重ね合わせ比較ツール (PIL直接描画)
├── dxf-to-scene.py          # DXF→Blenderシーン変換
└── blender/                 # Blenderモジュール群

output/
├── blueprint-analysis/      # 抽出JSON (ChloeBY_testN.json)
└── drawings/                # DXF + 比較画像

docs/
├── index.html               # 進捗ダッシュボード (GitHub Pages)
└── data.js                  # ダッシュボードデータ
```

## テスト用PDF

```
C:\Users\y-suz\OneDrive\デスクトップ\ChloeBY展開図‗見積用20251202 2.pdf
```
- Page 0 = 平面図 (作業対象)
- Page 1-5 = 展開図
- 縮尺: 1:50

## 改善PDCAサイクルの手順

### 1. 抽出実行
```bash
python scripts/pdf-extract-vectors.py \
  "C:/Users/y-suz/OneDrive/デスクトップ/ChloeBY展開図‗見積用20251202 2.pdf" \
  -o output/blueprint-analysis/ChloeBY_testN.json \
  --page 0 --pretty --debug
```

### 2. DXF生成
```bash
python scripts/gen-dxf.py \
  --json output/blueprint-analysis/ChloeBY_testN.json \
  -o output/drawings/ChloeBY_testN.dxf
```

### 3. 比較画像生成
```bash
python scripts/compare-pdf-dxf.py \
  "C:/Users/y-suz/OneDrive/デスクトップ/ChloeBY展開図‗見積用20251202 2.pdf" \
  output/drawings/ChloeBY_testN.dxf \
  -o output/drawings/comparison_testN.png --page 0
```

### 4. 結果確認 (Windows UTF-8対策付き)
```bash
chcp.com 65001 > /dev/null 2>&1
python -c "
import json, sys
sys.stdout.reconfigure(encoding='utf-8')
with open('output/blueprint-analysis/ChloeBY_testN.json', 'r', encoding='utf-8') as f:
    d = json.load(f)
rooms = d.get('rooms', [])
named = sum(1 for r in rooms if r.get('name', '不明') != '不明')
unknown = sum(1 for r in rooms if r.get('name', '不明') == '不明')
area0 = sum(1 for r in rooms if r.get('area_m2', 0) == 0)
print(f'壁: {len(d.get(\"walls\", []))}')
print(f'部屋: {len(rooms)} (名前あり{named}, 不明{unknown}, area=0: {area0})')
print(f'什器: {len(d.get(\"fixtures\", []))}')
"
```

### 5. ダッシュボード更新
- `docs/index.html`: viewMap追加, ボタン追加, Iterationカード追加, showIterImgN()追加, pdcaData追加
- `docs/data.js`: pass1_summary更新
- 比較画像を `docs/` にコピー

### 6. コミット
```bash
git add scripts/pdf-extract-vectors.py docs/ output/blueprint-analysis/ChloeBY_testN.json output/drawings/ChloeBY_testN.dxf
git commit -m "testN: <改善内容の要約>"
git push origin master
```

## 座標系 (最重要 — バグの温床)

### 5段階変換パイプライン
```
PyMuPDF (左上, Y↓, pt)
  ↓ flip_y: y_new = page_height - y
内部mm (左下, Y↑, mm用紙)
  ↓ ×scale_factor (50)
実寸mm (左下, Y↑, mm実寸)
  ↓ そのまま
JSON/DXF座標 (左下, Y↑, mm実寸)
  ↓ compare描画時の逆変換
PDFピクセル (左上, Y↓, px)
```

| 段階 | 原点 | Y方向 | 単位 |
|------|------|-------|------|
| PyMuPDF | 左上 | ↓ | pt |
| 内部mm | 左下 | ↑ | mm(用紙) |
| 実寸mm | 左下 | ↑ | mm(実寸) |
| DXF | 左下 | ↑ | mm(実寸) |
| PNG/ラスター | 左上 | ↓ | px |

### 注意
- `flip_y()` のdocstringは**間違い**: "原点=左下"と書いてあるがPyMuPDFは原点=左上
- `raster_to_mm()`: ×sf込みで実寸mmを返す
- `_pdf_to_raster_coords()`: 内部mm(sf未適用)を受け取る

## 次の改善タスク (優先順)

### 1. 不明22室の室名解決
- OpenCV面積フィルタを0.8m²に下げたことで小領域が大量に検出された
- テキストが存在しない通路・構造空間に「不明」が割り当てられている
- 対策案: 面積が小さく室名テキストが近くにない領域を「構造空間」として非表示にする

### 2. 部屋ポリゴンの形状改善
- 現在は全てバウンディングボックス矩形
- L字形状の部屋を正しく表現する必要がある
- OpenCVの連結成分の輪郭をそのまま使う (cv2.findContours)

### 3. 什器検出改善
- 現在14個 (PDFには30+個あるはず)
- テーブル/椅子/ソファ等の検出ロジック追加

### 4. 開口部のDXF反映
- JSON上は68個の開口部が検出済み
- gen-dxf.py でDXFに描画する処理が必要

### 5. 外壁位置の精度向上
- 一部の外壁がPDFとわずかにずれている

## pdf-extract-vectors.py の主要メソッド

| メソッド | 行番号(概算) | 機能 |
|---------|------------|------|
| `_classify_lines()` | ~400 | PDF線分を壁線/什器線/寸法線に分類 |
| `_classify_texts()` | ~1080 | テキストを室名/寸法値に分類 |
| `_detect_wall_pairs()` | ~1150 | 平行線ペアから壁を検出 |
| `_build_walls()` | ~1560 | 壁ペアから壁セグメントを構築 |
| `_extend_walls_to_intersections()` | ~2124 | 壁端点を交差点まで延長 |
| `_merge_collinear_walls()` | ~2300 | 同一直線上の壁を統合 |
| `_merge_near_duplicate_walls()` | ~2400 | 近接重複壁を統合 |
| `_filter_short_isolated_walls()` | ~2450 | 孤立短壁を除去 |
| `_build_room_polygons_cv2()` | ~2800 | OpenCVで部屋ポリゴン検出 |
| `raster_to_mm()` | ~2883 | ラスター座標→実寸mm変換 |

## テスト結果の検証ポイント

1. **壁数**: 前回より減っているか (ただし必要な壁が消えていないか)
2. **室名**: 「不明」の数が減っているか
3. **area=0**: 0を維持しているか
4. **overlay画像**: 赤線(壁)がPDFの壁と重なっているか

## 依存パッケージ
```
PyMuPDF (fitz), ezdxf, Pillow, opencv-python-headless, scikit-image, scipy, numpy, matplotlib
```
