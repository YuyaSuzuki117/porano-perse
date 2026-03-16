"""Interior Door Panel — bmesh ベースのパラメトリックドアモデル。

構成:
- ドア枠（フレーム）: 4辺の矩形フレーム
- ドアパネル: フラットパネル（微細ベベル付き）
- レバーハンドル: 両面に設置
- 全パーツ bmesh 生成（bpy.ops 不使用）

Usage:
    from blender.models.door_panel import create_door
    door = create_door("EntryDoor", width=0.78, height=2.0, open_angle=30.0)
"""

import bpy
import bmesh
import math
from mathutils import Vector, Matrix


# ---------------------------------------------------------------------------
# マテリアル
# ---------------------------------------------------------------------------

def _get_frame_material():
    """ドア枠用ダークウッドマテリアル。"""
    name = "M_DoorFrame_DarkWood"
    mat = bpy.data.materials.get(name)
    if mat:
        return mat

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # 既存ノードをクリア
    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (300, 0)
    # ダークウォールナット調
    principled.inputs["Base Color"].default_value = (0.035, 0.022, 0.015, 1.0)
    principled.inputs["Roughness"].default_value = 0.35
    try:
        principled.inputs["Specular IOR Level"].default_value = 0.4
    except KeyError:
        pass

    # 木目テクスチャ（控えめ）
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-700, 0)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-500, 0)
    mapping.inputs["Scale"].default_value = (1.0, 15.0, 1.0)

    wave = nodes.new("ShaderNodeTexWave")
    wave.location = (-300, 0)
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.inputs["Scale"].default_value = 20.0
    wave.inputs["Distortion"].default_value = 0.5
    wave.inputs["Detail"].default_value = 3.0

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-50, 0)
    ramp.color_ramp.elements[0].position = 0.2
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[0].color = (0.025, 0.016, 0.010, 1.0)
    ramp.color_ramp.elements[1].color = (0.045, 0.030, 0.020, 1.0)

    bump = nodes.new("ShaderNodeBump")
    bump.location = (150, -150)
    bump.inputs["Strength"].default_value = 0.02

    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    links.new(wave.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(wave.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return mat


def _get_panel_material():
    """ドアパネル用ライトウッドマテリアル。"""
    name = "M_DoorPanel_LightWood"
    mat = bpy.data.materials.get(name)
    if mat:
        return mat

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (300, 0)
    # ナチュラルオーク調
    principled.inputs["Base Color"].default_value = (0.12, 0.08, 0.05, 1.0)
    principled.inputs["Roughness"].default_value = 0.42
    try:
        principled.inputs["Specular IOR Level"].default_value = 0.35
    except KeyError:
        pass

    # 木目
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-700, 0)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-500, 0)
    mapping.inputs["Scale"].default_value = (1.0, 10.0, 1.0)

    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-300, 80)
    noise.inputs["Scale"].default_value = 5.0
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.5

    wave = nodes.new("ShaderNodeTexWave")
    wave.location = (-300, -80)
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.inputs["Scale"].default_value = 14.0
    wave.inputs["Distortion"].default_value = 0.6
    wave.inputs["Detail"].default_value = 2.0

    mix = nodes.new("ShaderNodeMixRGB")
    mix.location = (-100, 0)
    mix.blend_type = "MULTIPLY"
    mix.inputs["Fac"].default_value = 0.4

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (80, 0)
    ramp.color_ramp.elements[0].position = 0.15
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[0].color = (0.08, 0.055, 0.035, 1.0)
    ramp.color_ramp.elements[1].color = (0.15, 0.10, 0.065, 1.0)

    bump = nodes.new("ShaderNodeBump")
    bump.location = (150, -180)
    bump.inputs["Strength"].default_value = 0.025

    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    links.new(noise.outputs["Color"], mix.inputs["Color1"])
    links.new(wave.outputs["Color"], mix.inputs["Color2"])
    links.new(mix.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(mix.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return mat


def _get_handle_material():
    """ハンドル用ブラッシュドメタルマテリアル。"""
    name = "M_DoorHandle_BrushedMetal"
    mat = bpy.data.materials.get(name)
    if mat:
        return mat

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (300, 0)
    # ステンレスブラッシュド
    principled.inputs["Base Color"].default_value = (0.55, 0.56, 0.58, 1.0)
    principled.inputs["Metallic"].default_value = 1.0
    principled.inputs["Roughness"].default_value = 0.25
    try:
        principled.inputs["Specular IOR Level"].default_value = 0.5
    except KeyError:
        pass

    # ブラッシュド方向性ノイズ（Roughnessに適用）
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-600, 0)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-400, 0)
    mapping.inputs["Scale"].default_value = (1.0, 50.0, 1.0)

    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-200, 0)
    noise.inputs["Scale"].default_value = 80.0
    noise.inputs["Detail"].default_value = 3.0

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (0, 0)
    ramp.color_ramp.elements[0].position = 0.4
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[0].color = (0.20, 0.20, 0.20, 1.0)
    ramp.color_ramp.elements[1].color = (0.30, 0.30, 0.30, 1.0)

    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Roughness"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return mat


