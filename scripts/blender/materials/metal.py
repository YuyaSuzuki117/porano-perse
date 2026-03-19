import bpy

METAL_PRESETS = {
    'brushed':  {'color': (0.75, 0.75, 0.78, 1.0), 'roughness': 0.35, 'metallic': 0.95},
    'polished': {'color': (0.85, 0.85, 0.88, 1.0), 'roughness': 0.05, 'metallic': 1.0},
    'oxidized': {'color': (0.35, 0.45, 0.40, 1.0), 'roughness': 0.65, 'metallic': 0.7},
    'matte':    {'color': (0.50, 0.50, 0.52, 1.0), 'roughness': 0.60, 'metallic': 0.9},
    'brass':    {'color': (0.80, 0.65, 0.25, 1.0), 'roughness': 0.30, 'metallic': 0.95},
    'dark':     {'color': (0.15, 0.15, 0.18, 1.0), 'roughness': 0.45, 'metallic': 0.9},
}


def create_metal_material(finish='brushed', color=None, roughness=None):
    """Create a procedural metal PBR material.

    Args:
        finish: One of 'brushed', 'polished', 'oxidized', 'matte', 'brass'.
        color: Base color tuple (r, g, b, a) or None for preset default.
        roughness: Surface roughness override or None for preset default.

    Returns:
        bpy.types.Material
    """
    preset = METAL_PRESETS.get(finish, METAL_PRESETS['brushed'])
    base_color = color or preset['color']
    rough = roughness if roughness is not None else preset['roughness']
    metallic = preset['metallic']

    mat = bpy.data.materials.new(name=f"M_Metal_{finish}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metallic

    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-900, 300)

    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-700, 300)
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    if finish == 'brushed':
        _build_brushed(nodes, links, mapping, bsdf)
    elif finish == 'polished':
        _build_polished(nodes, links, mapping, bsdf)
    elif finish == 'oxidized':
        _build_oxidized(nodes, links, mapping, bsdf, base_color)
    elif finish == 'matte':
        _build_matte(nodes, links, mapping, bsdf)
    elif finish == 'brass':
        _build_brass(nodes, links, mapping, bsdf)
    else:
        _build_brushed(nodes, links, mapping, bsdf)

    return mat


# ---------------------------------------------------------------------------
# Internal builders
# ---------------------------------------------------------------------------

def _build_brushed(nodes, links, mapping, bsdf):
    """Brushed metal: anisotropic noise pattern."""
    # Stretch mapping for directional brushing
    mapping.inputs['Scale'].default_value = (1.0, 50.0, 1.0)

    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 300)
    noise.inputs['Scale'].default_value = 30.0
    noise.inputs['Detail'].default_value = 6.0
    noise.inputs['Distortion'].default_value = 0.5
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-200, 300)
    bump.inputs['Strength'].default_value = 0.1
    bump.inputs['Distance'].default_value = 0.003
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def _build_polished(nodes, links, mapping, bsdf):
    """Polished metal: minimal surface detail."""
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 300)
    noise.inputs['Scale'].default_value = 80.0
    noise.inputs['Detail'].default_value = 2.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-200, 300)
    bump.inputs['Strength'].default_value = 0.02
    bump.inputs['Distance'].default_value = 0.001
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def _build_oxidized(nodes, links, mapping, bsdf, base_color):
    """Oxidized metal: noise for patina variation."""
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 400)
    noise.inputs['Scale'].default_value = 6.0
    noise.inputs['Detail'].default_value = 8.0
    noise.inputs['Distortion'].default_value = 3.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    # Patina color variation
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.location = (-200, 400)
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = base_color
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (0.28, 0.55, 0.45, 1.0)
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])

    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-200, 50)
    bump.inputs['Strength'].default_value = 0.3
    bump.inputs['Distance'].default_value = 0.01
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def _build_matte(nodes, links, mapping, bsdf):
    """Matte metal: flat, subtle surface noise."""
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 300)
    noise.inputs['Scale'].default_value = 50.0
    noise.inputs['Detail'].default_value = 3.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-200, 300)
    bump.inputs['Strength'].default_value = 0.05
    bump.inputs['Distance'].default_value = 0.002
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def _build_brass(nodes, links, mapping, bsdf):
    """Brass: warm tone with subtle surface detail."""
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-450, 300)
    noise.inputs['Scale'].default_value = 25.0
    noise.inputs['Detail'].default_value = 5.0
    noise.inputs['Distortion'].default_value = 1.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-200, 300)
    bump.inputs['Strength'].default_value = 0.08
    bump.inputs['Distance'].default_value = 0.003
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
