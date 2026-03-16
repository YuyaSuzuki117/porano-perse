"""Bar Counter — custom Blender model with ribbed wood panel + marble top.

Produces a bar counter with:
- White marble countertop (Carrara, shared with cafe_table)
- Ribbed dark wood front panel (vertical grooves)
- Dark wood side panels
- Concealed base/toe kick
"""

import bpy
import math


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def _get_marble_top():
    """Reuse Carrara marble from cafe_table if available, else create simple."""
    mat = bpy.data.materials.get("M_CarraraMarble_V2")
    if mat:
        return mat
    # Simple fallback
    mat = bpy.data.materials.new("M_CarraraMarble_V2")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs['Base Color'].default_value = (0.95, 0.93, 0.90, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.12
    return mat


def _get_ribbed_wood():
    """Dark wood with vertical ribbing pattern for counter front."""
    mat = bpy.data.materials.get("M_RibbedDarkWood")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_RibbedDarkWood")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for n in list(nodes):
        if n.name != "Material Output":
            nodes.remove(n)
    output = nodes["Material Output"]

    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (400, 0)

    # Texture coordinates
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-1000, 0)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-800, 0)
    mapping.inputs["Scale"].default_value = (1.0, 1.0, 40.0)  # Vertical stretch for ribs
    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])

    # Wave for vertical ribs
    wave = nodes.new("ShaderNodeTexWave")
    wave.location = (-550, 100)
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.wave_profile = "SIN"
    wave.inputs["Scale"].default_value = 30.0
    wave.inputs["Distortion"].default_value = 0.0
    wave.inputs["Detail"].default_value = 0.0
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])

    # Wood grain noise (subtle, along Y)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-550, -100)
    noise.inputs["Scale"].default_value = 8.0
    noise.inputs["Detail"].default_value = 6.0
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

    # Mix ribs and grain
    mix = nodes.new("ShaderNodeMixRGB")
    mix.location = (-300, 0)
    mix.blend_type = "MULTIPLY"
    mix.inputs["Fac"].default_value = 0.3
    links.new(wave.outputs["Fac"], mix.inputs["Color1"])
    links.new(noise.outputs["Fac"], mix.inputs["Color2"])

    # Color ramp — dark walnut tones
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-100, 0)
    ramp.color_ramp.elements[0].position = 0.2
    ramp.color_ramp.elements[0].color = (0.04, 0.025, 0.015, 1.0)  # Very dark
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[1].color = (0.12, 0.07, 0.04, 1.0)    # Dark walnut
    links.new(mix.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    bsdf.inputs["Roughness"].default_value = 0.35

    # Bump from ribs (strong vertical groove)
    bump = nodes.new("ShaderNodeBump")
    bump.location = (200, -150)
    bump.inputs["Strength"].default_value = 0.15
    bump.inputs["Distance"].default_value = 0.005
    links.new(wave.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def _get_toe_kick_mat():
    """Dark matte material for toe kick / base."""
    mat = bpy.data.materials.get("M_ToeKick")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_ToeKick")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8
    return mat


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _assign_material(obj, material):
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)


def _smooth_object(obj):
    if obj.type == "MESH":
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth()


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def create_bar_counter(name="BarCounter", location=(0, 0, 0)):
    """Create a bar counter with ribbed wood front and marble top.

    Default size: 4m wide x 0.6m deep x 1.1m high.
    Returns the root Empty parent object.
    """
    marble = _get_marble_top()
    ribbed_wood = _get_ribbed_wood()
    toe_mat = _get_toe_kick_mat()

    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent.location = location

    counter_w = 4.0
    counter_d = 0.6
    counter_h = 1.1
    top_thickness = 0.04
    toe_h = 0.1
    panel_inset = 0.02  # Front panel slightly recessed

    # --- MARBLE COUNTERTOP ---
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, counter_h - top_thickness / 2))
    top = bpy.context.active_object
    top.name = f"{name}_Top"
    top.scale = (counter_w / 2 + 0.02, counter_d / 2 + 0.02, top_thickness / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _assign_material(top, marble)
    mod = top.modifiers.new("Bevel", "BEVEL")
    mod.width = 0.005
    mod.segments = 3
    mod.limit_method = "ANGLE"
    _smooth_object(top)
    top.parent = parent

    # --- FRONT PANEL (ribbed wood) ---
    front_h = counter_h - top_thickness - toe_h
    bpy.ops.mesh.primitive_cube_add(size=1,
        location=(0, -counter_d / 2 + panel_inset, toe_h + front_h / 2))
    front = bpy.context.active_object
    front.name = f"{name}_Front"
    front.scale = (counter_w / 2, 0.015, front_h / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _assign_material(front, ribbed_wood)
    _smooth_object(front)
    front.parent = parent

    # --- SIDE PANELS (plain dark wood, same material) ---
    for side_name, x_pos in [("Left", -counter_w / 2), ("Right", counter_w / 2)]:
        bpy.ops.mesh.primitive_cube_add(size=1,
            location=(x_pos, 0, toe_h + front_h / 2))
        side = bpy.context.active_object
        side.name = f"{name}_Side_{side_name}"
        side.scale = (0.015, counter_d / 2, front_h / 2)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        _assign_material(side, ribbed_wood)
        _smooth_object(side)
        side.parent = parent

    # --- BACK PANEL ---
    bpy.ops.mesh.primitive_cube_add(size=1,
        location=(0, counter_d / 2 - 0.015, toe_h + front_h / 2))
    back = bpy.context.active_object
    back.name = f"{name}_Back"
    back.scale = (counter_w / 2, 0.015, front_h / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _assign_material(back, ribbed_wood)
    back.parent = parent

    # --- TOP RAIL (dark wood strip below countertop) ---
    bpy.ops.mesh.primitive_cube_add(size=1,
        location=(0, -counter_d / 2, counter_h - top_thickness - 0.015))
    rail = bpy.context.active_object
    rail.name = f"{name}_Rail"
    rail.scale = (counter_w / 2 + 0.005, 0.025, 0.015)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _assign_material(rail, ribbed_wood)
    mod = rail.modifiers.new("Bevel", "BEVEL")
    mod.width = 0.003
    mod.segments = 2
    rail.parent = parent

    # --- TOE KICK (recessed dark base) ---
    bpy.ops.mesh.primitive_cube_add(size=1,
        location=(0, -counter_d / 2 + 0.04, toe_h / 2))
    toe = bpy.context.active_object
    toe.name = f"{name}_ToeKick"
    toe.scale = (counter_w / 2 - 0.02, 0.04, toe_h / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _assign_material(toe, toe_mat)
    toe.parent = parent

    # --- COUNTER SHELF (inside, for equipment) ---
    bpy.ops.mesh.primitive_cube_add(size=1,
        location=(0, 0, counter_h * 0.45))
    shelf = bpy.context.active_object
    shelf.name = f"{name}_Shelf"
    shelf.scale = (counter_w / 2 - 0.03, counter_d / 2 - 0.04, 0.01)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _assign_material(shelf, ribbed_wood)
    shelf.parent = parent

    return parent
