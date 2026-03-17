"""
gen-architectural-doors.py - 建築建具GLBモデル生成スクリプト

内装仕上げパース用のドア・窓・ショップフロント等をLow-Polyで生成。
bmesh使用、bpy.ops.mesh禁止。Blender 5.0 --background モードで実行。

出力先: C:/Users/y-suz/porano-perse/public/models/
形式: GLB (glTF Binary)
"""

import bpy
import bmesh
import os
import math

OUTPUT_DIR = r"C:\Users\y-suz\porano-perse\public\models"


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def clear_scene():
    """全オブジェクト・データを完全に削除してクリーンなシーンにする。"""
    # Remove all objects from the scene
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    # Purge all orphan data blocks
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    for cam in list(bpy.data.cameras):
        bpy.data.cameras.remove(cam)
    for light in list(bpy.data.lights):
        bpy.data.lights.remove(light)

    # Remove child collections but keep the scene's master collection
    scene_col = bpy.context.scene.collection
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)


def make_material(name, base_color, roughness=0.5, metallic=0.0,
                  transmission=0.0, alpha=1.0, ior=1.45):
    """Principled BSDFマテリアルを作成して返す。"""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic

    if transmission > 0:
        bsdf.inputs["Transmission Weight"].default_value = transmission
        bsdf.inputs["IOR"].default_value = ior
        mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else None
        if alpha < 1.0:
            bsdf.inputs["Alpha"].default_value = alpha

    return mat


def create_box(name, sx, sy, sz, material=None):
    """bmeshで直方体を作成。原点はボトムセンター(底面中央)。"""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)

    # Scale to desired dimensions
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
        v.co.z += sz / 2  # Move up so bottom is at z=0

    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def create_cylinder(name, radius, height, segments=12, material=None):
    """bmeshで円柱を作成。原点はボトムセンター。"""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    # Create top and bottom circles
    top_verts = []
    bot_verts = []
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        bot_verts.append(bm.verts.new((x, y, 0)))
        top_verts.append(bm.verts.new((x, y, height)))

    # Bottom face
    bm.faces.new(bot_verts[::-1])
    # Top face
    bm.faces.new(top_verts)
    # Side faces
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new([bot_verts[i], bot_verts[j], top_verts[j], top_verts[i]])

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def create_u_frame(name, outer_w, outer_h, frame_w, frame_d, material=None):
    """U字型フレーム（左柱 + 右柱 + 上梁）をbmeshで作成。原点はボトムセンター。"""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    half_w = outer_w / 2

    # Left vertical: from bottom to top
    _add_box_to_bmesh(bm, -half_w + frame_w / 2, 0, outer_h / 2,
                      frame_w, frame_d, outer_h)
    # Right vertical
    _add_box_to_bmesh(bm, half_w - frame_w / 2, 0, outer_h / 2,
                      frame_w, frame_d, outer_h)
    # Top horizontal (between the two verticals, at the top)
    top_inner_w = outer_w - 2 * frame_w
    _add_box_to_bmesh(bm, 0, 0, outer_h - frame_w / 2,
                      top_inner_w, frame_d, frame_w)

    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def _add_box_to_bmesh(bm, cx, cy, cz, sx, sy, sz):
    """bmeshにボックスを追加（中心座標指定）。"""
    verts = []
    for dx in (-sx/2, sx/2):
        for dy in (-sy/2, sy/2):
            for dz in (-sz/2, sz/2):
                verts.append(bm.verts.new((cx+dx, cy+dy, cz+dz)))

    # 6 faces of the box (using consistent winding)
    faces = [
        (0, 1, 3, 2),  # -x face
        (4, 6, 7, 5),  # +x face
        (0, 4, 5, 1),  # -y face
        (2, 3, 7, 6),  # +y face
        (0, 2, 6, 4),  # -z face
        (1, 5, 7, 3),  # +z face
    ]
    for f in faces:
        bm.faces.new([verts[i] for i in f])


