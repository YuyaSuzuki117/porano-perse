"""Bar Stool — high-quality Blender model via Python API.

Mid-century modern bar stool with:
- Curved plywood seat shell (lathe profile, slight saddle)
- Matte black metal frame (4 tapered legs, footrest ring)
- Seat height ~650mm (counter height)
- Low backrest curve for comfort
"""

import bpy
import math
from mathutils import Vector


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def _get_dark_wood_material():
    """Dark stained wood for seat shell."""
    mat = bpy.data.materials.get("M_DarkWood_BarStool")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_DarkWood_BarStool")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (300, 0)
    principled.inputs["Base Color"].default_value = (0.08, 0.055, 0.04, 1.0)
    principled.inputs["Roughness"].default_value = 0.38
    try:
        principled.inputs["Specular IOR Level"].default_value = 0.4
    except KeyError:
        pass

    # Subtle wood grain
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-800, 0)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-600, 0)
    mapping.inputs["Scale"].default_value = (1.0, 12.0, 1.0)

    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-380, 60)
    noise.inputs["Scale"].default_value = 6.0
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.4

    wave = nodes.new("ShaderNodeTexWave")
    wave.location = (-380, -100)
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.inputs["Scale"].default_value = 18.0
    wave.inputs["Distortion"].default_value = 0.8
    wave.inputs["Detail"].default_value = 3.0

    mix = nodes.new("ShaderNodeMixRGB")
    mix.location = (-150, 0)
    mix.blend_type = "MULTIPLY"
    mix.inputs["Fac"].default_value = 0.5

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (50, 30)
    ramp.color_ramp.elements[0].position = 0.15
    ramp.color_ramp.elements[1].position = 0.70
    ramp.color_ramp.elements[0].color = (0.025, 0.018, 0.014, 1.0)
    ramp.color_ramp.elements[1].color = (0.07, 0.05, 0.038, 1.0)

    bump = nodes.new("ShaderNodeBump")
    bump.location = (200, -130)
    bump.inputs["Strength"].default_value = 0.03

    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    links.new(noise.outputs["Color"], mix.inputs["Color1"])
    links.new(wave.outputs["Color"], mix.inputs["Color2"])
    links.new(mix.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(mix.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return mat


def _get_matte_black_metal():
    """Matte black metal for frame — roughness-driven expression."""
    mat = bpy.data.materials.get("M_MatteBlack_BarStool")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_MatteBlack_BarStool")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (300, 0)
    principled.inputs["Base Color"].default_value = (0.012, 0.012, 0.014, 1.0)
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.28
    try:
        principled.inputs["Specular IOR Level"].default_value = 0.35
    except KeyError:
        pass

    # Roughness variation only (per material-recipes.md)
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-600, 0)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-380, 0)
    noise.inputs["Scale"].default_value = 30.0
    noise.inputs["Detail"].default_value = 4.0

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-150, 0)
    ramp.color_ramp.elements[0].position = 0.38
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[0].color = (0.22, 0.22, 0.22, 1.0)
    ramp.color_ramp.elements[1].color = (0.32, 0.32, 0.32, 1.0)

    bump = nodes.new("ShaderNodeBump")
    bump.location = (80, -120)
    bump.inputs["Strength"].default_value = 0.002

    links.new(tex_coord.outputs["Object"], noise.inputs["Vector"])
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


