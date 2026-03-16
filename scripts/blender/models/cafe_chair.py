"""Mid-Century Cow Horn Chair — high-quality Blender model via Python API.

Produces a cow horn chair with:
- Matte black ebony frame with subtle wood grain bump
- Woven cane seat panel (checker weave pattern)
- Continuous curved cow horn backrest + armrests (Bezier curve with taper)
- Tapered splayed legs with stretchers
"""

import bpy
import math
from mathutils import Vector


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def _get_ebony_material():
    mat = bpy.data.materials.get("M_BlackEbony")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_BlackEbony")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs['Base Color'].default_value = (0.01, 0.01, 0.012, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.35
    bsdf.inputs['Specular IOR Level'].default_value = 0.5

    # Add subtle wood grain via Noise
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    tex_coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (1, 1, 8)  # Stretched along grain
    links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])

    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 50.0
    noise.inputs['Detail'].default_value = 4.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.05
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat


def _get_cane_material():
    mat = bpy.data.materials.get("M_WovenCane")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_WovenCane")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # Checker pattern for weave
    tex_coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (20, 20, 1)
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    checker = nodes.new('ShaderNodeTexChecker')
    checker.inputs['Scale'].default_value = 40.0
    checker.inputs['Color1'].default_value = (0.75, 0.60, 0.35, 1.0)  # Honey
    checker.inputs['Color2'].default_value = (0.55, 0.42, 0.22, 1.0)  # Shadow
    links.new(mapping.outputs['Vector'], checker.inputs['Vector'])
    links.new(checker.outputs['Color'], bsdf.inputs['Base Color'])

    bsdf.inputs['Roughness'].default_value = 0.75

    # Bump for weave texture
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.15
    links.new(checker.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat


# ---------------------------------------------------------------------------
# Chair geometry
# ---------------------------------------------------------------------------

def create_cafe_chair(name="CowHornChair", location=(0, 0, 0)):
    """Create a Mid-Century Cow Horn chair at the given location.

    Returns the root object (Empty parent).
    """
    ebony = _get_ebony_material()
    cane = _get_cane_material()

    # Parent empty
    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent.location = location

    # --- SEAT FRAME (circle with slight D-shape) ---
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.23, depth=0.025, vertices=32,
        location=(0, 0, 0.45),
    )
    seat_frame = bpy.context.active_object
    seat_frame.name = f"{name}_SeatFrame"
    seat_frame.data.materials.append(ebony)
    seat_frame.parent = parent

    # --- CANE SEAT (slightly smaller disc) ---
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.20, depth=0.008, vertices=32,
        location=(0, 0, 0.455),
    )
    cane_seat = bpy.context.active_object
    cane_seat.name = f"{name}_CaneSeat"
    cane_seat.data.materials.append(cane)
    bpy.ops.object.shade_smooth()
    cane_seat.parent = parent

    # --- LEGS (4 tapered cylinders using cone) ---
    leg_positions = [
        ((-0.16, -0.14, 0.225), 0.010, 0.018),  # back-left
        ((0.16, -0.14, 0.225), 0.010, 0.018),    # back-right
        ((-0.16, 0.12, 0.225), 0.010, 0.018),    # front-left
        ((0.16, 0.12, 0.225), 0.010, 0.018),     # front-right
    ]
    for i, (pos, r_top, r_bot) in enumerate(leg_positions):
        bpy.ops.mesh.primitive_cone_add(
            radius1=r_bot, radius2=r_top, depth=0.45,
            vertices=12, location=pos,
        )
        leg = bpy.context.active_object
        leg.name = f"{name}_Leg_{i}"
        leg.data.materials.append(ebony)
        bpy.ops.object.shade_smooth()
        leg.parent = parent

    # --- COW HORN BACKREST + ARMRESTS ---
    # Use a Bezier curve for the horn shape with circular bevel profile

    curve_data = bpy.data.curves.new(f"{name}_HornCurve", type='CURVE')
    curve_data.dimensions = '3D'
    curve_data.bevel_depth = 0.018  # Tube radius
    curve_data.bevel_resolution = 6  # Smooth tube cross-section
    curve_data.fill_mode = 'FULL'

    # Spline: left tip -> left arm -> backrest center -> right arm -> right tip
    spline = curve_data.splines.new('BEZIER')
    spline.bezier_points.add(6)  # 1 default + 6 = 7 total

    # Control points (x, y, z) in local space
    pts = [
        Vector((-0.24, 0.08, 0.50)),   # Left arm tip (front)
        Vector((-0.25, -0.02, 0.56)),   # Left arm mid
        Vector((-0.20, -0.12, 0.66)),   # Left arm top
        Vector((0.0, -0.18, 0.72)),     # Backrest center top
        Vector((0.20, -0.12, 0.66)),    # Right arm top
        Vector((0.25, -0.02, 0.56)),    # Right arm mid
        Vector((0.24, 0.08, 0.50)),     # Right arm tip (front)
    ]

    for i, pt in enumerate(pts):
        bp = spline.bezier_points[i]
        bp.co = pt
        bp.handle_left_type = 'AUTO'
        bp.handle_right_type = 'AUTO'

    # Taper: thicker at center, thinner at tips
    taper_data = bpy.data.curves.new(f"{name}_HornTaper", type='CURVE')
    taper_data.dimensions = '2D'
    taper_spline = taper_data.splines.new('BEZIER')
    taper_spline.bezier_points.add(2)  # 3 points

    taper_spline.bezier_points[0].co = Vector((0, 0.5, 0))    # left tip: thin
    taper_spline.bezier_points[0].handle_left_type = 'AUTO'
    taper_spline.bezier_points[0].handle_right_type = 'AUTO'
    taper_spline.bezier_points[1].co = Vector((0.5, 1.2, 0))  # center: thick
    taper_spline.bezier_points[1].handle_left_type = 'AUTO'
    taper_spline.bezier_points[1].handle_right_type = 'AUTO'
    taper_spline.bezier_points[2].co = Vector((1, 0.5, 0))    # right tip: thin
    taper_spline.bezier_points[2].handle_left_type = 'AUTO'
    taper_spline.bezier_points[2].handle_right_type = 'AUTO'

    taper_obj = bpy.data.objects.new(f"{name}_HornTaperObj", taper_data)
    bpy.context.collection.objects.link(taper_obj)
    taper_obj.hide_viewport = True
    taper_obj.hide_render = True

    curve_data.taper_object = taper_obj

    horn_obj = bpy.data.objects.new(f"{name}_Horn", curve_data)
    bpy.context.collection.objects.link(horn_obj)
    horn_obj.data.materials.append(ebony)
    horn_obj.parent = parent

    # --- BACK SUPPORT STRUTS (connect seat to horn) ---
    for x_pos in [-0.10, 0.10]:
        bpy.ops.mesh.primitive_cone_add(
            radius1=0.010, radius2=0.014, depth=0.25,
            vertices=8, location=(x_pos, -0.16, 0.575),
        )
        strut = bpy.context.active_object
        strut.name = f"{name}_Strut"
        strut.data.materials.append(ebony)
        bpy.ops.object.shade_smooth()
        strut.parent = parent

    # --- STRETCHERS (side bars between legs) ---
    for x_pos in [-0.16, 0.16]:
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.005, depth=0.24, vertices=8,
            location=(x_pos, -0.01, 0.12),
            rotation=(math.pi / 2, 0, 0),
        )
        stretcher = bpy.context.active_object
        stretcher.name = f"{name}_Stretcher"
        stretcher.data.materials.append(ebony)
        stretcher.parent = parent

    return parent
