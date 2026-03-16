import bpy


def hex_to_linear(h):
    """Convert a hex colour string to linear sRGB (r, g, b, a).

    Args:
        h: Hex string like '#FFFFFF' or 'FFFFFF'.

    Returns:
        Tuple (r, g, b, a) in linear space.
    """
    h = h.lstrip('#')
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    # sRGB to linear approximation
    return (r ** 2.2, g ** 2.2, b ** 2.2, 1.0)


def create_wall_material(color_hex='#FFFFFF', roughness=0.82):
    """Create a wall paint / wallpaper PBR material.

    Args:
        color_hex: Hex colour string for the wall paint.
        roughness: Surface roughness (typically 0.8+).

    Returns:
        bpy.types.Material
    """
    linear_color = hex_to_linear(color_hex)

    mat = bpy.data.materials.new(name=f"M_Wall_{color_hex.lstrip('#')}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    # Base colour
    bsdf.inputs['Base Color'].default_value = linear_color
    bsdf.inputs['Roughness'].default_value = roughness

    # Subtle wall texture via fine noise
    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-700, 300)

    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-500, 300)
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    noise = nodes.new('ShaderNodeTexNoise')
    noise.location = (-300, 300)
    noise.inputs['Scale'].default_value = 100.0
    noise.inputs['Detail'].default_value = 3.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    bump = nodes.new('ShaderNodeBump')
    bump.location = (-100, 300)
    bump.inputs['Strength'].default_value = 0.02
    bump.inputs['Distance'].default_value = 0.001
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat
