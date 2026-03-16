import bpy

FABRIC_DEFAULTS = {
    'linen':  {'color': (0.78, 0.75, 0.68, 1.0), 'roughness': 0.75},
    'velvet': {'color': (0.25, 0.12, 0.18, 1.0), 'roughness': 0.40},
    'tweed':  {'color': (0.45, 0.40, 0.32, 1.0), 'roughness': 0.85},
    'canvas': {'color': (0.72, 0.68, 0.58, 1.0), 'roughness': 0.80},
    'wool':   {'color': (0.60, 0.55, 0.50, 1.0), 'roughness': 0.90},
}


def create_fabric_material(fabric_type='linen', color=None, roughness=0.7):
    """Create a procedural fabric PBR material.

    Args:
        fabric_type: One of 'linen', 'velvet', 'tweed', 'canvas', 'wool'.
        color: Base color tuple (r, g, b, a) or None for type default.
        roughness: Surface roughness override.

    Returns:
        bpy.types.Material
    """
    defaults = FABRIC_DEFAULTS.get(fabric_type, FABRIC_DEFAULTS['linen'])
    base_color = color or defaults['color']
    rough = roughness if roughness != 0.7 else defaults['roughness']

    mat = bpy.data.materials.new(name=f"M_Fabric_{fabric_type}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-900, 300)

    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-700, 300)
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    if fabric_type == 'linen':
        _build_linen(nodes, links, mapping, bsdf, base_color, rough)
    elif fabric_type == 'velvet':
        _build_velvet(nodes, links, mapping, bsdf, base_color, rough)
    elif fabric_type == 'tweed':
        _build_tweed(nodes, links, mapping, bsdf, base_color, rough)
    elif fabric_type == 'canvas':
        _build_canvas(nodes, links, mapping, bsdf, base_color, rough)
    elif fabric_type == 'wool':
        _build_wool(nodes, links, mapping, bsdf, base_color, rough)
    else:
        _build_linen(nodes, links, mapping, bsdf, base_color, rough)

    return mat


# ---------------------------------------------------------------------------
# Internal builders
# ---------------------------------------------------------------------------

def _build_linen(nodes, links, mapping, bsdf, color, roughness):
    """Linen: Noise + subtle Wave for weave."""
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 400)
    noise.inputs['Scale'].default_value = 30.0
    noise.inputs['Detail'].default_value = 5.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    wave = nodes.new('ShaderNodeTexWave')
    wave.location = (-450, 100)
    wave.wave_type = 'BANDS'
    wave.inputs['Scale'].default_value = 25.0
    wave.inputs['Distortion'].default_value = 0.5
    links.new(mapping.outputs['Vector'], wave.inputs['Vector'])

    mix = nodes.new('ShaderNodeMix')
    mix.location = (-200, 300)
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.15
    mix.inputs[6].default_value = color
    links.new(noise.outputs['Fac'], mix.inputs[7])

    links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-200, -50)
    bump.inputs['Strength'].default_value = 0.1
    bump.inputs['Distance'].default_value = 0.005
    links.new(wave.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def _build_velvet(nodes, links, mapping, bsdf, color, roughness):
    """Velvet: Very smooth Noise, low roughness + sheen."""
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 300)
    noise.inputs['Scale'].default_value = 60.0
    noise.inputs['Detail'].default_value = 4.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    mix = nodes.new('ShaderNodeMix')
    mix.location = (-200, 300)
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.08
    mix.inputs[6].default_value = color
    links.new(noise.outputs['Color'], mix.inputs[7])

    links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness

    # Sheen for velvet look
    try:
        bsdf.inputs['Sheen Weight'].default_value = 0.8
        bsdf.inputs['Sheen Tint'].default_value = color
    except KeyError:
        try:
            bsdf.inputs['Sheen'].default_value = 0.8
        except KeyError:
            pass

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-200, -50)
    bump.inputs['Strength'].default_value = 0.05
    bump.inputs['Distance'].default_value = 0.002
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def _build_tweed(nodes, links, mapping, bsdf, color, roughness):
    """Tweed: Voronoi + Noise for coarse texture."""
    voronoi = nodes.new('ShaderNodeTexVoronoi')
    voronoi.location = (-450, 400)
    voronoi.inputs['Scale'].default_value = 15.0
    links.new(mapping.outputs['Vector'], voronoi.inputs['Vector'])

    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 100)
    noise.inputs['Scale'].default_value = 20.0
    noise.inputs['Detail'].default_value = 6.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    mix = nodes.new('ShaderNodeMix')
    mix.location = (-200, 350)
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.3
    links.new(voronoi.outputs['Color'], mix.inputs[6])
    links.new(noise.outputs['Color'], mix.inputs[7])

    # Color mix with base
    color_mix = nodes.new('ShaderNodeMix')
    color_mix.location = (0, 300)
    color_mix.data_type = 'RGBA'
    color_mix.inputs['Factor'].default_value = 0.6
    color_mix.inputs[6].default_value = color
    links.new(mix.outputs[2], color_mix.inputs[7])

    links.new(color_mix.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness

    bump = nodes.new('ShaderNodeBump')
    bump.location = (0, -50)
    bump.inputs['Strength'].default_value = 0.2
    bump.inputs['Distance'].default_value = 0.008
    links.new(voronoi.outputs['Distance'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def _build_canvas(nodes, links, mapping, bsdf, color, roughness):
    """Canvas: Checker-like pattern + Noise."""
    checker = nodes.new('ShaderNodeTexChecker')
    checker.location = (-450, 400)
    checker.inputs['Scale'].default_value = 25.0
    checker.inputs['Color1'].default_value = color
    checker.inputs['Color2'].default_value = (
        color[0] * 0.85, color[1] * 0.85, color[2] * 0.85, 1.0
    )
    links.new(mapping.outputs['Vector'], checker.inputs['Vector'])

    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 100)
    noise.inputs['Scale'].default_value = 30.0
    noise.inputs['Detail'].default_value = 4.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    mix = nodes.new('ShaderNodeMix')
    mix.location = (-200, 300)
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.1
    links.new(checker.outputs['Color'], mix.inputs[6])
    links.new(noise.outputs['Color'], mix.inputs[7])

    links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-200, -50)
    bump.inputs['Strength'].default_value = 0.12
    bump.inputs['Distance'].default_value = 0.005
    links.new(checker.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def _build_wool(nodes, links, mapping, bsdf, color, roughness):
    """Wool: Dense Noise for fuzzy look."""
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 300)
    noise.inputs['Scale'].default_value = 20.0
    noise.inputs['Detail'].default_value = 8.0
    noise.inputs['Distortion'].default_value = 1.5
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    mix = nodes.new('ShaderNodeMix')
    mix.location = (-200, 300)
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.2
    mix.inputs[6].default_value = color
    links.new(noise.outputs['Color'], mix.inputs[7])

    links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-200, -50)
    bump.inputs['Strength'].default_value = 0.25
    bump.inputs['Distance'].default_value = 0.01
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
