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


def create_wall_material(color_hex='#FFFFFF', roughness=0.82):
    """Create wall material using Principled BSDF for Cycles with GI.

    With Cycles global illumination, walls no longer need emission hacks.
    Uses proper Principled BSDF with subtle noise bump for wall texture.
    """
    linear_color = hex_to_linear(color_hex)

    mat = bpy.data.materials.new(name=f"M_Wall_{color_hex.lstrip('#')}")
    mat.use_nodes = True
    mat.use_backface_culling = False

    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs['Base Color'].default_value = linear_color
    bsdf.inputs['Roughness'].default_value = roughness

    # Subtle bump for wall texture
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    tex_coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeMapping')
    links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])

    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 100.0
    noise.inputs['Detail'].default_value = 3.0
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.02
    bump.inputs['Distance'].default_value = 0.001
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat
