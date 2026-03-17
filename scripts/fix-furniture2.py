"""
fix-furniture2.py - Regenerate 3 broken furniture GLB models using bmesh.
Models: armchair.glb, booth_sofa.glb, counter.glb

All geometry built with bmesh (no bpy.ops.mesh).
Principled BSDF found by node.type == 'BSDF_PRINCIPLED'.
Dimensions in meters. Low-poly, clean geometry.
"""

import bpy
import bmesh
import math
import os
from mathutils import Matrix, Vector

OUTPUT_DIR = r"C:\Users\y-suz\porano-perse\public\models"


def clear_scene():
    """Remove all objects, meshes, materials from scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def create_material(name, color_rgb, roughness=0.5, metallic=0.0):
    """Create a material with Principled BSDF found by node.type."""
    mat = bpy.data.materials.new(name=name)
    # Blender 5.0: use_nodes is True by default (deprecated setter)
    tree = mat.node_tree
    # Find Principled BSDF by type (not name - JP locale safe)
    principled = None
    for node in tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            principled = node
            break
    if principled is None:
        principled = tree.nodes.new('ShaderNodeBsdfPrincipled')
    principled.inputs['Base Color'].default_value = (*color_rgb, 1.0)
    principled.inputs['Roughness'].default_value = roughness
    principled.inputs['Metallic'].default_value = metallic
    return mat


def make_box(bm, x, y, z, w, d, h):
    """Create a box in bmesh centered at (x, y) horizontally, bottom at z.
    w=width(X), d=depth(Y), h=height(Z)."""
    verts = []
    for dz in [0, h]:
        for dy in [-d/2, d/2]:
            for dx in [-w/2, w/2]:
                verts.append(bm.verts.new((x + dx, y + dy, z + dz)))
    # faces: bottom, top, 4 sides
    faces = [
        (verts[0], verts[1], verts[3], verts[2]),  # bottom
        (verts[4], verts[6], verts[7], verts[5]),  # top
        (verts[0], verts[4], verts[5], verts[1]),  # front (-Y)
        (verts[2], verts[3], verts[7], verts[6]),  # back (+Y)
        (verts[0], verts[2], verts[6], verts[4]),  # left (-X)
        (verts[1], verts[5], verts[7], verts[3]),  # right (+X)
    ]
    created_faces = []
    for f in faces:
        created_faces.append(bm.faces.new(f))
    return created_faces


def make_tapered_leg(bm, cx, cy, z_bottom, height, top_radius, bottom_radius, segments=8):
    """Create a tapered cylinder (leg) using bmesh."""
    verts_bottom = []
    verts_top = []
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)
        verts_bottom.append(bm.verts.new((
            cx + bottom_radius * cos_a,
            cy + bottom_radius * sin_a,
            z_bottom
        )))
        verts_top.append(bm.verts.new((
            cx + top_radius * cos_a,
            cy + top_radius * sin_a,
            z_bottom + height
        )))
    # Side faces
    created_faces = []
    for i in range(segments):
        j = (i + 1) % segments
        f = bm.faces.new((verts_bottom[i], verts_bottom[j], verts_top[j], verts_top[i]))
        created_faces.append(f)
    # Top cap
    created_faces.append(bm.faces.new(verts_top))
    # Bottom cap
    created_faces.append(bm.faces.new(list(reversed(verts_bottom))))
    return created_faces


def make_rounded_box(bm, x, y, z, w, d, h, round_top=False, round_radius=0.01, round_segments=3):
    """Create a box with optionally rounded top edge using bmesh.
    For simplicity, adds a beveled top profile by creating extra geometry rings."""
    if not round_top:
        return make_box(bm, x, y, z, w, d, h)

    # Build box then bevel top edges
    faces = make_box(bm, x, y, z, w, d, h)
    # Find top edges (z == z+h)
    top_z = z + h
    bm.edges.ensure_lookup_table()
    top_edges = []
    for e in bm.edges:
        if (abs(e.verts[0].co.z - top_z) < 0.001 and
                abs(e.verts[1].co.z - top_z) < 0.001):
            top_edges.append(e)

    if top_edges:
        bmesh.ops.bevel(
            bm,
            geom=top_edges,
            offset=round_radius,
            segments=round_segments,
            affect='EDGES'
        )
    return faces


def assign_material_to_faces(obj, faces, mat_index):
    """Assign material index to given face indices after bmesh is freed."""
    mesh = obj.data
    for fi in faces:
        if fi < len(mesh.polygons):
            mesh.polygons[fi].material_index = mat_index


def export_glb(filepath):
    """Export scene as GLB."""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
    )
    print(f"Exported: {filepath}")


def print_bounding_box(name):
    """Print bounding box of all objects in scene."""
    min_co = Vector((float('inf'),) * 3)
    max_co = Vector((float('-inf'),) * 3)
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            for v in obj.bound_box:
                world_v = obj.matrix_world @ Vector(v)
                for i in range(3):
                    min_co[i] = min(min_co[i], world_v[i])
                    max_co[i] = max(max_co[i], world_v[i])
    size = max_co - min_co
    print(f"\n=== {name} Bounding Box ===")
    print(f"  Min: ({min_co.x:.3f}, {min_co.y:.3f}, {min_co.z:.3f})")
    print(f"  Max: ({max_co.x:.3f}, {max_co.y:.3f}, {max_co.z:.3f})")
    print(f"  Size: W={size.x*1000:.0f}mm x D={size.y*1000:.0f}mm x H={size.z*1000:.0f}mm")
    return size


# ============================================================
# MODEL 1: ARMCHAIR
# ============================================================
def build_armchair():
    clear_scene()

    mat_upholstery = create_material("Upholstery", (0.60, 0.48, 0.40), roughness=0.75)
    mat_wood = create_material("DarkWood", (0.30, 0.20, 0.12), roughness=0.45)

    # --- Seat cushion ---
    # 550x550x120mm at height 400mm
    mesh_seat = bpy.data.meshes.new("Seat")
    obj_seat = bpy.data.objects.new("Seat", mesh_seat)
    bpy.context.scene.collection.objects.link(obj_seat)
    obj_seat.data.materials.append(mat_upholstery)

    bm = bmesh.new()
    make_rounded_box(bm, 0, 0, 0.400, 0.550, 0.550, 0.120, round_top=True, round_radius=0.015)
    bm.to_mesh(mesh_seat)
    bm.free()

    # --- Base frame (solid block from leg-top to seat bottom) ---
    # 600x580x250mm from 150mm to 400mm
    mesh_base = bpy.data.meshes.new("BaseFrame")
    obj_base = bpy.data.objects.new("BaseFrame", mesh_base)
    bpy.context.scene.collection.objects.link(obj_base)
    obj_base.data.materials.append(mat_wood)

    bm = bmesh.new()
    make_box(bm, 0, 0, 0.150, 0.600, 0.580, 0.250)
    bm.to_mesh(mesh_base)
    bm.free()

    # --- 4 tapered legs ---
    mesh_legs = bpy.data.meshes.new("Legs")
    obj_legs = bpy.data.objects.new("Legs", mesh_legs)
    bpy.context.scene.collection.objects.link(obj_legs)
    obj_legs.data.materials.append(mat_wood)

    bm = bmesh.new()
    leg_positions = [
        (-0.250, -0.240),
        (0.250, -0.240),
        (-0.250, 0.240),
        (0.250, 0.240),
    ]
    for lx, ly in leg_positions:
        make_tapered_leg(bm, lx, ly, 0.0, 0.150, 0.020, 0.015, segments=8)
    bm.to_mesh(mesh_legs)
    bm.free()

    # --- Backrest ---
    # 550mm wide x 450mm tall x 100mm thick, angled 8 degrees back
    # Bottom at seat top (520mm), centered at rear of seat
    mesh_back = bpy.data.meshes.new("Backrest")
    obj_back = bpy.data.objects.new("Backrest", mesh_back)
    bpy.context.scene.collection.objects.link(obj_back)
    obj_back.data.materials.append(mat_upholstery)

    bm = bmesh.new()
    make_rounded_box(bm, 0, 0, 0, 0.550, 0.100, 0.450, round_top=True, round_radius=0.020, round_segments=4)
    bm.to_mesh(mesh_back)
    bm.free()

    # Position backrest: rear of seat (Y=0.275), bottom at seat level (Z=0.400)
    # Angle 8 degrees back (rotate around X axis)
    angle_rad = math.radians(8)
    obj_back.location = (0, 0.225, 0.400)
    obj_back.rotation_euler = (-angle_rad, 0, 0)

    # --- Armrests (2) ---
    # Each 100mm wide x 450mm deep x 200mm tall from seat level
    for side in [-1, 1]:
        mesh_arm = bpy.data.meshes.new(f"Armrest_{'L' if side == -1 else 'R'}")
        obj_arm = bpy.data.objects.new(f"Armrest_{'L' if side == -1 else 'R'}", mesh_arm)
        bpy.context.scene.collection.objects.link(obj_arm)
        obj_arm.data.materials.append(mat_upholstery)

        bm = bmesh.new()
        arm_x = side * 0.275  # half seat width
        make_rounded_box(bm, arm_x, -0.025, 0.400, 0.100, 0.450, 0.200,
                         round_top=True, round_radius=0.012, round_segments=3)
        bm.to_mesh(mesh_arm)
        bm.free()

    # Export
    filepath = os.path.join(OUTPUT_DIR, "armchair.glb")
    export_glb(filepath)
    size = print_bounding_box("armchair")
    # Verify approximate dimensions
    assert 0.60 < size.x < 0.80, f"Armchair width {size.x*1000:.0f}mm out of range"
    assert 0.50 < size.y < 0.70, f"Armchair depth {size.y*1000:.0f}mm out of range"
    assert 0.75 < size.z < 0.95, f"Armchair height {size.z*1000:.0f}mm out of range"
    print("armchair.glb: PASS")


# ============================================================
# MODEL 2: BOOTH SOFA
# ============================================================
def build_booth_sofa():
    clear_scene()

    mat_leather = create_material("Leather", (0.45, 0.35, 0.25), roughness=0.5)
    mat_base = create_material("BaseDark", (0.15, 0.12, 0.10), roughness=0.6)

    # --- Plinth base ---
    # 1400x600x100mm
    mesh_plinth = bpy.data.meshes.new("Plinth")
    obj_plinth = bpy.data.objects.new("Plinth", mesh_plinth)
    bpy.context.scene.collection.objects.link(obj_plinth)
    obj_plinth.data.materials.append(mat_base)

    bm = bmesh.new()
    # Back flush with Y=0: center_y = 0.300 (half depth toward -Y)
    make_box(bm, 0, -0.300, 0, 1.400, 0.600, 0.330)
    bm.to_mesh(mesh_plinth)
    bm.free()

    # --- Seat cushion ---
    # 1400x550x100mm on top of base, seat height total ~430mm
    mesh_seat = bpy.data.meshes.new("SeatCushion")
    obj_seat = bpy.data.objects.new("SeatCushion", mesh_seat)
    bpy.context.scene.collection.objects.link(obj_seat)
    obj_seat.data.materials.append(mat_leather)

    bm = bmesh.new()
    # Seat set slightly forward from back, centered. Back at Y=0 side.
    make_rounded_box(bm, 0, -0.325, 0.330, 1.400, 0.550, 0.100,
                     round_top=True, round_radius=0.012, round_segments=3)
    bm.to_mesh(mesh_seat)
    bm.free()

    # --- Backrest ---
    # 1400x80x500mm, straight vertical
    # Bottom at seat height 430mm, back flush with Y=0
    mesh_back = bpy.data.meshes.new("Backrest")
    obj_back = bpy.data.objects.new("Backrest", mesh_back)
    bpy.context.scene.collection.objects.link(obj_back)
    obj_back.data.materials.append(mat_leather)

    bm = bmesh.new()
    # Back panel: center_y so back face is at Y=0 => center_y = -0.040
    make_rounded_box(bm, 0, -0.040, 0.430, 1.400, 0.080, 0.500,
                     round_top=True, round_radius=0.015, round_segments=3)
    bm.to_mesh(mesh_back)
    bm.free()

    # Export
    filepath = os.path.join(OUTPUT_DIR, "booth_sofa.glb")
    export_glb(filepath)
    size = print_bounding_box("booth_sofa")
    assert 1.35 < size.x < 1.45, f"Booth width {size.x*1000:.0f}mm out of range"
    assert 0.55 < size.y < 0.65, f"Booth depth {size.y*1000:.0f}mm out of range"
    assert 0.88 < size.z < 0.98, f"Booth height {size.z*1000:.0f}mm out of range"
    print("booth_sofa.glb: PASS")


# ============================================================
# MODEL 3: COUNTER
# ============================================================
def build_counter():
    clear_scene()

    mat_front = create_material("FrontPanel", (0.85, 0.82, 0.78), roughness=0.3)
    mat_top = create_material("TopSurface", (0.75, 0.72, 0.68), roughness=0.2)

    # Origin at floor center. Counter faces -Y (customer side).
    # Total W=1500, D=500, H=1090mm

    # --- Front panel (customer-facing) ---
    # 1500 x 30 x 1050mm
    # Front face at Y = -0.250 (half depth)
    mesh_front = bpy.data.meshes.new("FrontPanel")
    obj_front = bpy.data.objects.new("FrontPanel", mesh_front)
    bpy.context.scene.collection.objects.link(obj_front)
    obj_front.data.materials.append(mat_front)

    bm = bmesh.new()
    # Front panel: center at Y = -0.250 + 0.015 = -0.235
    make_box(bm, 0, -0.235, 0, 1.500, 0.030, 1.050)
    bm.to_mesh(mesh_front)
    bm.free()

    # --- Top surface ---
    # 1500 x 500 x 40mm at height 1050mm
    # Front overhangs 50mm beyond front panel
    # Front panel front face at Y=-0.250, overhang => top front at Y=-0.300
    # Top center_y = -0.300 + 0.250 = -0.050
    mesh_top = bpy.data.meshes.new("TopSurface")
    obj_top = bpy.data.objects.new("TopSurface", mesh_top)
    bpy.context.scene.collection.objects.link(obj_top)
    obj_top.data.materials.append(mat_top)

    bm = bmesh.new()
    make_box(bm, 0, -0.050, 1.050, 1.500, 0.500, 0.040)
    bm.to_mesh(mesh_top)
    bm.free()

    # --- Kick panel (staff side, at floor) ---
    # 1500 x 30 x 100mm at Y = +0.250 - 0.015 = +0.235
    mesh_kick = bpy.data.meshes.new("KickPanel")
    obj_kick = bpy.data.objects.new("KickPanel", mesh_kick)
    bpy.context.scene.collection.objects.link(obj_kick)
    obj_kick.data.materials.append(mat_front)

    bm = bmesh.new()
    make_box(bm, 0, 0.185, 0, 1.500, 0.030, 0.100)
    bm.to_mesh(mesh_kick)
    bm.free()

    # --- Side panels (2) ---
    # Close off left and right sides: 500mm deep x 1050mm tall x 30mm thick
    for side in [-1, 1]:
        mesh_side = bpy.data.meshes.new(f"SidePanel_{'L' if side == -1 else 'R'}")
        obj_side = bpy.data.objects.new(f"SidePanel_{'L' if side == -1 else 'R'}", mesh_side)
        bpy.context.scene.collection.objects.link(obj_side)
        obj_side.data.materials.append(mat_front)

        bm = bmesh.new()
        sx = side * (0.750 - 0.015)  # inset by half thickness
        make_box(bm, sx, -0.030, 0, 0.030, 0.440, 1.050)
        bm.to_mesh(mesh_side)
        bm.free()

    # --- Internal shelf ---
    # 1500 x 400 x 20mm at height 500mm
    mesh_shelf = bpy.data.meshes.new("Shelf")
    obj_shelf = bpy.data.objects.new("Shelf", mesh_shelf)
    bpy.context.scene.collection.objects.link(obj_shelf)
    obj_shelf.data.materials.append(mat_front)

    bm = bmesh.new()
    # Shelf sits between front and back, shifted toward staff side
    make_box(bm, 0, 0.020, 0.500, 1.440, 0.400, 0.020)
    bm.to_mesh(mesh_shelf)
    bm.free()

    # Export
    filepath = os.path.join(OUTPUT_DIR, "counter.glb")
    export_glb(filepath)
    size = print_bounding_box("counter")
    assert 1.45 < size.x < 1.55, f"Counter width {size.x*1000:.0f}mm out of range"
    assert 0.45 < size.y < 0.60, f"Counter depth {size.y*1000:.0f}mm out of range"
    assert 1.00 < size.z < 1.15, f"Counter height {size.z*1000:.0f}mm out of range"
    print("counter.glb: PASS")


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("fix-furniture2.py - Regenerating 3 furniture models")
    print("=" * 60)

    build_armchair()
    build_booth_sofa()
    build_counter()

    print("\n" + "=" * 60)
    print("ALL 3 MODELS REGENERATED SUCCESSFULLY")
    print("=" * 60)
