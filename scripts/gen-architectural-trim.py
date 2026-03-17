"""
gen-architectural-trim.py
Generate low-poly interior finishing trim and millwork GLB models.
Uses bmesh for all geometry creation. Runs in Blender --background mode.

Models:
  baseboard.glb, crown_molding.glb, baseboard_wood.glb, trim_reveal.glb,
  counter_straight.glb, counter_l_shape.glb, bar_counter.glb,
  glass_partition.glb, decorative_column.glb, dropped_ceiling_frame.glb,
  niche_alcove.glb
"""

import bpy
import bmesh
import os
import math
from mathutils import Vector, Matrix

OUTPUT_DIR = r"C:\Users\y-suz\porano-perse\public\models"


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def clear_scene():
    """Remove all objects, meshes, materials from the scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Ensure we have a scene
    if not bpy.context.scene:
        bpy.ops.scene.new()


def make_material(name, base_color=(0.8, 0.8, 0.8, 1.0), roughness=0.5,
                  metallic=0.0, transmission=0.0, alpha=1.0):
    """Create a Principled BSDF material and return it."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if transmission > 0:
        bsdf.inputs["Transmission Weight"].default_value = transmission
        bsdf.inputs["IOR"].default_value = 1.45
        mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else None
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
    return mat


def finalize_bmesh(bm, name, material=None, origin_offset=None):
    """Convert bmesh to a Blender object, assign material, return object."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    if material:
        obj.data.materials.append(material)

    if origin_offset:
        # Move geometry so that origin is at the desired point
        for v in obj.data.vertices:
            v.co -= Vector(origin_offset)

    return obj


def export_glb(filepath):
    """Select all and export as GLB."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
    )
    print(f"  -> Exported: {filepath}")


def extrude_profile_along_x(profile_verts, length, close_caps=True):
    """
    Extrude a 2D profile (list of (y, z) tuples) along the X axis.
    Returns a bmesh with the extruded geometry.
    Profile is at x=0 and extruded to x=length.
    """
    bm = bmesh.new()

    n = len(profile_verts)
    # Front face verts (x=0)
    front = []
    for (y, z) in profile_verts:
        front.append(bm.verts.new((0.0, y, z)))

    # Back face verts (x=length)
    back = []
    for (y, z) in profile_verts:
        back.append(bm.verts.new((length, y, z)))

    bm.verts.ensure_lookup_table()

    # Side faces
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([front[i], front[j], back[j], back[i]])

    # Cap faces
    if close_caps:
        bm.faces.new(front[::-1])  # front cap (normal -X)
        bm.faces.new(back)         # back cap (normal +X)

    bm.normal_update()
    return bm


def make_box_bmesh(bm, x0, y0, z0, x1, y1, z1):
    """Add a box to an existing bmesh. Returns the 8 verts."""
    verts = [
        bm.verts.new((x0, y0, z0)),
        bm.verts.new((x1, y0, z0)),
        bm.verts.new((x1, y1, z0)),
        bm.verts.new((x0, y1, z0)),
        bm.verts.new((x0, y0, z1)),
        bm.verts.new((x1, y0, z1)),
        bm.verts.new((x1, y1, z1)),
        bm.verts.new((x0, y1, z1)),
    ]
    # 6 faces: bottom, top, front, back, left, right
    bm.faces.new([verts[0], verts[3], verts[2], verts[1]])  # bottom (z0)
    bm.faces.new([verts[4], verts[5], verts[6], verts[7]])  # top (z1)
    bm.faces.new([verts[0], verts[1], verts[5], verts[4]])  # front (y0)
    bm.faces.new([verts[2], verts[3], verts[7], verts[6]])  # back (y1)
    bm.faces.new([verts[0], verts[4], verts[7], verts[3]])  # left (x0)
    bm.faces.new([verts[1], verts[2], verts[6], verts[5]])  # right (x1)
    return verts


def make_single_box(name, x0, y0, z0, x1, y1, z1, material=None):
    """Create a box as a standalone object."""
    bm = bmesh.new()
    make_box_bmesh(bm, x0, y0, z0, x1, y1, z1)
    bm.normal_update()
    return finalize_bmesh(bm, name, material)


# ---------------------------------------------------------------------------
# 1. baseboard.glb (巾木) — white paint
# ---------------------------------------------------------------------------
def gen_baseboard():
    clear_scene()
    print("Generating baseboard.glb ...")

    # Profile: 60mm high x 10mm deep, slight top chamfer (2mm)
    # Looking from the end (YZ plane): wall is at Y=0, room side at Y=-0.01
    # Bottom at Z=0
    h = 0.060   # 60mm
    d = 0.010   # 10mm
    c = 0.002   # 2mm chamfer

    profile = [
        (0.0, 0.0),       # bottom-back (wall side)
        (-d, 0.0),        # bottom-front
        (-d, h - c),      # front face up to chamfer
        (-d + c, h),      # chamfer top-front
        (0.0, h),         # top-back
    ]

    bm = extrude_profile_along_x(profile, 1.0)
    mat = make_material("WhitePaint", (0.92, 0.91, 0.89, 1.0), roughness=0.3)
    obj = finalize_bmesh(bm, "Baseboard", mat)

    export_glb(os.path.join(OUTPUT_DIR, "baseboard.glb"))
    print("  baseboard.glb done.\n")


# ---------------------------------------------------------------------------
# 2. crown_molding.glb (廻縁) — concave curve, white paint
# ---------------------------------------------------------------------------
def gen_crown_molding():
    clear_scene()
    print("Generating crown_molding.glb ...")

    # 40mm x 40mm cross-section with concave curve
    # Sits at wall-ceiling junction: wall at Y=0, ceiling at Z=0 (top)
    # Profile in YZ: from wall (Y=0) to ceiling edge
    size = 0.040
    steps = 8

    profile = [(0.0, 0.0)]  # wall-ceiling corner (back-top)

    # Concave curve from (0, -size) to (-size, 0)
    # Quarter circle, concave = center at (-size, -size)
    for i in range(steps + 1):
        angle = (math.pi / 2) * (i / steps)
        y = -size * math.sin(angle)
        z = -size * math.cos(angle)
        profile.append((y, z))

    # Close back to wall
    profile.append((0.0, -size))

    bm = extrude_profile_along_x(profile, 1.0)
    mat = make_material("WhitePaint", (0.92, 0.91, 0.89, 1.0), roughness=0.3)
    obj = finalize_bmesh(bm, "CrownMolding", mat)

    export_glb(os.path.join(OUTPUT_DIR, "crown_molding.glb"))
    print("  crown_molding.glb done.\n")


# ---------------------------------------------------------------------------
# 3. baseboard_wood.glb (木製巾木) — same shape, wood material
# ---------------------------------------------------------------------------
def gen_baseboard_wood():
    clear_scene()
    print("Generating baseboard_wood.glb ...")

    h = 0.060
    d = 0.010
    c = 0.002

    profile = [
        (0.0, 0.0),
        (-d, 0.0),
        (-d, h - c),
        (-d + c, h),
        (0.0, h),
    ]

    bm = extrude_profile_along_x(profile, 1.0)
    mat = make_material("WoodMedium", (0.45, 0.28, 0.15, 1.0), roughness=0.5)
    obj = finalize_bmesh(bm, "BaseboardWood", mat)

    export_glb(os.path.join(OUTPUT_DIR, "baseboard_wood.glb"))
    print("  baseboard_wood.glb done.\n")


# ---------------------------------------------------------------------------
# 4. trim_reveal.glb (見切り材) — L-shape, aluminum
# ---------------------------------------------------------------------------
def gen_trim_reveal():
    clear_scene()
    print("Generating trim_reveal.glb ...")

    # L-shaped: 20mm x 20mm, 3mm thickness
    a = 0.020   # arm length
    t = 0.003   # thickness

    # Profile (YZ): L-shape outer boundary
    profile = [
        (0.0, 0.0),      # inside corner
        (-a, 0.0),        # horizontal arm end, bottom
        (-a, t),          # horizontal arm end, top
        (-t, t),          # inside step
        (-t, a),          # vertical arm top, inner
        (0.0, a),         # vertical arm top, outer
    ]

    bm = extrude_profile_along_x(profile, 1.0)
    mat = make_material("AluminumSilver", (0.78, 0.78, 0.80, 1.0),
                        roughness=0.25, metallic=0.9)
    obj = finalize_bmesh(bm, "TrimReveal", mat)

    export_glb(os.path.join(OUTPUT_DIR, "trim_reveal.glb"))
    print("  trim_reveal.glb done.\n")


# ---------------------------------------------------------------------------
# 5. counter_straight.glb — Straight counter
# ---------------------------------------------------------------------------
def gen_counter_straight():
    clear_scene()
    print("Generating counter_straight.glb ...")

    W = 2.0
    D = 0.6
    H = 0.85
    top_t = 0.04    # 40mm top thickness
    overhang = 0.03  # 30mm front overhang
    panel_t = 0.02   # 20mm front panel

    mat_stone = make_material("StoneTop", (0.82, 0.80, 0.78, 1.0), roughness=0.2)
    mat_wood = make_material("WoodFront", (0.45, 0.28, 0.15, 1.0), roughness=0.5)

    # Counter top: centered on X, front overhang on Y
    # Origin at bottom-center of the counter
    # X: -W/2 to W/2, Y: -overhang to D, Z: H-top_t to H
    top = make_single_box("CounterTop",
                          -W/2, -overhang, H - top_t,
                          W/2, D, H,
                          mat_stone)

    # Front panel: full height, at front edge (Y=0)
    panel = make_single_box("FrontPanel",
                            -W/2, 0.0, 0.0,
                            W/2, panel_t, H - top_t,
                            mat_wood)

    export_glb(os.path.join(OUTPUT_DIR, "counter_straight.glb"))
    print("  counter_straight.glb done.\n")


# ---------------------------------------------------------------------------
# 6. counter_l_shape.glb — L-shaped counter
# ---------------------------------------------------------------------------
def gen_counter_l_shape():
    clear_scene()
    print("Generating counter_l_shape.glb ...")

    # L-shape: one arm 2.0m along X, another 1.5m along Y
    # Consistent 600mm depth, H=0.85m
    arm1_len = 2.0   # along +X
    arm2_len = 1.5   # along +Y
    depth = 0.6
    H = 0.85
    top_t = 0.04
    panel_t = 0.02

    mat_stone = make_material("StoneTop", (0.82, 0.80, 0.78, 1.0), roughness=0.2)
    mat_wood = make_material("WoodFront", (0.45, 0.28, 0.15, 1.0), roughness=0.5)

    # Corner is at origin. Arm1 goes +X, Arm2 goes +Y.
    # Inner wall corner at (0, 0).
    # Arm1 top: X: 0 to arm1_len, Y: 0 to depth, Z: H-top_t to H
    make_single_box("Arm1Top",
                    0, 0, H - top_t,
                    arm1_len, depth, H,
                    mat_stone)

    # Arm2 top: X: 0 to depth, Y: depth to arm2_len, Z: H-top_t to H
    make_single_box("Arm2Top",
                    0, depth, H - top_t,
                    depth, arm2_len, H,
                    mat_stone)

    # Arm1 front panel: along front of arm1 (Y = depth side, customer side)
    make_single_box("Arm1FrontPanel",
                    depth, depth - panel_t, 0,
                    arm1_len, depth, H - top_t,
                    mat_wood)

    # Arm2 front panel: along front of arm2 (X = depth side)
    make_single_box("Arm2FrontPanel",
                    depth - panel_t, depth, 0,
                    depth, arm2_len, H - top_t,
                    mat_wood)

    export_glb(os.path.join(OUTPUT_DIR, "counter_l_shape.glb"))
    print("  counter_l_shape.glb done.\n")


