"""Room builder — constructs walls, floor, ceiling with openings in Blender.

Builds axis-aligned room geometry centred at the origin, with the floor at z=0.
Includes architectural trim: baseboards, crown molding.
Openings (doors/windows) are cut into walls via bmesh Boolean operations.
"""

import bpy
import bmesh
import math

from .core import (
    hex_to_rgba,
    make_material,
    link_to_collection,
)
from .materials.floor_finishes import create_floor_material
from .materials.wall_finishes import create_wall_material


# ---------------------------------------------------------------------------
# 内部ヘルパー
# ---------------------------------------------------------------------------

def _create_ceiling_material(color_hex="#FAFAFA"):
    """天井マテリアル — マットホワイトに微細なバリエーション

    完全フラットではなく、塗装面の微妙なムラとラフネス変化を再現。
    Roughness: 0.85-0.95（マット仕上げ）
    """
    from .core import hex_to_rgba

    linear_color = hex_to_rgba(color_hex)
    r, g, b, a = linear_color

    mat = bpy.data.materials.new(name="M_Ceiling_PBR")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    # テクスチャ座標
    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-1000, 300)
    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-800, 300)
    links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])

    # 大スケールの色ムラ（ローラー塗装のムラ感）
    noise_large = nodes.new('ShaderNodeTexNoise')
    noise_large.location = (-550, 400)
    noise_large.inputs['Scale'].default_value = 1.5
    noise_large.inputs['Detail'].default_value = 2.0
    noise_large.inputs['Roughness'].default_value = 0.4
    links.new(mapping.outputs['Vector'], noise_large.inputs['Vector'])

    # 微細ノイズ（塗膜のテクスチャ）
    noise_fine = nodes.new('ShaderNodeTexNoise')
    noise_fine.location = (-550, 100)
    noise_fine.inputs['Scale'].default_value = 80.0
    noise_fine.inputs['Detail'].default_value = 3.0
    noise_fine.inputs['Roughness'].default_value = 0.5
    links.new(mapping.outputs['Vector'], noise_fine.inputs['Vector'])

    # 色ミックス: ベース色 ± 微妙な明暗（2%以内のバリエーション）
    slightly_dark = (r * 0.97, g * 0.97, b * 0.97, 1.0)

    # 大スケールノイズを狭い範囲にリマップ
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.location = (-400, 400)
    ramp.color_ramp.elements[0].position = 0.40
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp.color_ramp.elements[1].position = 0.60
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(noise_large.outputs['Fac'], ramp.inputs['Fac'])

    mix_color = nodes.new('ShaderNodeMix')
    mix_color.location = (-200, 350)
    mix_color.data_type = 'RGBA'
    mix_color.inputs[6].default_value = linear_color      # A: ベース色
    mix_color.inputs[7].default_value = slightly_dark      # B: 少し暗い
    links.new(ramp.outputs['Color'], mix_color.inputs['Factor'])

    links.new(mix_color.outputs[2], bsdf.inputs['Base Color'])

    # ラフネスバリエーション（0.85-0.95のマット範囲）
    rough_map = nodes.new('ShaderNodeMapRange')
    rough_map.location = (-200, -100)
    rough_map.inputs['From Min'].default_value = 0.0
    rough_map.inputs['From Max'].default_value = 1.0
    rough_map.inputs['To Min'].default_value = 0.85
    rough_map.inputs['To Max'].default_value = 0.95
    links.new(noise_large.outputs['Fac'], rough_map.inputs['Value'])
    links.new(rough_map.outputs['Result'], bsdf.inputs['Roughness'])

    # 微細バンプ（塗膜のテクスチャ — 非常に弱く）
    bump = nodes.new('ShaderNodeBump')
    bump.location = (-200, -250)
    bump.inputs['Strength'].default_value = 0.015
    bump.inputs['Distance'].default_value = 0.0005
    links.new(noise_fine.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat


def _create_frame_material():
    """ドア・窓フレーム用マテリアル — 塗装木材のセミグロス仕上げ

    Roughness: 0.2-0.35（セミグロス塗装面）
    微細な木目方向のバリエーション付き
    """
    mat = bpy.data.materials.new(name="M_Frame_PBR")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    # ベース色: オフホワイト塗装
    base_color = (0.82, 0.82, 0.80, 1.0)

    # テクスチャ座標
    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-900, 300)
    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-700, 300)
    mapping.inputs['Scale'].default_value = (1.0, 1.0, 5.0)  # Z方向に伸ばす（縦枠の方向）
    links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])

    # 塗装下の木目（うっすら見える程度）
    wave = nodes.new('ShaderNodeTexWave')
    wave.location = (-450, 400)
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Z'
    wave.inputs['Scale'].default_value = 5.0
    wave.inputs['Distortion'].default_value = 1.5
    wave.inputs['Detail'].default_value = 2.0
    links.new(mapping.outputs['Vector'], wave.inputs['Vector'])

    # 微細ノイズ（塗装面のオレンジピール）
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 100)
    noise.inputs['Scale'].default_value = 200.0
    noise.inputs['Detail'].default_value = 3.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    # 木目を狭い範囲にリマップ（塗装下がうっすら見える程度）
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.location = (-300, 400)
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp.color_ramp.elements[1].position = 0.55
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(wave.outputs['Fac'], ramp.inputs['Fac'])

    # 色ミックス: ベース色 + 少し暗い色
    slightly_dark = (base_color[0] * 0.95, base_color[1] * 0.95, base_color[2] * 0.95, 1.0)
    mix_color = nodes.new('ShaderNodeMix')
    mix_color.location = (-100, 350)
    mix_color.data_type = 'RGBA'
    mix_color.inputs[6].default_value = base_color       # A
    mix_color.inputs[7].default_value = slightly_dark     # B
    links.new(ramp.outputs['Color'], mix_color.inputs['Factor'])

    links.new(mix_color.outputs[2], bsdf.inputs['Base Color'])

    # ラフネスバリエーション（セミグロス: 0.20-0.35）
    rough_map = nodes.new('ShaderNodeMapRange')
    rough_map.location = (-100, -100)
    rough_map.inputs['From Min'].default_value = 0.0
    rough_map.inputs['From Max'].default_value = 1.0
    rough_map.inputs['To Min'].default_value = 0.20
    rough_map.inputs['To Max'].default_value = 0.35
    links.new(wave.outputs['Fac'], rough_map.inputs['Value'])
    links.new(rough_map.outputs['Result'], bsdf.inputs['Roughness'])

    # バンプ: 塗装面のオレンジピール + 木目の微妙な凹凸
    bump_paint = nodes.new('ShaderNodeBump')
    bump_paint.location = (-100, -250)
    bump_paint.inputs['Strength'].default_value = 0.02
    bump_paint.inputs['Distance'].default_value = 0.0003
    links.new(noise.outputs['Fac'], bump_paint.inputs['Height'])

    bump_grain = nodes.new('ShaderNodeBump')
    bump_grain.location = (50, -350)
    bump_grain.inputs['Strength'].default_value = 0.01
    bump_grain.inputs['Distance'].default_value = 0.001
    links.new(wave.outputs['Fac'], bump_grain.inputs['Height'])
    links.new(bump_paint.outputs['Normal'], bump_grain.inputs['Normal'])
    links.new(bump_grain.outputs['Normal'], bsdf.inputs['Normal'])

    # Specular IOR Level — 塗装面の反射
    try:
        bsdf.inputs['Specular IOR Level'].default_value = 0.5
    except KeyError:
        pass

    return mat


