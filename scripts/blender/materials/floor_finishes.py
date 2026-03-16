import bpy
from .wood import create_wood_material


def create_floor_material(texture_type='wood', color=None, roughness=None, wood_type='oak'):
    """Create a procedural floor PBR material.

    Args:
        texture_type: One of 'wood', 'tile', 'concrete', 'tatami',
                      'marble', 'checkerboard', 'linoleum'.
        color: Base color tuple (r, g, b, a) or None for defaults.
        roughness: Surface roughness override or None for type default.
        wood_type: Wood type for 'wood' texture (oak, walnut, etc).

    Returns:
        bpy.types.Material
    """
    if texture_type == 'wood':
        return _build_wood_floor(color, roughness, wood_type)

    builders = {
        'tile': _build_tile_floor,
        'concrete': _build_concrete_floor,
        'tatami': _build_tatami_floor,
        'marble': _build_marble_floor,
        'checkerboard': _build_checkerboard_floor,
        'linoleum': _build_linoleum_floor,
    }
    builder = builders.get(texture_type, _build_tile_floor)
    return builder(color, roughness)


# ---------------------------------------------------------------------------
# Internal builders
# ---------------------------------------------------------------------------

def _build_wood_floor(color, roughness, wood_type='oak'):
    """Build a hardwood plank floor — direct color approach.

    Uses Principled BSDF with Wave+Noise for grain, Brick for plank seams (bump only).
    """
    from .wood import WOOD_PALETTES

    rough = roughness if roughness is not None else 0.38
    palette = WOOD_PALETTES.get(wood_type, WOOD_PALETTES['oak'])
    dark, mid, light = palette

    # Tint palette toward the style floor color
    if color:
        r, g, b = color[0], color[1], color[2]
        f = 0.5
        dark = tuple(d * (1 - f) + c * f for d, c in zip(dark, (r, g, b)))
        mid = tuple(m * (1 - f) + c * f for m, c in zip(mid, (r, g, b)))
        light = tuple(l * (1 - f) + c * f for l, c in zip(light, (r, g, b)))

    mat = bpy.data.materials.new(name=f"M_Floor_Wood_{wood_type}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # Remove default nodes except Output
    for n in list(nodes):
        if n.name != "Material Output":
            nodes.remove(n)
    output = nodes["Material Output"]

    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (400, 300)
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Specular IOR Level'].default_value = 0.4

    # Texture coordinates — Generated (maps 0-1 over object bounds)
    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-1200, 300)
    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-1000, 300)
    # Stretched along X for lengthwise plank grain
    mapping.inputs['Scale'].default_value = (3.0, 25.0, 1.0)
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    # Wave — wood grain bands
    wave = nodes.new('ShaderNodeTexWave')
    wave.location = (-700, 450)
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'X'
    wave.wave_profile = 'SAW'
    wave.inputs['Scale'].default_value = 10.0
    wave.inputs['Distortion'].default_value = 2.0
    wave.inputs['Detail'].default_value = 5.0
    links.new(mapping.outputs['Vector'], wave.inputs['Vector'])

    # Noise — organic variation
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-700, 200)
    noise.inputs['Scale'].default_value = 20.0
    noise.inputs['Detail'].default_value = 8.0
    noise.inputs['Roughness'].default_value = 0.5
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    # Mix grain = Wave 65% + Noise 35%
    mix = nodes.new('ShaderNodeMix')
    mix.location = (-450, 350)
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.35
    links.new(wave.outputs['Fac'], mix.inputs[6])
    links.new(noise.outputs['Fac'], mix.inputs[7])

    # ColorRamp — map to wood tones (tighter range for visible contrast)
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.location = (-150, 350)
    cr = ramp.color_ramp
    cr.elements[0].position = 0.30
    cr.elements[0].color = (*dark, 1.0)
    cr.elements[1].position = 0.70
    cr.elements[1].color = (*light, 1.0)
    mid_elem = cr.elements.new(0.48)
    mid_elem.color = (*mid, 1.0)
    links.new(mix.outputs[2], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])

    # Bump from grain
    bump = nodes.new('ShaderNodeBump')
    bump.location = (100, 0)
    bump.inputs['Strength'].default_value = 0.06
    bump.inputs['Distance'].default_value = 0.008
    links.new(mix.outputs[2], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat


def _build_tile_floor(color, roughness):
    rough = roughness if roughness is not None else 0.3
    base_color = color or (0.85, 0.85, 0.88, 1.0)

    mat = bpy.data.materials.new(name="M_Floor_Tile")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-900, 300)

    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-700, 300)
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    # Checker for grid pattern
    checker = nodes.new('ShaderNodeTexChecker')
    checker.location = (-450, 400)
    checker.inputs['Scale'].default_value = 10.0
    checker.inputs['Color1'].default_value = base_color
    checker.inputs['Color2'].default_value = (
        base_color[0] * 0.92, base_color[1] * 0.92, base_color[2] * 0.92, 1.0
    )
    links.new(mapping.outputs['Vector'], checker.inputs['Vector'])

    # Noise for subtle variation
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 100)
    noise.inputs['Scale'].default_value = 25.0
    noise.inputs['Detail'].default_value = 4.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    mix = nodes.new('ShaderNodeMix')
    mix.location = (-200, 300)
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.05
    links.new(checker.outputs['Color'], mix.inputs[6])
    links.new(noise.outputs['Color'], mix.inputs[7])

    links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough

    return mat


def _build_concrete_floor(color, roughness):
    rough = roughness if roughness is not None else 0.8
    base_color = color or (0.60, 0.60, 0.62, 1.0)

    mat = bpy.data.materials.new(name="M_Floor_Concrete")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-900, 300)

    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-700, 300)
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    # Noise for base concrete
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 400)
    noise.inputs['Scale'].default_value = 5.0
    noise.inputs['Detail'].default_value = 6.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    # Voronoi for pitting / aggregate
    voronoi = nodes.new('ShaderNodeTexVoronoi')
    voronoi.location = (-450, 100)
    voronoi.inputs['Scale'].default_value = 8.0
    links.new(mapping.outputs['Vector'], voronoi.inputs['Vector'])

    mix = nodes.new('ShaderNodeMix')
    mix.location = (-200, 300)
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.4
    links.new(noise.outputs['Color'], mix.inputs[6])
    links.new(voronoi.outputs['Color'], mix.inputs[7])

    # Color ramp to constrain to grey tones
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.location = (0, 300)
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.55, 0.55, 0.57, 1.0)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (0.65, 0.65, 0.67, 1.0)
    links.new(mix.outputs[2], ramp.inputs['Fac'])

    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough

    # Bump from Voronoi
    bump = nodes.new('ShaderNodeBump')
    bump.location = (0, -50)
    bump.inputs['Strength'].default_value = 0.2
    bump.inputs['Distance'].default_value = 0.01
    links.new(voronoi.outputs['Distance'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat


def _build_tatami_floor(color, roughness):
    rough = roughness if roughness is not None else 0.75

    mat = bpy.data.materials.new(name="M_Floor_Tatami")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-900, 300)

    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-700, 300)
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    # Wave for straw weave pattern
    wave = nodes.new('ShaderNodeTexWave')
    wave.location = (-450, 300)
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Y'
    wave.inputs['Scale'].default_value = 20.0
    wave.inputs['Distortion'].default_value = 1.0
    links.new(mapping.outputs['Vector'], wave.inputs['Vector'])

    # Color ramp: straw tones
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.location = (-200, 300)
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (0.72, 0.68, 0.35, 1.0)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (0.80, 0.75, 0.42, 1.0)
    links.new(wave.outputs['Fac'], ramp.inputs['Fac'])

    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough

    # Bump from wave
    bump = nodes.new('ShaderNodeBump')
    bump.location = (-200, -50)
    bump.inputs['Strength'].default_value = 0.1
    bump.inputs['Distance'].default_value = 0.005
    links.new(wave.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat


def _build_marble_floor(color, roughness):
    rough = roughness if roughness is not None else 0.15

    mat = bpy.data.materials.new(name="M_Floor_Marble")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-900, 300)

    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-700, 300)
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    # Voronoi for vein structure
    voronoi = nodes.new('ShaderNodeTexVoronoi')
    voronoi.location = (-450, 400)
    voronoi.inputs['Scale'].default_value = 4.0
    links.new(mapping.outputs['Vector'], voronoi.inputs['Vector'])

    # Wave for directional veining
    wave = nodes.new('ShaderNodeTexWave')
    wave.location = (-450, 100)
    wave.wave_type = 'BANDS'
    wave.inputs['Scale'].default_value = 2.0
    wave.inputs['Distortion'].default_value = 8.0
    links.new(mapping.outputs['Vector'], wave.inputs['Vector'])

    # Mix veins
    mix = nodes.new('ShaderNodeMix')
    mix.location = (-200, 300)
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.5
    links.new(voronoi.outputs['Distance'], mix.inputs[6])
    links.new(wave.outputs['Fac'], mix.inputs[7])

    # Color ramp: white/grey marble
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.location = (0, 300)
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.92, 0.90, 0.88, 1.0)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (0.55, 0.52, 0.50, 1.0)
    links.new(mix.outputs[2], ramp.inputs['Fac'])

    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Specular IOR Level'].default_value = 0.8

    return mat


def _build_checkerboard_floor(color, roughness):
    rough = roughness if roughness is not None else 0.4
    c1 = color or (0.9, 0.9, 0.9, 1.0)
    c2 = (c1[0] * 0.15, c1[1] * 0.15, c1[2] * 0.15, 1.0)

    mat = bpy.data.materials.new(name="M_Floor_Checkerboard")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-700, 300)

    checker = nodes.new('ShaderNodeTexChecker')
    checker.location = (-400, 300)
    checker.inputs['Scale'].default_value = 8.0
    checker.inputs['Color1'].default_value = c1
    checker.inputs['Color2'].default_value = c2
    links.new(tex_coord.outputs['Generated'], checker.inputs['Vector'])

    links.new(checker.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough

    return mat


def _build_linoleum_floor(color, roughness):
    rough = roughness if roughness is not None else 0.35
    base_color = color or (0.6, 0.62, 0.65, 1.0)

    mat = bpy.data.materials.new(name="M_Floor_Linoleum")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-700, 300)

    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-500, 300)
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    # Very fine noise for subtle surface texture
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-300, 300)
    noise.inputs['Scale'].default_value = 50.0
    noise.inputs['Detail'].default_value = 2.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    # Mix noise into solid color slightly
    mix = nodes.new('ShaderNodeMix')
    mix.location = (-100, 300)
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.05
    mix.inputs[6].default_value = base_color  # A
    links.new(noise.outputs['Color'], mix.inputs[7])  # B

    links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough

    return mat