# ---------------------------------------------------------------------------
# ジオメトリヘルパー
# ---------------------------------------------------------------------------

def _assign_material(obj, material):
    """オブジェクトにマテリアルを割り当て。"""
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)


def _create_box_bmesh(name, size_x, size_y, size_z, offset=(0, 0, 0)):
    """bmesh で直方体を生成。

    Args:
        name: メッシュ名
        size_x, size_y, size_z: 各軸のサイズ
        offset: 中心オフセット (x, y, z)

    Returns:
        bpy.types.Object
    """
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)

    # スケール適用
    scale_mat = Matrix.Diagonal(Vector((size_x, size_y, size_z, 1.0)))
    bmesh.ops.transform(bm, matrix=scale_mat, verts=bm.verts)

    # オフセット適用
    if offset != (0, 0, 0):
        translate_mat = Matrix.Translation(Vector(offset))
        bmesh.ops.transform(bm, matrix=translate_mat, verts=bm.verts)

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def _create_cylinder_bmesh(name, radius, depth, segments=24, offset=(0, 0, 0)):
    """bmesh で円柱を生成。

    Args:
        name: メッシュ名
        radius: 半径
        depth: 高さ（Z軸方向）
        segments: 円周分割数
        offset: 中心オフセット

    Returns:
        bpy.types.Object
    """
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    # 上面と下面の円を作成
    top_verts = []
    bottom_verts = []
    half_d = depth / 2.0

    for i in range(segments):
        angle = math.tau * i / segments
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        top_verts.append(bm.verts.new((x, y, half_d)))
        bottom_verts.append(bm.verts.new((x, y, -half_d)))

    bm.verts.ensure_lookup_table()

    # 側面
    for i in range(segments):
        ni = (i + 1) % segments
        bm.faces.new([top_verts[i], top_verts[ni],
                       bottom_verts[ni], bottom_verts[i]])

    # 上面・下面
    bm.faces.new(top_verts)
    bm.faces.new(list(reversed(bottom_verts)))

    # オフセット
    if offset != (0, 0, 0):
        translate_mat = Matrix.Translation(Vector(offset))
        bmesh.ops.transform(bm, matrix=translate_mat, verts=bm.verts)

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------------------
# レバーハンドル
# ---------------------------------------------------------------------------

def _create_lever_handle(name, side_sign, parent, material):
    """レバーハンドル（片側）を生成。

    Args:
        name: オブジェクト名
        side_sign: +1.0 (表側) or -1.0 (裏側) — Y軸方向のオフセット
        parent: 親オブジェクト
        material: ハンドルマテリアル
    """
    # ハンドル寸法
    plate_w = 0.035  # 座金幅
    plate_h = 0.14   # 座金高さ
    plate_d = 0.008  # 座金厚さ
    lever_len = 0.11  # レバー長さ
    lever_r = 0.008   # レバー断面半径
    lever_rise = 0.005  # レバー先端の下がり

    handle_y = side_sign * 0.025  # パネル表面からのオフセット
    handle_z = 1.0   # ハンドル高さ（床から）

    # 座金（エスカッション）
    escutcheon = _create_box_bmesh(
        f"{name}_Escutcheon",
        plate_w, plate_d, plate_h,
        offset=(0, handle_y, handle_z)
    )
    _assign_material(escutcheon, material)
    escutcheon.parent = parent

    # レバー（水平棒）
    lever = _create_cylinder_bmesh(
        f"{name}_Lever",
        radius=lever_r,
        depth=lever_len,
        segments=12,
        offset=(0, 0, 0)
    )
    # レバーを横向き（X軸方向）に配置
    lever.rotation_euler = (0, math.radians(90), 0)
    lever.location = (lever_len / 2.0, handle_y + side_sign * plate_d, handle_z)
    _assign_material(lever, material)
    lever.parent = parent

    # レバー先端のカーブダウン部分（小さな球）
    tip = _create_cylinder_bmesh(
        f"{name}_LeverTip",
        radius=lever_r * 1.2,
        depth=lever_r * 2.0,
        segments=12,
        offset=(lever_len, handle_y + side_sign * plate_d, handle_z - lever_rise)
    )
    _assign_material(tip, material)
    tip.parent = parent

    return escutcheon