def _create_leg(name, start, end, top_radius, bottom_radius, material, parent):
    """Tapered leg with quaternion orientation."""
    direction = end - start
    length = direction.length
    bpy.ops.mesh.primitive_cone_add(
        vertices=20,
        radius1=top_radius,
        radius2=bottom_radius,
        depth=length,
        location=(0, 0, 0),
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


def _create_curve_ring(name, radius, height, bevel_depth, material, parent):
    """Create a circular ring (footrest) using Bezier curve."""
    curve = bpy.data.curves.new(name, type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 24
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 6
    curve.fill_mode = "FULL"
    curve.use_fill_caps = True

    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(3)  # 4 points for circle
    spline.use_cyclic_u = True

    # Approximate circle with 4 Bezier points
    k = radius * 0.5522847498  # magic number for circle approximation
    points_data = [
        ((radius, 0, height), (-k, 0, 0), (k, 0, 0)),     # right
        ((0, radius, height), (0, -k, 0), (0, k, 0)),      # top (but actually front)
        ((-radius, 0, height), (k, 0, 0), (-k, 0, 0)),     # left
        ((0, -radius, height), (0, k, 0), (0, -k, 0)),     # bottom (actually back)
    ]

    for i, (co, hl_off, hr_off) in enumerate(points_data):
        bp = spline.bezier_points[i]
        bp.co = co
        bp.handle_left_type = "FREE"
        bp.handle_right_type = "FREE"
        bp.handle_left = (co[0] + hl_off[0], co[1] + hl_off[1], co[2] + hl_off[2])
        bp.handle_right = (co[0] + hr_off[0], co[1] + hr_off[1], co[2] + hr_off[2])

    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    _assign_material(obj, material)
    obj.parent = parent

    # Convert to mesh for consistency
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    _smooth_object(obj)
    obj.select_set(False)
    return obj


def _create_seat_shell(name, material, parent):
    """Create a curved plywood seat shell with low backrest using lathe profile."""
    segments = 48
    vertices = []
    faces = []
    rings = []

    # Seat shell profile: slightly curved dish shape
    # (radius, z) — from center outward
    seat_profile = [
        (0.0, 0.005),     # center raised
        (0.04, 0.004),
        (0.08, 0.002),
        (0.12, 0.0),      # flat zone
        (0.155, -0.002),   # slight droop at edge
        (0.17, -0.003),    # seat edge
    ]

    for radius, z_offset in seat_profile:
        seat_z = 0.65 + z_offset  # seat height
        if radius <= 1e-6:
            rings.append([len(vertices)])
            vertices.append((0.0, 0.0, seat_z))
            continue
        ring = []
        for step in range(segments):
            angle = math.tau * step / segments
            ring.append(len(vertices))
            vertices.append((
                radius * math.cos(angle),
                radius * math.sin(angle),
                seat_z,
            ))
        rings.append(ring)

    # Build faces
    for ring_a, ring_b in zip(rings, rings[1:]):
        if len(ring_a) == 1:
            center = ring_a[0]
            for step in range(segments):
                next_step = (step + 1) % segments
                faces.append([center, ring_b[next_step], ring_b[step]])
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

    # Solidify for thickness
    solidify = obj.modifiers.new("Solidify", "SOLIDIFY")
    solidify.thickness = 0.012
    solidify.offset = -1.0

    _smooth_object(obj)
    obj.parent = parent
    return obj


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def create_bar_stool(name="BarStool", location=(0, 0, 0)):
    """Create a mid-century modern bar stool.

    Returns the root Empty parent object.
    """
    wood = _get_dark_wood_material()
    metal = _get_matte_black_metal()

    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent.location = location

    # --- SEAT SHELL (curved plywood) ---
    _create_seat_shell(f"{name}_Seat", wood, parent)

    # --- LOW BACKREST (Bezier curve arc) ---
    curve = bpy.data.curves.new(f"{name}_BackrestCurve", type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 16
    curve.bevel_depth = 0.012
    curve.bevel_resolution = 6
    curve.fill_mode = "FULL"
    curve.use_fill_caps = True

    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(2)  # 3 points
    backrest_pts = [
        (-0.15, -0.08, 0.66),
        (0.0, -0.14, 0.73),
        (0.15, -0.08, 0.66),
    ]
    for i, pt in enumerate(backrest_pts):
        bp = spline.bezier_points[i]
        bp.co = pt
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"

    backrest = bpy.data.objects.new(f"{name}_Backrest", curve)
    bpy.context.collection.objects.link(backrest)
    _assign_material(backrest, wood)
    backrest.parent = parent

    # Convert to mesh
    bpy.ops.object.select_all(action="DESELECT")
    backrest.select_set(True)
    bpy.context.view_layer.objects.active = backrest
    bpy.ops.object.convert(target="MESH")
    _smooth_object(backrest)
    backrest.select_set(False)

    # --- SEAT MOUNT RING (connects legs to seat underside) ---
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.13, depth=0.012, vertices=48,
        location=(0, 0, 0.638),
    )
    mount = bpy.context.active_object
    mount.name = f"{name}_SeatMount"
    _assign_material(mount, metal)
    _smooth_object(mount)
    mount.parent = parent

    # --- LEGS (4 tapered, penetrate into seat mount) ---
    seat_h = 0.65
    leg_spread = 0.12       # Under seat, inside seat radius
    leg_base_spread = 0.20  # Wider at floor

    leg_positions = [
        (Vector((leg_spread, leg_spread, seat_h)),        # Top INTO seat
         Vector((leg_base_spread, leg_base_spread, 0.0))),
        (Vector((-leg_spread, leg_spread, seat_h)),
         Vector((-leg_base_spread, leg_base_spread, 0.0))),
        (Vector((-leg_spread, -leg_spread, seat_h)),
         Vector((-leg_base_spread, -leg_base_spread, 0.0))),
        (Vector((leg_spread, -leg_spread, seat_h)),
         Vector((leg_base_spread, -leg_base_spread, 0.0))),
    ]

    for i, (top, bottom) in enumerate(leg_positions):
        _create_leg(
            f"{name}_Leg_{i}", top, bottom,
            top_radius=0.010, bottom_radius=0.007,
            material=metal, parent=parent,
        )

    # --- FOOTREST RING (circular tube between legs) ---
    _create_curve_ring(
        f"{name}_Footrest",
        radius=0.17, height=0.22,
        bevel_depth=0.007,
        material=metal, parent=parent,
    )

    # --- CROSS STRETCHERS (X-brace for structural integrity) ---
    for start, end in [
        (Vector((-0.15, -0.15, 0.12)), Vector((0.15, 0.15, 0.12))),
        (Vector((0.15, -0.15, 0.12)), Vector((-0.15, 0.15, 0.12))),
    ]:
        _create_leg(
            f"{name}_Stretcher", start, end,
            top_radius=0.005, bottom_radius=0.005,
            material=metal, parent=parent,
        )

    return parent
