Blenderパイプラインでパースをレンダリングする。

## 手順

### 1. テンプレート確認
- `src/data/room-templates.ts` から利用可能なテンプレートID一覧を取得
- 引数でテンプレートが指定されていればそれを使用、なければユーザーに確認

### 2. JSON生成
```bash
cd C:/Users/LENOVO/Projects/porano-perse
npx tsx scripts/template-to-json.ts --template=$TEMPLATE_ID --style=$STYLE
```
- `output/scene-json/` にJSONが生成されることを確認

### 3. Blenderレンダリング
```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/render-template.py \
  -- output/scene-json/$TEMPLATE_ID.json --quality=$QUALITY --camera=$CAMERA
```

品質オプション:
| quality | samples | 用途 |
|---------|---------|------|
| `preview` | 32 | 確認用（~40秒） |
| `draft` | 64 | 中品質 |
| `production` | 256 | 最終成果物 |

カメラオプション: `main`, `counter`, `window`, `all`

### 4. 結果確認
- `output/` に .blend と .png が生成されたことを確認
- ファイルサイズを報告
- 可能であれば画像をReadで表示

### 5. バッチレンダリング（全テンプレート）
引数に `--batch` が指定された場合:
```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/render-batch.py
```
⚠️ 全19テンプレート×9スタイル = 171枚。時間がかかるためバックグラウンド実行推奨。

### 注意事項
- Blenderは必ず `--background` で実行（GUI不使用）
- GPU自動検出: CUDA → OPTIX → CPU フォールバック
- Blender 5.0 API: `handle_left_type`(非handle_type_left), 自動タイル
- エラー発生時は `scripts/blender/` のPythonモジュールを確認
