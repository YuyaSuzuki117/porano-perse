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
- 数値確認コマンド:
  ```bash
  chcp.com 65001 > /dev/null 2>&1; python -c "
  import json,sys
  sys.stdout.reconfigure(encoding='utf-8')
  with open('output/blueprint-analysis/ChloeBY_testN.json','r',encoding='utf-8') as f:
      d=json.load(f)
  rooms=d.get('rooms',[])
  named=sum(1 for r in rooms if r.get('name','不明')!='不明')
  unknown=sum(1 for r in rooms if r.get('name','不明')=='不明')
  area0=sum(1 for r in rooms if r.get('area_m2',0)==0)
  print(f'壁: {len(d.get(\"walls\",[]))}')
  print(f'部屋: {len(rooms)} (名前あり{named}, 不明{unknown}, area=0: {area0})')
  print(f'什器: {len(d.get(\"fixtures\",[]))}')
  "
  ```

### 5. Act: 記録と次のサイクルへ

#### 5.1 ダッシュボード更新
- `docs/data.js`: `pass1_summary` オブジェクトを最新結果で更新
- `docs/index.html` を編集:
  - `viewMap` に新テスト番号のエントリ追加
  - ボタン行に新テストのボタン追加
  - カード行に新テストの結果カード追加
  - `pdcaData` 配列に新イテレーションのPDCA情報追加
  - `showIterImg()` 関数で参照する画像パスを確認
- 比較画像を `docs/` にコピー:
  ```bash
  cp output/blueprint-analysis/compare_testN.png docs/compare_testN.png
  ```

#### 5.2 記録
- git commit + push
- メモリ `project_pdfdxf_improvement.md` を更新
- 残課題を整理して次の優先順位を提示

## エージェントチーム活用（並列改善）

複数の改善タスクを並列で実行する場合:

### 手順
1. **worktree隔離**: 各エージェントを別worktreeで実行し競合回避
   ```
   # エージェントA: 壁改善
   # エージェントB: 室名改善
   # エージェントC: 部屋検出改善
   ```
2. **タスク分割例**:
   - 壁改善: 壁の重複削除、壁端点のスナップ精度向上
   - 室名改善: テキスト抽出→部屋名マッチングの精度向上
   - 部屋検出改善: OpenCV輪郭検出パラメータの最適化
3. **結果統合**: 各エージェントの修正をメインブランチに統合
4. **統合テスト**: testN を実行して全体の改善/悪化を確認

### 注意
- 各エージェントは `pdf-extract-vectors.py` の異なるメソッドを担当すること
- 同じメソッドを複数エージェントが触ると競合する
- 統合後は必ず overlay 比較を実行

## 比較ツール (compare-pdf-dxf.py) の仕組み

- blueprint JSON から直接描画（matplotlib不使用、PIL直接描画）
- 座標変換パイプライン:
  1. `real_mm` (blueprint JSON の座標)
  2. → `paper_mm` (÷ scale)
  3. → `pt` (ポイント単位)
  4. → `flip_y` (Y軸反転)
  5. → `pixel` (画像座標)
- PDFページを背景に、DXFの壁/部屋/什器を重ねて描画

## 注意
- **コンテキスト管理**: pdf-extract-vectors.py は ~3,700行、**全読み禁止**（必要セクションのみ `limit` で読む）
- 1サイクルで修正は1-2項目に絞る
- overlay画像を必ず確認してから「改善した」と判断する
