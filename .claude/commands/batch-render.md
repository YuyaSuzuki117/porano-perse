# /batch-render — バッチレンダリング

案件内の全シーン（またはフィルタ指定）を一括レンダリングする。

## 引数
- `$ARGUMENTS` — `<案件名> [--quality preview|draft|final] [--room <部屋名>] [--camera <カメラ名>]`

## 手順

### Step 1: レンダリング対象の特定
- `output/projects/<案件名>/blender/` 内の .blend ファイルを列挙
- --room 指定時はフィルタ
- 対象がなければ `scripts/render-*.py` から案件用スクリプトを探索

### Step 2: 品質設定
| プリセット | Samples | 解像度 | 用途 |
|-----------|---------|--------|------|
| preview | 32 | 1920×1080 | 確認用 (~40秒) |
| draft | 64 | 2560×1440 | 社内レビュー |
| final | 256 | 3840×2160 | 納品用 |

### Step 3: 順次レンダリング実行
各シーンに対して:
```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background "<blend_file>" \
  --python scripts/render-template.py \
  -- <scene_json> --quality=<quality> --camera=<camera>
```
- メモリ節約のため**順次実行**（並列禁止）
- 各レンダリング完了後に進捗を報告
- エラー発生時はスキップして次へ進む

### Step 4: 完了報告
| シーン | カメラ | 品質 | 時間 | 出力パス | 状態 |
のテーブルを出力。失敗があれば原因も記載。
