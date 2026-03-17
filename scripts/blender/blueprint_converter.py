"""
Blueprint JSON → Blender Scene 変換器
/blueprint-analyze で生成されたJSONからBlenderシーンを構築する
"""
import bpy
import bmesh
import json
import math
import os
import sys

# 同階層のモジュールをインポート
sys.path.insert(0, os.path.dirname(__file__))
from core import clear_scene, setup_collections
from room_builder import RoomBuilder
from presets import (
    apply_render_quality,
    apply_material_preset,
    setup_camera_from_preset,
    MATERIAL_PRESETS,
    CEILING_HEIGHT_MM,
)


class BlueprintConverter:
    """図面分析JSONからBlenderシーンを構築"""

    def __init__(self, json_path):
        with open(json_path, 'r', encoding='utf-8') as f:
            self.data = json.load(f)
        self.project_name = self.data.get('project_name', 'unnamed')
        self.room = self.data.get('room', {})
        self.walls = self.data.get('walls', [])
        self.fixtures = self.data.get('fixtures', [])
        self.furniture = self.data.get('furniture_suggestions', [])
        self.lighting_data = self.data.get('lighting', {})
        self.floor_data = self.data.get('floor', {})
        self.style = self.data.get('style_hints', 'modern')

    def build_scene(self, quality='preview'):
        """フルシーンを構築"""
        print(f"=== Building scene: {self.project_name} ===")

        # 1. シーン完全クリア（デフォルトCube/Camera/Light含め全削除）
        clear_scene()

        # 2. 部屋構築
        self._build_room()

        # 3. 造作物
        self._build_fixtures()

        # 4. 家具（プレースホルダー）
        self._place_furniture()

        # 5. 照明
        self._setup_lighting()

        # 6. カメラ
        self._setup_cameras()

        # 7. レンダリング設定
        apply_render_quality(quality)

        print(f"=== Scene built: {self.project_name} ===")

    def _build_room(self):
        """壁・床・天井を構築"""
        width_m = self.room.get('width_mm', 5000) / 1000
        depth_m = self.room.get('depth_mm', 4000) / 1000
        height_m = self.room.get('ceiling_height_mm', 2700) / 1000

        print(f"Room: {width_m}m x {depth_m}m x {height_m}m")

        # 床
        self._create_floor(width_m, depth_m)

        # 天井
        self._create_ceiling(width_m, depth_m, height_m)

        # 壁（JSONの壁データから生成）
        if self.walls:
            for wall_data in self.walls:
                self._create_wall_from_data(wall_data, height_m)
        else:
            # フォールバック: 4面壁を自動生成
            self._create_box_walls(width_m, depth_m, height_m)

    def _create_floor(self, width, depth):
        """床を生成"""
        mesh = bpy.data.meshes.new("Floor")
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1)
        bm.to_mesh(mesh)
        bm.free()

        obj = bpy.data.objects.new("Floor", mesh)
        obj.scale = (width / 2, depth / 2, 1)
        obj.location = (width / 2, depth / 2, 0)
        bpy.context.collection.objects.link(obj)

        # マテリアル
        floor_mat = self._get_floor_material()
        apply_material_preset(obj, floor_mat)

    def _create_ceiling(self, width, depth, height):
        """天井を生成"""
        mesh = bpy.data.meshes.new("Ceiling")
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1)
        bm.to_mesh(mesh)
        bm.free()

        obj = bpy.data.objects.new("Ceiling", mesh)
        obj.scale = (width / 2, depth / 2, 1)
        obj.location = (width / 2, depth / 2, height)
        obj.rotation_euler = (math.radians(180), 0, 0)
        bpy.context.collection.objects.link(obj)

        apply_material_preset(obj, 'ceiling_white')

    def _create_wall_from_data(self, wall_data, default_height):
        """壁データからジオメトリを生成"""
        start = wall_data.get('start', [0, 0])
        end = wall_data.get('end', [1, 0])
        height = wall_data.get('height_mm', default_height * 1000) / 1000
        thickness = wall_data.get('thickness_mm', 120) / 1000

        # 壁の長さと角度を計算
        dx = (end[0] - start[0]) / 1000  # mm → m
        dy = (end[1] - start[1]) / 1000
        length = math.sqrt(dx * dx + dy * dy)
        angle = math.atan2(dy, dx)

        if length < 0.01:
            return

        # 壁メッシュ
        mesh = bpy.data.meshes.new(f"Wall_{wall_data.get('id', 'x')}")
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        bm.to_mesh(mesh)
        bm.free()

        obj = bpy.data.objects.new(f"Wall_{wall_data.get('id', 'x')}", mesh)
        obj.scale = (length / 2, thickness / 2, height / 2)

        cx = (start[0] / 1000 + end[0] / 1000) / 2
        cy = (start[1] / 1000 + end[1] / 1000) / 2
        obj.location = (cx, cy, height / 2)
        obj.rotation_euler = (0, 0, angle)

        bpy.context.collection.objects.link(obj)

        # 壁マテリアル
        finish = wall_data.get('finish', 'クロス白')
        mat_name = 'wall_white'
        if 'コンクリ' in finish:
            mat_name = 'wall_concrete'
        elif 'モルタル' in finish:
            mat_name = 'wall_mortar'
        apply_material_preset(obj, mat_name)

        # 開口部は別途ブーリアンで処理（TODO: 高度な開口部カット）
        openings = wall_data.get('openings', [])
        for opening in openings:
            print(f"  Opening: {opening.get('type')} {opening.get('width_mm')}x{opening.get('height_mm')}mm")

    def _create_box_walls(self, width, depth, height):
        """矩形部屋の4面壁を自動生成"""
        thickness = 0.12
        walls = [
            ('Wall_N', (width / 2, depth, height / 2), (width / 2, thickness / 2, height / 2), 0),
            ('Wall_S', (width / 2, 0, height / 2), (width / 2, thickness / 2, height / 2), 0),
            ('Wall_E', (width, depth / 2, height / 2), (thickness / 2, depth / 2, height / 2), 0),
            ('Wall_W', (0, depth / 2, height / 2), (thickness / 2, depth / 2, height / 2), 0),
        ]

        for name, loc, scale, rot in walls:
            mesh = bpy.data.meshes.new(name)
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1)
            bm.to_mesh(mesh)
            bm.free()

            obj = bpy.data.objects.new(name, mesh)
            obj.location = loc
            obj.scale = scale
            bpy.context.collection.objects.link(obj)
            apply_material_preset(obj, 'wall_white')

    def _build_fixtures(self):
        """造作物（カウンター・棚等）"""
        for fixture in self.fixtures:
            pos = fixture.get('position', [0, 0, 0])
            dims = fixture.get('dimensions', [1000, 600, 900])
            name = fixture.get('name', fixture.get('type', 'Fixture'))

            mesh = bpy.data.meshes.new(name)
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1)
            bm.to_mesh(mesh)
            bm.free()

            obj = bpy.data.objects.new(name, mesh)
            w, d, h = dims[0] / 1000, dims[1] / 1000, dims[2] / 1000
            obj.scale = (w / 2, d / 2, h / 2)
            obj.location = (pos[0] / 1000, pos[1] / 1000, h / 2 + pos[2] / 1000)
            bpy.context.collection.objects.link(obj)

            # マテリアル
            mat_hint = fixture.get('material', '木目')
            if '木' in mat_hint:
                apply_material_preset(obj, 'wood_medium')
            elif '金属' in mat_hint or 'ステンレス' in mat_hint:
                apply_material_preset(obj, 'metal_stainless')
            else:
                apply_material_preset(obj, 'wood_light')

            print(f"  Fixture: {name} ({w:.1f}x{d:.1f}x{h:.1f}m)")

    def _place_furniture(self):
        """家具プレースホルダー配置"""
        for item in self.furniture:
            pos = item.get('position', [0, 0])
            ftype = item.get('type', 'box')
            count = item.get('count', 1)

            # シンプルなプレースホルダー
            for i in range(count):
                size = self._furniture_size(ftype)
                mesh = bpy.data.meshes.new(f"{ftype}_{i}")
                bm = bmesh.new()
                bmesh.ops.create_cube(bm, size=1)
                bm.to_mesh(mesh)
                bm.free()

                obj = bpy.data.objects.new(f"{ftype}_{i}", mesh)
                w, d, h = size
                obj.scale = (w / 2, d / 2, h / 2)
                offset_x = (i % 3) * w * 1.2
                offset_y = (i // 3) * d * 1.2
                obj.location = (
                    pos[0] / 1000 + offset_x,
                    pos[1] / 1000 + offset_y,
                    h / 2
                )
                bpy.context.collection.objects.link(obj)
                apply_material_preset(obj, 'wood_light')

            print(f"  Furniture: {ftype} x{count}")

    def _setup_lighting(self):
        """照明セットアップ"""
        from lighting import setup_lighting
        direction = self.lighting_data.get('natural_light_direction', '南')
        # 方角→角度マッピング
        dir_angles = {'北': 0, '東': 90, '南': 180, '西': 270}
        angle = dir_angles.get(direction, 180)
        setup_lighting(style='natural', sun_rotation=math.radians(angle))

    def _setup_cameras(self):
        """カメラ配置"""
        width_m = self.room.get('width_mm', 5000) / 1000
        depth_m = self.room.get('depth_mm', 4000) / 1000
        center = (width_m / 2, depth_m / 2)

        # メインカメラ（eye_level）
        cam = setup_camera_from_preset('eye_level', center, width_m, depth_m)
        if cam:
            bpy.context.scene.camera = cam

        # 俯瞰カメラ
        setup_camera_from_preset('overview', center, width_m, depth_m)

    def _get_floor_material(self):
        """床データからマテリアルプリセット名を返す"""
        material = self.floor_data.get('material', 'フローリング')
        if 'オーク' in material or 'フローリング' in material:
            return 'floor_oak'
        elif 'ウォールナット' in material:
            return 'floor_walnut'
        elif 'タイル' in material:
            return 'floor_tile_white'
        elif 'テラゾー' in material:
            return 'floor_terrazzo'
        elif 'モルタル' in material:
            return 'floor_mortar'
        return 'floor_oak'

    def _furniture_size(self, ftype):
        """家具タイプから概算サイズ(m)を返す"""
        sizes = {
            'table': (0.8, 0.8, 0.72),
            'chair': (0.45, 0.45, 0.80),
            'sofa': (1.8, 0.85, 0.80),
            'desk': (1.2, 0.6, 0.72),
            'shelf': (0.9, 0.35, 1.8),
            'cabinet': (0.6, 0.45, 0.85),
            'bed': (1.4, 2.0, 0.45),
            'counter_stool': (0.40, 0.40, 0.75),
        }
        return sizes.get(ftype, (0.5, 0.5, 0.5))

    def render(self, output_dir, quality='preview'):
        """レンダリング実行"""
        self.build_scene(quality)

        os.makedirs(output_dir, exist_ok=True)

        # .blend保存
        blend_path = os.path.join(output_dir, f"{self.project_name}.blend")
        bpy.ops.wm.save_as_mainfile(filepath=blend_path)
        print(f"Saved: {blend_path}")

        # PNG出力
        png_path = os.path.join(output_dir, f"{self.project_name}.png")
        bpy.context.scene.render.filepath = png_path
        bpy.ops.render.render(write_still=True)
        print(f"Rendered: {png_path}")

        return blend_path, png_path


# ============================================================
# CLI エントリポイント
# ============================================================
def main():
    """コマンドライン実行"""
    argv = sys.argv
    # Blender の '--' 以降の引数を取得
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []

    if len(argv) < 1:
        print("Usage: blender --background --python blueprint_converter.py -- <json_path> [--quality preview|draft|production]")
        return

    json_path = argv[0]
    quality = 'preview'
    if '--quality' in argv:
        qi = argv.index('--quality')
        if qi + 1 < len(argv):
            quality = argv[qi + 1]

    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(json_path))), 'output')

    converter = BlueprintConverter(json_path)
    converter.render(output_dir, quality)


if __name__ == '__main__':
    main()
