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
    """Create wall material using Diffuse + Emission mix for EEVEE interiors.

    Uses Mix Shader: 70% Diffuse BSDF + 30% Emission to ensure walls
    show their color even in enclosed EEVEE scenes without GI.
    """
    linear_color = hex_to_linear(color_hex)

    mat = bpy.data.materials.new(name=f"M_Wall_{color_hex.lstrip('#')}")
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # Clear default nodes
    for n in nodes:
        nodes.remove(n)

    # Output
    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (400, 0)

    # Diffuse BSDF (for light response)
    diffuse = nodes.new('ShaderNodeBsdfDiffuse')
    diffuse.location = (-200, 100)
    diffuse.inputs['Color'].default_value = linear_color
    diffuse.inputs['Roughness'].default_value = roughness

    # Emission (for self-illumination in closed rooms)
    emission = nodes.new('ShaderNodeEmission')
    emission.location = (-200, -100)
    emission.inputs['Color'].default_value = linear_color
    emission.inputs['Strength'].default_value = 0.4

    # Mix Shader: 70% diffuse + 30% emission
    mix = nodes.new('ShaderNodeMixShader')
    mix.location = (150, 0)
    mix.inputs['Fac'].default_value = 0.3  # 30% emission

    links.new(diffuse.outputs['BSDF'], mix.inputs[1])
    links.new(emission.outputs['Emission'], mix.inputs[2])
    links.new(mix.outputs['Shader'], output.inputs['Surface'])

    return mat