def _create_trim_pbr_material(name, base_rgba, roughness_range=(0.30, 0.45)):
    """巾木・廻り縁用PBRマテリアル — セミグロス塗装面

    Args:
        name: マテリアル名
        base_rgba: ベース色 (r, g, b, a)
        roughness_range: ラフネスの変動範囲 (min, max)
    """
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    r, g, b, a = base_rgba

    # テクスチャ座標
    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-800, 300)
    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-600, 300)
    links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])

    # 微細ノイズ（塗装面のムラ）
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-350, 300)
    noise.inputs['Scale'].default_value = 100.0
    noise.inputs['Detail'].default_value = 3.0
    noise.inputs['Roughness'].default_value = 0.5
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    # 色バリエーション（±3%）
    slightly_dark = (r * 0.97, g * 0.97, b * 0.97, 1.0)

    mix_color = nodes.new('ShaderNodeMix')
    mix_color.location = (-150, 300)
    mix_color.data_type = 'RGBA'
    mix_color.inputs[6].default_value = base_rgba         # A
    mix_color.inputs[7].default_value = slightly_dark      # B

    # ノイズを狭い範囲にリマップ
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.location = (-250, 150)
    ramp.color_ramp.elements[0].position = 0.40
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp.color_ramp.elements[1].position = 0.60
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], mix_color.inputs['Factor'])

    links.new(mix_color.outputs[2], bsdf.inputs['Base Color'])

    # ラフネスバリエーション
    rough_map = nodes.new('ShaderNodeMapRange')
    rough_map.location = (-150, -50)
    rough_map.inputs['From Min'].default_value = 0.0
    rough_map.inputs['From Max'].default_value = 1.0
    rough_map.inputs['To Min'].default_value = roughness_range[0]
    rough_map.inputs['To Max'].default_value = roughness_range[1]
    links.new(noise.outputs['Fac'], rough_map.inputs['Value'])
    links.new(rough_map.outputs['Result'], bsdf.inputs['Roughness'])

    # 微細バンプ（塗装面のテクスチャ）
    bump = nodes.new('ShaderNodeBump')
    bump.location = (-150, -200)
    bump.inputs['Strength'].default_value = 0.02
    bump.inputs['Distance'].default_value = 0.0005
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    # Specular IOR Level
    try:
        bsdf.inputs['Specular IOR Level'].default_value = 0.45
    except KeyError:
        pass

    return mat