# ---------------------------------------------------------------------------
# メインエントリポイント
# ---------------------------------------------------------------------------

def create_door(name="Door", width=0.78, height=2.0,
                frame_width=0.06, frame_depth=0.12,
                open_angle=0.0, location=(0, 0, 0)):
    """パラメトリックなインテリアドアを生成。

    ドアは XZ 平面に配置（Y=0 が壁の中心線）。
    幅方向 = X, 高さ方向 = Z。

    Args:
        name: ドア名
        width: 開口幅 (m)
        height: 開口高さ (m)
        frame_width: 枠の見込み幅 (m)
        frame_depth: 枠の奥行き（壁厚に合わせる） (m)
        open_angle: ドアの開き角度 (度)。0 = 閉じた状態
        location: 配置座標 (x, y, z) — ドア中心下端

    Returns:
        bpy.types.Object — ルート Empty（全パーツの親）
    """
    print(f"[door_panel] Creating door: {name} ({width:.2f}m x {height:.2f}m)")

    # マテリアル取得
    frame_mat = _get_frame_material()
    panel_mat = _get_panel_material()
    handle_mat = _get_handle_material()

    # ルート Empty
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = location
    root.empty_display_size = 0.2

    # --- ドア枠（4辺） ---
    panel_thickness = 0.035  # ドアパネル厚さ

    # 左枠
    left_frame = _create_box_bmesh(
        f"{name}_Frame_L",
        frame_width, frame_depth, height,
        offset=(-width / 2.0 - frame_width / 2.0, 0, height / 2.0)
    )
    _assign_material(left_frame, frame_mat)
    left_frame.parent = root

    # 右枠
    right_frame = _create_box_bmesh(
        f"{name}_Frame_R",
        frame_width, frame_depth, height,
        offset=(width / 2.0 + frame_width / 2.0, 0, height / 2.0)
    )
    _assign_material(right_frame, frame_mat)
    right_frame.parent = root

    # 上枠（鴨居）
    top_frame = _create_box_bmesh(
        f"{name}_Frame_T",
        width + frame_width * 2, frame_depth, frame_width,
        offset=(0, 0, height + frame_width / 2.0)
    )
    _assign_material(top_frame, frame_mat)
    top_frame.parent = root

    # 下枠（敷居）— 薄め
    sill_height = 0.015
    sill = _create_box_bmesh(
        f"{name}_Frame_B",
        width + frame_width * 2, frame_depth, sill_height,
        offset=(0, 0, sill_height / 2.0)
    )
    _assign_material(sill, frame_mat)
    sill.parent = root

    # --- ドアパネル ---
    # パネルはヒンジ側（左端）を基点に回転するため、
    # ピボットを左端に配置
    panel_inset = 0.005  # 枠内側からの隙間
    actual_panel_w = width - panel_inset * 2
    actual_panel_h = height - sill_height - panel_inset

    # パネル用 Empty（回転ピボット = ヒンジ位置）
    hinge = bpy.data.objects.new(f"{name}_Hinge", None)
    bpy.context.collection.objects.link(hinge)
    hinge.location = (-width / 2.0 + panel_inset, 0, 0)
    hinge.parent = root

    # パネル本体（ヒンジからのローカル座標）
    panel = _create_box_bmesh(
        f"{name}_Panel",
        actual_panel_w, panel_thickness, actual_panel_h,
        offset=(actual_panel_w / 2.0, 0,
                sill_height + actual_panel_h / 2.0)
    )
    _assign_material(panel, panel_mat)
    panel.parent = hinge

    # ドアの開き角度を適用（Z軸回転）
    if open_angle != 0.0:
        hinge.rotation_euler = (0, 0, math.radians(open_angle))

    # --- レバーハンドル（両面） ---
    # ハンドルはパネルの子（パネルと一緒に回転）
    # ハンドル位置: パネルの右寄り、高さ1.0m
    handle_x_offset = actual_panel_w * 0.8  # ヒンジから80%位置

    handle_parent = bpy.data.objects.new(f"{name}_HandleMount", None)
    bpy.context.collection.objects.link(handle_parent)
    handle_parent.location = (handle_x_offset, 0, 0)
    handle_parent.parent = hinge

    # 表面ハンドル
    _create_lever_handle(f"{name}_Handle_Front", +1.0, handle_parent, handle_mat)
    # 裏面ハンドル
    _create_lever_handle(f"{name}_Handle_Back", -1.0, handle_parent, handle_mat)

    print(f"[door_panel] Door '{name}' created with {open_angle:.0f}° opening")
    return root
