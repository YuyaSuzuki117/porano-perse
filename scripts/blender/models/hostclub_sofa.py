"""Hostclub L-shaped Sofa — high-quality Blender model via bmesh.

Produces a luxury L-shaped sofa for hostclub/VIP scenes:
- L-shape: seat width 600mm, backrest height 700mm, seat height 400mm
- Rounded cushion feel with bevel
- Dark leather material (Roughness 0.3, dark purple/black)
- All geometry via bmesh (no bpy.ops mesh primitives)
"""

import bpy
import bmesh
import math
from mathutils import Vector, Matrix


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def _get_dark_leather_material():
    """Dark leather with subtle noise variation — hostclub purple/black."""
    mat = bpy.data.materials.get("M_DarkLeather_HC")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_DarkLeather_HC")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (400, 0)
    # Dark purple-black base
    principled.inputs["Base Color"].default_value = (0.035, 0.015, 0.04, 1.0)
    principled.inputs["Roughness"].default_value = 0.3
    principled.inputs["Metallic"].default_value = 0.0
    try:
        principled.inputs["Specular IOR Level"].default_value = 0.45
    except KeyError:
        pass

    # Subtle leather grain via noise -> roughness variation
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-800, 0)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-600, 0)
    mapping.inputs["Scale"].default_value = (12.0, 12.0, 12.0)

    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-380, 0)
    noise.inputs["Scale"].default_value = 45.0
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.6

    # Roughness ramp for leather grain
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-140, 0)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[0].color = (0.24, 0.24, 0.24, 1.0)
    ramp.color_ramp.elements[1].color = (0.38, 0.38, 0.38, 1.0)

    # Color variation (very subtle purple shift)
    color_noise = nodes.new("ShaderNodeTexNoise")
    color_noise.location = (-380, -200)
    color_noise.inputs["Scale"].default_value = 6.0
    color_noise.inputs["Detail"].default_value = 4.0
    color_noise.inputs["Roughness"].default_value = 0.5

    color_ramp = nodes.new("ShaderNodeValToRGB")
    color_ramp.location = (-140, -200)
    color_ramp.color_ramp.elements[0].position = 0.3
    color_ramp.color_ramp.elements[1].position = 0.7
    color_ramp.color_ramp.elements[0].color = (0.025, 0.01, 0.03, 1.0)
    color_ramp.color_ramp.elements[1].color = (0.05, 0.02, 0.055, 1.0)

    # Bump for leather texture
    bump = nodes.new("ShaderNodeBump")
    bump.location = (200, -120)
    bump.inputs["Strength"].default_value = 0.025

    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    links.new(mapping.outputs["Vector"], color_noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Roughness"])
    links.new(color_noise.outputs["Fac"], color_ramp.inputs["Fac"])
    links.new(color_ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    return mat


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _assign_material(obj, material):
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)


def _set_smooth(obj):
    """Set smooth shading on all faces via mesh data (no bpy.ops)."""
    if obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True
        obj.data.update()


def _create_box_bmesh(name, width, depth, height, location, material,
                      parent=None, bevel_width=0.012):
    """Create a rounded box using bmesh with bevel for cushion feel."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    # Create box centered at origin
    bmesh.ops.create_cube(bm, size=1.0)

    # Scale to target dimensions
    bmesh.ops.scale(bm, vec=(width, depth, height),
                    verts=bm.verts[:])

    # Bevel all edges for rounded cushion appearance
    if bevel_width > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:],
                        offset=bevel_width, segments=3,
                        affect='EDGES')

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    _assign_material(obj, material)
    _set_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def _create_cylinder_bmesh(name, radius, depth, location, material,
                           parent=None, segments=32):
    """Create a cylinder using bmesh for sofa legs/feet."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False,
                          segments=segments, radius1=radius, radius2=radius,
                          depth=depth)

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    _assign_material(obj, material)
    _set_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def _get_sofa_leg_material():
    """Small dark metal feet for sofa base."""
    mat = bpy.data.materials.get("M_SofaLeg_HC")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_SofaLeg_HC")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (200, 0)
    principled.inputs["Base Color"].default_value = (0.01, 0.01, 0.01, 1.0)
    principled.inputs["Roughness"].default_value = 0.25
    principled.inputs["Metallic"].default_value = 0.9

    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return mat


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def create_hostclub_sofa(name="HostclubSofa", location=(0, 0, 0)):
    """Create an L-shaped hostclub sofa at the given location.

    Dimensions (meters):
    - Seat width (depth): 0.6m
    - Backrest height: 0.7m (from floor)
    - Seat height: 0.4m
    - L-shape: long side ~1.8m, short side ~1.2m

    Returns the root Empty parent object.
    """
    leather = _get_dark_leather_material()
    leg_mat = _get_sofa_leg_material()

    # Parent empty
    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent.location = location

    # --- Dimensions (meters) ---
    seat_depth = 0.60       # Front-to-back of seat cushion
    seat_height = 0.40      # Floor to seat surface
    backrest_h = 0.30       # Backrest above seat (total 0.70m from floor)
    backrest_thick = 0.12   # Backrest thickness
    cushion_thick = 0.14    # Seat cushion thickness
    base_height = seat_height - cushion_thick  # 0.26m base frame

    long_side = 1.80        # Long arm of L
    short_side = 1.20       # Short arm of L
    arm_width = 0.10        # Armrest width
    arm_height = 0.25       # Armrest above seat

    # --- BASE FRAME (L-shape: two boxes) ---
    # Long side base
    _create_box_bmesh(
        f"{name}_Base_Long",
        width=long_side, depth=seat_depth, height=base_height,
        location=(0, 0, base_height / 2),
        material=leather, parent=parent, bevel_width=0.008,
    )
    # Short side base (perpendicular, at -X end)
    short_base_x = -(long_side / 2) + (seat_depth / 2)
    short_base_y = (seat_depth / 2) + (short_side - seat_depth) / 2
    _create_box_bmesh(
        f"{name}_Base_Short",
        width=seat_depth, depth=short_side - seat_depth, height=base_height,
        location=(short_base_x, short_base_y, base_height / 2),
        material=leather, parent=parent, bevel_width=0.008,
    )

    # --- SEAT CUSHIONS ---
    # Long side cushion (split into 3 segments)
    cushion_gap = 0.01
    n_cushions_long = 3
    cushion_w = (long_side - cushion_gap * (n_cushions_long + 1)) / n_cushions_long
    for i in range(n_cushions_long):
        cx = -(long_side / 2) + cushion_gap + cushion_w / 2 + i * (cushion_w + cushion_gap)
        _create_box_bmesh(
            f"{name}_SeatCush_L{i}",
            width=cushion_w, depth=seat_depth - 0.02, height=cushion_thick,
            location=(cx, 0, base_height + cushion_thick / 2),
            material=leather, parent=parent, bevel_width=0.018,
        )

    # Short side cushion (2 segments)
    n_cushions_short = 2
    short_cush_len = (short_side - seat_depth - cushion_gap * (n_cushions_short + 1)) / n_cushions_short
    for i in range(n_cushions_short):
        cy = (seat_depth / 2) + cushion_gap + short_cush_len / 2 + i * (short_cush_len + cushion_gap)
        _create_box_bmesh(
            f"{name}_SeatCush_S{i}",
            width=seat_depth - 0.02, depth=short_cush_len, height=cushion_thick,
            location=(short_base_x, cy, base_height + cushion_thick / 2),
            material=leather, parent=parent, bevel_width=0.018,
        )

    # --- BACKREST ---
    # Long side backrest
    backrest_y = -(seat_depth / 2) + (backrest_thick / 2)
    _create_box_bmesh(
        f"{name}_Back_Long",
        width=long_side, depth=backrest_thick, height=backrest_h,
        location=(0, backrest_y, seat_height + backrest_h / 2),
        material=leather, parent=parent, bevel_width=0.015,
    )

    # Short side backrest
    backrest_x = -(long_side / 2) + (backrest_thick / 2)
    short_back_y = (seat_depth / 2) + (short_side - seat_depth) / 2
    _create_box_bmesh(
        f"{name}_Back_Short",
        width=backrest_thick, depth=short_side - seat_depth + backrest_thick, height=backrest_h,
        location=(backrest_x, short_back_y, seat_height + backrest_h / 2),
        material=leather, parent=parent, bevel_width=0.015,
    )

    # --- ARMREST (right side of long section) ---
    arm_x = long_side / 2 - arm_width / 2
    _create_box_bmesh(
        f"{name}_Arm_R",
        width=arm_width, depth=seat_depth, height=arm_height,
        location=(arm_x, 0, seat_height + arm_height / 2),
        material=leather, parent=parent, bevel_width=0.012,
    )

    # Armrest on far end of short section
    arm_y = (seat_depth / 2) + (short_side - seat_depth) - arm_width / 2
    _create_box_bmesh(
        f"{name}_Arm_S",
        width=seat_depth + backrest_thick, depth=arm_width, height=arm_height,
        location=(short_base_x - backrest_thick / 2, arm_y, seat_height + arm_height / 2),
        material=leather, parent=parent, bevel_width=0.012,
    )

    # --- SOFA FEET (small cylinders) ---
    foot_r = 0.025
    foot_h = 0.04
    foot_positions = [
        (long_side / 2 - 0.08, seat_depth / 2 - 0.08),
        (long_side / 2 - 0.08, -(seat_depth / 2 - 0.08)),
        (-(long_side / 2 - 0.08), -(seat_depth / 2 - 0.08)),
        (-(long_side / 2 - 0.08), short_side - seat_depth / 2 - 0.08),
        (short_base_x + seat_depth / 2 - 0.08, short_side - seat_depth / 2 - 0.08),
    ]
    for i, (fx, fy) in enumerate(foot_positions):
        _create_cylinder_bmesh(
            f"{name}_Foot_{i}",
            radius=foot_r, depth=foot_h,
            location=(fx, fy, foot_h / 2),
            material=leg_mat, parent=parent, segments=16,
        )

    return parent