def _make_glass():
    """窓用のガラスマテリアルを作成"""
    mat = bpy.data.materials.new("M_Glass")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs['Base Color'].default_value = (0.85, 0.92, 1.0, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.02
    bsdf.inputs['Alpha'].default_value = 0.12
    try:
        bsdf.inputs['Transmission Weight'].default_value = 0.95
    except KeyError:
        try:
            bsdf.inputs['Transmission'].default_value = 0.95
        except KeyError:
            pass
    try:
        mat.surface_render_method = 'BLENDED'
    except AttributeError:
        pass
    return mat


def _create_box_mesh(name, size_x, size_y, size_z):
    """bmeshで直方体メッシュを作成して返す（bpy.ops不使用）

    Args:
        name: メッシュ名
        size_x, size_y, size_z: 各軸方向の全幅（半分ではない）

    Returns:
        (mesh, object) タプル。原点は直方体の中心。
    """
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)

    # スケール適用（bmesh頂点を直接変換）
    for v in bm.verts:
        v.co.x *= size_x
        v.co.y *= size_y
        v.co.z *= size_z

    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def _apply_material(obj, mat):
    """オブジェクトにマテリアルを割り当てる"""
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def _cut_opening_bmesh(wall_obj, opening, wall_name, room_width, room_depth, wall_thickness):
    """壁にBoolean DIFFERENCEで開口部を切り抜く（bmesh使用）

    カッターキューブをbmeshで作成し、Boolean modifierで壁から差し引く。
    --background モードでも安定動作する。

    Args:
        wall_obj: 壁オブジェクト
        opening: 開口部データ dict
        wall_name: "north"/"south"/"east"/"west"
        room_width: 部屋の幅(m)
        room_depth: 部屋の奥行(m)
        wall_thickness: 壁厚(m)
    """
    pos_along = opening["positionAlongWall"]  # 壁に沿った位置(m)
    width = opening["width"]                   # 開口幅(m)
    height = opening["height"]                 # 開口高(m)
    elevation = opening.get("elevation", 0.0)  # 床面からの高さ(m)

    W = room_width
    D = room_depth
    t = wall_thickness
    margin = 0.01  # 貫通確保用マージン(1cm)

    # 壁方向に応じたカッター位置・サイズを計算
    if wall_name == "north":
        cx = -W / 2 + pos_along
        cy = D / 2
        cutter_sx = width
        cutter_sy = t + margin * 2
        cutter_sz = height
    elif wall_name == "south":
        cx = -W / 2 + pos_along
        cy = -D / 2
        cutter_sx = width
        cutter_sy = t + margin * 2
        cutter_sz = height
    elif wall_name == "east":
        cx = W / 2
        cy = -D / 2 + pos_along
        cutter_sx = t + margin * 2
        cutter_sy = width
        cutter_sz = height
    elif wall_name == "west":
        cx = -W / 2
        cy = -D / 2 + pos_along
        cutter_sx = t + margin * 2
        cutter_sy = width
        cutter_sz = height
    else:
        print(f"[room_builder] WARNING: 不明な壁方向 '{wall_name}'")
        return

    cz = elevation + height / 2  # カッターの中心Z座標

    # 開口部が壁の端を超えないようにクランプ
    if wall_name in ("north", "south"):
        wall_length = W
        half_w = width / 2
        local_pos = pos_along
        # 壁端からはみ出す場合は警告
        if local_pos - half_w < 0 or local_pos + half_w > wall_length:
            print(f"[room_builder] WARNING: 開口部が壁端を超えています ({wall_name}, pos={pos_along}, w={width})")
    else:
        wall_length = D
        half_w = width / 2
        local_pos = pos_along
        if local_pos - half_w < 0 or local_pos + half_w > wall_length:
            print(f"[room_builder] WARNING: 開口部が壁端を超えています ({wall_name}, pos={pos_along}, w={width})")

    # カッターメッシュをbmeshで作成
    cutter_mesh = bpy.data.meshes.new("_Cutter")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)

    # 頂点を直接スケーリング
    for v in bm.verts:
        v.co.x *= cutter_sx
        v.co.y *= cutter_sy
        v.co.z *= cutter_sz

    bm.to_mesh(cutter_mesh)
    bm.free()

    cutter = bpy.data.objects.new("_Cutter", cutter_mesh)
    bpy.context.collection.objects.link(cutter)
    cutter.location = (cx, cy, cz)

    # Boolean modifier で壁を切り抜く
    mod = wall_obj.modifiers.new(name="Opening", type='BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    mod.solver = 'FLOAT'  # Blender 5.0: FLOAT/EXACT/MANIFOLD (FASTは廃止)

    # modifier適用（コンテキスト設定が必要）
    bpy.context.view_layer.objects.active = wall_obj
    wall_obj.select_set(True)

    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
        print(f"[room_builder]   Boolean切り抜き成功: {wall_name} wall")
    except Exception as e:
        print(f"[room_builder]   WARNING: Boolean modifier適用失敗 ({e}), bmeshフォールバック使用")
        # modifier削除（適用失敗時）
        if mod.name in [m.name for m in wall_obj.modifiers]:
            wall_obj.modifiers.remove(mod)
        # フォールバック: bmeshで直接穴を開ける
        _cut_opening_bmesh_direct(wall_obj, cx, cy, cz, cutter_sx, cutter_sy, cutter_sz)

    # カッター削除
    bpy.data.objects.remove(cutter, do_unlink=True)
    bpy.data.meshes.remove(cutter_mesh)

    wall_obj.select_set(False)


def _cut_opening_bmesh_direct(wall_obj, cx, cy, cz, sx, sy, sz):
    """Booleanが失敗した場合のフォールバック: bmeshで直接頂点を削除

    壁メッシュに対して、指定範囲内の面を削除して開口部を作る。
    """
    import mathutils

    bm = bmesh.new()
    bm.from_mesh(wall_obj.data)
    bm.faces.ensure_lookup_table()

    # ワールド座標でカッター範囲を定義
    loc = wall_obj.location
    min_x = cx - sx / 2 - loc.x
    max_x = cx + sx / 2 - loc.x
    min_y = cy - sy / 2 - loc.y
    max_y = cy + sy / 2 - loc.y
    min_z = cz - sz / 2 - loc.z
    max_z = cz + sz / 2 - loc.z

    # カッター範囲内に完全に収まる面を削除
    faces_to_delete = []
    for face in bm.faces:
        center = face.calc_center_median()
        if (min_x <= center.x <= max_x and
                min_y <= center.y <= max_y and
                min_z <= center.z <= max_z):
            faces_to_delete.append(face)

    if faces_to_delete:
        bmesh.ops.delete(bm, geom=faces_to_delete, context='FACES')

    bm.to_mesh(wall_obj.data)
    bm.free()
    wall_obj.data.update()

    print(f"[room_builder]   bmeshフォールバック: {len(faces_to_delete)}面を削除")


def _make_window_glass(opening, wall_name, W, D, glass_mat, collections):
    """開口部の位置にガラス平面を配置"""
    wall = opening["wall"]
    pos_along = opening["positionAlongWall"]
    ow = opening["width"]
    oh = opening["height"]
    elev = opening.get("elevation", 0.0)
    centre_z = elev + oh / 2

    if wall in ("north", "south"):
        cx = -W / 2 + pos_along
        cy = D / 2 if wall == "north" else -D / 2
        loc = (cx, cy, centre_z)
        rot = (math.pi / 2, 0, 0)
        sx, sy = ow / 2, oh / 2
    else:
        cy = -D / 2 + pos_along
        cx = W / 2 if wall == "east" else -W / 2
        loc = (cx, cy, centre_z)
        rot = (math.pi / 2, 0, math.pi / 2)
        sx, sy = ow / 2, oh / 2

    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    glass = bpy.context.active_object
    glass.name = f"Glass_{wall.capitalize()}_{int(pos_along * 100)}"
    glass.scale = (sx * 2, sy * 2, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _apply_material(glass, glass_mat)
    link_to_collection(glass, collections["03_Openings"])


def _make_frame(opening, wall_name, W, D, t, collections, is_door=False):
    """開口部の周囲にフレーム（枠）を配置

    Args:
        is_door: Trueの場合、底辺フレームを省略（ドア用）
    """
    wall = opening["wall"]
    pos_along = opening["positionAlongWall"]
    ow = opening["width"]
    oh = opening["height"]
    elev = opening.get("elevation", 0.0)
    centre_z = elev + oh / 2
    frame_w = 0.04
    frame_d = 0.06

    if wall in ("north", "south"):
        cx = -W / 2 + pos_along
        cy = D / 2 + t if wall == "north" else -D / 2 - t
        pieces = [
            # 上枠
            (f"Frame_{wall}_top",
             (cx, cy, elev + oh + frame_w / 2),
             (ow / 2 + frame_w, frame_d / 2, frame_w / 2)),
            # 左枠
            (f"Frame_{wall}_left",
             (cx - ow / 2 - frame_w / 2, cy, centre_z),
             (frame_w / 2, frame_d / 2, oh / 2 + frame_w)),
            # 右枠
            (f"Frame_{wall}_right",
             (cx + ow / 2 + frame_w / 2, cy, centre_z),
             (frame_w / 2, frame_d / 2, oh / 2 + frame_w)),
        ]
        # ドアでなければ底辺フレームを追加
        if not is_door:
            pieces.append(
                (f"Frame_{wall}_bot",
                 (cx, cy, elev - frame_w / 2),
                 (ow / 2 + frame_w, frame_d / 2, frame_w / 2))
            )
    else:
        cy = -D / 2 + pos_along
        cx = W / 2 + t if wall == "east" else -W / 2 - t
        pieces = [
            # 上枠
            (f"Frame_{wall}_top",
             (cx, cy, elev + oh + frame_w / 2),
             (frame_d / 2, ow / 2 + frame_w, frame_w / 2)),
            # 左枠
            (f"Frame_{wall}_left",
             (cx, cy - ow / 2 - frame_w / 2, centre_z),
             (frame_d / 2, frame_w / 2, oh / 2 + frame_w)),
            # 右枠
            (f"Frame_{wall}_right",
             (cx, cy + ow / 2 + frame_w / 2, centre_z),
             (frame_d / 2, frame_w / 2, oh / 2 + frame_w)),
        ]
        # ドアでなければ底辺フレームを追加
        if not is_door:
            pieces.append(
                (f"Frame_{wall}_bot",
                 (cx, cy, elev - frame_w / 2),
                 (frame_d / 2, ow / 2 + frame_w, frame_w / 2))
            )

    frame_mat = _create_frame_material()

    for name, loc, scl in pieces:
        obj = _create_box_mesh(name, scl[0] * 2, scl[1] * 2, scl[2] * 2)
        obj.location = loc
        _apply_material(obj, frame_mat)
        link_to_collection(obj, collections["03_Openings"])


# ---------------------------------------------------------------------------
# 建築トリム（巾木・廻り縁）
# ---------------------------------------------------------------------------

def _make_trim_material(name, color_rgba, roughness=0.4):
    """巾木・廻り縁用のマテリアル（後方互換用 — 新規コードは _create_trim_pbr_material を使用）"""
    mat = make_material(name, color_rgba, roughness=roughness)
    return mat


def _build_baseboards(W, D, H, wall_color_rgba, room_col):
    """全4壁に巾木を追加

    高さ: 80mm、奥行: 12mm、壁から少しオフセット
    """
    baseboard_h = 0.08
    baseboard_d = 0.012
    # 壁より少し明るくしてコントラストを出す
    r, g, b, a = wall_color_rgba
    bb_color = (min(r * 1.15, 1.0), min(g * 1.15, 1.0), min(b * 1.15, 1.0), 1.0)
    bb_mat = _create_trim_pbr_material("M_Baseboard", bb_color, roughness_range=(0.30, 0.40))

    pieces = [
        # 北壁
        ("Baseboard_N", (0, D / 2 - baseboard_d / 2, baseboard_h / 2),
         (W, baseboard_d, baseboard_h)),
        # 南壁
        ("Baseboard_S", (0, -D / 2 + baseboard_d / 2, baseboard_h / 2),
         (W, baseboard_d, baseboard_h)),
        # 東壁
        ("Baseboard_E", (W / 2 - baseboard_d / 2, 0, baseboard_h / 2),
         (baseboard_d, D - baseboard_d * 2, baseboard_h)),
        # 西壁
        ("Baseboard_W", (-W / 2 + baseboard_d / 2, 0, baseboard_h / 2),
         (baseboard_d, D - baseboard_d * 2, baseboard_h)),
    ]

    created = []
    for name, loc, size in pieces:
        obj = _create_box_mesh(name, size[0], size[1], size[2])
        obj.location = loc
        _apply_material(obj, bb_mat)
        # プロファイル用のベベル
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = 0.003
        mod.segments = 2
        mod.limit_method = "ANGLE"
        link_to_collection(obj, room_col)
        created.append(obj)

    print(f"[room_builder] 巾木: 4本")
    return created


def _build_crown_molding(W, D, H, ceiling_color_rgba, room_col, wall_thickness=0.12):
    """壁と天井の接合部に廻り縁を追加

    プロファイル: 落ち60mm、出40mm
    """
    cm_drop = 0.06
    cm_proj = 0.04
    # 天井より少し違うトーン
    r, g, b, a = ceiling_color_rgba
    cm_color = (min(r * 1.05, 1.0), min(g * 1.05, 1.0), min(b * 1.05, 1.0), 1.0)
    # 廻り縁は小オブジェクトのため、バンプ付きPBRは視覚的アーティファクトを起こす
    # シンプルなフラットマテリアルを使用
    cm_mat = make_material("M_CrownMolding", cm_color, roughness=0.3)

    # 壁内面に配置（壁ボックス内部に埋まらないよう壁厚の半分だけ内側にオフセット）
    # 天井面(z=H)とのZファイティング防止: 1mm下げる
    wt2 = wall_thickness / 2
    z_off = 0.001
    pieces = [
        # 北壁（内面: y = D/2 - wt2）
        ("Crown_N", (0, D / 2 - wt2 - cm_proj / 2, H - cm_drop / 2 - z_off),
         (W - wall_thickness * 2, cm_proj, cm_drop)),
        # 南壁
        ("Crown_S", (0, -D / 2 + wt2 + cm_proj / 2, H - cm_drop / 2 - z_off),
         (W - wall_thickness * 2, cm_proj, cm_drop)),
        # 東壁
        ("Crown_E", (W / 2 - wt2 - cm_proj / 2, 0, H - cm_drop / 2 - z_off),
         (cm_proj, D - wall_thickness * 2, cm_drop)),
        # 西壁
        ("Crown_W", (-W / 2 + wt2 + cm_proj / 2, 0, H - cm_drop / 2 - z_off),
         (cm_proj, D - wall_thickness * 2, cm_drop)),
    ]

    created = []
    for name, loc, size in pieces:
        obj = _create_box_mesh(name, size[0], size[1], size[2])
        obj.location = loc
        _apply_material(obj, cm_mat)
        # シンプルなフラットシェーディング（小オブジェクトにベベル/スムースは不要）
        pass
        link_to_collection(obj, room_col)
        created.append(obj)

    print(f"[room_builder] 廻り縁: 4本")
    return created


# ---------------------------------------------------------------------------
# 公開API
# ---------------------------------------------------------------------------

def build_room(scene_data, collections):
    """部屋ジオメトリ（床・天井・壁）を開口部・トリム付きで構築

    Args:
        scene_data: dict with keys:
            room.width, room.depth, room.height (metres)
            room.wallThickness (default 0.12)
            openings: list of opening dicts
            style.wallColor, style.floorColor, style.ceilingColor: hex strings
            style.floorTexture: texture type string
        collections: dict from setup_collections()

    Returns:
        dict of created objects keyed by name.
    """
    print("[room_builder] 部屋ジオメトリ構築中...")

    room = scene_data.get("room", {})
    style = scene_data.get("style", {})
    openings = scene_data.get("openings", [])

    W = room.get("width", 5.0)
    D = room.get("depth", 4.0)
    H = room.get("height", 2.7)
    wall_thickness = room.get("wallThickness", 0.12)
    t = wall_thickness / 2

    room_col = collections["01_Room"]
    created = {}

    # --- マテリアル -----------------------------------------------------------
    wall_color_hex = style.get("wallColor", "#FFFFFF")
    floor_color_hex = style.get("floorColor", "#C8A882")
    ceiling_color_hex = style.get("ceilingColor", "#FAFAFA")
    floor_texture = style.get("floorTexture", "wood")

    wood_type = style.get("woodType", "oak")

    wall_color_rgba = hex_to_rgba(wall_color_hex)
    ceiling_color_rgba = hex_to_rgba(ceiling_color_hex)

    wall_mat = create_wall_material(color_hex=wall_color_hex)
    floor_mat = create_floor_material(
        texture_type=floor_texture,
        color=hex_to_rgba(floor_color_hex),
        wood_type=wood_type,
    )
    ceiling_mat = _create_ceiling_material(color_hex=ceiling_color_hex)

    # --- 床 -----------------------------------------------------------------
    print(f"[room_builder] 床: {W}m x {D}m")
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "Floor"
    floor.scale = (W, D, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _apply_material(floor, floor_mat)
    link_to_collection(floor, room_col)
    created["Floor"] = floor

    # --- 天井 ---------------------------------------------------------------
    print(f"[room_builder] 天井: z={H}")
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, H),
                                      rotation=(math.pi, 0, 0))
    ceiling = bpy.context.active_object
    ceiling.name = "Ceiling"
    ceiling.scale = (W, D, 1)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    _apply_material(ceiling, ceiling_mat)
    link_to_collection(ceiling, room_col)
    created["Ceiling"] = ceiling

    # --- 壁（厚みのあるボックスとして作成）-----------------------------------
    # Boolean切り抜きのため、壁は平面ではなくソリッドボックスで作成
    walls = {}
    wall_builds = [
        # (方向, 中心位置, X幅, Y幅, Z幅)
        ("north", (0, D / 2, H / 2),         W + wall_thickness * 2, wall_thickness, H),
        ("south", (0, -D / 2, H / 2),        W + wall_thickness * 2, wall_thickness, H),
        ("east",  (W / 2, 0, H / 2),         wall_thickness, D, H),
        ("west",  (-W / 2, 0, H / 2),        wall_thickness, D, H),
    ]

    for direction, loc, sx, sy, sz in wall_builds:
        name = f"Wall_{direction.capitalize()}"
        print(f"[room_builder] {name} ({sx:.2f} x {sy:.2f} x {sz:.2f})")

        wall_obj = _create_box_mesh(name, sx, sy, sz)
        wall_obj.location = loc
        _apply_material(wall_obj, wall_mat)
        link_to_collection(wall_obj, room_col)
        walls[direction] = wall_obj
        created[name] = wall_obj

    # --- 開口部のBoolean切り抜き --------------------------------------------
    # まず全壁を作成してから、各開口部を壁に切り抜く
    # その後でガラスとフレームを配置する
    openings_by_wall = {}
    for opening in openings:
        wall_dir = opening.get("wall", "north")
        if wall_dir not in openings_by_wall:
            openings_by_wall[wall_dir] = []
        openings_by_wall[wall_dir].append(opening)

    for wall_dir, wall_openings in openings_by_wall.items():
        wall_obj = walls.get(wall_dir)
        if wall_obj is None:
            print(f"[room_builder] WARNING: 不明な壁 '{wall_dir}', 開口部スキップ")
            continue

        print(f"[room_builder] {wall_dir}壁に{len(wall_openings)}個の開口部を切り抜き中...")
        for opening in wall_openings:
            _cut_opening_bmesh(wall_obj, opening, wall_dir, W, D, wall_thickness)

    # --- 巾木（壁ジオメトリ変更後でもOK — 別オブジェクト）--------------------
    _build_baseboards(W, D, H, wall_color_rgba, room_col)

    # --- 廻り縁 --------------------------------------------------------------
    # 廻り縁は60mm×40mmと極小のためパース画では非表示
    # （Zファイティング・ジオメトリ干渉のリスクに対してメリットが小さい）
    # _build_crown_molding(W, D, H, ceiling_color_rgba, room_col, wall_thickness)

    # --- ガラスとフレームの配置（Boolean切り抜き後）--------------------------
    glass_mat = None

    for i, opening in enumerate(openings):
        wall_dir = opening.get("wall", "north")
        o_type = opening.get("type", "door")
        is_door = (o_type == "door")

        wall_obj = walls.get(wall_dir)
        if wall_obj is None:
            print(f"[room_builder] WARNING: 不明な壁 '{wall_dir}', 開口部 {i} スキップ")
            continue

        print(f"[room_builder] 開口部 {i}: {o_type} ({wall_dir}壁)")

        # 窓の場合はガラスを配置
        if o_type == "window":
            if glass_mat is None:
                glass_mat = _make_glass()
            _make_window_glass(opening, wall_dir, W, D, glass_mat, collections)

        # フレーム配置（ドアの場合は底辺フレームなし）
        _make_frame(opening, wall_dir, W, D, t, collections, is_door=is_door)

    print(f"[room_builder] 部屋完成: {len(created)}オブジェクト, "
          f"{len(openings)}開口部, 巾木+廻り縁")
    return created