# ---------------------------------------------------------------------------
# 7. bar_counter.glb — Bar counter
# ---------------------------------------------------------------------------
def gen_bar_counter():
    clear_scene()
    print("Generating bar_counter.glb ...")

    W = 2.5
    D = 0.5
    H = 1.05
    top_t = 0.04
    cust_overhang = 0.15  # customer side overhang
    panel_t = 0.02
    rail_r = 0.015  # footrest rail radius
    rail_h = 0.15   # 15cm above floor

    mat_dark_wood = make_material("DarkWoodTop", (0.25, 0.14, 0.08, 1.0), roughness=0.4)
    mat_panel = make_material("PaintedPanel", (0.35, 0.33, 0.31, 1.0), roughness=0.35)
    mat_metal = make_material("MetalRail", (0.6, 0.58, 0.56, 1.0),
                              roughness=0.3, metallic=0.8)

    # Top: customer side has overhang
    # Origin bottom-center. Staff side at Y=D, Customer side at Y=-cust_overhang
    make_single_box("BarTop",
                    -W/2, -cust_overhang, H - top_t,
                    W/2, D, H,
                    mat_dark_wood)

    # Front panel (customer side, at Y=0)
    make_single_box("BarFrontPanel",
                    -W/2, 0.0, 0.0,
                    W/2, panel_t, H - top_t,
                    mat_panel)

    # Footrest rail — approximate with an octagonal cylinder
    # Along X axis at Y = -rail_r*2 (customer side), Z = rail_h
    bm = bmesh.new()
    segments = 8
    for xi, xpos in enumerate([(-W/2, W/2)]):
        x0, x1 = xpos
        rail_cy = -0.04  # slightly in front of front panel
        rail_cz = rail_h

        front_verts = []
        back_verts = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            y = rail_cy + rail_r * math.cos(angle)
            z = rail_cz + rail_r * math.sin(angle)
            front_verts.append(bm.verts.new((x0, y, z)))
            back_verts.append(bm.verts.new((x1, y, z)))

        bm.verts.ensure_lookup_table()

        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new([front_verts[i], front_verts[j],
                          back_verts[j], back_verts[i]])

        bm.faces.new(front_verts[::-1])
        bm.faces.new(back_verts)

    bm.normal_update()
    finalize_bmesh(bm, "FootrestRail", mat_metal)

    export_glb(os.path.join(OUTPUT_DIR, "bar_counter.glb"))
    print("  bar_counter.glb done.\n")


# ---------------------------------------------------------------------------
# 8. glass_partition.glb — Glass partition panel
# ---------------------------------------------------------------------------
def gen_glass_partition():
    clear_scene()
    print("Generating glass_partition.glb ...")

    W = 1.0
    H = 2.1
    frame_profile = 0.03  # 3cm
    glass_t = 0.012       # 12mm glass
    frame_t = 0.035       # frame slightly thicker

    mat_alum = make_material("Aluminum", (0.75, 0.75, 0.77, 1.0),
                             roughness=0.25, metallic=0.9)
    mat_glass = make_material("Glass", (0.9, 0.95, 0.95, 1.0),
                              roughness=0.05, transmission=0.9, alpha=0.15)

    # Bottom frame rail
    make_single_box("BottomFrame",
                    -W/2, -frame_t/2, 0.0,
                    W/2, frame_t/2, frame_profile,
                    mat_alum)

    # Top frame rail
    make_single_box("TopFrame",
                    -W/2, -frame_t/2, H - frame_profile,
                    W/2, frame_t/2, H,
                    mat_alum)

    # Glass panel (between frames)
    make_single_box("GlassPanel",
                    -W/2, -glass_t/2, frame_profile,
                    W/2, glass_t/2, H - frame_profile,
                    mat_glass)

    export_glb(os.path.join(OUTPUT_DIR, "glass_partition.glb"))
    print("  glass_partition.glb done.\n")


