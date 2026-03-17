"""
gen-architectural-equipment.py
Generates lighting fixtures and building equipment GLB models for interior パース.
All models are LOW-POLY, clean geometry using bmesh (no bpy.ops.mesh).
Run: blender --background --python gen-architectural-equipment.py
"""

import bpy
import bmesh
import os
import math
from mathutils import Vector, Matrix

OUTPUT_DIR = r"C:\Users\y-suz\porano-perse\public\models"
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================================
# Utility Functions
# ============================================================

def clear_scene():
    """Remove all objects, meshes, materials from the scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Ensure we have a scene
    if not bpy.context.scene:
        bpy.ops.scene.new()


def make_material(name, base_color=(0.8, 0.8, 0.8, 1.0), roughness=0.5,
                  metallic=0.0, emission_color=None, emission_strength=0.0):
    """Create a Principled BSDF material."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    out_node = nodes.new('ShaderNodeOutputMaterial')
    out_node.location = (300, 0)

    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic

    if emission_color and emission_strength > 0:
        bsdf.inputs['Emission Color'].default_value = emission_color
        bsdf.inputs['Emission Strength'].default_value = emission_strength

    mat.node_tree.links.new(bsdf.outputs['BSDF'], out_node.inputs['Surface'])
    return mat


def create_mesh_object(name, bm, materials=None):
    """Create a Blender object from a bmesh."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    if materials:
        if isinstance(materials, list):
            for mat in materials:
                obj.data.materials.append(mat)
        else:
            obj.data.materials.append(materials)

    return obj


def bmesh_cylinder(bm, radius, depth, segments=16, offset=(0, 0, 0),
                   cap_top=True, cap_bottom=True, mat_index=0):
    """Create a cylinder using bmesh. Returns list of created verts."""
    verts_bottom = []
    verts_top = []
    ox, oy, oz = offset

    for i in range(segments):
        angle = 2 * math.pi * i / segments
        x = ox + radius * math.cos(angle)
        y = oy + radius * math.sin(angle)
        verts_bottom.append(bm.verts.new((x, y, oz)))
        verts_top.append(bm.verts.new((x, y, oz + depth)))

    bm.verts.ensure_lookup_table()

    # Side faces
    for i in range(segments):
        ni = (i + 1) % segments
        f = bm.faces.new([verts_bottom[i], verts_bottom[ni],
                          verts_top[ni], verts_top[i]])
        f.material_index = mat_index

    # Cap faces
    if cap_bottom:
        f = bm.faces.new(verts_bottom[::-1])
        f.material_index = mat_index
    if cap_top:
        f = bm.faces.new(verts_top)
        f.material_index = mat_index

    return verts_bottom, verts_top


def bmesh_cone(bm, radius_bottom, radius_top, depth, segments=16,
               offset=(0, 0, 0), cap_top=True, cap_bottom=True, mat_index=0):
    """Create a cone/frustum using bmesh."""
    verts_bottom = []
    verts_top = []
    ox, oy, oz = offset

    for i in range(segments):
        angle = 2 * math.pi * i / segments
        x_b = ox + radius_bottom * math.cos(angle)
        y_b = oy + radius_bottom * math.sin(angle)
        verts_bottom.append(bm.verts.new((x_b, y_b, oz)))

        x_t = ox + radius_top * math.cos(angle)
        y_t = oy + radius_top * math.sin(angle)
        verts_top.append(bm.verts.new((x_t, y_t, oz + depth)))

    bm.verts.ensure_lookup_table()

    for i in range(segments):
        ni = (i + 1) % segments
        f = bm.faces.new([verts_bottom[i], verts_bottom[ni],
                          verts_top[ni], verts_top[i]])
        f.material_index = mat_index

    if cap_bottom and radius_bottom > 0.0001:
        f = bm.faces.new(verts_bottom[::-1])
        f.material_index = mat_index
    if cap_top and radius_top > 0.0001:
        f = bm.faces.new(verts_top)
        f.material_index = mat_index

    return verts_bottom, verts_top


def bmesh_box(bm, sx, sy, sz, offset=(0, 0, 0), mat_index=0):
    """Create a box using bmesh. sx, sy, sz are full dimensions."""
    ox, oy, oz = offset
    hx, hy = sx / 2, sy / 2

    v0 = bm.verts.new((ox - hx, oy - hy, oz))
    v1 = bm.verts.new((ox + hx, oy - hy, oz))
    v2 = bm.verts.new((ox + hx, oy + hy, oz))
    v3 = bm.verts.new((ox - hx, oy + hy, oz))
    v4 = bm.verts.new((ox - hx, oy - hy, oz + sz))
    v5 = bm.verts.new((ox + hx, oy - hy, oz + sz))
    v6 = bm.verts.new((ox + hx, oy + hy, oz + sz))
    v7 = bm.verts.new((ox - hx, oy + hy, oz + sz))

    faces = [
        [v3, v2, v1, v0],  # bottom
        [v4, v5, v6, v7],  # top
        [v0, v1, v5, v4],  # front
        [v2, v3, v7, v6],  # back
        [v1, v2, v6, v5],  # right
        [v3, v0, v4, v7],  # left
    ]

    for fv in faces:
        f = bm.faces.new(fv)
        f.material_index = mat_index

    return [v0, v1, v2, v3, v4, v5, v6, v7]


def bmesh_ring(bm, outer_radius, inner_radius, depth, segments=24,
               offset=(0, 0, 0), mat_index=0):
    """Create a ring/annulus shape using bmesh."""
    ox, oy, oz = offset
    verts_outer_bottom = []
    verts_outer_top = []
    verts_inner_bottom = []
    verts_inner_top = []

    for i in range(segments):
        angle = 2 * math.pi * i / segments
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)

        verts_outer_bottom.append(bm.verts.new((
            ox + outer_radius * cos_a, oy + outer_radius * sin_a, oz)))
        verts_outer_top.append(bm.verts.new((
            ox + outer_radius * cos_a, oy + outer_radius * sin_a, oz + depth)))
        verts_inner_bottom.append(bm.verts.new((
            ox + inner_radius * cos_a, oy + inner_radius * sin_a, oz)))
        verts_inner_top.append(bm.verts.new((
            ox + inner_radius * cos_a, oy + inner_radius * sin_a, oz + depth)))

    bm.verts.ensure_lookup_table()

    for i in range(segments):
        ni = (i + 1) % segments
        # Outer wall
        f = bm.faces.new([verts_outer_bottom[i], verts_outer_bottom[ni],
                          verts_outer_top[ni], verts_outer_top[i]])
        f.material_index = mat_index
        # Inner wall
        f = bm.faces.new([verts_inner_top[i], verts_inner_top[ni],
                          verts_inner_bottom[ni], verts_inner_bottom[i]])
        f.material_index = mat_index
        # Top face (ring)
        f = bm.faces.new([verts_outer_top[i], verts_outer_top[ni],
                          verts_inner_top[ni], verts_inner_top[i]])
        f.material_index = mat_index
        # Bottom face (ring)
        f = bm.faces.new([verts_inner_bottom[i], verts_inner_bottom[ni],
                          verts_outer_bottom[ni], verts_outer_bottom[i]])
        f.material_index = mat_index

    return (verts_outer_bottom, verts_outer_top,
            verts_inner_bottom, verts_inner_top)


def bmesh_half_cylinder(bm, radius, length, segments=12,
                        offset=(0, 0, 0), mat_index=0):
    """Create a half cylinder (for wall sconce shade). Open at back (wall side).
    Extends along +Y axis from offset. Curved part is top half."""
    ox, oy, oz = offset

    verts_front = []
    verts_back = []

    for i in range(segments + 1):
        angle = math.pi * i / segments  # 0 to pi
        x = ox + radius * math.cos(angle)
        z = oz + radius * math.sin(angle)
        verts_front.append(bm.verts.new((x, oy, z)))
        verts_back.append(bm.verts.new((x, oy + length, z)))

    bm.verts.ensure_lookup_table()

    # Curved surface
    for i in range(segments):
        f = bm.faces.new([verts_front[i], verts_front[i + 1],
                          verts_back[i + 1], verts_back[i]])
        f.material_index = mat_index

    # End caps
    if len(verts_front) >= 3:
        f = bm.faces.new(verts_front[::-1])
        f.material_index = mat_index
        f = bm.faces.new(verts_back)
        f.material_index = mat_index

    # Flat bottom face
    f = bm.faces.new([verts_front[0], verts_back[0],
                      verts_back[-1], verts_front[-1]])
    f.material_index = mat_index

    return verts_front, verts_back


def export_glb(filepath, name):
    """Export scene to GLB and print file info."""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
    )
    size = os.path.getsize(filepath)
    size_kb = size / 1024
    print(f"  -> {name}: {size_kb:.1f} KB ({filepath})")
    return size


# ============================================================
# Model Generators
# ============================================================

def gen_downlight_recessed():
    """1. Recessed downlight - ceiling mount."""
    clear_scene()

    mat_white = make_material("Trim_White", (0.9, 0.9, 0.9, 1), 0.5, 0.0)
    mat_silver = make_material("Reflector_Silver", (0.75, 0.75, 0.78, 1), 0.3, 0.8)
    mat_led = make_material("LED_Emissive", (1, 1, 1, 1), 0.5, 0.0,
                            emission_color=(1, 0.98, 0.95, 1), emission_strength=5.0)

    # Trim ring: outer 50mm radius, inner 45mm, 3mm deep
    # Origin at top (ceiling level) = z=0, ring goes downward
    bm = bmesh.new()

    # Trim ring (white)
    bmesh_ring(bm, 0.050, 0.045, -0.003, segments=24, offset=(0, 0, 0), mat_index=0)

    # Inner reflector cone (silver) - from inner edge of trim downward
    # Cone from radius 0.045 at z=-0.003 to radius 0.025 at z=-0.040
    bmesh_cone(bm, 0.045, 0.025, -0.037, segments=24,
               offset=(0, 0, -0.003), cap_top=False, cap_bottom=False, mat_index=1)

    # LED disc at top of cone (z=-0.040)
    bmesh_cylinder(bm, 0.025, 0.003, segments=16,
                   offset=(0, 0, -0.043), cap_top=True, cap_bottom=True, mat_index=2)

    # Housing cylinder (hidden in ceiling but gives it body)
    bmesh_cylinder(bm, 0.052, -0.060, segments=16,
                   offset=(0, 0, 0), cap_top=True, cap_bottom=True, mat_index=0)

    obj = create_mesh_object("Downlight_Recessed", bm, [mat_white, mat_silver, mat_led])

    fp = os.path.join(OUTPUT_DIR, "downlight_recessed.glb")
    export_glb(fp, "downlight_recessed.glb")


def gen_spot_light():
    """2. Adjustable spotlight."""
    clear_scene()

    mat_black = make_material("Black_Matte", (0.05, 0.05, 0.05, 1), 0.8, 0.3)
    mat_lens = make_material("Lens_Glass", (0.1, 0.1, 0.1, 1), 0.1, 0.0,
                             emission_color=(1, 0.98, 0.9, 1), emission_strength=2.0)

    bm = bmesh.new()

    # Main cylindrical housing: 40mm radius, 120mm long
    # Origin at mount point (top). Housing hangs downward and is tilted.
    # For simplicity, orient housing along -Z first then we'll note origin is at top.
    # Housing pointing down-forward: let's keep it simple, along -Z
    bmesh_cylinder(bm, 0.040, -0.120, segments=16,
                   offset=(0, 0, 0), mat_index=0)

    # Lens face (slightly recessed) at bottom of housing
    bmesh_cylinder(bm, 0.035, -0.005, segments=16,
                   offset=(0, 0, -0.115), mat_index=1)

    # Mounting bracket (yoke) - two flat plates on sides
    # Left plate
    bmesh_box(bm, 0.003, 0.030, 0.050, offset=(-0.043, 0, 0.010), mat_index=0)
    # Right plate
    bmesh_box(bm, 0.003, 0.030, 0.050, offset=(0.043, 0, 0.010), mat_index=0)

    # Mount base (top plate connecting to ceiling/track)
    bmesh_box(bm, 0.050, 0.030, 0.010, offset=(0, 0, 0.060), mat_index=0)

    # Small pivot cylinders on yoke sides
    bmesh_cylinder(bm, 0.005, 0.003, segments=8,
                   offset=(-0.045, 0, 0.010))
    bmesh_cylinder(bm, 0.005, 0.003, segments=8,
                   offset=(0.042, 0, 0.010))

    obj = create_mesh_object("Spot_Light", bm, [mat_black, mat_lens])

    fp = os.path.join(OUTPUT_DIR, "spot_light.glb")
    export_glb(fp, "spot_light.glb")


def gen_track_light_rail():
    """3. Track light rail - 1m segment."""
    clear_scene()

    mat_white = make_material("Rail_White", (0.85, 0.85, 0.85, 1), 0.6, 0.2)
    mat_groove = make_material("Groove_Dark", (0.3, 0.3, 0.3, 1), 0.5, 0.5)

    bm = bmesh.new()

    # Main rail body: 30mm wide x 20mm high x 1000mm long
    # Origin at one end. Rail extends along +X.
    bmesh_box(bm, 1.000, 0.030, 0.020, offset=(0.500, 0, -0.010), mat_index=0)

    # Conductor grooves (subtle channels on bottom face)
    # Two thin darker strips
    bmesh_box(bm, 1.000, 0.004, 0.002,
              offset=(0.500, -0.008, -0.020), mat_index=1)
    bmesh_box(bm, 1.000, 0.004, 0.002,
              offset=(0.500, 0.008, -0.020), mat_index=1)

    # End cap at x=0 end
    bmesh_box(bm, 0.004, 0.030, 0.020, offset=(-0.002, 0, -0.010), mat_index=0)

    # Mounting clips (two along the rail)
    for x_pos in [0.250, 0.750]:
        bmesh_box(bm, 0.020, 0.040, 0.005, offset=(x_pos, 0, 0.0025), mat_index=0)

    obj = create_mesh_object("Track_Light_Rail", bm, [mat_white, mat_groove])

    fp = os.path.join(OUTPUT_DIR, "track_light_rail.glb")
    export_glb(fp, "track_light_rail.glb")


def gen_wall_sconce():
    """4. Wall sconce/bracket light."""
    clear_scene()

    mat_metal = make_material("Brushed_Metal", (0.7, 0.7, 0.72, 1), 0.4, 0.6)
    mat_shade = make_material("Shade_White", (0.9, 0.88, 0.85, 1), 0.6, 0.0,
                              emission_color=(1, 0.95, 0.85, 1), emission_strength=2.0)

    bm = bmesh.new()

    # Wall plate: 100x100x10mm - sits on wall (origin at wall surface center)
    # Wall is at Y=0 plane, plate extends in +Y
    bmesh_box(bm, 0.100, 0.010, 0.100, offset=(0, 0.005, 0), mat_index=0)

    # Arm extending from wall: 80mm along +Y
    bmesh_box(bm, 0.020, 0.080, 0.020, offset=(0, 0.050, 0.010), mat_index=0)

    # Shade: uplight half-cylinder shape, 100mm wide x 80mm tall
    # Position at end of arm
    # Use half cylinder oriented as uplight
    bmesh_half_cylinder(bm, 0.040, 0.100, segments=12,
                        offset=(0, 0.060, 0.020), mat_index=1)

    obj = create_mesh_object("Wall_Sconce", bm, [mat_metal, mat_shade])

    fp = os.path.join(OUTPUT_DIR, "wall_sconce.glb")
    export_glb(fp, "wall_sconce.glb")


def gen_indirect_light_cove():
    """5. Indirect lighting cove profile - 1m segment."""
    clear_scene()

    mat_gypsum = make_material("Gypsum_White", (0.92, 0.91, 0.90, 1), 0.7, 0.0)
    mat_led_strip = make_material("LED_Strip", (1, 1, 1, 1), 0.3, 0.0,
                                  emission_color=(1, 0.98, 0.92, 1),
                                  emission_strength=8.0)

    bm = bmesh.new()

    # L-shaped cove profile, 1m long along X
    # Origin at one end (x=0). Profile in Y-Z plane.
    # Vertical drop: 150mm down from ceiling
    # Horizontal shelf: 100mm depth toward wall

    length = 1.000
    drop = 0.150
    depth = 0.100
    thickness = 0.012  # 12mm gypsum board

    # Vertical piece (face of cove)
    bmesh_box(bm, length, thickness, drop,
              offset=(length / 2, 0, -drop / 2), mat_index=0)

    # Horizontal shelf (top of cove, set back)
    bmesh_box(bm, length, depth, thickness,
              offset=(length / 2, -depth / 2, -drop + thickness / 2), mat_index=0)

    # LED strip (thin emissive line on top of shelf, near front edge)
    bmesh_box(bm, length, 0.010, 0.003,
              offset=(length / 2, -0.010, -drop + thickness + 0.0015), mat_index=1)

    obj = create_mesh_object("Indirect_Light_Cove", bm, [mat_gypsum, mat_led_strip])

    fp = os.path.join(OUTPUT_DIR, "indirect_light_cove.glb")
    export_glb(fp, "indirect_light_cove.glb")


def gen_pendant_light_simple():
    """6. Simple pendant light."""
    clear_scene()

    mat_black = make_material("Cord_Black", (0.05, 0.05, 0.05, 1), 0.6, 0.0)
    mat_white_shade = make_material("Shade_White", (0.92, 0.90, 0.88, 1), 0.7, 0.0)
    mat_canopy = make_material("Canopy_White", (0.85, 0.85, 0.85, 1), 0.5, 0.0)
    mat_inner = make_material("Shade_Inner", (1, 1, 1, 1), 0.5, 0.0,
                              emission_color=(1, 0.97, 0.90, 1), emission_strength=3.0)

    bm = bmesh.new()

    # Origin at ceiling mount point (z=0)

    # Canopy (ceiling mount disc): 100mm diameter, 15mm thick
    bmesh_cylinder(bm, 0.050, -0.015, segments=16,
                   offset=(0, 0, 0), mat_index=2)

    # Cord: thin cylinder, 500mm long, going downward
    bmesh_cylinder(bm, 0.002, -0.500, segments=8,
                   offset=(0, 0, -0.015), mat_index=0)

    # Shade: cone/dome shape, 250mm diameter x 200mm tall
    # Top of shade at z = -0.515 (just below cord)
    # Cone: top radius 0.020 (where cord enters), bottom radius 0.125
    bmesh_cone(bm, 0.020, 0.125, -0.200, segments=20,
               offset=(0, 0, -0.515), cap_top=True, cap_bottom=False, mat_index=1)

    # Inner surface of shade (slightly emissive to suggest light)
    bmesh_cone(bm, 0.018, 0.120, -0.195, segments=20,
               offset=(0, 0, -0.517), cap_top=False, cap_bottom=False, mat_index=3)

    # Rim ring at bottom of shade
    bmesh_ring(bm, 0.125, 0.120, -0.005, segments=20,
               offset=(0, 0, -0.715), mat_index=1)

    obj = create_mesh_object("Pendant_Light_Simple", bm,
                             [mat_black, mat_white_shade, mat_canopy, mat_inner])

    fp = os.path.join(OUTPUT_DIR, "pendant_light_simple.glb")
    export_glb(fp, "pendant_light_simple.glb")


def gen_air_diffuser():
    """7. Ceiling air diffuser (square type)."""
    clear_scene()

    mat_white = make_material("Diffuser_White", (0.90, 0.90, 0.90, 1), 0.5, 0.1)

    bm = bmesh.new()

    # Origin at ceiling surface center. Diffuser recesses upward.

    # Outer frame: 300x300mm, 15mm deep (into ceiling), 15mm wide border
    # Outer box
    bmesh_box(bm, 0.300, 0.300, 0.015, offset=(0, 0, 0.0075), mat_index=0)

    # Inner recess (cut effect - we'll make the inner area a separate slightly
    # recessed panel with vanes)
    # Actually, for low-poly, let's build up the vanes directly

    # Inner opening area = 270mm x 270mm
    # 4 directional vanes (louvers) - simplified as thin flat boxes
    vane_thickness = 0.002
    vane_height = 0.012

    # Horizontal vanes (along X)
    for i in range(4):
        y_offset = -0.090 + i * 0.060  # spread across inner area
        bmesh_box(bm, 0.260, vane_thickness, vane_height,
                  offset=(0, y_offset, 0.007 + vane_height / 2), mat_index=0)

    # Vertical vanes (along Y) - perpendicular set
    for i in range(4):
        x_offset = -0.090 + i * 0.060
        bmesh_box(bm, vane_thickness, 0.260, vane_height,
                  offset=(x_offset, 0, 0.007 + vane_height / 2), mat_index=0)

    # Center hub
    bmesh_cylinder(bm, 0.025, 0.003, segments=12,
                   offset=(0, 0, 0.015), mat_index=0)

    obj = create_mesh_object("Air_Diffuser", bm, [mat_white])

    fp = os.path.join(OUTPUT_DIR, "air_diffuser.glb")
    export_glb(fp, "air_diffuser.glb")


def gen_access_panel():
    """8. Ceiling access panel (点検口)."""
    clear_scene()

    mat_white = make_material("Panel_White", (0.90, 0.90, 0.90, 1), 0.6, 0.0)
    mat_aluminum = make_material("Frame_Aluminum", (0.78, 0.78, 0.80, 1), 0.35, 0.7)

    bm = bmesh.new()

    # Origin at ceiling surface center

    # Panel: 450x450mm, 10mm thick (gypsum board)
    bmesh_box(bm, 0.450, 0.450, 0.010, offset=(0, 0, 0.005), mat_index=0)

    # Aluminum frame: 20mm wide, 3mm thick, around the panel
    frame_outer = 0.450 / 2 + 0.020
    frame_inner = 0.450 / 2
    frame_depth = 0.003

    # Top frame
    bmesh_box(bm, 0.490, 0.020, frame_depth,
              offset=(0, frame_outer - 0.010, -0.001), mat_index=1)
    # Bottom frame
    bmesh_box(bm, 0.490, 0.020, frame_depth,
              offset=(0, -frame_outer + 0.010, -0.001), mat_index=1)
    # Left frame
    bmesh_box(bm, 0.020, 0.450, frame_depth,
              offset=(-frame_outer + 0.010, 0, -0.001), mat_index=1)
    # Right frame
    bmesh_box(bm, 0.020, 0.450, frame_depth,
              offset=(frame_outer - 0.010, 0, -0.001), mat_index=1)

    # Reveal line (subtle groove) - thin indentation around panel edge
    reveal = 0.001
    # Inner reveal lines (4 thin dark strips)
    bmesh_box(bm, 0.450, reveal, 0.002,
              offset=(0, 0.224, -0.001), mat_index=1)
    bmesh_box(bm, 0.450, reveal, 0.002,
              offset=(0, -0.224, -0.001), mat_index=1)
    bmesh_box(bm, reveal, 0.450, 0.002,
              offset=(0.224, 0, -0.001), mat_index=1)
    bmesh_box(bm, reveal, 0.450, 0.002,
              offset=(-0.224, 0, -0.001), mat_index=1)

    obj = create_mesh_object("Access_Panel", bm, [mat_white, mat_aluminum])

    fp = os.path.join(OUTPUT_DIR, "access_panel.glb")
    export_glb(fp, "access_panel.glb")


def gen_exit_sign():
    """9. Emergency exit sign (非常口)."""
    clear_scene()

    mat_body = make_material("Sign_Body", (0.85, 0.85, 0.85, 1), 0.5, 0.0)
    mat_green = make_material("Green_Emissive", (0.0, 0.6, 0.1, 1), 0.3, 0.0,
                              emission_color=(0.0, 0.8, 0.15, 1),
                              emission_strength=4.0)
    mat_bracket = make_material("Bracket_Gray", (0.5, 0.5, 0.5, 1), 0.5, 0.3)

    bm = bmesh.new()

    # Sign box: 300mm x 150mm x 30mm
    # Origin at top-center (ceiling/wall mount point)

    # Main box body
    bmesh_box(bm, 0.300, 0.030, 0.150,
              offset=(0, 0, -0.075), mat_index=0)

    # Green emissive face (front) - slightly proud of the box
    bmesh_box(bm, 0.280, 0.001, 0.130,
              offset=(0, -0.016, -0.075), mat_index=1)

    # Green emissive face (back) - for double-sided visibility
    bmesh_box(bm, 0.280, 0.001, 0.130,
              offset=(0, 0.016, -0.075), mat_index=1)

    # Mounting bracket (L-shape for ceiling mount)
    # Horizontal part (attaches to ceiling)
    bmesh_box(bm, 0.060, 0.060, 0.003,
              offset=(0, 0, 0.0015), mat_index=2)
    # Vertical part (connects to sign)
    bmesh_box(bm, 0.060, 0.003, 0.030,
              offset=(0, 0.028, -0.015), mat_index=2)

    obj = create_mesh_object("Exit_Sign", bm, [mat_body, mat_green, mat_bracket])

    fp = os.path.join(OUTPUT_DIR, "exit_sign.glb")
    export_glb(fp, "exit_sign.glb")


def gen_sprinkler_head():
    """10. Sprinkler head (ceiling mount)."""
    clear_scene()

    mat_chrome = make_material("Chrome", (0.85, 0.85, 0.88, 1), 0.15, 1.0)
    mat_white = make_material("Escutcheon_White", (0.90, 0.90, 0.90, 1), 0.5, 0.0)

    bm = bmesh.new()

    # Origin at ceiling surface level (z=0)

    # Escutcheon ring: 60mm diameter flush ring, 3mm thick
    bmesh_ring(bm, 0.030, 0.010, -0.003, segments=16,
               offset=(0, 0, 0), mat_index=1)

    # Pipe stub going into ceiling
    bmesh_cylinder(bm, 0.008, 0.025, segments=8,
                   offset=(0, 0, 0), mat_index=0)

    # Pendant pipe below ceiling
    bmesh_cylinder(bm, 0.008, -0.030, segments=8,
                   offset=(0, 0, -0.003), mat_index=0)

    # Sprinkler head body (wider part at bottom)
    bmesh_cone(bm, 0.008, 0.015, -0.010, segments=10,
               offset=(0, 0, -0.033), mat_index=0)

    # Deflector plate at very bottom
    bmesh_cylinder(bm, 0.018, -0.002, segments=12,
                   offset=(0, 0, -0.045), mat_index=0)

    # Bulb (tiny glass element) - simplified as small sphere-like shape
    bmesh_cone(bm, 0.003, 0.003, -0.008, segments=6,
               offset=(0, 0, -0.035), cap_top=True, cap_bottom=True, mat_index=0)

    obj = create_mesh_object("Sprinkler_Head", bm, [mat_chrome, mat_white])

    fp = os.path.join(OUTPUT_DIR, "sprinkler_head.glb")
    export_glb(fp, "sprinkler_head.glb")


def gen_smoke_detector():
    """11. Smoke detector (ceiling mount)."""
    clear_scene()

    mat_white = make_material("Detector_White", (0.90, 0.90, 0.90, 1), 0.6, 0.0)
    mat_led = make_material("LED_Red", (0.8, 0.0, 0.0, 1), 0.3, 0.0,
                            emission_color=(1, 0, 0, 1), emission_strength=3.0)

    bm = bmesh.new()

    # Origin at ceiling surface (z=0). Detector protrudes downward.

    # Base plate (flush with ceiling)
    bmesh_cylinder(bm, 0.050, -0.005, segments=20,
                   offset=(0, 0, 0), mat_index=0)

    # Main dome body - slight dome shape using stacked cylinders
    bmesh_cylinder(bm, 0.048, -0.010, segments=20,
                   offset=(0, 0, -0.005), mat_index=0)
    bmesh_cone(bm, 0.048, 0.040, -0.010, segments=20,
               offset=(0, 0, -0.015), mat_index=0)
    bmesh_cone(bm, 0.040, 0.020, -0.008, segments=20,
               offset=(0, 0, -0.025), mat_index=0)

    # LED indicator dot (small cylinder on the side)
    bmesh_cylinder(bm, 0.003, -0.002, segments=8,
                   offset=(0.035, 0, -0.012), mat_index=1)

    obj = create_mesh_object("Smoke_Detector", bm, [mat_white, mat_led])

    fp = os.path.join(OUTPUT_DIR, "smoke_detector.glb")
    export_glb(fp, "smoke_detector.glb")


def gen_outlet_plate():
    """12. Electrical outlet face plate (壁コンセント)."""
    clear_scene()

    mat_white = make_material("Plate_White", (0.90, 0.90, 0.90, 1), 0.6, 0.0)
    mat_slot = make_material("Slot_Dark", (0.15, 0.15, 0.15, 1), 0.5, 0.0)

    bm = bmesh.new()

    # Origin at wall surface center. Plate sits proud of wall by 5mm.
    # Plate: 70mm x 120mm x 5mm (width x height x depth)
    # Wall is at Y=0, plate extends in -Y (toward room)

    # Main plate
    bmesh_box(bm, 0.070, 0.005, 0.120, offset=(0, -0.0025, 0), mat_index=0)

    # Upper outlet (two parallel slots + ground)
    slot_y = -0.006  # slightly proud of plate face
    # Left slot
    bmesh_box(bm, 0.008, 0.002, 0.003,
              offset=(-0.008, slot_y, 0.025), mat_index=1)
    # Right slot
    bmesh_box(bm, 0.008, 0.002, 0.003,
              offset=(0.008, slot_y, 0.025), mat_index=1)
    # Ground (semicircle approximated by small box)
    bmesh_box(bm, 0.005, 0.002, 0.005,
              offset=(0, slot_y, 0.015), mat_index=1)

    # Lower outlet (same pattern, offset down)
    bmesh_box(bm, 0.008, 0.002, 0.003,
              offset=(-0.008, slot_y, -0.025), mat_index=1)
    bmesh_box(bm, 0.008, 0.002, 0.003,
              offset=(0.008, slot_y, -0.025), mat_index=1)
    bmesh_box(bm, 0.005, 0.002, 0.005,
              offset=(0, slot_y, -0.035), mat_index=1)

    # Slight bevel / frame edge (thinner surrounding border)
    bmesh_box(bm, 0.074, 0.002, 0.124, offset=(0, -0.001, 0), mat_index=0)

    obj = create_mesh_object("Outlet_Plate", bm, [mat_white, mat_slot])

    fp = os.path.join(OUTPUT_DIR, "outlet_plate.glb")
    export_glb(fp, "outlet_plate.glb")


def gen_switch_plate():
    """13. Light switch face plate."""
    clear_scene()

    mat_white = make_material("Plate_White", (0.90, 0.90, 0.90, 1), 0.6, 0.0)
    mat_switch = make_material("Switch_LightGray", (0.80, 0.80, 0.80, 1), 0.4, 0.0)

    bm = bmesh.new()

    # Origin at wall surface center

    # Main plate: 70mm x 120mm x 5mm
    bmesh_box(bm, 0.070, 0.005, 0.120, offset=(0, -0.0025, 0), mat_index=0)

    # Rocker switch element: 40mm x 60mm, slightly proud
    # Wide rocker style (Japanese style) with dividing line
    bmesh_box(bm, 0.040, 0.004, 0.055,
              offset=(0, -0.007, 0), mat_index=1)

    # Dividing line in the middle of rocker (very thin)
    bmesh_box(bm, 0.040, 0.001, 0.001,
              offset=(0, -0.010, 0), mat_index=0)

    # Small indicator dot (like a pilot light)
    bmesh_cylinder(bm, 0.002, -0.001, segments=8,
                   offset=(0, -0.010, 0.020), mat_index=1)

    # Surrounding frame edge
    bmesh_box(bm, 0.074, 0.002, 0.124, offset=(0, -0.001, 0), mat_index=0)

    obj = create_mesh_object("Switch_Plate", bm, [mat_white, mat_switch])

    fp = os.path.join(OUTPUT_DIR, "switch_plate.glb")
    export_glb(fp, "switch_plate.glb")


# ============================================================
# Main Execution
# ============================================================

def main():
    print("=" * 60)
    print("Generating Architectural Equipment GLB Models")
    print("=" * 60)
    print(f"Output directory: {OUTPUT_DIR}")
    print()

    generators = [
        ("1/13 Downlight (Recessed)", gen_downlight_recessed),
        ("2/13 Spot Light", gen_spot_light),
        ("3/13 Track Light Rail", gen_track_light_rail),
        ("4/13 Wall Sconce", gen_wall_sconce),
        ("5/13 Indirect Light Cove", gen_indirect_light_cove),
        ("6/13 Pendant Light (Simple)", gen_pendant_light_simple),
        ("7/13 Air Diffuser", gen_air_diffuser),
        ("8/13 Access Panel", gen_access_panel),
        ("9/13 Exit Sign", gen_exit_sign),
        ("10/13 Sprinkler Head", gen_sprinkler_head),
        ("11/13 Smoke Detector", gen_smoke_detector),
        ("12/13 Outlet Plate", gen_outlet_plate),
        ("13/13 Switch Plate", gen_switch_plate),
    ]

    total_size = 0
    results = []

    for label, gen_func in generators:
        print(f"\n[{label}]")
        try:
            gen_func()
            results.append((label, "OK"))
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
            results.append((label, f"FAIL: {e}"))

    # Summary
    print("\n" + "=" * 60)
    print("GENERATION COMPLETE - Summary:")
    print("=" * 60)

    for label, status in results:
        print(f"  {label}: {status}")

    # List all generated files with sizes
    print("\nGenerated files:")
    total = 0
    for fname in sorted(os.listdir(OUTPUT_DIR)):
        fpath = os.path.join(OUTPUT_DIR, fname)
        if fname.endswith('.glb') and os.path.isfile(fpath):
            sz = os.path.getsize(fpath)
            # Only list our files
            if fname in [
                "downlight_recessed.glb", "spot_light.glb",
                "track_light_rail.glb", "wall_sconce.glb",
                "indirect_light_cove.glb", "pendant_light_simple.glb",
                "air_diffuser.glb", "access_panel.glb",
                "exit_sign.glb", "sprinkler_head.glb",
                "smoke_detector.glb", "outlet_plate.glb",
                "switch_plate.glb"
            ]:
                total += sz
                print(f"  {fname}: {sz/1024:.1f} KB")

    print(f"\nTotal size of new models: {total/1024:.1f} KB")
    print("Done!")


if __name__ == "__main__":
    main()
