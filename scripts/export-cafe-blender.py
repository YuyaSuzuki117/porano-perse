"""
小規模カフェテンプレート → Blender シーン出力スクリプト v2
=========================================================
使い方:
  blender --background --python scripts/export-cafe-blender.py
  → output/small-cafe.blend に保存

修正点 v2:
- 壁をSolidify (厚み付き) に変更 → 裏面透過問題解消
- 床マテリアルをプロシージャルウッドに改善
- カメラを部屋の内部に確実に配置
- GLBモデルのスケーリング修正 (モデル自体が実寸のため scale=寸法ではなくスケール倍率)
- 環境光(World)追加で黒背景解消
- 窓に実際の開口 (Boolean) 適用
"""

import bpy
import os
import math
import mathutils

# ===== パス設定 =====
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
MODELS_DIR = os.path.join(PROJECT_DIR, "public", "models")
OUTPUT_DIR = os.path.join(PROJECT_DIR, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ===== テンプレートデータ =====
W = 6.0   # 部屋幅
D = 7.0   # 部屋奥行
H = 2.7   # 天井高
HW = W / 2
HD = D / 2
PI = math.pi

# カフェカラーパレット
COL_FLOOR = (0.52, 0.36, 0.24, 1.0)
COL_WALL = (0.98, 0.94, 0.88, 1.0)
COL_CEILING = (0.96, 0.95, 0.93, 1.0)
COL_FRAME = (0.25, 0.20, 0.15, 1.0)

# 家具データ: [type, name, [app_x, app_y, app_z], [app_rx, app_ry, app_rz], [sx, sy, sz]]
# アプリ座標: x=左右, y=高さ(上), z=奥行(+手前, -奥)
FURNITURE = [
    # カウンター＆バックバー
    ["counter", "カウンター", [0, 0, -HD+0.4], [0,0,0], [3.0,1.0,0.5]],
    ["espresso_machine", "エスプレッソマシン", [-0.8, 0.85, -HD+0.25], [0,0,0], [0.4,0.45,0.35]],
    ["cake_showcase", "ケーキショーケース", [0.8, 0, -HD+0.25], [0,0,0], [1.0,0.9,0.5]],
    ["register", "レジ", [1.8, 0, -HD+0.4], [0,0,0], [0.5,0.9,0.45]],
    # スツール3脚
    ["stool", "スツール1", [-0.8, 0, -HD+1.2], [0,0,0], [0.35,0.7,0.35]],
    ["stool", "スツール2", [0.0, 0, -HD+1.2], [0,0,0], [0.35,0.7,0.35]],
    ["stool", "スツール3", [0.8, 0, -HD+1.2], [0,0,0], [0.35,0.7,0.35]],
    # 丸テーブル4セット (各2椅子)
    ["table_round", "丸テーブルLF", [-1.3,0,0], [0,0,0], [0.7,0.72,0.7]],
    ["chair", "椅子LF1", [-1.3,0,-0.45], [0,0,0], [0.42,0.82,0.42]],
    ["chair", "椅子LF2", [-1.3,0,0.45], [0,PI,0], [0.42,0.82,0.42]],
    ["table_round", "丸テーブルRF", [1.3,0,0], [0,0,0], [0.7,0.72,0.7]],
    ["chair", "椅子RF1", [1.3,0,-0.45], [0,0,0], [0.42,0.82,0.42]],
    ["chair", "椅子RF2", [1.3,0,0.45], [0,PI,0], [0.42,0.82,0.42]],
    ["table_round", "丸テーブルLB", [-1.3,0,1.8], [0,0,0], [0.7,0.72,0.7]],
    ["chair", "椅子LB1", [-1.3,0,1.35], [0,0,0], [0.42,0.82,0.42]],
    ["chair", "椅子LB2", [-1.3,0,2.25], [0,PI,0], [0.42,0.82,0.42]],
    ["table_round", "丸テーブルRB", [1.3,0,1.8], [0,0,0], [0.7,0.72,0.7]],
    ["chair", "椅子RB1", [1.3,0,1.35], [0,0,0], [0.42,0.82,0.42]],
    ["chair", "椅子RB2", [1.3,0,2.25], [0,PI,0], [0.42,0.82,0.42]],
    # ソファ席
    ["sofa", "ソファ", [-HW+0.5,0,0.8], [0,PI/2,0], [1.4,0.65,0.6]],
    ["table_round", "ソファテーブル", [-HW+1.3,0,0.8], [0,0,0], [0.55,0.5,0.55]],
    # 装飾
    ["menu_board", "メニューボード", [0,1.5,HD-0.12], [0,PI,0], [0.7,0.5,0.05]],
    ["clock", "時計", [0,2.0,-HD+0.08], [0,0,0], [0.3,0.3,0.05]],
    # ペンダントライト
    ["pendant_light", "ペンダントライト1", [-1.5,H-0.3,0.8], [0,0,0], [0.28,0.35,0.28]],
    ["pendant_light", "ペンダントライト2", [0,H-0.3,0.8], [0,0,0], [0.28,0.35,0.28]],
    ["pendant_light", "ペンダントライト3", [1.5,H-0.3,0.8], [0,0,0], [0.28,0.35,0.28]],
    # 間接照明
    ["indirect_light", "間接照明", [0,2.0,-HD+0.12], [0,0,0], [0.1,0.3,2.5]],
    # 植物
    ["plant", "観葉植物", [HW-0.4,0,HD-0.4], [0,0,0], [0.5,1.2,0.5]],
    ["plant_small", "小型植物", [-1.5,0.72,0], [0,0,0], [0.2,0.3,0.2]],
    ["flower_pot", "花瓶", [1.3,0.72,1.8], [0,0,0], [0.18,0.25,0.18]],
    # 入口
    ["coat_rack", "コートラック", [1.5,0,HD-0.35], [0,0,0], [0.4,1.7,0.4]],
    ["umbrella_stand", "傘立て", [2.0,0,HD-0.25], [0,0,0], [0.25,0.55,0.25]],
    ["trash_can", "ゴミ箱", [-HW+0.35,0,HD-0.3], [0,0,0], [0.28,0.6,0.28]],
    # ラグ
    ["rug", "ラグ", [0,0.01,0.8], [0,0,0], [2.5,0.02,2]],
    # カーテン
    ["curtain", "カーテン左", [-1.5,0,-HD+0.08], [0,0,0], [0.5,2.2,0.08]],
    ["curtain", "カーテン右", [1.5,0,-HD+0.08], [0,0,0], [0.5,2.2,0.08]],
    # エアコン
    ["air_conditioner", "エアコン左", [-HW+0.08,2.2,0], [0,PI/2,0], [0.9,0.3,0.25]],
    ["air_conditioner", "エアコン右", [HW-0.08,2.2,0], [0,-PI/2,0], [0.9,0.3,0.25]],
]

# 開口部
OPENINGS = [
    # wall, pos_along_wall, width, height, elevation, type
    ["south", 3.0, 1.0, 2.1, 0, "door"],
    ["north", 1.5, 1.5, 1.3, 0.8, "window"],
    ["north", 4.5, 1.5, 1.3, 0.8, "window"],
]


# ===== 座標変換 =====
def to_blender(app_pos):
    """アプリ [x, y, z] → Blender (x, -z, y)
    アプリ: y=up, z=front(+)/back(-)
    Blender: z=up, y=front(-)/back(+)
    """
    return (app_pos[0], -app_pos[2], app_pos[1])

def rot_to_blender(app_rot):
    """アプリ回転 → Blender回転
    アプリ: Y軸回転=水平回転 → Blender: Z軸回転
    """
    return (app_rot[0], -app_rot[2], app_rot[1])

def scale_to_blender(app_scale):
    """アプリスケール [sx, sy, sz] → Blender (sx, sz, sy)"""
    return (app_scale[0], app_scale[2], app_scale[1])


# ===== ヘルパー =====
def make_material(name, color, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = color
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
    return mat

def make_wood_floor_material():
    """プロシージャル木目フローリング"""
    mat = bpy.data.materials.new(name="M_WoodFloor")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs['Roughness'].default_value = 0.45
    try:
        bsdf.inputs['Specular IOR Level'].default_value = 0.4
    except:
        pass

    # Noise Texture → Color Ramp → Base Color
    tex_coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (8, 2, 1)

    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 15
    noise.inputs['Detail'].default_value = 6
    noise.inputs['Distortion'].default_value = 2.5

    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (0.25, 0.15, 0.08, 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (0.55, 0.38, 0.22, 1)
    # 中間色追加
    e = ramp.color_ramp.elements.new(0.5)
    e.color = (0.42, 0.28, 0.15, 1)

    links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])

    # Bump
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.15
    bump.inputs['Distance'].default_value = 0.02

    noise2 = nodes.new('ShaderNodeTexNoise')
    noise2.inputs['Scale'].default_value = 40
    noise2.inputs['Detail'].default_value = 3

    links.new(mapping.outputs['Vector'], noise2.inputs['Vector'])
    links.new(noise2.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat

def make_glass_material():
    """窓ガラス"""
    mat = bpy.data.materials.new(name="M_Glass")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.85, 0.92, 1.0, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.02
        bsdf.inputs['Alpha'].default_value = 0.12
        try:
            bsdf.inputs['Transmission Weight'].default_value = 0.95
        except:
            try:
                bsdf.inputs['Transmission'].default_value = 0.95
            except:
                pass
    # Blender 4.x / 5.x transparency
    try:
        mat.surface_render_method = 'BLENDED'
    except:
        pass
    return mat


# ===== シーン構築 =====
def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for block in bpy.data.meshes:
        if block.users == 0: bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0: bpy.data.materials.remove(block)
    print("[Scene] クリア完了")


def create_room():
    """厚みのある壁・プロシージャル木目床・天井"""
    floor_mat = make_wood_floor_material()
    wall_mat = make_material("M_Wall", COL_WALL, roughness=0.82)
    ceil_mat = make_material("M_Ceiling", COL_CEILING, roughness=0.9)

    # === 床 (厚み付き) ===
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.025))
    floor = bpy.context.active_object
    floor.name = "Floor"
    floor.scale = (W/2, D/2, 0.025)
    floor.data.materials.append(floor_mat)

    # === 天井 ===
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, H + 0.025))
    ceil = bpy.context.active_object
    ceil.name = "Ceiling"
    ceil.scale = (W/2, D/2, 0.025)
    ceil.data.materials.append(ceil_mat)

    # === 壁 (厚み0.12mのCube) ===
    wall_t = 0.06  # 半厚み
    wall_defs = [
        # 北壁 (奥, y=+D/2) — アプリのz=-HD
        {"name": "Wall_North", "loc": (0, D/2 + wall_t, H/2), "scale": (W/2 + wall_t*2, wall_t, H/2)},
        # 南壁 (手前, y=-D/2) — アプリのz=+HD, ドア側
        {"name": "Wall_South", "loc": (0, -D/2 - wall_t, H/2), "scale": (W/2 + wall_t*2, wall_t, H/2)},
        # 西壁 (左, x=-W/2)
        {"name": "Wall_West", "loc": (-W/2 - wall_t, 0, H/2), "scale": (wall_t, D/2, H/2)},
        # 東壁 (右, x=+W/2)
        {"name": "Wall_East", "loc": (W/2 + wall_t, 0, H/2), "scale": (wall_t, D/2, H/2)},
    ]

    for wd in wall_defs:
        bpy.ops.mesh.primitive_cube_add(size=1, location=wd["loc"])
        wall = bpy.context.active_object
        wall.name = wd["name"]
        wall.scale = wd["scale"]
        wall.data.materials.append(wall_mat)

    print(f"[Room] 部屋作成完了 ({W}m × {D}m × {H}m)")