# ---------------------------------------------------------------------------
# 9. decorative_column.glb — Square column wrap
# ---------------------------------------------------------------------------
def gen_decorative_column():
    clear_scene()
    print("Generating decorative_column.glb ...")

    S = 0.30     # 300mm side
    H = 2.70     # 2700mm height
    trim_h = 0.005  # 5mm reveal trim band
    trim_ext = 0.003  # 3mm extension beyond column face

    mat_white = make_material("WhitePaint", (0.92, 0.91, 0.89, 1.0), roughness=0.3)

    # Main column body — origin at bottom center
    make_single_box("ColumnBody",
                    -S/2, -S/2, 0.0,
                    S/2, S/2, H,
                    mat_white)

    # Bottom trim band
    e = trim_ext
    make_single_box("BottomTrim",
                    -S/2 - e, -S/2 - e, 0.0,
                    S/2 + e, S/2 + e, trim_h,
                    mat_white)

    # Top trim band
    make_single_box("TopTrim",
                    -S/2 - e, -S/2 - e, H - trim_h,
                    S/2 + e, S/2 + e, H,
                    mat_white)

    export_glb(os.path.join(OUTPUT_DIR, "decorative_column.glb"))
    print("  decorative_column.glb done.\n")


# ---------------------------------------------------------------------------
# 10. dropped_ceiling_frame.glb — Dropped ceiling edge profile (1m segment)
# ---------------------------------------------------------------------------
def gen_dropped_ceiling_frame():
    clear_scene()
    print("Generating dropped_ceiling_frame.glb ...")

    drop = 0.200   # 200mm drop
    ext = 0.050    # 50mm extension from wall
    t = 0.0125     # 12.5mm gypsum board thickness

    # Profile in YZ plane. Wall at Y=0, extending into room at -Y.
    # Top of profile at Z=0 (ceiling), drop goes downward to Z=-drop.
    # L-shaped cross section representing the step:
    #   Horizontal soffit: Y=0 to Y=-ext at Z=-drop
    #   Vertical face: Y=-ext from Z=0 to Z=-drop
    #   Wall-side: Y=0 from Z=0 to Z=-drop (hidden, but close the shape)

    # Outer boundary of L-shape (with thickness)
    profile = [
        (0.0, 0.0),                  # top-wall corner
        (-(ext + t), 0.0),           # top-outer (vertical face outer)
        (-(ext + t), -(drop + t)),   # bottom-outer corner
        (0.0, -(drop + t)),          # bottom-wall side (soffit outer)
        (0.0, -drop),                # bottom-wall inner
        (-ext, -drop),               # soffit inner corner
        (-ext, -t),                  # vertical inner top
        (0.0, -t),                   # wall inner (above soffit)
    ]

    bm = extrude_profile_along_x(profile, 1.0)
    mat = make_material("GypsumWhite", (0.93, 0.92, 0.90, 1.0), roughness=0.6)
    obj = finalize_bmesh(bm, "DroppedCeilingFrame", mat)

    export_glb(os.path.join(OUTPUT_DIR, "dropped_ceiling_frame.glb"))
    print("  dropped_ceiling_frame.glb done.\n")