def export_glb(filepath):
    """シーン全体をGLBエクスポートし、ファイルサイズを表示。"""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
    )
    size_kb = os.path.getsize(filepath) / 1024
    print(f"  -> Exported: {os.path.basename(filepath)} ({size_kb:.1f} KB)")


# ---------------------------------------------------------------------------
# Material presets
# ---------------------------------------------------------------------------

def mat_wood(name="Wood"):
    """暖かみのある木目マテリアル。"""
    return make_material(name, base_color=(0.45, 0.30, 0.18), roughness=0.6)


def mat_wood_light(name="Wood_Light"):
    """やや明るい木目マテリアル（枠用）。"""
    return make_material(name, base_color=(0.55, 0.40, 0.25), roughness=0.55)


def mat_metal_dark(name="Metal_Dark"):
    """ダークグレーメタリック。"""
    return make_material(name, base_color=(0.15, 0.15, 0.17), roughness=0.3, metallic=0.9)


def mat_glass(name="Glass"):
    """半透明ガラス（青みがかった透明）。"""
    return make_material(name, base_color=(0.85, 0.90, 0.95),
                         roughness=0.05, transmission=0.9, alpha=0.3)


def mat_aluminum(name="Aluminum"):
    """アルミニウム（シルバーメタリック）。"""
    return make_material(name, base_color=(0.7, 0.7, 0.72),
                         roughness=0.25, metallic=0.95)


def mat_white_frame(name="White_Frame"):
    """白/ライトグレーのフレーム。"""
    return make_material(name, base_color=(0.85, 0.85, 0.83), roughness=0.4)


# ===========================================================================
# Model generators
# ===========================================================================

def gen_flush_door():
    """1. フラッシュドア (W0.8m × H2.1m × D0.04m)"""
    clear_scene()
    print("Generating: flush_door.glb")

    wood = mat_wood("FlushDoor_Wood")
    metal = mat_metal_dark("FlushDoor_Metal")

    # Door panel - origin at bottom center
    panel = create_box("FlushDoor_Panel", 0.8, 0.04, 2.1, wood)

    # Door handle - right side, at ~1.0m height
    # Handle base plate (small rectangle)
    base_plate = create_box("FlushDoor_HandleBase", 0.03, 0.015, 0.12, metal)
    base_plate.location = (0.32, 0.02 + 0.0075, 1.0)

    # Handle lever (cylinder, horizontal)
    lever = create_cylinder("FlushDoor_HandleLever", 0.008, 0.1, 8, metal)
    lever.location = (0.32, 0.02 + 0.015, 1.0)
    lever.rotation_euler = (math.pi / 2, 0, 0)  # Point outward

    # Handle on back side
    base_plate_back = create_box("FlushDoor_HandleBase_Back", 0.03, 0.015, 0.12, metal)
    base_plate_back.location = (0.32, -0.02 - 0.0075, 1.0)

    lever_back = create_cylinder("FlushDoor_HandleLever_Back", 0.008, 0.1, 8, metal)
    lever_back.location = (0.32, -0.02 - 0.015, 1.0)
    lever_back.rotation_euler = (-math.pi / 2, 0, 0)

    export_glb(os.path.join(OUTPUT_DIR, "flush_door.glb"))