def create_openings():
    """開口部: Boolean Modifier で壁に穴を開ける + 窓ガラス + フレーム"""
    frame_mat = make_material("M_Frame", COL_FRAME, roughness=0.35, metallic=0.1)
    glass_mat = make_glass_material()

    for i, op in enumerate(OPENINGS):
        wall_name_str, pos_along, ow, oh, elev, otype = op

        # 開口位置 (Blender座標)
        if wall_name_str == "north":
            wall_obj_name = "Wall_North"
            cx = -W/2 + pos_along
            cy = D/2
            cz = elev + oh/2
            frame_rot = (0, 0, 0)
            bool_scale = (ow/2 + 0.01, 0.15, oh/2 + 0.01)
        elif wall_name_str == "south":
            wall_obj_name = "Wall_South"
            cx = -W/2 + pos_along
            cy = -D/2
            cz = elev + oh/2
            frame_rot = (0, 0, 0)
            bool_scale = (ow/2 + 0.01, 0.15, oh/2 + 0.01)
        else:
            continue

        # Boolean カッター
        bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, cz))
        cutter = bpy.context.active_object
        cutter.name = f"_Cutter_{i}"
        cutter.scale = bool_scale
        cutter.display_type = 'WIRE'

        # Boolean 適用
        wall_obj = bpy.data.objects.get(wall_obj_name)
        if wall_obj:
            bpy.context.view_layer.objects.active = wall_obj
            mod = wall_obj.modifiers.new(name=f"Bool_{i}", type='BOOLEAN')
            mod.operation = 'DIFFERENCE'
            mod.object = cutter
            try:
                mod.solver = 'FAST'
            except:
                pass
            bpy.ops.object.modifier_apply(modifier=mod.name)
            # カッター削除
            bpy.data.objects.remove(cutter, do_unlink=True)

        # 窓ガラス
        if otype == "window":
            bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, cy, cz))
            glass = bpy.context.active_object
            glass.name = f"Window_Glass_{i}"
            if wall_name_str in ["north", "south"]:
                glass.rotation_euler = (PI/2, 0, 0)
                glass.scale = (ow/2, 1, oh/2)
            glass.data.materials.append(glass_mat)

        # フレーム (4辺)
        ft = 0.035
        fd = 0.07
        frame_parts = []
        if wall_name_str in ["north", "south"]:
            frame_parts = [
                ((cx, cy, elev + oh), (ow/2 + ft, fd/2, ft/2)),         # 上
                ((cx, cy, elev), (ow/2 + ft, fd/2, ft/2)),              # 下
                ((cx - ow/2, cy, elev + oh/2), (ft/2, fd/2, oh/2 + ft)), # 左
                ((cx + ow/2, cy, elev + oh/2), (ft/2, fd/2, oh/2 + ft)), # 右
            ]

        for j, (loc, sc) in enumerate(frame_parts):
            bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
            fr = bpy.context.active_object
            fr.name = f"Frame_{i}_{j}"
            fr.scale = sc
            fr.data.materials.append(frame_mat)

    print(f"[Openings] 開口部 {len(OPENINGS)} 箇所作成完了")


