図面分析結果からBlenderパースを制作する。`/blueprint-analyze` の出力を入力として使う。

## 引数
- `$ARGUMENTS`: 分析JSONパスまたはプロジェクト名（省略時はoutput/blueprint-analysis/内の最新を使用）

## 手順

### 1. 分析データ読み込み
- `output/blueprint-analysis/` から対象JSONを読む
- `_prompt.md` があればそれも読んで制作方針を確認
- JSONが無い場合は `/blueprint-analyze` の実行を案内

### 2. Blender Pythonスクリプト生成
分析JSONを基に案件専用のレンダリングスクリプトを生成:

出力先: `scripts/render-{project_name}.py`

スクリプトの構成:
```python
#!/usr/bin/env python3
"""
{project_name} パースレンダリング
図面分析: output/blueprint-analysis/{project_name}.json
生成日: {date}
"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'blender'))

from core import init_scene
from room_builder import RoomBuilder
from furniture_importer import FurnitureImporter
from lighting import setup_lighting
from cameras import setup_cameras
from renderer import render_scene
from style_applicator import apply_style
from materials import wood, metal, fabric, glass, wall, floor

def main():
    # 1. シーン初期化
    init_scene()

    # 2. 部屋構築（壁・床・天井・開口部）
    builder = RoomBuilder()
    # ... 分析JSONの寸法を使用

    # 3. 造作物（カウンター等）
    # ... fixtures から生成

    # 4. 家具配置（プレースホルダー）
    importer = FurnitureImporter()
    # ... furniture_suggestions から配置

    # 5. マテリアル適用
    # ... style_hints に基づく

    # 6. 照明
    setup_lighting(style='...')

    # 7. カメラ
    setup_cameras(room_width=..., room_depth=..., ceiling_height=...)

    # 8. レンダリング
    render_scene(
        output_path=f'output/{project_name}',
        quality='preview'  # 初回はpreview
    )

if __name__ == '__main__':
    main()
```

### 3. パース生成の優先順位（厳守）
1. **最優先**: 天井・壁・床・建具をしっかり作る（図面寸法厳守）
2. **後回し**: 家具はプレースホルダーでOK
3. **禁止**: 余計な線や物を入れない

### 4. テストレンダリング（preview品質）
```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
  --background --python scripts/render-{project_name}.py
```
- バックグラウンドで実行
- 完了後に出力画像をReadで表示

### 5. 結果確認と次のステップ
- レンダリング画像を表示
- .blend ファイルのパスを報告
- 問題点があれば `/perse-iterate` での改善を案内

### パース生成ルール
- Blenderは必ず `--background` で実行
- Blender 5.0 API規約に従う（handle_left_type等）
- bmeshでジオメトリ生成（bpy.ops禁止）
- PBRマテリアル（Principled BSDF）
- GPU自動検出: CUDA → OPTIX → CPU
- OpenImageDenoise常時有効