def gen_glass_door():
    """2. ガラスドア (W0.9m × H2.2m)"""
    clear_scene()
    print("Generating: glass_door.glb")

    metal = mat_metal_dark("GlassDoor_Frame")
    glass = mat_glass("GlassDoor_Glass")

    frame_w = 0.04  # Frame profile width
    frame_d = 0.05  # Frame depth
    door_w = 0.9
    door_h = 2.2

    # Frame - four sides
    half_w = door_w / 2

    # Left frame
    create_box("GlassDoor_FrameLeft", frame_w, frame_d, door_h, metal).location = (
        -half_w + frame_w / 2, 0, 0)
    # Right frame
    create_box("GlassDoor_FrameRight", frame_w, frame_d, door_h, metal).location = (
        half_w - frame_w / 2, 0, 0)
    # Top frame
    create_box("GlassDoor_FrameTop", door_w - 2 * frame_w, frame_d, frame_w, metal).location = (
        0, 0, door_h - frame_w)
    # Bottom frame
    create_box("GlassDoor_FrameBottom", door_w - 2 * frame_w, frame_d, frame_w, metal).location = (
        0, 0, 0)

    # Glass pane
    glass_w = door_w - 2 * frame_w
    glass_h = door_h - 2 * frame_w
    glass_pane = create_box("GlassDoor_Glass", glass_w, 0.006, glass_h, glass)
    glass_pane.location = (0, 0, frame_w)

    # Push bar handle (horizontal bar across the door at ~1.0m)
    handle_bar = create_box("GlassDoor_PushBar", 0.5, 0.025, 0.025, metal)
    handle_bar.location = (0, frame_d / 2 + 0.015, 1.0)

    # Push bar brackets (two small blocks)
    for x_off in (-0.2, 0.2):
        bracket = create_box("GlassDoor_Bracket", 0.03, 0.03, 0.03, metal)
        bracket.location = (x_off, frame_d / 2 + 0.005, 1.0)

    export_glb(os.path.join(OUTPUT_DIR, "glass_door.glb"))


def gen_sliding_door():
    """3. 引戸 (W0.9m × H2.1m)"""
    clear_scene()
    print("Generating: sliding_door.glb")

    wood = mat_wood("SlidingDoor_Wood")
    metal = mat_metal_dark("SlidingDoor_Metal")

    door_w = 0.9
    door_h = 2.1
    door_d = 0.035

    # Door panel
    panel = create_box("SlidingDoor_Panel", door_w, door_d, door_h, wood)

    # Recessed grip handle - a shallow groove on the edge of the door
    # Grip cutout visual: a thin inset rectangle on the right edge
    grip_w = 0.015
    grip_h = 0.12
    grip_d = 0.01
    grip = create_box("SlidingDoor_Grip", grip_w, grip_d, grip_h, metal)
    grip.location = (door_w / 2 - 0.04, door_d / 2 + grip_d / 2, 1.0)

    # Back grip
    grip_back = create_box("SlidingDoor_Grip_Back", grip_w, grip_d, grip_h, metal)
    grip_back.location = (door_w / 2 - 0.04, -door_d / 2 - grip_d / 2, 1.0)

    # Top rail
    rail_h = 0.03
    rail_d = 0.05
    rail = create_box("SlidingDoor_Rail", door_w + 0.1, rail_d, rail_h, metal)
    rail.location = (0, 0, door_h + rail_h / 2 + 0.005)

    export_glb(os.path.join(OUTPUT_DIR, "sliding_door.glb"))


def gen_double_sliding_door():
    """4. 引違い戸 (W1.8m × H2.1m)"""
    clear_scene()
    print("Generating: double_sliding_door.glb")

    wood = mat_wood("DoubleSlidingDoor_Wood")
    metal = mat_metal_dark("DoubleSlidingDoor_Metal")

    panel_w = 0.9
    door_h = 2.1
    door_d = 0.035

    # Left panel (slightly offset in Y for overlap area)
    left_panel = create_box("DoubleSlidingDoor_PanelLeft", panel_w, door_d, door_h, wood)
    left_panel.location = (-panel_w / 2, 0.005, 0)

    # Right panel
    right_panel = create_box("DoubleSlidingDoor_PanelRight", panel_w, door_d, door_h, wood)
    right_panel.location = (panel_w / 2, -0.005, 0)

    # Grip handles on each panel (near center meeting point)
    grip_w = 0.015
    grip_h = 0.12
    grip_d = 0.01

    # Left panel grip (right edge)
    grip_l = create_box("DoubleSlidingDoor_GripLeft", grip_w, grip_d, grip_h, metal)
    grip_l.location = (-0.04, 0.005 + door_d / 2 + grip_d / 2, 1.0)

    # Right panel grip (left edge)
    grip_r = create_box("DoubleSlidingDoor_GripRight", grip_w, grip_d, grip_h, metal)
    grip_r.location = (0.04, -0.005 - door_d / 2 - grip_d / 2, 1.0)

    # Top rail (spans full width + extra)
    rail_w = 1.8 + 0.1
    rail_h = 0.03
    rail_d = 0.06
    rail = create_box("DoubleSlidingDoor_Rail", rail_w, rail_d, rail_h, metal)
    rail.location = (0, 0, door_h + rail_h / 2 + 0.005)

    export_glb(os.path.join(OUTPUT_DIR, "double_sliding_door.glb"))