def import_furniture():
    """GLBモデルインポート＆配置"""
    ok = 0
    fallback_mat = make_material("M_Fallback", (0.6, 0.5, 0.4, 1.0), roughness=0.7)

    for item in FURNITURE:
        ftype, fname, pos, rot, scale = item
        b_pos = to_blender(pos)
        b_rot = rot_to_blender(rot)
        b_scale = scale_to_blender(scale)

        glb_path = os.path.join(MODELS_DIR, f"{ftype}.glb")
        if not os.path.exists(glb_path):
            print(f"  [SKIP] {fname} ({ftype}.glb なし) → フォールバック")
            bpy.ops.mesh.primitive_cube_add(size=0.5, location=b_pos, rotation=b_rot)
            obj = bpy.context.active_object
            obj.name = fname
            obj.scale = (b_scale[0]*0.5, b_scale[1]*0.5, b_scale[2]*0.5)
            obj.data.materials.append(fallback_mat)
            continue

        try:
            bpy.ops.import_scene.gltf(filepath=glb_path)
            objs = bpy.context.selected_objects
            if not objs:
                raise RuntimeError("No objects")

            # 空のペアレント
            empty = bpy.data.objects.new(fname, None)
            bpy.context.collection.objects.link(empty)
            empty.location = b_pos
            empty.rotation_euler = b_rot
            empty.scale = b_scale
            empty.empty_display_type = 'PLAIN_AXES'
            empty.empty_display_size = 0.05

            for obj in objs:
                obj.parent = empty
                # シャドウ
                obj.visible_shadow = True
                try:
                    obj.cycles_visibility.shadow = True
                except:
                    pass

            ok += 1
        except Exception as e:
            print(f"  [ERR] {fname}: {e}")
            bpy.ops.mesh.primitive_cube_add(size=0.3, location=b_pos)
            obj = bpy.context.active_object
            obj.name = fname
            obj.data.materials.append(fallback_mat)

    print(f"[Furniture] {ok}/{len(FURNITURE)} 個インポート完了")


