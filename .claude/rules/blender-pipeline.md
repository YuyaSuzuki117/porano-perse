# Blender パイプラインルール

対象: `scripts/**/*.py`, `scripts/template-to-json.ts`

## アーキテクチャ
```
template-to-json.ts → scene.json → render-template.py → Blender 5.0 (Cycles) → .blend + .png
```

Next.js アプリ（src/）とBlenderパイプライン（scripts/）は完全に独立。
Blenderスクリプトはアプリの依存関係に含めない。

## Blender 5.0 API 規約
- `handle_left_type` / `handle_right_type`（5.0で名前変更、旧: `handle_type_left`）
- `render.tile_x` / `render.tile_y` → 廃止（自動タイル）
- Principled BSDF: `Emission Color` + `Emission Strength`（ノード名で接続）
- `bpy.context.view_layer.use_pass_denoising_data` ではなくCompositorノードでデノイズ

## Pythonモジュール構成 (scripts/blender/)
| モジュール | 責務 |
|-----------|------|
| `core.py` | シーン初期化・基本メッシュ作成 |
| `room_builder.py` | 部屋ジオメトリ（壁・床・天井・開口部） |
| `furniture_importer.py` | GLBインポート・配置（カスタムモデル振り分け） |
| `lighting.py` | 3点照明 + 環境光 |
| `cameras.py` | カメラプリセット（Main/Counter/Window） |
| `renderer.py` | Cycles設定・画像出力 |
| `style_applicator.py` | カラーパレット・AgXトーンマッピング |
| `materials/*.py` | PBRマテリアル6種 |
| `models/*.py` | カスタム高品質モデル |

## コーディングルール

### マテリアル作成
```python
# ✅ ノードツリーでPBR設定
mat = bpy.data.materials.new(name="Wood_Oak")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.45, 0.30, 0.18, 1.0)
bsdf.inputs["Roughness"].default_value = 0.65

# ❌ viewport colorだけ設定（レンダリングに反映されない）
mat.diffuse_color = (0.45, 0.30, 0.18, 1.0)
```

### オブジェクト作成
```python
# ✅ bmeshで生成 → メッシュに変換
import bmesh
mesh = bpy.data.meshes.new("Chair_Seat")
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bm.to_mesh(mesh)
bm.free()
obj = bpy.data.objects.new("Chair_Seat", mesh)
bpy.context.collection.objects.link(obj)

# ❌ bpy.ops（コンテキスト依存でバッチ実行時に失敗）
bpy.ops.mesh.primitive_cube_add()  # 避ける
```

### カスタムモデル追加手順
1. `scripts/blender/models/` に新ファイル作成（例: `bar_stool.py`）
2. `create_model(name, style_colors)` 関数を実装
3. `furniture_importer.py` の振り分けロジックに追加
4. テストレンダリングで確認: `/blender-render`

### レンダリング設定
- GPU自動検出: CUDA → OPTIX → CPU（フォールバック順）
- OpenImageDenoise: 常時有効
- 品質: preview(32) / draft(64) / production(256)
- 出力: PNG RGBA 4K (3840×2160)

## 実行ルール
- 常に `--background` モード（GUI不使用）
- 長時間レンダリングはバックグラウンド実行
- エラー時は stderr の Python traceback を確認
- GLBインポートエラー → `public/models/` のファイル存在確認