def gen_door_frame():
    """5. ドア枠 (W0.85m × H2.15m × D0.12m)"""
    clear_scene()
    print("Generating: door_frame.glb")

    wood_light = mat_wood_light("DoorFrame_Wood")

    frame_w = 0.85
    frame_h = 2.15
    profile_w = 0.06  # Frame profile width
    profile_d = 0.12  # Frame depth

    # U-shaped frame
    frame = create_u_frame("DoorFrame_Frame", frame_w, frame_h,
                           profile_w, profile_d, wood_light)

    # Inner chamfer strips (thin decorative edge on inner side)
    chamfer_w = 0.008
    chamfer_d = profile_d
    inner_half = (frame_w - 2 * profile_w) / 2

    # Left inner chamfer
    chamfer_l = create_box("DoorFrame_ChamferLeft", chamfer_w, chamfer_d,
                           frame_h - profile_w, wood_light)
    chamfer_l.location = (-inner_half - chamfer_w / 2, 0, 0)

    # Right inner chamfer
    chamfer_r = create_box("DoorFrame_ChamferRight", chamfer_w, chamfer_d,
                           frame_h - profile_w, wood_light)
    chamfer_r.location = (inner_half + chamfer_w / 2, 0, 0)

    # Top inner chamfer
    chamfer_t = create_box("DoorFrame_ChamferTop", frame_w - 2 * profile_w,
                           chamfer_d, chamfer_w, wood_light)
    chamfer_t.location = (0, 0, frame_h - profile_w - chamfer_w)

    export_glb(os.path.join(OUTPUT_DIR, "door_frame.glb"))


def gen_window_single():
    """6. 単窓 (W0.9m × H1.2m)"""
    clear_scene()
    print("Generating: window_single.glb")

    frame_mat = mat_white_frame("Window_Frame")
    glass = mat_glass("Window_Glass")

    win_w = 0.9
    win_h = 1.2
    frame_profile = 0.05  # 5cm wide profile
    frame_d = 0.07

    # Frame (U-shape + bottom)
    # Left
    create_box("WindowSingle_FrameLeft", frame_profile, frame_d, win_h, frame_mat).location = (
        -win_w / 2 + frame_profile / 2, 0, 0)
    # Right
    create_box("WindowSingle_FrameRight", frame_profile, frame_d, win_h, frame_mat).location = (
        win_w / 2 - frame_profile / 2, 0, 0)
    # Top
    create_box("WindowSingle_FrameTop", win_w - 2 * frame_profile, frame_d,
               frame_profile, frame_mat).location = (0, 0, win_h - frame_profile)
    # Bottom
    create_box("WindowSingle_FrameBottom", win_w - 2 * frame_profile, frame_d,
               frame_profile, frame_mat).location = (0, 0, 0)

    # Glass pane
    glass_w = win_w - 2 * frame_profile
    glass_h = win_h - 2 * frame_profile
    glass_pane = create_box("WindowSingle_Glass", glass_w, 0.005, glass_h, glass)
    glass_pane.location = (0, 0, frame_profile)

    # Window sill (ledge at bottom, 5cm deep)
    sill_depth = 0.05
    sill_h = 0.02
    sill = create_box("WindowSingle_Sill", win_w + 0.04, sill_depth + frame_d / 2,
                       sill_h, frame_mat)
    sill.location = (0, -frame_d / 2 + (sill_depth + frame_d / 2) / 2 - sill_depth, -sill_h)

    export_glb(os.path.join(OUTPUT_DIR, "window_single.glb"))


def gen_window_fix():
    """7. FIX窓 (W1.2m × H0.6m) — 欄間等用"""
    clear_scene()
    print("Generating: window_fix.glb")

    frame_mat = mat_white_frame("WindowFix_Frame")
    glass = mat_glass("WindowFix_Glass")

    win_w = 1.2
    win_h = 0.6
    frame_profile = 0.04
    frame_d = 0.06

    # Frame - all four sides
    # Left
    create_box("WindowFix_FrameLeft", frame_profile, frame_d, win_h, frame_mat).location = (
        -win_w / 2 + frame_profile / 2, 0, 0)
    # Right
    create_box("WindowFix_FrameRight", frame_profile, frame_d, win_h, frame_mat).location = (
        win_w / 2 - frame_profile / 2, 0, 0)
    # Top
    create_box("WindowFix_FrameTop", win_w - 2 * frame_profile, frame_d,
               frame_profile, frame_mat).location = (0, 0, win_h - frame_profile)
    # Bottom
    create_box("WindowFix_FrameBottom", win_w - 2 * frame_profile, frame_d,
               frame_profile, frame_mat).location = (0, 0, 0)

    # Glass pane
    glass_w = win_w - 2 * frame_profile
    glass_h = win_h - 2 * frame_profile
    glass_pane = create_box("WindowFix_Glass", glass_w, 0.005, glass_h, glass)
    glass_pane.location = (0, 0, frame_profile)

    export_glb(os.path.join(OUTPUT_DIR, "window_fix.glb"))


def gen_window_double():
    """8. 引違い窓 (W1.8m × H1.2m)"""
    clear_scene()
    print("Generating: window_double.glb")

    frame_mat = mat_white_frame("WindowDouble_Frame")
    glass = mat_glass("WindowDouble_Glass")

    win_w = 1.8
    win_h = 1.2
    frame_profile = 0.05
    frame_d = 0.07
    mullion_w = 0.04  # Center mullion width

    # Outer frame
    # Left
    create_box("WindowDouble_FrameLeft", frame_profile, frame_d, win_h, frame_mat).location = (
        -win_w / 2 + frame_profile / 2, 0, 0)
    # Right
    create_box("WindowDouble_FrameRight", frame_profile, frame_d, win_h, frame_mat).location = (
        win_w / 2 - frame_profile / 2, 0, 0)
    # Top
    create_box("WindowDouble_FrameTop", win_w - 2 * frame_profile, frame_d,
               frame_profile, frame_mat).location = (0, 0, win_h - frame_profile)
    # Bottom
    create_box("WindowDouble_FrameBottom", win_w - 2 * frame_profile, frame_d,
               frame_profile, frame_mat).location = (0, 0, 0)

    # Center mullion
    mullion = create_box("WindowDouble_Mullion", mullion_w, frame_d,
                         win_h - 2 * frame_profile, frame_mat)
    mullion.location = (0, 0, frame_profile)

    # Left glass pane
    pane_w = (win_w - 2 * frame_profile - mullion_w) / 2
    glass_h = win_h - 2 * frame_profile
    glass_left = create_box("WindowDouble_GlassLeft", pane_w, 0.005, glass_h, glass)
    glass_left.location = (-(pane_w + mullion_w) / 2, 0, frame_profile)

    # Right glass pane
    glass_right = create_box("WindowDouble_GlassRight", pane_w, 0.005, glass_h, glass)
    glass_right.location = ((pane_w + mullion_w) / 2, 0, frame_profile)

    # Window sill
    sill_depth = 0.05
    sill_h = 0.02
    sill = create_box("WindowDouble_Sill", win_w + 0.04, sill_depth + frame_d / 2,
                       sill_h, frame_mat)
    sill.location = (0, -frame_d / 2 + (sill_depth + frame_d / 2) / 2 - sill_depth, -sill_h)

    export_glb(os.path.join(OUTPUT_DIR, "window_double.glb"))


