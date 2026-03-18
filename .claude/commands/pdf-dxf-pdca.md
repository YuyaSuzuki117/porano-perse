# PDF→DXF 改善PDCAサイクル

## 手順

### 1. 現状確認
- メモリ `project_pdfdxf_improvement.md` を読んで前回の状態を確認
- `git log --oneline -5` で直近コミットを確認
- 最新のtest結果JSONと比較overlay画像を確認

### 2. Plan: 改善計画
- 前回の残課題リストから優先度最高の項目を選択
- 修正箇所を特定（`scripts/pdf-extract-vectors.py` の該当メソッド）
- 修正内容を1-2行で言語化してユーザーに確認

### 3. Do: 実装
- `scripts/pdf-extract-vectors.py` を修正
- テスト実行:
  ```
  python scripts/pdf-extract-vectors.py "C:/Users/y-suz/OneDrive/デスクトップ/ChloeBY展開図‗見積用20251202 2.pdf" --page 0 --debug -o output/blueprint-analysis/ChloeBY_testN.json
  ```
- DXF生成:
  ```
  python scripts/gen-dxf.py --json output/blueprint-analysis/ChloeBY_testN.json -o output/drawings/ChloeBY_testN.dxf
  ```

### 4. Check: 比較検証（必須！推測禁止）
- overlay画像生成:
  ```
  python scripts/compare-pdf-dxf.py "C:/Users/y-suz/OneDrive/デスクトップ/ChloeBY展開図‗見積用20251202 2.pdf" output/drawings/ChloeBY_testN.dxf --page 0 -o output/blueprint-analysis/compare_testN.png
  ```
- overlay画像を目視確認し、改善/悪化を言語化
- 数値結果をtest(N-1)と比較表にまとめる

### 5. Act: 記録と次のサイクルへ
- ダッシュボード更新 (`docs/index.html` にイテレーション追加、時刻付き)
- 比較画像を `docs/` にコピー
- git commit + push
- メモリ `project_pdfdxf_improvement.md` を更新
- 残課題を整理して次の優先順位を提示

## 注意
- コンテキスト管理: pdf-extract-vectors.py は全読み禁止（必要セクションのみ `limit` で読む）
- 1サイクルで修正は1-2項目に絞る
- overlay画像を必ず確認してから「改善した」と判断する
