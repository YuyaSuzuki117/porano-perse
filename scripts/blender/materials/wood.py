import bpy

WOOD_PALETTES = {
    'oak':      ((0.35, 0.22, 0.10), (0.52, 0.36, 0.20), (0.65, 0.48, 0.28)),
    'walnut':   ((0.18, 0.10, 0.05), (0.30, 0.18, 0.10), (0.42, 0.28, 0.15)),
    'birch':    ((0.72, 0.62, 0.48), (0.82, 0.72, 0.55), (0.90, 0.82, 0.65)),
    'ash':      ((0.65, 0.58, 0.45), (0.78, 0.70, 0.55), (0.88, 0.80, 0.65)),
    'pine':     ((0.75, 0.60, 0.35), (0.85, 0.70, 0.42), (0.92, 0.80, 0.52)),
    'teak':     ((0.45, 0.28, 0.12), (0.55, 0.35, 0.18), (0.65, 0.42, 0.22)),
    'mahogany': ((0.25, 0.08, 0.05), (0.38, 0.12, 0.08), (0.50, 0.18, 0.10)),
    'cherry':   ((0.55, 0.25, 0.15), (0.65, 0.32, 0.18), (0.75, 0.40, 0.22)),
}


def create_wood_material(wood_type='oak', roughness=0.45):
    """Create a procedural wood PBR material.

    Args:
        wood_type: One of 'oak', 'walnut', 'birch', 'ash', 'pine',
                   'teak', 'mahogany', 'cherry'.
        roughness: Surface roughness (0.0 - 1.0).

    Returns:
        bpy.types.Material
    """
    palette = WOOD_PALETTES.get(wood_type, WOOD_PALETTES['oak'])
    dark, mid, light = palette

    mat = bpy.data.materials.new(name=f"M_Wood_{wood_type}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    # --- Texture Coordinate & Mapping ---
    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-1200, 300)

    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-1000, 300)
    mapping.inputs['Scale'].default_value = (8.0, 2.0, 1.0)
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    # --- Wave Texture (wood grain bands) ---
    wave = nodes.new('ShaderNodeTexWave')
    wave.location = (-750, 400)
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'X'
    wave.wave_profile = 'SAW'
    wave.inputs['Scale'].default_value = 3.0
    wave.inputs['Distortion'].default_value = 5.0
    links.new(mapping.outputs['Vector'], wave.inputs['Vector'])

    # --- Noise Texture (grain variation) ---
    noise_grain = nodes.new('ShaderNodeTexNoise')
    noise_grain.location = (-750, 100)
    noise_grain.inputs['Scale'].default_value = 15.0
    noise_grain.inputs['Detail'].default_value = 6.0
    noise_grain.inputs['Distortion'].default_value = 2.5
    links.new(mapping.outputs['Vector'], noise_grain.inputs['Vector'])

    # --- Mix Wave + Noise ---
    mix_rgb = nodes.new('ShaderNodeMix')
    mix_rgb.location = (-500, 300)
    mix_rgb.data_type = 'RGBA'
    mix_rgb.inputs['Factor'].default_value = 0.3
    links.new(wave.outputs['Fac'], mix_rgb.inputs[6])      # A (Color)
    links.new(noise_grain.outputs['Fac'], mix_rgb.inputs[7]) # B (Color)

    # --- Color Ramp ---
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.location = (-250, 300)
    cr = ramp.color_ramp
    cr.elements[0].position = 0.3
    cr.elements[0].color = (*dark, 1.0)
    cr.elements[1].position = 0.7
    cr.elements[1].color = (*light, 1.0)
    mid_elem = cr.elements.new(0.5)
    mid_elem.color = (*mid, 1.0)

    links.new(mix_rgb.outputs[2], ramp.inputs['Fac'])  # Result (Color) output

    # --- Connect to BSDF ---
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness

    # --- Bump from fine noise ---
    noise_bump = nodes.new('ShaderNodeTexNoise')
    noise_bump.location = (-500, -100)
    noise_bump.inputs['Scale'].default_value = 40.0
    noise_bump.inputs['Detail'].default_value = 3.0
    links.new(mapping.outputs['Vector'], noise_bump.inputs['Vector'])

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-250, -100)
    bump.inputs['Strength'].default_value = 0.15
    bump.inputs['Distance'].default_value = 0.02
    links.new(noise_bump.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat
