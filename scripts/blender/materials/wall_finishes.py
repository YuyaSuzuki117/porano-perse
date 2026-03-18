import bpy


def hex_to_linear(h):
    """Convert hex colour to linear sRGB (r, g, b, a)."""
    h = h.lstrip('#')
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0

    def srgb_to_linear(c):
        if c <= 0.04045:
            return c / 12.92
        return ((c + 0.055) / 1.055) ** 2.4

    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


def create_wall_material(color_hex='#FFFFFF', roughness=0.45):
    """Create wall material with subtle plaster texture for realistic interior.

    Features:
    - Subtle color variation (avoids flat CG look)
    - Micro-bump for plaster texture
    - Slight roughness variation

    Note: roughness=0.45 is standard for painted interior walls.
          0.82 was too high (looked like raw concrete).
    """
    linear_color = hex_to_linear(color_hex)

    mat = bpy.data.materials.new(name=f"M_Wall_{color_hex.lstrip('#')}")
    mat.use_nodes = True
    mat.use_backface_culling = False

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs['Roughness'].default_value = roughness

    # Texture coordinates
    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-1100, 300)
    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-900, 300)
    links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])

    # Large-scale color variation (plaster patches)
    noise_large = nodes.new('ShaderNodeTexNoise')
    noise_large.location = (-650, 400)
    noise_large.inputs['Scale'].default_value = 2.0
    noise_large.inputs['Detail'].default_value = 3.0
    noise_large.inputs['Roughness'].default_value = 0.6
    links.new(mapping.outputs['Vector'], noise_large.inputs['Vector'])

    # Mix base color with slightly darker variant
    r, g, b, a = linear_color
    dark_color = (r * 0.92, g * 0.92, b * 0.92, 1.0)

    mix_color = nodes.new('ShaderNodeMix')
    mix_color.location = (-350, 350)
    mix_color.data_type = 'RGBA'
    mix_color.inputs[6].default_value = linear_color  # A
    mix_color.inputs[7].default_value = dark_color     # B
    links.new(noise_large.outputs['Fac'], mix_color.inputs['Factor'])
    # Clamp variation to subtle range
    mix_color.inputs['Factor'].default_value = 0.0  # overridden by link
    mix_color.clamp_factor = True

    # Remap noise to narrow range for subtlety
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.location = (-500, 400)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp.color_ramp.elements[1].position = 0.65
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(noise_large.outputs['Fac'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], mix_color.inputs['Factor'])

    links.new(mix_color.outputs[2], bsdf.inputs['Base Color'])

    # Micro-bump for plaster texture
    noise_fine = nodes.new('ShaderNodeTexNoise')
    noise_fine.location = (-650, -50)
    noise_fine.inputs['Scale'].default_value = 150.0
    noise_fine.inputs['Detail'].default_value = 4.0
    links.new(mapping.outputs['Vector'], noise_fine.inputs['Vector'])

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-350, -50)
    bump.inputs['Strength'].default_value = 0.03
    bump.inputs['Distance'].default_value = 0.001
    links.new(noise_fine.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    # Roughness variation
    roughness_mix = nodes.new('ShaderNodeMath')
    roughness_mix.location = (-350, -200)
    roughness_mix.operation = 'ADD'
    roughness_mix.inputs[0].default_value = roughness
    links.new(noise_large.outputs['Fac'], roughness_mix.inputs[1])

    roughness_clamp = nodes.new('ShaderNodeClamp')
    roughness_clamp.location = (-200, -200)
    roughness_clamp.inputs['Min'].default_value = roughness - 0.05
    roughness_clamp.inputs['Max'].default_value = roughness + 0.05
    links.new(roughness_mix.outputs['Value'], roughness_clamp.inputs['Value'])
    links.new(roughness_clamp.outputs['Result'], bsdf.inputs['Roughness'])

    return mat


def create_mirror_wall_material(tint_hex='#1A1A2A', roughness=0.05):
    """Create mirror wall material with realistic reflective surface.

    Features:
    - Metallic: 1.0 (full metallic reflection)
    - Very low roughness for near-perfect mirror
    - Dark tint for realistic mirror appearance
    - Subtle noise for micro-roughness variation (±0.02)
    - Very weak bump for micro-distortion of real mirrors

    Args:
        tint_hex: Base tint color hex (default: dark blue/purple)
        roughness: Base roughness (default: 0.05, near-mirror)

    Returns:
        bpy.types.Material
    """
    linear_color = hex_to_linear(tint_hex)

    mat = bpy.data.materials.new(name=f"M_Mirror_{tint_hex.lstrip('#')}")
    mat.use_nodes = True
    mat.use_backface_culling = False

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    # Core mirror properties
    bsdf.inputs['Base Color'].default_value = linear_color
    bsdf.inputs['Metallic'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = roughness

    # Texture coordinates
    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-900, 300)
    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-700, 300)
    links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])

    # Micro-roughness variation via noise (±0.02)
    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-500, 200)
    noise.inputs['Scale'].default_value = 80.0
    noise.inputs['Detail'].default_value = 4.0
    noise.inputs['Roughness'].default_value = 0.5
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    # Map noise to roughness ± 0.02 range
    roughness_remap = nodes.new('ShaderNodeMapRange')
    roughness_remap.location = (-300, 200)
    roughness_remap.inputs['From Min'].default_value = 0.0
    roughness_remap.inputs['From Max'].default_value = 1.0
    roughness_remap.inputs['To Min'].default_value = max(roughness - 0.02, 0.0)
    roughness_remap.inputs['To Max'].default_value = roughness + 0.02
    links.new(noise.outputs['Fac'], roughness_remap.inputs['Value'])
    links.new(roughness_remap.outputs['Result'], bsdf.inputs['Roughness'])

    # Very weak bump for micro-distortion (real mirrors are not perfectly flat)
    noise_bump = nodes.new('ShaderNodeTexNoise')
    noise_bump.location = (-500, -50)
    noise_bump.inputs['Scale'].default_value = 200.0
    noise_bump.inputs['Detail'].default_value = 6.0
    noise_bump.inputs['Roughness'].default_value = 0.4
    links.new(mapping.outputs['Vector'], noise_bump.inputs['Vector'])

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-300, -50)
    bump.inputs['Strength'].default_value = 0.005
    bump.inputs['Distance'].default_value = 0.0005
    links.new(noise_bump.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat
