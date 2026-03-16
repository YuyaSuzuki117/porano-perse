"""Modern Marble Cafe Table — high-quality Blender model via Python API.

Based on Codex-generated design with lathe-profile pedestal.
Produces a modern cafe table with:
- Carrara marble top (φ700mm, 30mm) with 1st/2nd vein layers
- Matte black metal pedestal as single lathe-profile mesh (no seams)
- Trumpet/tulip base with natural flare curve
- Top mount + flange connection plates
"""

import bpy
import math


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def _get_marble_material():
    """Carrara marble: white base with primary + secondary vein layers."""
    mat = bpy.data.materials.get("M_CarraraMarble_V2")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_CarraraMarble_V2")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (560, 20)
    principled.inputs["Base Color"].default_value = (0.978, 0.978, 0.973, 1.0)
    principled.inputs["Roughness"].default_value = 0.12
    try:
        principled.inputs["Specular IOR Level"].default_value = 0.5
    except KeyError:
        pass

    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-1220, 0)

    # Large-scale mapping (primary veins)
    mapping_large = nodes.new("ShaderNodeMapping")
    mapping_large.location = (-1020, 110)
    mapping_large.inputs["Scale"].default_value = (2.8, 2.8, 2.8)
    mapping_large.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(22.0))

    # Fine-scale mapping (body variation)
    mapping_fine = nodes.new("ShaderNodeMapping")
    mapping_fine.location = (-1020, -150)
    mapping_fine.inputs["Scale"].default_value = (15.0, 15.0, 15.0)
    mapping_fine.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(14.0))

    # Noise for large-scale structure
    noise_large = nodes.new("ShaderNodeTexNoise")
    noise_large.location = (-790, 120)
    noise_large.inputs["Scale"].default_value = 1.45
    noise_large.inputs["Detail"].default_value = 14.0
    noise_large.inputs["Roughness"].default_value = 0.58

    # Noise for vein detail
    noise_vein = nodes.new("ShaderNodeTexNoise")
    noise_vein.location = (-790, 250)
    noise_vein.inputs["Scale"].default_value = 6.4
    noise_vein.inputs["Detail"].default_value = 14.0
    noise_vein.inputs["Roughness"].default_value = 0.55

    # Fine noise for body micro-variation
    noise_fine = nodes.new("ShaderNodeTexNoise")
    noise_fine.location = (-790, -40)
    noise_fine.inputs["Scale"].default_value = 22.0
    noise_fine.inputs["Detail"].default_value = 6.0
    noise_fine.inputs["Roughness"].default_value = 0.52

    # Wave for primary vein direction
    wave = nodes.new("ShaderNodeTexWave")
    wave.location = (-780, 270)
    wave.wave_type = "BANDS"
    wave.bands_direction = "DIAGONAL"
    wave.inputs["Scale"].default_value = 2.35
    wave.inputs["Detail"].default_value = 4.0
    wave.inputs["Distortion"].default_value = 10.0

    # Primary vein mix
    mix_vein = nodes.new("ShaderNodeMixRGB")
    mix_vein.location = (-530, 170)
    mix_vein.blend_type = "MULTIPLY"
    mix_vein.inputs["Fac"].default_value = 1.0

    # Secondary vein mix
    secondary_vein_mix = nodes.new("ShaderNodeMixRGB")
    secondary_vein_mix.location = (-530, 10)
    secondary_vein_mix.blend_type = "SCREEN"
    secondary_vein_mix.inputs["Fac"].default_value = 0.42

    # Primary vein ramp (white → dark grey)
    vein_ramp = nodes.new("ShaderNodeValToRGB")
    vein_ramp.location = (-280, 170)
    vein_ramp.color_ramp.elements[0].position = 0.36
    vein_ramp.color_ramp.elements[1].position = 0.53
    vein_ramp.color_ramp.elements[0].color = (0.995, 0.995, 0.995, 1.0)
    vein_ramp.color_ramp.elements[1].color = (0.38, 0.4, 0.43, 1.0)

    # Secondary vein ramp (subtle grey)
    secondary_vein_ramp = nodes.new("ShaderNodeValToRGB")
    secondary_vein_ramp.location = (-280, 10)
    secondary_vein_ramp.color_ramp.elements[0].position = 0.34
    secondary_vein_ramp.color_ramp.elements[1].position = 0.43
    secondary_vein_ramp.color_ramp.elements[0].color = (0.98, 0.98, 0.98, 1.0)
    secondary_vein_ramp.color_ramp.elements[1].color = (0.68, 0.69, 0.71, 1.0)

    # Body color ramp (subtle warm variation)
    body_ramp = nodes.new("ShaderNodeValToRGB")
    body_ramp.location = (-280, -40)
    body_ramp.color_ramp.elements[0].position = 0.24
    body_ramp.color_ramp.elements[1].position = 0.86
    body_ramp.color_ramp.elements[0].color = (0.95, 0.95, 0.945, 1.0)
    body_ramp.color_ramp.elements[1].color = (1.0, 1.0, 0.998, 1.0)

    # Combine body + secondary veins
    color_mix = nodes.new("ShaderNodeMixRGB")
    color_mix.location = (10, 55)
    color_mix.blend_type = "MULTIPLY"
    color_mix.inputs["Fac"].default_value = 0.52

    # Overlay primary veins
    vein_overlay = nodes.new("ShaderNodeMixRGB")
    vein_overlay.location = (250, 45)
    vein_overlay.blend_type = "MULTIPLY"
    vein_overlay.inputs["Fac"].default_value = 0.95

    # Subtle bump from veins
    bump = nodes.new("ShaderNodeBump")
    bump.location = (470, -120)
    bump.inputs["Strength"].default_value = 0.011

    # Connections
    links.new(tex_coord.outputs["Object"], mapping_large.inputs["Vector"])
    links.new(tex_coord.outputs["Object"], mapping_fine.inputs["Vector"])
    links.new(mapping_large.outputs["Vector"], noise_large.inputs["Vector"])
    links.new(mapping_large.outputs["Vector"], noise_vein.inputs["Vector"])
    links.new(mapping_large.outputs["Vector"], wave.inputs["Vector"])
    links.new(mapping_fine.outputs["Vector"], noise_fine.inputs["Vector"])
    links.new(wave.outputs["Color"], mix_vein.inputs["Color1"])
    links.new(noise_vein.outputs["Color"], mix_vein.inputs["Color2"])
    links.new(mix_vein.outputs["Color"], vein_ramp.inputs["Fac"])
    links.new(noise_large.outputs["Color"], secondary_vein_mix.inputs["Color1"])
    links.new(noise_vein.outputs["Color"], secondary_vein_mix.inputs["Color2"])
    links.new(secondary_vein_mix.outputs["Color"], secondary_vein_ramp.inputs["Fac"])
    links.new(noise_fine.outputs["Fac"], body_ramp.inputs["Fac"])
    links.new(body_ramp.outputs["Color"], color_mix.inputs["Color1"])
    links.new(secondary_vein_ramp.outputs["Color"], color_mix.inputs["Color2"])
    links.new(color_mix.outputs["Color"], vein_overlay.inputs["Color1"])
    links.new(vein_ramp.outputs["Color"], vein_overlay.inputs["Color2"])
    links.new(vein_overlay.outputs["Color"], principled.inputs["Base Color"])
    links.new(vein_ramp.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    # Subsurface for marble translucency
    try:
        principled.inputs["Subsurface Weight"].default_value = 0.05
        principled.inputs["Subsurface Radius"].default_value = (0.5, 0.3, 0.2)
    except Exception:
        pass

    return mat


def _get_matte_black_metal():
    """Matte black metal — roughness-driven surface expression (not color noise)."""
    mat = bpy.data.materials.get("M_MatteBlackMetal_V2")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_MatteBlackMetal_V2")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (320, 0)
    # Dark base, roughness variation for surface expression
    principled.inputs["Base Color"].default_value = (0.01, 0.01, 0.012, 1.0)
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.24
    try:
        principled.inputs["Specular IOR Level"].default_value = 0.32
    except KeyError:
        pass
    try:
        principled.inputs["Coat Weight"].default_value = 0.08
        principled.inputs["Coat Roughness"].default_value = 0.18
    except KeyError:
        pass

    # Roughness variation via noise (not color — per material-recipes.md)
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-880, 20)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-680, 20)
    mapping.inputs["Scale"].default_value = (3.0, 3.0, 14.0)

    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-460, 20)
    noise.inputs["Scale"].default_value = 20.0
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.32

    # Roughness ramp (subtle variation)
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-220, 20)
    ramp.color_ramp.elements[0].position = 0.4
    ramp.color_ramp.elements[1].position = 0.74
    ramp.color_ramp.elements[0].color = (0.18, 0.18, 0.18, 1.0)
    ramp.color_ramp.elements[1].color = (0.34, 0.34, 0.34, 1.0)

    # Very subtle bump
    bump = nodes.new("ShaderNodeBump")
    bump.location = (80, -120)
    bump.inputs["Strength"].default_value = 0.0015

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


