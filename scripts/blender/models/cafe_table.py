"""cafe_table.py — Modern Marble Cafe Table

Carrara marble top + matte black metal trumpet pedestal.

Specs:
  Total height : 750 mm
  Top          : φ700 mm Carrara marble disc, 25 mm thick
  Pedestal     : φ40 mm column, matte black metal
  Base         : φ400 mm trumpet/tulip shape, matte black
"""

import bpy
import math


def _get_marble_material():
    """Carrara marble: white base with grey veining."""
    mat = bpy.data.materials.get("M_CarraraMarble")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_CarraraMarble")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    # White marble base
    bsdf.inputs['Roughness'].default_value = 0.15
    bsdf.inputs['Specular IOR Level'].default_value = 0.5

    # Vein pattern: Voronoi + Wave mixed
    tex_coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (2, 2, 2)
    links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])

    # Voronoi for cell structure
    voronoi = nodes.new('ShaderNodeTexVoronoi')
    voronoi.inputs['Scale'].default_value = 3.0
    voronoi.feature = 'DISTANCE_TO_EDGE'
    links.new(mapping.outputs['Vector'], voronoi.inputs['Vector'])

    # Wave for directional veining
    wave = nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.inputs['Scale'].default_value = 2.0
    wave.inputs['Distortion'].default_value = 8.0
    wave.inputs['Detail'].default_value = 3.0
    links.new(mapping.outputs['Vector'], wave.inputs['Vector'])

    # Mix veins
    mix_veins = nodes.new('ShaderNodeMix')
    mix_veins.data_type = 'FLOAT'
    mix_veins.inputs['Factor'].default_value = 0.5
    links.new(voronoi.outputs['Distance'], mix_veins.inputs[2])  # A
    links.new(wave.outputs['Fac'], mix_veins.inputs[3])  # B

    # Color ramp: white marble with grey veins
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.95, 0.93, 0.91, 1.0)  # White
    mid = ramp.color_ramp.elements.new(0.4)
    mid.color = (0.88, 0.86, 0.84, 1.0)  # Light grey
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[1].color = (0.55, 0.52, 0.50, 1.0)  # Vein grey
    links.new(mix_veins.outputs[0], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])

    # Subtle bump from veins
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.03
    links.new(mix_veins.outputs[0], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    # Subsurface for marble translucency
    try:
        bsdf.inputs['Subsurface Weight'].default_value = 0.05
        bsdf.inputs['Subsurface Radius'].default_value = (0.5, 0.3, 0.2)
    except Exception:
        pass

    return mat


def _get_matte_black_metal():
    """Matte black metal for pedestal and base."""
    mat = bpy.data.materials.get("M_MatteBlackMetal")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_MatteBlackMetal")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.45
    bsdf.inputs['Metallic'].default_value = 0.9

    # Subtle surface texture
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 200.0
    noise.inputs['Detail'].default_value = 2.0
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.02
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    return mat


def create_cafe_table(name="MarbleCafeTable", location=(0, 0, 0)):
    """Create a modern marble cafe table.

    Returns the root Empty parent object.
    """
    marble = _get_marble_material()
    metal = _get_matte_black_metal()

    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent.location = location

    # --- MARBLE TOP (phi700mm, 25mm thick) ---
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.35, depth=0.025, vertices=48,
        location=(0, 0, 0.738)
    )
    top = bpy.context.active_object
    top.name = f"{name}_Top"
    top.data.materials.append(marble)
    bpy.ops.object.shade_smooth()
    # Add bevel modifier for slightly rounded edge
    bevel = top.modifiers.new("Bevel", 'BEVEL')
    bevel.width = 0.003
    bevel.segments = 3
    bpy.context.view_layer.objects.active = top
    bpy.ops.object.modifier_apply(modifier="Bevel")
    top.parent = parent

    # --- TOP FLANGE (connection plate) ---
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.045, depth=0.015, vertices=24,
        location=(0, 0, 0.718)
    )
    flange = bpy.context.active_object
    flange.name = f"{name}_Flange"
    flange.data.materials.append(metal)
    bpy.ops.object.shade_smooth()
    flange.parent = parent

    # --- PEDESTAL COLUMN (tapered cylinder) ---
    bpy.ops.mesh.primitive_cone_add(
        radius1=0.025, radius2=0.020, depth=0.62,
        vertices=16, location=(0, 0, 0.40)
    )
    pedestal = bpy.context.active_object
    pedestal.name = f"{name}_Pedestal"
    pedestal.data.materials.append(metal)
    bpy.ops.object.shade_smooth()
    pedestal.parent = parent

    # --- TRUMPET BASE ---
    # Build trumpet/tulip shape from stacked cone sections
    trumpet_sections = [
        # (radius, z_center, height)
        (0.025, 0.095, 0.01),   # neck (narrow)
        (0.04,  0.085, 0.01),   # flare start
        (0.06,  0.075, 0.01),   # flare
        (0.09,  0.065, 0.01),   # flare
        (0.12,  0.055, 0.01),   # flare
        (0.15,  0.045, 0.01),   # flare
        (0.175, 0.038, 0.008),  # flare
        (0.195, 0.033, 0.006),  # near flat
        (0.20,  0.030, 0.012),  # base disc
    ]

    for i, (r, z, h) in enumerate(trumpet_sections):
        r_next = trumpet_sections[i + 1][0] if i < len(trumpet_sections) - 1 else r
        bpy.ops.mesh.primitive_cone_add(
            radius1=r_next if i < len(trumpet_sections) - 1 else r,
            radius2=r,
            depth=h,
            vertices=24,
            location=(0, 0, z)
        )
        section = bpy.context.active_object
        section.name = f"{name}_Base_{i}"
        section.data.materials.append(metal)
        bpy.ops.object.shade_smooth()
        section.parent = parent

    # Base bottom disc
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.205, depth=0.005, vertices=32,
        location=(0, 0, 0.022)
    )
    base_disc = bpy.context.active_object
    base_disc.name = f"{name}_BaseDisc"
    base_disc.data.materials.append(metal)
    bpy.ops.object.shade_smooth()
    base_disc.parent = parent

    return parent
