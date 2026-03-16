"""Art Deco Velvet Club Chair — high-quality Blender model via Python API.

Produces an Art Deco tub/club chair with:
- Rounded, enveloping shell (seat + back + arms as one continuous form)
- Seat height ~420mm, total height ~750mm, width ~650mm, depth ~600mm
- Polished brass pedestal ring at the base
- Four short brass legs
- Velvet upholstery with sheen and micro-nap bump
"""

import bpy
import math
from mathutils import Vector


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

_VELVET_COLORS = {
    'blue': (0.05, 0.08, 0.22),
    'green': (0.04, 0.15, 0.08),
}


def _get_velvet_material(color_name='blue'):
    """Velvet upholstery with sheen, subtle color variation, and micro-nap bump."""
    mat_name = f"M_Velvet_{color_name.capitalize()}"
    mat = bpy.data.materials.get(mat_name)
    if mat:
        return mat

    base_rgb = _VELVET_COLORS.get(color_name, _VELVET_COLORS['blue'])

    mat = bpy.data.materials.new(mat_name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]

    # Principled BSDF
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (400, 0)
    principled.inputs["Roughness"].default_value = 0.85
    try:
        principled.inputs["Sheen Weight"].default_value = 0.8
        principled.inputs["Sheen Tint"].default_value = 0.5
    except KeyError:
        pass

    # Texture coordinate + mapping
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-900, 0)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-700, 0)
    mapping.inputs["Scale"].default_value = (4.0, 4.0, 4.0)

    # Noise for subtle color variation
    noise_color = nodes.new("ShaderNodeTexNoise")
    noise_color.location = (-470, 100)
    noise_color.inputs["Scale"].default_value = 12.0
    noise_color.inputs["Detail"].default_value = 4.0
    noise_color.inputs["Roughness"].default_value = 0.5

    # Mix base color with noise (factor 0.05 = very subtle)
    mix_color = nodes.new("ShaderNodeMixRGB")
    mix_color.location = (-200, 80)
    mix_color.blend_type = "MIX"
    mix_color.inputs["Fac"].default_value = 0.05
    mix_color.inputs["Color1"].default_value = (*base_rgb, 1.0)
    # Slightly lighter variant for variation
    mix_color.inputs["Color2"].default_value = (
        base_rgb[0] * 1.3,
        base_rgb[1] * 1.3,
        base_rgb[2] * 1.3,
        1.0,
    )

    # Noise for micro-nap bump
    noise_bump = nodes.new("ShaderNodeTexNoise")
    noise_bump.location = (-470, -100)
    noise_bump.inputs["Scale"].default_value = 80.0
    noise_bump.inputs["Detail"].default_value = 8.0
    noise_bump.inputs["Roughness"].default_value = 0.6

    bump = nodes.new("ShaderNodeBump")
    bump.location = (160, -150)
    bump.inputs["Strength"].default_value = 0.02

    # Connections
    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise_color.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise_bump.inputs["Vector"])
    links.new(noise_color.outputs["Color"], mix_color.inputs["Color2"])
    links.new(mix_color.outputs["Color"], principled.inputs["Base Color"])
    links.new(noise_bump.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    return mat


def _get_polished_brass():
    """Polished brass — roughness variation only (color fixed per material-recipes.md)."""
    mat = bpy.data.materials.get("M_PolishedBrass")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_PolishedBrass")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]

    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (320, 0)
    principled.inputs["Base Color"].default_value = (0.78, 0.57, 0.11, 1.0)
    principled.inputs["Metallic"].default_value = 0.95
    principled.inputs["Roughness"].default_value = 0.15

    # Roughness variation via noise (color stays fixed)
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-880, 20)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-680, 20)
    mapping.inputs["Scale"].default_value = (6.0, 6.0, 6.0)

    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-460, 20)
    noise.inputs["Scale"].default_value = 30.0
    noise.inputs["Detail"].default_value = 4.0
    noise.inputs["Roughness"].default_value = 0.4

    # Roughness ramp (subtle variation around 0.15)
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-220, 20)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[0].color = (0.10, 0.10, 0.10, 1.0)
    ramp.color_ramp.elements[1].color = (0.22, 0.22, 0.22, 1.0)

    # Very subtle bump
    bump = nodes.new("ShaderNodeBump")
    bump.location = (80, -120)
    bump.inputs["Strength"].default_value = 0.003

    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Roughness"])
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


def _smooth_object(obj):
    if obj.type == "MESH":
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth()


