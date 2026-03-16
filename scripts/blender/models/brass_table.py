"""Polished Brass Side Table — high-quality Blender model via Python API.

A small round brass side table with:
- Top disc: φ450mm, 8mm thick
- Central column: φ25mm, height 600mm
- Base disc: φ300mm, 10mm thick
- All polished brass with Bevel modifiers for rounded edges
"""

import bpy
import math


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def _get_polished_brass():
    """Polished brass — roughness variation only (color fixed per material-recipes.md).

    Shared material: reuses cache from club_chair if already loaded.
    """
    mat = bpy.data.materials.get("M_PolishedBrass")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_PolishedBrass")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]

    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (320, 0)
    principled.inputs["Base Color"].default_value = (0.78, 0.57, 0.11, 1.0)
    principled.inputs["Metallic"].default_value = 0.95
    principled.inputs["Roughness"].default_value = 0.15

    # Roughness variation via noise (color stays fixed)
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-880, 20)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-680, 20)
    mapping.inputs["Scale"].default_value = (6.0, 6.0, 6.0)

    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-460, 20)
    noise.inputs["Scale"].default_value = 30.0
    noise.inputs["Detail"].default_value = 4.0
    noise.inputs["Roughness"].default_value = 0.4

    # Roughness ramp (subtle variation around 0.15)
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-220, 20)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[0].color = (0.10, 0.10, 0.10, 1.0)
    ramp.color_ramp.elements[1].color = (0.22, 0.22, 0.22, 1.0)

    # Very subtle bump
    bump = nodes.new("ShaderNodeBump")
    bump.location = (80, -120)
    bump.inputs["Strength"].default_value = 0.003

    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Roughness"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    return mat


# ---------------------------------------------------------------------------
# Geometry helpers
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

def create_brass_table(name="BrassTable", location=(0, 0, 0)):
    """Create a small round polished brass side table at the given location.

    Dimensions:
    - Top: φ450mm, 8mm thick
    - Column: φ25mm, 600mm tall
    - Base: φ300mm, 10mm thick
    - Total height: ~618mm (base 10mm + column 600mm + top 8mm)

    Returns the root object (Empty parent).
    """
    brass = _get_polished_brass()

    # Parent empty
    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent.location = location

    # Vertical layout:
    #   Base bottom: z=0
    #   Base top:    z=0.010
    #   Column:      z=0.010 → z=0.610
    #   Top bottom:  z=0.610
    #   Top top:     z=0.618

    # -----------------------------------------------------------------------
    # BASE DISC (φ300mm = r0.15, 10mm thick)
    # -----------------------------------------------------------------------
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.15, depth=0.010, vertices=80,
        location=(0, 0, 0.005),
    )
    base = bpy.context.active_object
    base.name = f"{name}_Base"
    _assign_material(base, brass)
    _smooth_object(base)
    mod = base.modifiers.new("Bevel", "BEVEL")
    mod.width = 0.003
    mod.segments = 4
    mod.limit_method = "ANGLE"
    base.parent = parent

    # -----------------------------------------------------------------------
    # CENTRAL COLUMN (φ25mm = r0.0125, 600mm tall)
    # -----------------------------------------------------------------------
    column_height = 0.600
    column_center_z = 0.010 + column_height / 2.0  # 0.310
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.0125, depth=column_height, vertices=32,
        location=(0, 0, column_center_z),
    )
    column = bpy.context.active_object
    column.name = f"{name}_Column"
    _assign_material(column, brass)
    _smooth_object(column)
    column.parent = parent

    # Small fillet ring at column-base junction
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.020, depth=0.006, vertices=32,
        location=(0, 0, 0.013),
    )
    fillet_base = bpy.context.active_object
    fillet_base.name = f"{name}_FilletBase"
    _assign_material(fillet_base, brass)
    _smooth_object(fillet_base)
    mod = fillet_base.modifiers.new("Bevel", "BEVEL")
    mod.width = 0.002
    mod.segments = 3
    mod.limit_method = "ANGLE"
    fillet_base.parent = parent

    # Small fillet ring at column-top junction
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.020, depth=0.006, vertices=32,
        location=(0, 0, 0.607),
    )
    fillet_top = bpy.context.active_object
    fillet_top.name = f"{name}_FilletTop"
    _assign_material(fillet_top, brass)
    _smooth_object(fillet_top)
    mod = fillet_top.modifiers.new("Bevel", "BEVEL")
    mod.width = 0.002
    mod.segments = 3
    mod.limit_method = "ANGLE"
    fillet_top.parent = parent

    # -----------------------------------------------------------------------
    # TOP DISC (φ450mm = r0.225, 8mm thick)
    # -----------------------------------------------------------------------
    top_z = 0.010 + column_height + 0.004  # 0.614 (center of 8mm disc)
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.225, depth=0.008, vertices=80,
        location=(0, 0, top_z),
    )
    top = bpy.context.active_object
    top.name = f"{name}_Top"
    _assign_material(top, brass)
    _smooth_object(top)
    mod = top.modifiers.new("Bevel", "BEVEL")
    mod.width = 0.003
    mod.segments = 4
    mod.limit_method = "ANGLE"
    top.parent = parent

    return parent
