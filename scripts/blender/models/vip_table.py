"""VIP Round Table — high-quality Blender model via bmesh.

Produces a luxury VIP table for hostclub/lounge scenes:
- Round tabletop: diameter 800mm, height 500mm
- Pedestal (single column): shaft diameter 80mm, base diameter 400mm
- Glass top material (transmission, Roughness 0.05)
- Black metal shaft/base (Roughness 0.2)
- All geometry via bmesh (no bpy.ops mesh primitives)
"""

import bpy
import bmesh
import math
from mathutils import Vector


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def _get_glass_top_material():
    """Clear glass top — high transmission, very low roughness."""
    mat = bpy.data.materials.get("M_GlassTop_VIP")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_GlassTop_VIP")
    mat.use_nodes = True
    mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else None
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (300, 0)

    # Glass properties
    principled.inputs["Base Color"].default_value = (0.95, 0.97, 0.98, 1.0)
    principled.inputs["Roughness"].default_value = 0.05
    principled.inputs["Metallic"].default_value = 0.0
    try:
        principled.inputs["Specular IOR Level"].default_value = 0.5
    except KeyError:
        pass

    # Transmission for glass transparency
    try:
        principled.inputs["Transmission Weight"].default_value = 0.92
    except KeyError:
        try:
            principled.inputs["Transmission"].default_value = 0.92
        except KeyError:
            pass

    principled.inputs["IOR"].default_value = 1.52  # Standard glass

    # Subtle green tint at edges (typical for thick glass)
    try:
        principled.inputs["Coat Weight"].default_value = 0.1
        principled.inputs["Coat Roughness"].default_value = 0.02
    except KeyError:
        pass

    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return mat


def _get_black_metal_material():
    """Black metal for pedestal shaft and base — roughness-driven surface."""
    mat = bpy.data.materials.get("M_BlackMetal_VIP")
    if mat:
        return mat
    mat = bpy.data.materials.new("M_BlackMetal_VIP")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in list(nodes):
        if node.name != "Material Output":
            nodes.remove(node)

    output = nodes["Material Output"]
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (320, 0)

    # Very dark base, roughness variation for surface expression
    principled.inputs["Base Color"].default_value = (0.008, 0.008, 0.01, 1.0)
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.2
    try:
        principled.inputs["Specular IOR Level"].default_value = 0.35
    except KeyError:
        pass
    try:
        principled.inputs["Coat Weight"].default_value = 0.1
        principled.inputs["Coat Roughness"].default_value = 0.15
    except KeyError:
        pass

    # Roughness variation via noise (per material-recipes.md: color minimal, roughness carries expression)
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-800, 0)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-600, 0)
    mapping.inputs["Scale"].default_value = (4.0, 4.0, 16.0)

    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-380, 0)
    noise.inputs["Scale"].default_value = 24.0
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.35

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-140, 0)
    ramp.color_ramp.elements[0].position = 0.38
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[0].color = (0.16, 0.16, 0.16, 1.0)
    ramp.color_ramp.elements[1].color = (0.28, 0.28, 0.28, 1.0)

    bump = nodes.new("ShaderNodeBump")
    bump.location = (100, -120)
    bump.inputs["Strength"].default_value = 0.002

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


def _set_smooth(obj):
    """Set smooth shading on all faces via mesh data (no bpy.ops)."""
    if obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True
        obj.data.update()


