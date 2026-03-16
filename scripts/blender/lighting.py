"""6-layer lighting system driven by scene JSON (Cycles).

Layers:
  1. Ceiling main Area Light
  2. Window natural lights (per opening)
  3. Accent Spot Light
  4. Pendant Point Lights (per furniture item of type pendant_light)
  5. World environment background
  6. Fill light (reduced energy — Cycles GI handles bounce lighting)
"""

import bpy
import math

from .core import hex_to_rgba, to_blender, link_to_collection


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def hex_to_linear(h):
    """Convert hex color string to (r, g, b) in linear sRGB."""
    rgba = hex_to_rgba(h, alpha=1.0)
    return (rgba[0], rgba[1], rgba[2])


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def setup_lighting(scene_data, collections):
    """Create the 5-layer lighting setup from scene_data.

    Args:
        scene_data: Parsed scene JSON dict.
        collections: Dict mapping collection names to bpy.types.Collection.
    """
    room = scene_data.get("room", {})
    style = scene_data.get("style", {})
    openings = scene_data.get("openings", [])
    furniture = scene_data.get("furniture", [])

    W = float(room.get("width", 5.0))
    D = float(room.get("depth", 5.0))
    H = float(room.get("height", 3.0))

    spot_intensity = float(style.get("spotlightIntensity", 1.0))
    spot_color_hex = style.get("spotlightColor", "#FFD090")
    sky_color_hex = style.get("hemisphereSkyColor", "#C8D8E8")
    # ground_color_hex = style.get("hemisphereGroundColor", "#8B7355")

    spot_color = hex_to_linear(spot_color_hex)
    sky_color = hex_to_linear(sky_color_hex)

    lighting_col = collections.get("04_Lighting")

    # -----------------------------------------------------------------------
    # Layer 1: Ceiling main Area Light
    # -----------------------------------------------------------------------
    bpy.ops.object.light_add(type='AREA', location=(0, 0, H - 0.05))
    ceiling_light = bpy.context.active_object
    ceiling_light.name = "Light_Ceiling_Main"
    ceiling_light.data.energy = spot_intensity * 250
    ceiling_light.data.size = min(W, D) * 0.7
    ceiling_light.data.color = spot_color
    ceiling_light.data.use_shadow = True
    if lighting_col:
        link_to_collection(ceiling_light, lighting_col)
    print(f"[lighting] Layer 1: Ceiling main — energy={ceiling_light.data.energy:.0f}")

    # -----------------------------------------------------------------------
    # Layer 2: Window natural lights
    # -----------------------------------------------------------------------
    win_count = 0
    for idx, opening in enumerate(openings):
        if opening.get("type") != "window":
            continue

        wall = opening.get("wall", "north")
        pos_along = float(opening.get("positionAlongWall", W / 2))
        ow = float(opening.get("width", 1.0))
        oh = float(opening.get("height", 1.2))
        elev = float(opening.get("elevation", 0.9))

        if wall == "north":
            cx = -W / 2 + pos_along
            loc = (cx, D / 2 - 0.2, elev + oh / 2)
            rot = (math.pi / 2, 0, 0)
        elif wall == "south":
            cx = -W / 2 + pos_along
            loc = (cx, -D / 2 + 0.2, elev + oh / 2)
            rot = (-math.pi / 2, 0, 0)
        elif wall == "east":
            cy = -D / 2 + pos_along
            loc = (W / 2 - 0.2, cy, elev + oh / 2)
            rot = (0, math.pi / 2, 0)
        elif wall == "west":
            cy = -D / 2 + pos_along
            loc = (-W / 2 + 0.2, cy, elev + oh / 2)
            rot = (0, -math.pi / 2, 0)
        else:
            continue

        bpy.ops.object.light_add(type='AREA', location=loc, rotation=rot)
        win_light = bpy.context.active_object
        win_light.name = f"Light_Window_{idx:02d}"
        win_light.data.energy = 120
        win_light.data.size = ow
        win_light.data.color = (0.9, 0.95, 1.0)
        win_light.data.use_shadow = True
        if lighting_col:
            link_to_collection(win_light, lighting_col)
        win_count += 1

    print(f"[lighting] Layer 2: Window natural — {win_count} lights")

    # -----------------------------------------------------------------------
    # Layer 3: Accent Spot Light
    # -----------------------------------------------------------------------
    accent_loc = (0, D / 4, H - 0.1)
    bpy.ops.object.light_add(type='SPOT', location=accent_loc)
    accent = bpy.context.active_object
    accent.name = "Light_Accent_Spot"
    accent.data.energy = spot_intensity * 160
    accent.data.spot_size = 1.0
    accent.data.color = spot_color
    # Aim downward toward room center
    accent.rotation_euler = (math.pi / 2, 0, 0)
    if lighting_col:
        link_to_collection(accent, lighting_col)
    print(f"[lighting] Layer 3: Accent spot — energy={accent.data.energy:.0f}")

    # -----------------------------------------------------------------------
    # Layer 4: Pendant Point Lights
    # -----------------------------------------------------------------------
    pendant_count = 0
    # Create a warm variant of spot color
    warm_color = (
        min(spot_color[0] * 1.1, 1.0),
        spot_color[1] * 0.9,
        spot_color[2] * 0.7,
    )
    for idx, item in enumerate(furniture):
        if item.get("type") != "pendant_light":
            continue

        app_pos = item.get("position", [0, 0, 0])
        bl_pos = to_blender(app_pos)

        bpy.ops.object.light_add(type='POINT', location=bl_pos)
        pendant = bpy.context.active_object
        pendant.name = f"Light_Pendant_{idx:02d}"
        pendant.data.energy = 40
        pendant.data.color = warm_color
        pendant.data.shadow_soft_size = 0.2
        if lighting_col:
            link_to_collection(pendant, lighting_col)
        pendant_count += 1

    print(f"[lighting] Layer 4: Pendant lights — {pendant_count} lights")

    # -----------------------------------------------------------------------
    # Layer 5: World environment
    # -----------------------------------------------------------------------
    world = bpy.data.worlds.get("World")
    if world is None:
        world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world

    world.use_nodes = True
    nodes = world.node_tree.nodes
    bg_node = nodes.get("Background")
    if bg_node is None:
        bg_node = nodes.new('ShaderNodeBackground')
    # Use wall color for world background to illuminate walls correctly
    wall_color_hex = scene_data.get("style", {}).get("wallColor", "#FFFFFF")
    from .core import hex_to_rgba
    wall_rgba = hex_to_rgba(wall_color_hex)
    bg_node.inputs['Color'].default_value = (
        wall_rgba[0] * 0.5 + sky_color[0] * 0.5,
        wall_rgba[1] * 0.5 + sky_color[1] * 0.5,
        wall_rgba[2] * 0.5 + sky_color[2] * 0.5,
        1.0
    )
    bg_node.inputs['Strength'].default_value = 0.5

    print("[lighting] Layer 5: World environment set")

    # -----------------------------------------------------------------------
    # Layer 6: Fill light (shadow-less, reduced for Cycles GI)
    # -----------------------------------------------------------------------
    bpy.ops.object.light_add(type='AREA', location=(0, 0, H - 0.3))
    fill = bpy.context.active_object
    fill.name = "Light_Fill"
    fill.data.energy = 50
    fill.data.size = max(W, D) * 1.2
    fill.data.color = (1.0, 0.97, 0.93)
    fill.data.use_shadow = False
    if lighting_col:
        link_to_collection(fill, lighting_col)
    print("[lighting] Layer 6: Fill light (no shadow, reduced for Cycles GI)")

    print(f"[lighting] Setup complete — 6 layers configured")