def _create_lathe_object(name, profile, material, segments=96, parent=None):
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

def create_cafe_table(name="ModernCafeTable", location=(0, 0, 0)):
    """Create a modern marble cafe table with lathe-profile pedestal.

    Returns the root Empty parent object.
    """
    marble = _get_marble_material()
    metal = _get_matte_black_metal()

    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent.location = location

    # --- MARBLE TOP (φ700mm, 30mm thick) ---
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.35, depth=0.03, vertices=96,
        location=(0, 0, 0.735),
    )
    top = bpy.context.active_object
    top.name = f"{name}_Top"
    _assign_material(top, marble)
    _smooth_object(top)
    mod = top.modifiers.new("Bevel", "BEVEL")
    mod.width = 0.005
    mod.segments = 4
    mod.limit_method = "ANGLE"
    top.parent = parent

    # --- TOP MOUNT (connection cylinder) ---
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.065, depth=0.018, vertices=64,
        location=(0, 0, 0.705),
    )
    mount = bpy.context.active_object
    mount.name = f"{name}_TopMount"
    _assign_material(mount, metal)
    _smooth_object(mount)
    mod = mount.modifiers.new("Bevel", "BEVEL")
    mod.width = 0.003
    mod.segments = 3
    mod.limit_method = "ANGLE"
    mount.parent = parent

    # --- TOP FLANGE (wider connection plate) ---
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.105, depth=0.012, vertices=64,
        location=(0, 0, 0.69),
    )
    flange = bpy.context.active_object
    flange.name = f"{name}_Flange"
    _assign_material(flange, metal)
    _smooth_object(flange)
    mod = flange.modifiers.new("Bevel", "BEVEL")
    mod.width = 0.003
    mod.segments = 3
    mod.limit_method = "ANGLE"
    flange.parent = parent

    # --- PEDESTAL (single lathe-profile mesh — no seams) ---
    pedestal_profile = [
        (0.0, 0.683),     # Center top (closed)
        (0.04, 0.683),    # Column top
        (0.04, 0.152),    # Column bottom → flare begins
        (0.041, 0.128),   # Subtle flare
        (0.043, 0.108),
        (0.047, 0.09),
        (0.055, 0.072),
        (0.068, 0.056),
        (0.088, 0.042),
        (0.113, 0.031),
        (0.142, 0.022),
        (0.171, 0.015),
        (0.194, 0.01),
        (0.205, 0.006),   # Base edge
        (0.205, 0.0),     # Base bottom edge
        (0.0, 0.0),       # Center bottom (closed)
    ]
    pedestal = _create_lathe_object(
        f"{name}_Pedestal", pedestal_profile, metal,
        segments=128, parent=parent,
    )
    mod = pedestal.modifiers.new("Bevel", "BEVEL")
    mod.width = 0.0015
    mod.segments = 2
    mod.limit_method = "ANGLE"

    return parent
