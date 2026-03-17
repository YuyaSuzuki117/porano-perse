"""
fix-furniture1.py — Regenerate 3 broken furniture GLB models
  chair.glb, table_square.glb, sofa.glb
Uses bmesh for all geometry. Blender 5.0 compatible (JP locale safe).
"""

import bpy
import bmesh
import math
import os
from mathutils import Matrix, Vector

OUTPUT_DIR = r"C:\Users\y-suz\porano-perse\public\models"


# ─────────────────────────────────────────────────────────────
# Utility helpers
# ─────────────────────────────────────────────────────────────

def clear_scene():
    """Remove all objects, meshes, materials from the scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def new_material(name, color_rgb, roughness=0.5, metallic=0.0):
    """Create a Principled BSDF material by node.type (locale-safe)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    # Find Principled BSDF by type, not by name
    bsdf = None
    for node in tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            bsdf = node
            break
    if bsdf is None:
        bsdf = tree.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (*color_rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat


def make_mesh_object(name, material):
    """Create a new mesh + object, link to scene collection, assign material."""
    mesh = bpy.data.meshes.new(name + "_mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def bmesh_box(bm, sx, sy, sz, offset=(0, 0, 0)):
    """Create an axis-aligned box in bmesh centred at offset, size sx×sy×sz."""
    mat = Matrix.Translation(Vector(offset))
    bmesh.ops.create_cube(bm, size=1.0, matrix=mat)
    # Scale verts — cube is ±0.5
    for v in bm.verts:
        v.co.x = offset[0] + (v.co.x - offset[0]) * sx
        v.co.y = offset[1] + (v.co.y - offset[1]) * sy
        v.co.z = offset[2] + (v.co.z - offset[2]) * sz


def bmesh_box_absolute(bm, sx, sy, sz, cx, cy, cz):
    """Create a box: centre (cx,cy,cz), full size sx,sy,sz. Fresh bmesh verts only."""
    verts = []
    for dx in (-0.5, 0.5):
        for dy in (-0.5, 0.5):
            for dz in (-0.5, 0.5):
                v = bm.verts.new((cx + dx * sx, cy + dy * sy, cz + dz * sz))
                verts.append(v)
    # 8 verts → 6 faces
    # vertex order: 0(-,-,-) 1(-,-,+) 2(-,+,-) 3(-,+,+) 4(+,-,-) 5(+,-,+) 6(+,+,-) 7(+,+,+)
    faces = [
        (0, 1, 3, 2),  # -X
        (4, 6, 7, 5),  # +X
        (0, 4, 5, 1),  # -Y
        (2, 3, 7, 6),  # +Y
        (0, 2, 6, 4),  # -Z
        (1, 5, 7, 3),  # +Z
    ]
    for f in faces:
        bm.faces.new([verts[i] for i in f])


def bmesh_cylinder(bm, radius, height, segments, cx, cy, cz):
    """Create a vertical cylinder (Z-up) centred at (cx, cy, cz)."""
    top_verts = []
    bot_verts = []
    z_top = cz + height / 2
    z_bot = cz - height / 2
    for i in range(segments):
        angle = 2.0 * math.pi * i / segments
        x = cx + radius * math.cos(angle)
        y = cy + radius * math.sin(angle)
        top_verts.append(bm.verts.new((x, y, z_top)))
        bot_verts.append(bm.verts.new((x, y, z_bot)))
    # Side faces
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new([bot_verts[i], bot_verts[j], top_verts[j], top_verts[i]])
    # Top and bottom caps
    bm.faces.new(top_verts)
    bm.faces.new(list(reversed(bot_verts)))


def export_glb(filepath):
    """Export entire scene as GLB."""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
    )
    print(f"  Exported: {filepath}")


def print_scene_bounds():
    """Print bounding box of all mesh objects in the scene."""
    all_min = Vector((1e9, 1e9, 1e9))
    all_max = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        for pt in bbox:
            for i in range(3):
                if pt[i] < all_min[i]:
                    all_min[i] = pt[i]
                if pt[i] > all_max[i]:
                    all_max[i] = pt[i]
    size = all_max - all_min
    print(f"  Bounds min: ({all_min.x:.3f}, {all_min.y:.3f}, {all_min.z:.3f})")
    print(f"  Bounds max: ({all_max.x:.3f}, {all_max.y:.3f}, {all_max.z:.3f})")
    print(f"  Size: W={size.x*1000:.0f}mm × D={size.y*1000:.0f}mm × H={size.z*1000:.0f}mm")
    return all_min, all_max, size


def make_object_from_bm(bm, name, material):
    """Finalize a bmesh into a linked object with material."""
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


# ─────────────────────────────────────────────────────────────
# Model 1: chair.glb — Dining chair
# ─────────────────────────────────────────────────────────────

def build_chair():
    print("\n=== Building chair.glb ===")
    clear_scene()

    # Materials
    mat_seat = new_material("Seat_Fabric", (0.55, 0.45, 0.35), roughness=0.7)
    mat_wood = new_material("Chair_Wood", (0.50, 0.35, 0.22), roughness=0.5)

    # Dimensions in metres
    seat_w = 0.420
    seat_d = 0.420
    seat_t = 0.030
    seat_h = 0.450  # bottom of seat at this height
    leg_size = 0.030
    leg_h = seat_h  # 450mm
    inset = 0.020
    back_w = 0.380
    back_h = 0.350
    back_t = 0.020
    back_angle = math.radians(5)

    # ── Seat ──
    bm = bmesh.new()
    bmesh_box_absolute(bm, seat_w, seat_d, seat_t,
                       0, 0, seat_h + seat_t / 2)
    obj_seat = make_object_from_bm(bm, "Chair_Seat", mat_seat)

    # ── Legs ──
    # Positions: inset from seat edges
    front_x_left = -seat_w / 2 + inset + leg_size / 2
    front_x_right = seat_w / 2 - inset - leg_size / 2
    front_y = -seat_d / 2 + inset + leg_size / 2
    back_y = seat_d / 2 - inset - leg_size / 2
    back_angle_leg = math.radians(3)

    leg_positions = [
        # (cx, cy, angle_x)  — front legs straight, back legs tilted
        (front_x_left, front_y, 0),       # front-left
        (front_x_right, front_y, 0),      # front-right
        (front_x_left, back_y, back_angle_leg),   # back-left
        (front_x_right, back_y, back_angle_leg),  # back-right
    ]

    for i, (lx, ly, tilt) in enumerate(leg_positions):
        bm = bmesh.new()
        bmesh_box_absolute(bm, leg_size, leg_size, leg_h,
                           lx, ly, leg_h / 2)
        if tilt != 0:
            # Rotate bmesh verts around pivot at top of leg (seat level)
            pivot = Vector((lx, ly, seat_h))
            rot_mat = Matrix.Rotation(tilt, 4, 'X')
            for v in bm.verts:
                v.co = pivot + rot_mat @ (v.co - pivot)
        make_object_from_bm(bm, f"Chair_Leg_{i}", mat_wood)

    # ── Backrest (solid panel) ──
    bm = bmesh.new()
    back_cz = seat_h + seat_t + back_h / 2
    bmesh_box_absolute(bm, back_w, back_t, back_h,
                       0, seat_d / 2 - inset - back_t / 2, back_cz)
    # Rotate bmesh verts for backrest tilt
    pivot = Vector((0, seat_d / 2 - inset - back_t / 2, seat_h + seat_t))
    rot_mat = Matrix.Rotation(back_angle, 4, 'X')
    for v in bm.verts:
        v.co = pivot + rot_mat @ (v.co - pivot)
    obj_back = make_object_from_bm(bm, "Chair_Back", mat_wood)

    mn, mx, sz = print_scene_bounds()
    # Verify: floor at Z=0, height ~800mm, no negative Z
    assert mn.z >= -0.001, f"FAIL: geometry below floor at Z={mn.z:.3f}m"
    assert mx.z <= 0.85, f"FAIL: chair too tall at Z={mx.z:.3f}m (expected ~0.80m)"
    print("  OK: Chair bounds verified")
    export_glb(os.path.join(OUTPUT_DIR, "chair.glb"))


# ─────────────────────────────────────────────────────────────
# Model 2: table_square.glb — Square dining table
# ─────────────────────────────────────────────────────────────

def build_table_square():
    print("\n=== Building table_square.glb ===")
    clear_scene()

    # Materials
    mat_top = new_material("Table_Top_Wood", (0.65, 0.50, 0.35), roughness=0.4)
    mat_legs = new_material("Table_Leg_Wood", (0.55, 0.40, 0.28), roughness=0.45)

    # Dimensions
    top_w = 0.900
    top_d = 0.900
    top_t = 0.030
    top_surface_h = 0.750  # top surface at 750mm
    top_bottom_h = top_surface_h - top_t  # 720mm
    leg_dia = 0.050
    leg_radius = leg_dia / 2
    leg_h = top_bottom_h  # legs go from floor to underside of top
    inset = 0.060
    leg_segments = 12  # low-poly cylinder

    # ── Table top ──
    bm = bmesh.new()
    bmesh_box_absolute(bm, top_w, top_d, top_t,
                       0, 0, top_bottom_h + top_t / 2)
    obj_top = make_object_from_bm(bm, "Table_Top", mat_top)

    # ── 4 Legs (cylinders) ──
    leg_positions = [
        (-top_w / 2 + inset, -top_d / 2 + inset),
        (top_w / 2 - inset, -top_d / 2 + inset),
        (-top_w / 2 + inset, top_d / 2 - inset),
        (top_w / 2 - inset, top_d / 2 - inset),
    ]

    for i, (lx, ly) in enumerate(leg_positions):
        bm = bmesh.new()
        bmesh_cylinder(bm, leg_radius, leg_h, leg_segments,
                       lx, ly, leg_h / 2)
        make_object_from_bm(bm, f"Table_Leg_{i}", mat_legs)

    mn, mx, sz = print_scene_bounds()
    # Verify legs don't extend above table top
    assert mx.z <= top_surface_h + 0.001, \
        f"FAIL: geometry extends to {mx.z:.3f}m, should be <= {top_surface_h}m"
    print("  ✓ No geometry above table top surface")

    export_glb(os.path.join(OUTPUT_DIR, "table_square.glb"))


# ─────────────────────────────────────────────────────────────
# Model 3: sofa.glb — 3-seater sofa
# ─────────────────────────────────────────────────────────────

def build_sofa():
    print("\n=== Building sofa.glb ===")
    clear_scene()

    # Single warm neutral fabric for the whole sofa (simpler for AI rendering)
    mat_fabric = new_material("Sofa_Fabric", (0.60, 0.55, 0.50), roughness=0.75)
    mat_base = new_material("Sofa_Base", (0.30, 0.28, 0.25), roughness=0.6)

    # Dimensions
    total_w = 1.800
    total_d = 0.800
    total_h = 0.800

    base_w = total_w
    base_d = total_d
    base_h = 0.150

    # Seat cushion zone
    cushion_w = 0.560
    cushion_d = 0.600
    cushion_h = 0.120
    cushion_gap = 0.020
    num_cushions = 3
    # Seat platform height (top of base to bottom of cushions)
    seat_platform_h = 0.130  # space between base top and cushion bottom
    cushion_bottom_z = base_h + seat_platform_h  # 0.280
    cushion_top_z = cushion_bottom_z + cushion_h  # 0.400

    # Backrest
    back_w = total_w
    back_t = 0.150
    back_h = 0.400
    back_bottom_z = cushion_top_z  # starts at top of cushions
    back_top_z = back_bottom_z + back_h  # 0.800

    # Armrests
    arm_w = 0.150
    arm_d = 0.700  # depth along sofa depth
    arm_h = back_top_z - base_h  # from top of base to top of backrest
    arm_bottom_z = base_h

    # ── Base/plinth ──
    bm = bmesh.new()
    bmesh_box_absolute(bm, base_w, base_d, base_h,
                       0, 0, base_h / 2)
    make_object_from_bm(bm, "Sofa_Base", mat_base)

    # ── Seat platform (connects base to cushions) ──
    platform_w = total_w - 2 * arm_w  # inner width between armrests
    platform_d = cushion_d
    platform_h_val = seat_platform_h
    bm = bmesh.new()
    bmesh_box_absolute(bm, platform_w, platform_d, platform_h_val,
                       0, -(total_d / 2 - arm_d / 2 - (total_d - cushion_d) / 2) * 0 + 0,  # centred in Y
                       base_h + platform_h_val / 2)
    # Actually let's place platform so cushions sit forward
    # Platform Y: front-aligned with front of base, behind armrests
    platform_cy = -total_d / 2 + platform_d / 2 + (total_d - cushion_d - back_t) / 2
    # Simpler: cushions centred between front face and backrest
    # Front of sofa: -total_d/2, back face of backrest: total_d/2
    # Backrest occupies rear back_t
    available_d = total_d - back_t
    platform_cy = -total_d / 2 + available_d / 2
    # Remake
    bm_p = bmesh.new()
    bmesh_box_absolute(bm_p, platform_w, cushion_d, platform_h_val,
                       0, platform_cy, base_h + platform_h_val / 2)
    make_object_from_bm(bm_p, "Sofa_SeatPlatform", mat_base)

    # ── Seat cushions ──
    total_cushion_span = num_cushions * cushion_w + (num_cushions - 1) * cushion_gap
    start_x = -total_cushion_span / 2 + cushion_w / 2
    for i in range(num_cushions):
        cx = start_x + i * (cushion_w + cushion_gap)
        cy = platform_cy
        cz = cushion_bottom_z + cushion_h / 2
        bm_c = bmesh.new()
        bmesh_box_absolute(bm_c, cushion_w, cushion_d, cushion_h,
                           cx, cy, cz)
        make_object_from_bm(bm_c, f"Sofa_Cushion_{i}", mat_fabric)

    # ── Backrest ──
    back_cy = total_d / 2 - back_t / 2
    back_cz = back_bottom_z + back_h / 2
    bm_b = bmesh.new()
    bmesh_box_absolute(bm_b, back_w, back_t, back_h,
                       0, back_cy, back_cz)
    make_object_from_bm(bm_b, "Sofa_Back", mat_fabric)

    # ── Armrests ──
    for side in (-1, 1):
        arm_cx = side * (total_w / 2 - arm_w / 2)
        arm_cy = -total_d / 2 + arm_d / 2
        arm_cz = arm_bottom_z + arm_h / 2
        bm_a = bmesh.new()
        bmesh_box_absolute(bm_a, arm_w, arm_d, arm_h,
                           arm_cx, arm_cy, arm_cz)
        side_name = "L" if side < 0 else "R"
        make_object_from_bm(bm_a, f"Sofa_Arm_{side_name}", mat_fabric)

    mn, mx, sz = print_scene_bounds()
    # Verify no random protrusions
    assert mx.z <= total_h + 0.01, \
        f"FAIL: geometry extends to {mx.z:.3f}m, should be <= {total_h}m"
    assert abs(sz.x - total_w) < 0.01, \
        f"FAIL: width is {sz.x*1000:.0f}mm, expected {total_w*1000:.0f}mm"
    print("  ✓ No unexpected protrusions")

    export_glb(os.path.join(OUTPUT_DIR, "sofa.glb"))


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    build_chair()
    build_table_square()
    build_sofa()
    print("\n=== All 3 models regenerated successfully ===")