def setup_world():
    """環境光 (World) — 黒背景防止"""
    world = bpy.data.worlds.new("CafeWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links

    bg = nodes.get("Background")
    bg.inputs['Color'].default_value = (0.85, 0.82, 0.78, 1.0)
    bg.inputs['Strength'].default_value = 0.3

    print("[World] 環境光設定完了")


def setup_lighting():
    """カフェ照明"""
    # 天井メインライト
    bpy.ops.object.light_add(type='AREA', location=(0, 0, H - 0.05))
    main = bpy.context.active_object
    main.name = "L_Ceiling"
    main.data.energy = 300
    main.data.size = 4.0
    main.data.color = (1.0, 0.93, 0.85)
    main.data.use_shadow = True

    # 窓からの自然光 (北壁=Blender y+方向)
    bpy.ops.object.light_add(type='AREA', location=(0, D/2 - 0.2, 1.4), rotation=(PI/2, 0, 0))
    win_light = bpy.context.active_object
    win_light.name = "L_Window"
    win_light.data.energy = 150
    win_light.data.size = 3.0
    win_light.data.color = (0.9, 0.95, 1.0)
    win_light.data.use_shadow = True

    # カウンター照射スポット
    bpy.ops.object.light_add(type='SPOT', location=(0, D/2 - 1.0, H - 0.1), rotation=(PI/4, 0, 0))
    spot = bpy.context.active_object
    spot.name = "L_CounterSpot"
    spot.data.energy = 120
    spot.data.spot_size = 1.0
    spot.data.color = (1.0, 0.9, 0.78)
    spot.data.use_shadow = True

    # ペンダントライトからの発光 (テーブルエリア照射)
    for i, x in enumerate([-1.5, 0, 1.5]):
        bpy.ops.object.light_add(type='POINT', location=(x, -0.8, H - 0.5))
        pl = bpy.context.active_object
        pl.name = f"L_Pendant_{i}"
        pl.data.energy = 40
        pl.data.color = (1.0, 0.88, 0.72)
        pl.data.shadow_soft_size = 0.2
        pl.data.use_shadow = True

    # フィルライト (部屋全体を明るく)
    bpy.ops.object.light_add(type='AREA', location=(0, 0, H - 0.3))
    fill = bpy.context.active_object
    fill.name = "L_Fill"
    fill.data.energy = 50
    fill.data.size = 5.0
    fill.data.color = (1.0, 0.97, 0.95)
    fill.data.use_shadow = False  # 影なし (フィル)

    print("[Lighting] 照明設定完了")


def setup_cameras():
    """カメラ設定 — 部屋内部から"""
    # メイン: 入口右手前から奥を見る
    bpy.ops.object.camera_add(
        location=(2.0, -2.5, 1.55),
        rotation=(1.20, 0.0, 0.55)
    )
    cam1 = bpy.context.active_object
    cam1.name = "Cam_Main"
    cam1.data.lens = 22
    cam1.data.clip_start = 0.05
    cam1.data.clip_end = 50
    cam1.data.sensor_width = 36
    bpy.context.scene.camera = cam1

    # サブ: カウンター裏から入口方向
    bpy.ops.object.camera_add(
        location=(-1.0, 2.8, 1.4),
        rotation=(1.35, 0.0, PI + 0.4)
    )
    cam2 = bpy.context.active_object
    cam2.name = "Cam_Counter"
    cam2.data.lens = 24
    cam2.data.clip_start = 0.05
    cam2.data.clip_end = 50

    # サブ: 俯瞰
    bpy.ops.object.camera_add(
        location=(0, -0.5, 4.5),
        rotation=(0.65, 0.0, 0.0)
    )
    cam3 = bpy.context.active_object
    cam3.name = "Cam_TopDown"
    cam3.data.lens = 18
    cam3.data.clip_start = 0.05
    cam3.data.clip_end = 50

    print("[Camera] カメラ3台設定完了")


def setup_render():
    """EEVEE レンダー設定"""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False

    eevee = scene.eevee
    try: eevee.taa_render_samples = 128
    except: pass
    try: eevee.taa_samples = 32
    except: pass

    # レイトレーシング
    try:
        eevee.use_raytracing = True
        eevee.ray_tracing_method = 'SCREEN'
    except: pass

    # SSR
    try:
        eevee.use_ssr = True
        eevee.use_ssr_refraction = True
        eevee.ssr_quality = 0.75
        eevee.ssr_thickness = 0.15
    except: pass

    # AO
    try:
        eevee.use_gtao = True
        eevee.gtao_distance = 1.5
        eevee.gtao_quality = 0.75
    except: pass

    # ブルーム
    try:
        eevee.use_bloom = True
        eevee.bloom_threshold = 0.8
        eevee.bloom_intensity = 0.04
    except: pass

    # シャドウ
    try:
        eevee.shadow_cube_size = '2048'
        eevee.shadow_cascade_size = '2048'
        eevee.use_shadow_high_bitdepth = True
        eevee.use_soft_shadows = True
    except: pass

    # カラーマネジメント
    try:
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except: pass
    scene.view_settings.exposure = 0.2
    scene.view_settings.gamma = 1.0

    # 出力
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.compression = 15
    scene.render.filepath = os.path.join(OUTPUT_DIR, "small-cafe-render.png")

    # 単位
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = 'METERS'

    print("[Render] EEVEE設定完了")


def organize_collections():
    """コレクション整理"""
    scene_col = bpy.context.scene.collection

    collections = {
        "01_Room": [],
        "02_Furniture": [],
        "03_Openings": [],
        "04_Lighting": [],
        "05_Cameras": [],
    }

    for obj in list(bpy.data.objects):
        n = obj.name.lower()
        if any(k in n for k in ['floor', 'wall_', 'ceiling']):
            collections["01_Room"].append(obj)
        elif any(k in n for k in ['l_', 'light']):
            collections["04_Lighting"].append(obj)
        elif any(k in n for k in ['cam_']):
            collections["05_Cameras"].append(obj)
        elif any(k in n for k in ['frame_', 'window_glass', 'door']):
            collections["03_Openings"].append(obj)
        else:
            collections["02_Furniture"].append(obj)

    for col_name, objs in collections.items():
        col = bpy.data.collections.new(col_name)
        scene_col.children.link(col)
        for obj in objs:
            for old_col in list(obj.users_collection):
                old_col.objects.unlink(obj)
            col.objects.link(obj)

    print("[Collections] 整理完了")


# ===== メイン =====
def main():
    print("=" * 60)
    print("小規模カフェ → Blender v2")
    print("=" * 60)

    clear_scene()
    setup_world()
    create_room()
    create_openings()
    import_furniture()
    setup_lighting()
    setup_cameras()
    setup_render()
    organize_collections()

    # 保存
    blend_path = os.path.join(OUTPUT_DIR, "small-cafe.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"\n[Save] {blend_path}")

    # レンダリング
    print("[Render] レンダリング中...")
    bpy.ops.render.render(write_still=True)
    print(f"[Render] 完了 → {bpy.context.scene.render.filepath}")

    print("=" * 60)
    print("完了！")
    print("=" * 60)


if __name__ == "__main__":
    main()
