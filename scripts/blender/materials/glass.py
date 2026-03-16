import bpy


def create_glass_material(tint=None, roughness=0.02):
    """Create a glass PBR material for windows and displays.

    Args:
        tint: Color tint tuple (r, g, b, a) or None for default light blue.
        roughness: Surface roughness (default 0.02 for clear glass).

    Returns:
        bpy.types.Material
    """
    base_color = tint or (0.85, 0.92, 1.0, 1.0)
    tint_name = "tinted" if tint else "clear"

    mat = bpy.data.materials.new(name=f"M_Glass_{tint_name}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Alpha'].default_value = 0.12

    # Transmission — handle Blender version differences
    try:
        bsdf.inputs['Transmission Weight'].default_value = 0.95
    except KeyError:
        try:
            bsdf.inputs['Transmission'].default_value = 0.95
        except KeyError:
            pass

    # Blend mode for transparency
    try:
        mat.surface_render_method = 'BLENDED'
    except (AttributeError, TypeError):
        pass

    return mat
