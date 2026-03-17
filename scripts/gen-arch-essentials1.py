"""
gen-arch-essentials1.py
Generate 4 interior finishing GLB models using bmesh.
Models: wainscoting, louver_screen, handrail_wall, handrail_free
"""

import bpy
import bmesh
import os
import math
from mathutils import Vector

OUTPUT_DIR = r"C:\Users\y-suz\porano-perse\public\models"


def clear_scene():
    """Remove all objects from scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def create_material(name, base_color, roughness=0.5, metallic=0.0):
    """Create a Principled BSDF material."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    # Find Principled BSDF by type (not name, for Japanese locale compatibility)
    bsdf = None
    for node in nodes:
        if node.type == 'BSDF_PRINCIPLED':
            bsdf = node
            break
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*base_color, 1.0)
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
    return mat


def bmesh_box(bm, sx, sy, sz, offset=(0, 0, 0)):
    """Create a box using bmesh. sx/sy/sz are full dimensions. offset is center."""
    ox, oy, oz = offset
    verts = []
    for x in (-sx/2, sx/2):
        for y in (-sy/2, sy/2):
            for z in (-sz/2, sz/2):
                verts.append(bm.verts.new((x + ox, y + oy, z + oz)))
    bm.verts.ensure_lookup_table()
    # Faces: 6 faces of a box
    faces = [
        (0, 1, 3, 2),  # -X
        (4, 6, 7, 5),  # +X
        (0, 4, 5, 1),  # -Y
        (2, 3, 7, 6),  # +Y
        (0, 2, 6, 4),  # -Z
        (1, 5, 7, 3),  # +Z
    ]
    start = len(bm.verts) - 8
    created_faces = []
    for f in faces:
        created_faces.append(bm.faces.new([bm.verts[start + i] for i in f]))
    return verts, created_faces


def bmesh_cylinder(bm, radius, height, segments=16, offset=(0, 0, 0), axis='Z'):
    """Create a cylinder using bmesh along given axis. Centered at offset."""
    ox, oy, oz = offset
    top_verts = []
    bot_verts = []

    for i in range(segments):
        angle = 2 * math.pi * i / segments
        ca = math.cos(angle) * radius
        sa = math.sin(angle) * radius

        if axis == 'Z':
            bot_verts.append(bm.verts.new((ca + ox, sa + oy, -height/2 + oz)))
            top_verts.append(bm.verts.new((ca + ox, sa + oy, height/2 + oz)))
        elif axis == 'X':
            bot_verts.append(bm.verts.new((-height/2 + ox, ca + oy, sa + oz)))
            top_verts.append(bm.verts.new((height/2 + ox, ca + oy, sa + oz)))
        elif axis == 'Y':
            bot_verts.append(bm.verts.new((ca + ox, -height/2 + oy, sa + oz)))
            top_verts.append(bm.verts.new((ca + ox, height/2 + oy, sa + oz)))

    # Side faces
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new([bot_verts[i], bot_verts[j], top_verts[j], top_verts[i]])

    # Cap faces
    bm.faces.new(bot_verts[::-1])
    bm.faces.new(top_verts)


def bmesh_disc(bm, radius, segments=16, offset=(0, 0, 0), normal='X'):
    """Create a flat disc (very thin cylinder) using bmesh."""
    thickness = 0.001
    bmesh_cylinder(bm, radius, thickness, segments, offset,
                   axis='X' if normal == 'X' else 'Z')