def gen_shopfront_glass():
    """9. ショップフロント ガラス壁 (W3.0m × H2.5m)"""
    clear_scene()
    print("Generating: shopfront_glass.glb")

    alu = mat_aluminum("Shopfront_Aluminum")
    glass = mat_glass("Shopfront_Glass")

    wall_w = 3.0
    wall_h = 2.5
    frame_profile = 0.03  # 3cm narrow profile
    frame_d = 0.06
    mullion_w = 0.03

    # Outer frame
    # Left
    create_box("Shopfront_FrameLeft", frame_profile, frame_d, wall_h, alu).location = (
        -wall_w / 2 + frame_profile / 2, 0, 0)
    # Right
    create_box("Shopfront_FrameRight", frame_profile, frame_d, wall_h, alu).location = (
        wall_w / 2 - frame_profile / 2, 0, 0)
    # Top
    create_box("Shopfront_FrameTop", wall_w - 2 * frame_profile, frame_d,
               frame_profile, alu).location = (0, 0, wall_h - frame_profile)
    # Bottom
    create_box("Shopfront_FrameBottom", wall_w - 2 * frame_profile, frame_d,
               frame_profile, alu).location = (0, 0, 0)

    # Center mullion (divides into 2 panes)
    mullion = create_box("Shopfront_Mullion", mullion_w, frame_d,
                         wall_h - 2 * frame_profile, alu)
    mullion.location = (0, 0, frame_profile)

    # Left glass pane
    pane_w = (wall_w - 2 * frame_profile - mullion_w) / 2
    glass_h = wall_h - 2 * frame_profile
    glass_left = create_box("Shopfront_GlassLeft", pane_w, 0.006, glass_h, glass)
    glass_left.location = (-(pane_w + mullion_w) / 2, 0, frame_profile)

    # Right glass pane
    glass_right = create_box("Shopfront_GlassRight", pane_w, 0.006, glass_h, glass)
    glass_right.location = ((pane_w + mullion_w) / 2, 0, frame_profile)

    # Horizontal transom bar at ~2.2m (common in shopfronts)
    transom = create_box("Shopfront_Transom", wall_w - 2 * frame_profile, frame_d,
                         mullion_w, alu)
    transom.location = (0, 0, 2.2)

    export_glb(os.path.join(OUTPUT_DIR, "shopfront_glass.glb"))


# ===========================================================================
# Main
# ===========================================================================

def main():
    print("=" * 60)
    print("gen-architectural-doors.py - 建具GLBモデル生成")
    print(f"出力先: {OUTPUT_DIR}")
    print("=" * 60)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    generators = [
        gen_flush_door,
        gen_glass_door,
        gen_sliding_door,
        gen_double_sliding_door,
        gen_door_frame,
        gen_window_single,
        gen_window_fix,
        gen_window_double,
        gen_shopfront_glass,
    ]

    for gen_func in generators:
        try:
            gen_func()
        except Exception as e:
            print(f"  !! ERROR in {gen_func.__name__}: {e}")
            import traceback
            traceback.print_exc()

    print()
    print("=" * 60)
    print("完了 - 生成されたファイル一覧:")
    print("=" * 60)

    expected_files = [
        "flush_door.glb",
        "glass_door.glb",
        "sliding_door.glb",
        "double_sliding_door.glb",
        "door_frame.glb",
        "window_single.glb",
        "window_fix.glb",
        "window_double.glb",
        "shopfront_glass.glb",
    ]

    total_size = 0
    for fname in expected_files:
        fpath = os.path.join(OUTPUT_DIR, fname)
        if os.path.exists(fpath):
            size = os.path.getsize(fpath)
            total_size += size
            print(f"  OK  {fname:30s} {size/1024:.1f} KB")
        else:
            print(f"  NG  {fname:30s} (not found)")

    print(f"\n合計: {total_size/1024:.1f} KB ({len(expected_files)} files)")


if __name__ == "__main__":
    main()
