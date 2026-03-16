"""Mid-Century Chair — high-quality Blender model via Python API.

Based on Codex-generated design. Produces a mid-century modern chair with:
- Dark wood frame with Noise+Wave procedural grain and bump
- Woven cane seat panel (X/Y wave weave pattern)
- Continuous curved backrest + armrests (Bezier curve with elliptical bevel profile)
- Tapered splayed legs with quaternion-aligned orientation
- Rear support bar
"""

import bpy
import math
from mathutils import Vector


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def _get_dark_wood_material():
    """Dark wood with procedural Noise+Wave grain and bump mapping."""
    mat = bpy.data.materials.get("M_DarkWood_Chair")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_DarkWood_Chair")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # Remove default Principled BSDF
    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (260, 0)
    principled.inputs["Base Color"].default_value = (0.06, 0.045, 0.035, 1.0)
    principled.inputs["Roughness"].default_value = 0.42
    principled.inputs["Specular IOR Level"].default_value = 0.42

    # Texture coordinate + mapping (stretched along grain)
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-900, 0)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-700, 0)
    mapping.inputs["Scale"].default_value = (1.0, 16.0, 1.0)

    # Noise texture for grain variation
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-470, 80)
    noise.inputs["Scale"].default_value = 8.0
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.45

    # Wave texture for wood bands
    wave = nodes.new("ShaderNodeTexWave")
    wave.location = (-470, -120)
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.inputs["Scale"].default_value = 24.0
    wave.inputs["Distortion"].default_value = 1.1
    wave.inputs["Detail"].default_value = 3.0

    # Mix Noise and Wave
    mix = nodes.new("ShaderNodeMixRGB")
    mix.location = (-220, 0)
    mix.blend_type = "MULTIPLY"
    mix.inputs["Fac"].default_value = 0.55

    # Color ramp for dark wood tones
    color_ramp = nodes.new("ShaderNodeValToRGB")
    color_ramp.location = (20, 50)
    color_ramp.color_ramp.elements[0].position = 0.12
    color_ramp.color_ramp.elements[1].position = 0.72
    color_ramp.color_ramp.elements[0].color = (0.018, 0.015, 0.013, 1.0)
    color_ramp.color_ramp.elements[1].color = (0.055, 0.045, 0.037, 1.0)

    # Bump for surface grain
    bump = nodes.new("ShaderNodeBump")
    bump.location = (220, -130)
    bump.inputs["Strength"].default_value = 0.04

    # Connections
    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    links.new(noise.outputs["Color"], mix.inputs["Color1"])
    links.new(wave.outputs["Color"], mix.inputs["Color2"])
    links.new(mix.outputs["Color"], color_ramp.inputs["Fac"])
    links.new(color_ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(mix.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    return mat


def _get_cane_material():
    """Woven cane seat with X/Y wave weave pattern and bump."""
    mat = bpy.data.materials.get("M_WovenCane_Chair")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_WovenCane_Chair")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (320, 20)
    principled.inputs["Base Color"].default_value = (0.76, 0.63, 0.38, 1.0)
    principled.inputs["Roughness"].default_value = 0.62
    principled.inputs["Specular IOR Level"].default_value = 0.28

    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-1080, 40)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-880, 40)
    mapping.inputs["Scale"].default_value = (56.0, 56.0, 56.0)

    # X-direction weave bands
    wave_x = nodes.new("ShaderNodeTexWave")
    wave_x.location = (-650, 180)
    wave_x.wave_type = "BANDS"
    wave_x.bands_direction = "X"
    wave_x.inputs["Scale"].default_value = 18.0
    wave_x.inputs["Detail"].default_value = 1.0
    wave_x.inputs["Distortion"].default_value = 0.15

    # Y-direction weave bands
    wave_y = nodes.new("ShaderNodeTexWave")
    wave_y.location = (-650, -20)
    wave_y.wave_type = "BANDS"
    wave_y.bands_direction = "Y"
    wave_y.inputs["Scale"].default_value = 18.0
    wave_y.inputs["Detail"].default_value = 1.0
    wave_y.inputs["Distortion"].default_value = 0.15

    # Multiply X and Y for cross-weave
    mix = nodes.new("ShaderNodeMixRGB")
    mix.location = (-360, 80)
    mix.blend_type = "MULTIPLY"
    mix.inputs["Fac"].default_value = 1.0

    # Color ramp for honey/shadow tones
    color_ramp = nodes.new("ShaderNodeValToRGB")
    color_ramp.location = (-120, 80)
    color_ramp.color_ramp.elements[0].position = 0.33
    color_ramp.color_ramp.elements[1].position = 0.68
    color_ramp.color_ramp.elements[0].color = (0.6, 0.48, 0.26, 1.0)
    color_ramp.color_ramp.elements[1].color = (0.88, 0.79, 0.55, 1.0)

    bump = nodes.new("ShaderNodeBump")
    bump.location = (80, -130)
    bump.inputs["Strength"].default_value = 0.09

    links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], wave_x.inputs["Vector"])
    links.new(mapping.outputs["Vector"], wave_y.inputs["Vector"])
    links.new(wave_x.outputs["Color"], mix.inputs["Color1"])
    links.new(wave_y.outputs["Color"], mix.inputs["Color2"])
    links.new(mix.outputs["Color"], color_ramp.inputs["Fac"])
    links.new(color_ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(mix.outputs["Color"], bump.inputs["Height"])
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


def _smooth_object(obj):
    if obj.type == "MESH":
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth()


def _create_leg(name, start, end, top_radius, bottom_radius, material, parent):
    """Create a tapered leg oriented from start to end using quaternion rotation."""
    direction = end - start
    length = direction.length
    bpy.ops.mesh.primitive_cone_add(
        vertices=28,
        radius1=top_radius,
        radius2=bottom_radius,
        depth=length,
        location=(0.0, 0.0, 0.0),
    )
    leg = bpy.context.active_object
    leg.name = name
    leg.location = (start + end) / 2.0
    leg.rotation_mode = "QUATERNION"
    leg.rotation_quaternion = direction.to_track_quat("Z", "Y")
    _assign_material(leg, material)
    _smooth_object(leg)
    leg.parent = parent
    return leg


def _create_curve_object(name, points, material, bevel_depth,
                         bevel_object=None, cyclic=False,
                         dimensions="3D", fill_mode="FULL",
                         extrude=0.0, parent=None):
    """Create a Bezier curve object with optional bevel."""
    curve = bpy.data.curves.new(name=name, type="CURVE")
    curve.dimensions = dimensions
    curve.resolution_u = 24
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 8
    curve.fill_mode = fill_mode
    curve.extrude = extrude
    curve.use_fill_caps = True
    if bevel_object is not None:
        curve.bevel_mode = "OBJECT"
        curve.bevel_object = bevel_object

    spline = curve.splines.new(type="BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bp, coord in zip(spline.bezier_points, points):
        bp.co = coord
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic

    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    _assign_material(obj, material)
    if parent is not None:
        obj.parent = parent
    return obj


def _create_profile_curve(name, width, height):
    """Create a 2D elliptical bevel profile curve (hidden)."""
    curve = bpy.data.curves.new(name=name, type="CURVE")
    curve.dimensions = "2D"
    curve.fill_mode = "BOTH"
    spline = curve.splines.new(type="BEZIER")
    spline.bezier_points.add(3)

    points = [
        (width * 0.5, 0.0, 0.0),
        (0.0, height * 0.5, 0.0),
        (-width * 0.5, 0.0, 0.0),
        (0.0, -height * 0.5, 0.0),
    ]
    for bp, coord in zip(spline.bezier_points, points):
        bp.co = coord
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    spline.use_cyclic_u = True

    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.hide_render = True
    obj.hide_viewport = True
    return obj


def _convert_chair_curves_to_mesh(parent):
    """Convert only this chair's curve children to mesh (safe for multi-furniture scenes)."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in list(parent.children):
        if obj.type == "CURVE":
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.convert(target="MESH")
            _smooth_object(obj)
            obj.select_set(False)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def create_cafe_chair(name="MidCenturyChair", location=(0, 0, 0)):
    """Create a mid-century modern chair at the given location.

    Returns the root object (Empty parent).
    """
    dark_wood = _get_dark_wood_material()
    cane = _get_cane_material()

    # Parent empty
    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent.location = location

    # Elliptical bevel profile for backrest
    backrest_profile = _create_profile_curve(
        f"{name}_BackrestProfile", width=0.05, height=0.022
    )
    backrest_profile.parent = parent

    # --- SEAT FRAME (Bezier, cyclic) ---
    seat_frame_points = [
        (-0.26, -0.17, 0.44),
        (-0.28, 0.02, 0.44),
        (-0.18, 0.20, 0.44),
        (0.00, 0.24, 0.44),
        (0.18, 0.20, 0.44),
        (0.28, 0.02, 0.44),
        (0.26, -0.17, 0.44),
        (0.00, -0.24, 0.44),
    ]
    _create_curve_object(
        f"{name}_SeatFrame", seat_frame_points, dark_wood,
        bevel_depth=0.016, cyclic=True, parent=parent,
    )

    # --- CANE SEAT PANEL ---
    seat_panel_points = [
        (-0.225, -0.145, 0.447),
        (-0.245, 0.02, 0.447),
        (-0.155, 0.17, 0.447),
        (0.00, 0.20, 0.447),
        (0.155, 0.17, 0.447),
        (0.245, 0.02, 0.447),
        (0.225, -0.145, 0.447),
        (0.00, -0.20, 0.447),
    ]
    _create_curve_object(
        f"{name}_SeatPanel", seat_panel_points, cane,
        bevel_depth=0.0, cyclic=True, dimensions="2D",
        fill_mode="BOTH", extrude=0.005, parent=parent,
    )

    # --- BACKREST (curved, with elliptical bevel profile) ---
    backrest_points = [
        (-0.34, -0.09, 0.675),
        (-0.30, -0.115, 0.695),
        (-0.11, -0.24, 0.71),
        (0.00, -0.26, 0.715),
        (0.11, -0.24, 0.71),
        (0.30, -0.115, 0.695),
        (0.34, -0.09, 0.675),
    ]
    _create_curve_object(
        f"{name}_Backrest", backrest_points, dark_wood,
        bevel_depth=0.0, bevel_object=backrest_profile, parent=parent,
    )

    # --- REAR SUPPORT BAR ---
    rear_support_points = [
        (-0.19, -0.18, 0.405),
        (0.00, -0.205, 0.405),
        (0.19, -0.18, 0.405),
    ]
    _create_curve_object(
        f"{name}_RearSupport", rear_support_points, dark_wood,
        bevel_depth=0.013, parent=parent,
    )

    # --- LEGS (4 tapered, quaternion-oriented) ---
    _create_leg(
        f"{name}_FrontLeg_L",
        Vector((-0.205, 0.145, 0.42)),
        Vector((-0.24, 0.18, 0.015)),
        top_radius=0.023, bottom_radius=0.013,
        material=dark_wood, parent=parent,
    )
    _create_leg(
        f"{name}_FrontLeg_R",
        Vector((0.205, 0.145, 0.42)),
        Vector((0.24, 0.18, 0.015)),
        top_radius=0.023, bottom_radius=0.013,
        material=dark_wood, parent=parent,
    )
    _create_leg(
        f"{name}_BackLeg_L",
        Vector((-0.30, -0.115, 0.695)),
        Vector((-0.315, -0.205, 0.015)),
        top_radius=0.024, bottom_radius=0.013,
        material=dark_wood, parent=parent,
    )
    _create_leg(
        f"{name}_BackLeg_R",
        Vector((0.30, -0.115, 0.695)),
        Vector((0.315, -0.205, 0.015)),
        top_radius=0.024, bottom_radius=0.013,
        material=dark_wood, parent=parent,
    )

    # --- Convert curves to mesh + add modifiers ---
    _convert_chair_curves_to_mesh(parent)

    for obj in parent.children:
        if obj.type == "MESH" and obj.name in {
            f"{name}_SeatFrame", f"{name}_SeatPanel",
            f"{name}_Backrest", f"{name}_RearSupport",
        }:
            mod = obj.modifiers.new(name="Bevel", type="BEVEL")
            mod.width = 0.0025
            mod.segments = 2
            mod.limit_method = "ANGLE"
            _smooth_object(obj)

    # Add solidify to seat panel for thickness
    seat_panel_name = f"{name}_SeatPanel"
    if seat_panel_name in bpy.data.objects:
        seat_panel_obj = bpy.data.objects[seat_panel_name]
        solidify = seat_panel_obj.modifiers.new(name="Solidify", type="SOLIDIFY")
        solidify.thickness = 0.0035
        solidify.offset = 0.0

    # Clean up hidden profile curve
    profile_name = f"{name}_BackrestProfile"
    if profile_name in bpy.data.objects:
        profile_obj = bpy.data.objects[profile_name]
        bpy.data.objects.remove(profile_obj, do_unlink=True)

    return parent