def _create_lathe_object(name, profile, material, segments=64, parent=None):
    """Create a lathe/revolution mesh from a 2D profile [(radius, z), ...].

    Single seamless mesh — no stacked cones, no visible seams.
    """
    vertices = []
    faces = []
    rings = []

    for radius, z in profile:
        if radius <= 1e-6:
            rings.append([len(vertices)])
            vertices.append((0.0, 0.0, z))
            continue
        ring = []
        for step in range(segments):
            angle = math.tau * step / segments
            ring.append(len(vertices))
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
        rings.append(ring)

    for ring_a, ring_b in zip(rings, rings[1:]):
        if len(ring_a) == 1 and len(ring_b) == 1:
            continue
        if len(ring_a) == 1:
            center = ring_a[0]
            for step in range(segments):
                next_step = (step + 1) % segments
                faces.append([center, ring_b[next_step], ring_b[step]])
            continue
        if len(ring_b) == 1:
            center = ring_b[0]
            for step in range(segments):
                next_step = (step + 1) % segments
                faces.append([ring_a[step], ring_a[next_step], center])
            continue
        for step in range(segments):
            next_step = (step + 1) % segments
            faces.append([ring_a[step], ring_a[next_step], ring_b[next_step], ring_b[step]])

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    _assign_material(obj, material)

    # Fix normals
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)

    _smooth_object(obj)
    if parent:
        obj.parent = parent
    return obj


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def create_club_chair(name="ClubChair", location=(0, 0, 0), color='blue'):
    """Create an Art Deco velvet club chair at the given location.

    Args:
        name: Object name prefix.
        location: World position (x, y, z).
        color: Velvet color — 'blue' or 'green'.

    Returns the root object (Empty parent).
    """
    velvet = _get_velvet_material(color_name=color)
    brass = _get_polished_brass()

    # Parent empty
    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent.location = location

    # -----------------------------------------------------------------------
    # SHELL (seat + back + arms as one lathe-revolution body)
    # -----------------------------------------------------------------------
    # The tub chair shell is approximated as a lathe profile:
    # wider at top (arms/back), narrower at bottom (seat edge).
    # Profile: (radius, z) — radius from center axis
    #
    # Dimensions: W ~650mm, D ~600mm → average radius ~310mm at widest
    # Seat height ~420mm, back top ~750mm, seat bottom ~350mm
    shell_profile = [
        (0.0,   0.75),    # Top center (closed)
        (0.12,  0.75),    # Back top inner lip
        (0.26,  0.74),    # Opening widens
        (0.30,  0.72),    # Arms start
        (0.325, 0.68),    # Full arm width
        (0.325, 0.55),    # Arm continues down
        (0.315, 0.46),    # Arm to seat transition
        (0.30,  0.42),    # Seat height
        (0.28,  0.38),    # Seat underside taper
        (0.26,  0.35),    # Bottom of shell
        (0.24,  0.34),    # Shell bottom edge
    ]
    _create_lathe_object(
        f"{name}_Shell", shell_profile, velvet,
        segments=80, parent=parent,
    )

    # Inner cushion (slightly inset, simulates seat depth)
    cushion_profile = [
        (0.0,   0.435),   # Cushion center top
        (0.10,  0.435),
        (0.20,  0.432),
        (0.26,  0.425),
        (0.28,  0.42),    # Cushion edge (flush with shell seat height)
        (0.26,  0.415),   # Cushion underside
        (0.10,  0.412),
        (0.0,   0.41),    # Cushion center bottom
    ]
    _create_lathe_object(
        f"{name}_Cushion", cushion_profile, velvet,
        segments=80, parent=parent,
    )

    # -----------------------------------------------------------------------
    # BRASS PEDESTAL RING (torus-like ring at the base of the shell)
    # -----------------------------------------------------------------------
    # Create a Bezier circle curve with bevel_depth for the ring
    ring_curve = bpy.data.curves.new(f"{name}_Ring_Curve", type="CURVE")
    ring_curve.dimensions = "3D"
    ring_curve.resolution_u = 32
    ring_curve.bevel_depth = 0.012  # Ring cross-section radius
    ring_curve.bevel_resolution = 8
    ring_curve.fill_mode = "FULL"
    ring_curve.use_fill_caps = True

    # Circular spline at z=0.34 (bottom of shell)
    ring_radius = 0.255
    ring_z = 0.34
    spline = ring_curve.splines.new(type="BEZIER")
    spline.bezier_points.add(3)  # 4 points total for circle
    circle_pts = [
        (ring_radius, 0.0, ring_z),
        (0.0, ring_radius, ring_z),
        (-ring_radius, 0.0, ring_z),
        (0.0, -ring_radius, ring_z),
    ]
    for bp, coord in zip(spline.bezier_points, circle_pts):
        bp.co = coord
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    spline.use_cyclic_u = True

    ring_obj = bpy.data.objects.new(f"{name}_BrassRing", ring_curve)
    bpy.context.collection.objects.link(ring_obj)
    _assign_material(ring_obj, brass)
    ring_obj.parent = parent

    # Convert ring curve to mesh for shade_smooth
    bpy.ops.object.select_all(action="DESELECT")
    ring_obj.select_set(True)
    bpy.context.view_layer.objects.active = ring_obj
    bpy.ops.object.convert(target="MESH")
    _smooth_object(ring_obj)

    # -----------------------------------------------------------------------
    # FOUR SHORT BRASS LEGS
    # -----------------------------------------------------------------------
    leg_height = 0.34   # From floor to bottom of shell
    leg_radius_top = 0.014
    leg_radius_bottom = 0.012
    leg_inset = 0.19    # Distance from center to each leg

    leg_positions = [
        (leg_inset, leg_inset),
        (leg_inset, -leg_inset),
        (-leg_inset, leg_inset),
        (-leg_inset, -leg_inset),
    ]

    for i, (lx, ly) in enumerate(leg_positions):
        bpy.ops.mesh.primitive_cone_add(
            vertices=24,
            radius1=leg_radius_top,
            radius2=leg_radius_bottom,
            depth=leg_height,
            location=(lx, ly, leg_height / 2.0),
        )
        leg = bpy.context.active_object
        leg.name = f"{name}_Leg_{i}"
        _assign_material(leg, brass)
        _smooth_object(leg)
        leg.parent = parent

    # -----------------------------------------------------------------------
    # BRASS FOOT CAPS (small discs at leg bottoms)
    # -----------------------------------------------------------------------
    for i, (lx, ly) in enumerate(leg_positions):
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.016, depth=0.004, vertices=24,
            location=(lx, ly, 0.002),
        )
        cap = bpy.context.active_object
        cap.name = f"{name}_FootCap_{i}"
        _assign_material(cap, brass)
        _smooth_object(cap)
        cap.parent = parent

    return parent