def mesh_from_bmesh(name, bm):
    """Convert bmesh to mesh object and link to scene."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def export_glb(filepath):
    """Export scene as GLB."""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
    )


def get_bounds(objs):
    """Get bounding box of all objects. Returns (min_co, max_co, dims)."""
    # Force depsgraph update so bound_box is accurate
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    min_co = [float('inf')] * 3
    max_co = [float('-inf')] * 3
    for obj in objs:
        obj_eval = obj.evaluated_get(depsgraph)
        for corner in obj_eval.bound_box:
            world = obj_eval.matrix_world @ Vector(corner)
            for i in range(3):
                min_co[i] = min(min_co[i], world[i])
                max_co[i] = max(max_co[i], world[i])
    dims = [max_co[i] - min_co[i] for i in range(3)]
    return min_co, max_co, dims


def print_model_info(name, filepath, objs):
    """Print model info for verification."""
    size = os.path.getsize(filepath)
    min_co, max_co, dims = get_bounds(objs)
    print(f"  {name}: {size:,} bytes")
    print(f"    Size: X={dims[0]:.3f}m Y={dims[1]:.3f}m Z={dims[2]:.3f}m")
    print(f"    Min:  X={min_co[0]:.3f} Y={min_co[1]:.3f} Z={min_co[2]:.3f}")
    print(f"    Max:  X={max_co[0]:.3f} Y={max_co[1]:.3f} Z={max_co[2]:.3f}")


# ============================================================
# Model 1: wainscoting.glb
# ============================================================
def gen_wainscoting():
    clear_scene()

    mat_panel = create_material("WainscotPanel", (0.92, 0.91, 0.89), roughness=0.3)
    mat_rail = create_material("ChairRail", (0.90, 0.89, 0.87), roughness=0.25)

    objs = []

    # Back panel: 1000mm x 900mm x 8mm
    # Origin at bottom-left: center at (0.5, 0.004, 0.45)
    bm = bmesh.new()
    bmesh_box(bm, 1.0, 0.008, 0.9, offset=(0.5, 0.004, 0.45))
    obj = mesh_from_bmesh("BackPanel", bm)
    obj.data.materials.append(mat_panel)
    bm.free()
    objs.append(obj)

    # Chair rail (top cap): 1000mm x 25mm(height) x 15mm(depth) at top
    # Position: top of panel at Z=0.900, center at Z=0.900 + 0.0125 = 0.9125?
    # Actually it sits at the top edge. Let's place it so bottom aligns with Z=0.9 - 0.025/2
    # Chair rail top aligns with panel top: center Z = 0.9 - 0.0125 = 0.8875
    # Depth: 15mm, so it protrudes beyond panel: center Y = 0.015/2 = 0.0075
    bm = bmesh.new()
    bmesh_box(bm, 1.0, 0.015, 0.025, offset=(0.5, 0.0075, 0.9 - 0.0125))
    obj = mesh_from_bmesh("ChairRail", bm)
    obj.data.materials.append(mat_rail)
    bm.free()
    objs.append(obj)

    # Two raised frames: each 420mm wide x 600mm tall x 5mm raised
    # Evenly spaced with 50mm margin from edges
    # Margin: 50mm from left, 50mm from right = 100mm margins
    # Remaining width: 1000 - 100 = 900mm for 2 panels + gap
    # Each panel: 420mm, total panels: 840mm, gap: 900 - 840 = 60mm between them
    # Panel 1 center X: 0.050 + 0.210 = 0.260
    # Panel 2 center X: 0.260 + 0.420 + 0.060 = 0.740
    # Vertical: 50mm margin from baseboard top (60mm), 50mm from chair rail bottom
    # Baseboard top: 60mm, so frame bottom = 60mm + 50mm = 110mm
    # Chair rail bottom: 900 - 25 = 875mm, frame top = 875 - 50 = 825mm?
    # But frame height is 600mm. Let's center vertically in the available space.
    # Available: from baseboard top (60mm) to chair rail bottom (875mm) = 815mm
    # Frame 600mm centered: center Z = 0.060 + 0.815/2 = 0.060 + 0.4075 = 0.4675
    # But let's use the spec: each frame 600mm tall, evenly spaced with 50mm margin
    # I'll interpret: 50mm margin from sides, and place frames centered vertically
    frame_center_z = 0.060 + (0.875 - 0.060) / 2  # = 0.4675
    for cx in [0.260, 0.740]:
        bm = bmesh.new()
        # Raised 5mm from back panel surface (panel is 8mm deep, so frame front at Y = 0.008 + 0.005/2)
        bmesh_box(bm, 0.420, 0.005, 0.600, offset=(cx, 0.008 + 0.0025, frame_center_z))
        obj = mesh_from_bmesh("RaisedFrame", bm)
        obj.data.materials.append(mat_panel)
        bm.free()
        objs.append(obj)

    # Baseboard: 60mm high x 12mm deep at bottom
    bm = bmesh.new()
    bmesh_box(bm, 1.0, 0.012, 0.060, offset=(0.5, 0.006, 0.030))
    obj = mesh_from_bmesh("Baseboard", bm)
    obj.data.materials.append(mat_panel)
    bm.free()
    objs.append(obj)

    filepath = os.path.join(OUTPUT_DIR, "wainscoting.glb")
    export_glb(filepath)
    print_model_info("wainscoting.glb", filepath, objs)
    return objs


# ============================================================
# Model 2: louver_screen.glb
# ============================================================
def gen_louver_screen():
    clear_scene()

    mat_frame = create_material("LouverFrame", (0.25, 0.15, 0.08), roughness=0.45)
    mat_slat = create_material("LouverSlat", (0.45, 0.30, 0.18), roughness=0.5)

    objs = []

    # Frame: outer rectangle 1000mm wide x 2400mm tall x 30mm deep
    # Frame members: 30mm x 30mm cross-section
    # Origin: bottom center -> center X = 0, center Y = 0
    # Bottom rail
    bm = bmesh.new()
    bmesh_box(bm, 1.0, 0.030, 0.030, offset=(0, 0, 0.015))
    # Top rail
    bmesh_box(bm, 1.0, 0.030, 0.030, offset=(0, 0, 2.400 - 0.015))
    # Left post
    bmesh_box(bm, 0.030, 0.030, 2.400 - 0.060, offset=(-0.500 + 0.015, 0, 1.200))
    # Right post
    bmesh_box(bm, 0.030, 0.030, 2.400 - 0.060, offset=(0.500 - 0.015, 0, 1.200))
    obj = mesh_from_bmesh("Frame", bm)
    obj.data.materials.append(mat_frame)
    bm.free()
    objs.append(obj)

    # Louver blades: 8 vertical slats
    # Each slat: 20mm wide x 2340mm tall x 30mm deep
    # Evenly spaced across inner width: 1000 - 60 = 940mm inner
    # 8 slats spacing: 940 / (8+1) = ~104.4mm between centers
    inner_width = 1.0 - 0.060  # 0.940m
    spacing = inner_width / (8 + 1)
    slat_height = 2.340  # 2400 - 30 - 30

    for i in range(8):
        cx = -inner_width / 2 + spacing * (i + 1)
        bm = bmesh.new()
        bmesh_box(bm, 0.020, 0.030, slat_height, offset=(cx, 0, 1.200))
        obj = mesh_from_bmesh(f"Slat_{i}", bm)
        obj.data.materials.append(mat_slat)
        # Rotate ~15 degrees around vertical (Z) axis
        obj.rotation_euler[2] = math.radians(15)
        bm.free()
        objs.append(obj)

    filepath = os.path.join(OUTPUT_DIR, "louver_screen.glb")
    export_glb(filepath)
    print_model_info("louver_screen.glb", filepath, objs)
    return objs


# ============================================================
# Model 3: handrail_wall.glb
# ============================================================
def gen_handrail_wall():
    clear_scene()

    mat_steel = create_material("StainlessSteel", (0.75, 0.75, 0.73),
                                roughness=0.2, metallic=0.9)

    objs = []

    # Rail bar: cylinder, diameter 35mm, length 1000mm, along X axis at Z=0.800
    bm = bmesh.new()
    bmesh_cylinder(bm, 0.0175, 1.0, segments=16, offset=(0.5, 0.060, 0.800), axis='X')
    obj = mesh_from_bmesh("RailBar", bm)
    obj.data.materials.append(mat_steel)
    bm.free()
    objs.append(obj)

    # Brackets at X=0.1 and X=0.9
    for bx in [0.1, 0.9]:
        # Wall plate: 50mm x 50mm x 5mm at Y=0 (against wall)
        bm = bmesh.new()
        bmesh_box(bm, 0.050, 0.005, 0.050, offset=(bx, 0.0025, 0.800))
        obj = mesh_from_bmesh(f"WallPlate_{bx}", bm)
        obj.data.materials.append(mat_steel)
        bm.free()
        objs.append(obj)

        # Arm: cylinder diameter 12mm, length 60mm extending from wall (+Y)
        bm = bmesh.new()
        bmesh_cylinder(bm, 0.006, 0.060, segments=12,
                       offset=(bx, 0.005 + 0.030, 0.800), axis='Y')
        obj = mesh_from_bmesh(f"BracketArm_{bx}", bm)
        obj.data.materials.append(mat_steel)
        bm.free()
        objs.append(obj)

    # End caps: flat discs at each end of rail
    for ex in [0.0, 1.0]:
        bm = bmesh.new()
        bmesh_disc(bm, 0.0175, segments=16, offset=(ex, 0.060, 0.800), normal='X')
        obj = mesh_from_bmesh(f"EndCap_{ex}", bm)
        obj.data.materials.append(mat_steel)
        bm.free()
        objs.append(obj)

    filepath = os.path.join(OUTPUT_DIR, "handrail_wall.glb")
    export_glb(filepath)
    print_model_info("handrail_wall.glb", filepath, objs)
    return objs


# ============================================================
# Model 4: handrail_free.glb
# ============================================================
def gen_handrail_free():
    clear_scene()

    mat_dark = create_material("DarkMetal", (0.15, 0.15, 0.15),
                               roughness=0.35, metallic=0.9)

    objs = []

    # Rail bar: cylinder, diameter 40mm, length 1000mm, along X at Z=0.850
    # Origin: bottom center of first post -> first post at X=0
    # Rail from X=0 to X=1.0, center at X=0.5
    bm = bmesh.new()
    bmesh_cylinder(bm, 0.020, 1.0, segments=16, offset=(0.5, 0, 0.850), axis='X')
    obj = mesh_from_bmesh("RailBar", bm)
    obj.data.materials.append(mat_dark)
    bm.free()
    objs.append(obj)

    # Posts at X=0.0 and X=1.0
    for px in [0.0, 1.0]:
        # Vertical post: diameter 40mm, height 850mm
        bm = bmesh.new()
        bmesh_cylinder(bm, 0.020, 0.850, segments=16, offset=(px, 0, 0.425), axis='Z')
        obj = mesh_from_bmesh(f"Post_{px}", bm)
        obj.data.materials.append(mat_dark)
        bm.free()
        objs.append(obj)

        # Base plate: 120mm x 120mm x 8mm on floor
        bm = bmesh.new()
        bmesh_box(bm, 0.120, 0.120, 0.008, offset=(px, 0, 0.004))
        obj = mesh_from_bmesh(f"BasePlate_{px}", bm)
        obj.data.materials.append(mat_dark)
        bm.free()
        objs.append(obj)

    filepath = os.path.join(OUTPUT_DIR, "handrail_free.glb")
    export_glb(filepath)
    print_model_info("handrail_free.glb", filepath, objs)
    return objs


# ============================================================
# Main
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("Generating interior finishing models...")
    print("=" * 60)

    gen_wainscoting()
    gen_louver_screen()
    gen_handrail_wall()
    gen_handrail_free()

    print("=" * 60)
    print("All 4 models generated successfully!")
    print("=" * 60)