# ---------------------------------------------------------------------------
# 11. niche_alcove.glb — Wall niche/alcove
# ---------------------------------------------------------------------------
def gen_niche_alcove():
    clear_scene()
    print("Generating niche_alcove.glb ...")

    # Wall section: 1.0m W x 1.2m H x 0.12m thick
    wall_w = 1.0
    wall_h = 1.2
    wall_t = 0.12

    # Niche: centered, 0.6m W x 0.8m H x 0.15m deep (but limited by wall thickness)
    niche_w = 0.6
    niche_h = 0.8
    niche_d = min(0.15, wall_t - 0.02)  # leave 20mm backing minimum
    # niche_d = 0.10 (since wall is 0.12m)
    niche_d = 0.10

    # Niche center: vertically centered at wall_h * 0.55 (slightly above center)
    niche_cz = wall_h * 0.55

    mat_wall = make_material("WallWhite", (0.93, 0.92, 0.90, 1.0), roughness=0.5)
    mat_niche = make_material("NicheInterior", (0.82, 0.81, 0.79, 1.0), roughness=0.5)

    # Build wall with niche as multiple boxes using bmesh
    # Wall is at Y=0 (front face) to Y=wall_t (back face)
    # Niche opens from Y=0 going into Y=niche_d

    # Strategy: build 5 wall segments around the niche opening
    # + 3 niche interior faces (back, top, bottom, left, right are boxes)

    niche_x0 = -niche_w / 2
    niche_x1 = niche_w / 2
    niche_z0 = niche_cz - niche_h / 2
    niche_z1 = niche_cz + niche_h / 2

    # Left wall section
    make_single_box("WallLeft",
                    -wall_w/2, 0.0, 0.0,
                    niche_x0, wall_t, wall_h,
                    mat_wall)

    # Right wall section
    make_single_box("WallRight",
                    niche_x1, 0.0, 0.0,
                    wall_w/2, wall_t, wall_h,
                    mat_wall)

    # Bottom wall section (below niche)
    make_single_box("WallBottom",
                    niche_x0, 0.0, 0.0,
                    niche_x1, wall_t, niche_z0,
                    mat_wall)

    # Top wall section (above niche)
    make_single_box("WallTop",
                    niche_x0, 0.0, niche_z1,
                    niche_x1, wall_t, wall_h,
                    mat_wall)

    # Wall behind niche (thin back)
    make_single_box("WallBehindNiche",
                    niche_x0, niche_d, niche_z0,
                    niche_x1, wall_t, niche_z1,
                    mat_wall)

    # Niche interior — back face
    make_single_box("NicheBack",
                    niche_x0, niche_d - 0.003, niche_z0,
                    niche_x1, niche_d, niche_z1,
                    mat_niche)

    # Niche interior — top face (horizontal slab)
    make_single_box("NicheTop",
                    niche_x0, 0.0, niche_z1 - 0.003,
                    niche_x1, niche_d, niche_z1,
                    mat_niche)

    # Niche interior — bottom face
    make_single_box("NicheBottom",
                    niche_x0, 0.0, niche_z0,
                    niche_x1, niche_d, niche_z0 + 0.003,
                    mat_niche)

    # Niche interior — left side
    make_single_box("NicheLeft",
                    niche_x0, 0.0, niche_z0,
                    niche_x0 + 0.003, niche_d, niche_z1,
                    mat_niche)

    # Niche interior — right side
    make_single_box("NicheRight",
                    niche_x1 - 0.003, 0.0, niche_z0,
                    niche_x1, niche_d, niche_z1,
                    mat_niche)

    export_glb(os.path.join(OUTPUT_DIR, "niche_alcove.glb"))
    print("  niche_alcove.glb done.\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("Generating architectural trim & millwork models ...")
    print("Output: " + OUTPUT_DIR)
    print("=" * 60)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    gen_baseboard()
    gen_crown_molding()
    gen_baseboard_wood()
    gen_trim_reveal()
    gen_counter_straight()
    gen_counter_l_shape()
    gen_bar_counter()
    gen_glass_partition()
    gen_decorative_column()
    gen_dropped_ceiling_frame()
    gen_niche_alcove()

    print("=" * 60)
    print("All 11 architectural trim models generated successfully!")
    print("=" * 60)


if __name__ == "__main__":
    main()
