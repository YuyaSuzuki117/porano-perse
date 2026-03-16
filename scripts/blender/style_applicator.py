"""Post-processing style application.

Applies StyleConfig to the scene after room and furniture are built.
Handles world background and color management.
With Cycles GI, ambient occlusion is handled naturally by the renderer.
"""

import bpy
import math

from .core import hex_to_rgba


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def apply_style(scene_data):
    """Apply style post-processing to the scene.

    This is a thin coordinator called after room_builder, furniture_importer,
    and lighting have run. Its main jobs:
      1. Ensure World background matches style.hemisphereSkyColor
      2. Set color management (AgX, exposure, gamma)

    Args:
        scene_data: Parsed scene JSON dict.
    """
    style = scene_data.get("style", {})
    sky_color_hex = style.get("hemisphereSkyColor", "#C8D8E8")

    # -------------------------------------------------------------------
    # 1. World background (set if not already configured by lighting)
    # -------------------------------------------------------------------
    world = bpy.data.worlds.get("World")
    if world is None:
        world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world

    world.use_nodes = True
    nodes = world.node_tree.nodes
    bg_node = nodes.get("Background")
    if bg_node is None:
        bg_node = nodes.new('ShaderNodeBackground')

    sky_rgba = hex_to_rgba(sky_color_hex)
    bg_node.inputs['Color'].default_value = sky_rgba
    bg_node.inputs['Strength'].default_value = 0.3

    print(f"[style] World background set — {sky_color_hex}")

    # -------------------------------------------------------------------
    # 2. Color management (AgX works well with Cycles)
    # -------------------------------------------------------------------
    scene = bpy.context.scene
    try:
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = 'AgX - Medium High Contrast'
        print("[style] Color management: AgX - Medium High Contrast")
    except Exception:
        try:
            scene.view_settings.view_transform = 'Filmic'
            scene.view_settings.look = 'None'
            print("[style] Color management: Filmic (fallback)")
        except Exception:
            print("[style] Color management: using defaults")

    scene.view_settings.exposure = 0.3
    scene.view_settings.gamma = 1.0

    print("[style] Style application complete")