def _create_lathe_bmesh(name, profile, material, segments=64, parent=None):
    """Create a lathe/revolution mesh from a 2D profile [(radius, z), ...].

    Single seamless mesh via bmesh — no bpy.ops.
    """
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    rings = []
    for radius, z in profile:
        if radius <= 1e-6:
            # Center point
            v = bm.verts.new((0.0, 0.0, z))
            rings.append([v])
        else:
            ring = []
            for step in range(segments):
                angle = math.tau * step / segments
                x = radius * math.cos(angle)
                y = radius * math.sin(angle)
                ring.append(bm.verts.new((x, y, z)))
            rings.append(ring)

    bm.verts.ensure_lookup_table()

    # Create faces between consecutive rings
    for ring_a, ring_b in zip(rings, rings[1:]):
        if len(ring_a) == 1 and len(ring_b) == 1:
            continue
        if len(ring_a) == 1:
            center = ring_a[0]
            for step in range(segments):
                next_step = (step + 1) % segments
                bm.faces.new([center, ring_b[next_step], ring_b[step]])
            continue
        if len(ring_b) == 1:
            center = ring_b[0]
            for step in range(segments):
                next_step = (step + 1) % segments
                bm.faces.new([ring_a[step], ring_a[next_step], center])
            continue
        for step in range(segments):
            next_step = (step + 1) % segments
            bm.faces.new([ring_a[step], ring_a[next_step],
                          ring_b[next_step], ring_b[step]])

    # Recalculate normals
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    _assign_material(obj, material)
    _set_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def _create_disc_bmesh(name, radius, thickness, location, material,
                       parent=None, segments=64, bevel_width=0.003):
    """Create a disc (short cylinder) using bmesh with optional bevel."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False,
                          segments=segments, radius1=radius, radius2=radius,
                          depth=thickness)

    # Bevel edges for rounded look
    if bevel_width > 0:
        edges_to_bevel = [e for e in bm.edges
                          if not e.is_boundary
                          and abs(e.verts[0].co.z - e.verts[1].co.z) < 0.001]
        if not edges_to_bevel:
            edges_to_bevel = bm.edges[:]
        bmesh.ops.bevel(bm, geom=edges_to_bevel,
                        offset=bevel_width, segments=3,
                        affect='EDGES')

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    _assign_material(obj, material)
    _set_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def create_vip_table(name="VIPTable", location=(0, 0, 0)):
    """Create a round VIP table with glass top and pedestal base.

    Dimensions (meters):
    - Tabletop diameter: 0.8m (800mm)
    - Total height: 0.5m (500mm)
    - Shaft diameter: 0.08m (80mm)
    - Base diameter: 0.4m (400mm)

    Returns the root Empty parent object.
    """
    glass = _get_glass_top_material()
    metal = _get_black_metal_material()

    # Parent empty
    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent.location = location

    # --- Dimensions (meters) ---
    top_radius = 0.40       # 800mm diameter
    top_thick = 0.012       # 12mm glass
    total_height = 0.50
    shaft_radius = 0.04     # 80mm diameter
    base_radius = 0.20      # 400mm diameter

    top_z = total_height    # Top surface at 500mm

    # --- GLASS TABLETOP ---
    _create_disc_bmesh(
        f"{name}_GlassTop",
        radius=top_radius, thickness=top_thick,
        location=(0, 0, top_z - top_thick / 2),
        material=glass, parent=parent,
        segments=64, bevel_width=0.002,
    )

    # --- PEDESTAL (lathe profile for seamless single mesh) ---
    # Profile from top to bottom: shaft -> flare -> base
    pedestal_profile = [
        (0.0,              top_z - top_thick),       # Center top (closed)
        (shaft_radius,     top_z - top_thick),       # Shaft top
        (shaft_radius,     0.08),                     # Shaft bottom -> flare
        (shaft_radius + 0.005, 0.065),               # Begin flare
        (shaft_radius + 0.015, 0.052),
        (shaft_radius + 0.035, 0.04),
        (shaft_radius + 0.065, 0.03),
        (shaft_radius + 0.095, 0.023),
        (shaft_radius + 0.12, 0.018),
        (base_radius - 0.01, 0.013),
        (base_radius,      0.008),                    # Base outer edge
        (base_radius,      0.0),                      # Base bottom
        (0.0,              0.0),                       # Center bottom (closed)
    ]

    pedestal = _create_lathe_bmesh(
        f"{name}_Pedestal",
        profile=pedestal_profile,
        material=metal,
        segments=96,
        parent=parent,
    )

    # --- TOP MOUNT (small disc under glass for visual connection) ---
    _create_disc_bmesh(
        f"{name}_TopMount",
        radius=shaft_radius + 0.025, thickness=0.008,
        location=(0, 0, top_z - top_thick - 0.004),
        material=metal, parent=parent,
        segments=48, bevel_width=0.002,
    )

    return parent
