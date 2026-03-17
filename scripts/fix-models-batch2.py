"""
fix-models-batch2.py - Regenerate problematic lighting GLB models

Output: C:/Users/y-suz/porano-perse/public/models/
Models: downlight_recessed.glb, spot_light.glb, wall_sconce.glb, indirect_light_cove.glb

Execute:
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --python C:/Users/y-suz/porano-perse/scripts/fix-models-batch2.py
"""

import bpy
import bmesh
import math
import os

OUTPUT_DIR = r"C:\Users\y-suz\porano-perse\public\models"


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def clear_scene():
    """Remove all objects, meshes, materials from the scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def find_bsdf(node_tree):
    """Find the Principled BSDF node by type (locale-independent)."""
    for node in node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            return node
    raise RuntimeError("Principled BSDF node not found in material node tree")


def create_material(name, base_color, roughness=0.5, metallic=0.0,
                    emission_color=None, emission_strength=0.0):
    """Create a Principled BSDF material with given parameters."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = find_bsdf(mat.node_tree)
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission_color is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def link_obj(obj):
    """Link object to the scene collection."""
    bpy.context.scene.collection.objects.link(obj)


def make_obj(name, mesh):
    """Create an object from mesh data and link it to the scene."""
    obj = bpy.data.objects.new(name, mesh)
    link_obj(obj)
    return obj


def assign_material(obj, mat):
    """Assign a material to an object."""
    obj.data.materials.append(mat)


def export_glb(filepath):
    """Export the scene as GLB."""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
    )


def get_scene_bounds():
    """Return the bounding box of all mesh objects in the scene."""
    min_co = [float('inf')] * 3
    max_co = [float('-inf')] * 3
    for obj in bpy.context.scene.collection.all_objects:
        if obj.type == 'MESH':
            for v in obj.bound_box:
                world_v = obj.matrix_world @ __import__('mathutils').Vector(v)
                for i in range(3):
                    min_co[i] = min(min_co[i], world_v[i])
                    max_co[i] = max(max_co[i], world_v[i])
    dims = [max_co[i] - min_co[i] for i in range(3)]
    return min_co, max_co, dims


def bmesh_cylinder(bm, radius, depth, segments=32, offset=(0, 0, 0)):
    """Create a cylinder in bmesh at given offset. Cylinder axis is Z.
    The cylinder spans from offset.z to offset.z + depth."""
    ox, oy, oz = offset
    verts_bottom = []
    verts_top = []
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        x = ox + radius * math.cos(angle)
        y = oy + radius * math.sin(angle)
        verts_bottom.append(bm.verts.new((x, y, oz)))
        verts_top.append(bm.verts.new((x, y, oz + depth)))

    # Side faces
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new([verts_bottom[i], verts_bottom[j],
                       verts_top[j], verts_top[i]])

    # Cap faces
    bm.faces.new(verts_bottom[::-1])  # bottom (normals outward)
    bm.faces.new(verts_top)           # top

    return verts_bottom, verts_top


def bmesh_disc(bm, radius, z=0, segments=32, offset=(0, 0)):
    """Create a flat disc (single face) at height z."""
    ox, oy = offset
    verts = []
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        x = ox + radius * math.cos(angle)
        y = oy + radius * math.sin(angle)
        verts.append(bm.verts.new((x, y, z)))
    bm.faces.new(verts)
    return verts


def bmesh_ring(bm, outer_r, inner_r, z=0, height=0, segments=32):
    """Create a ring (annulus) from outer_r to inner_r.
    If height > 0, creates a 3D ring with top and bottom faces and side walls."""
    if height <= 0:
        # Flat ring - single layer of faces
        outer_verts = []
        inner_verts = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            cos_a = math.cos(angle)
            sin_a = math.sin(angle)
            outer_verts.append(bm.verts.new((outer_r * cos_a, outer_r * sin_a, z)))
            inner_verts.append(bm.verts.new((inner_r * cos_a, inner_r * sin_a, z)))

        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new([outer_verts[i], outer_verts[j],
                           inner_verts[j], inner_verts[i]])
        return outer_verts, inner_verts
    else:
        # 3D ring with volume
        z_top = z
        z_bot = z - height

        outer_top = []
        outer_bot = []
        inner_top = []
        inner_bot = []

        for i in range(segments):
            angle = 2 * math.pi * i / segments
            cos_a = math.cos(angle)
            sin_a = math.sin(angle)
            outer_top.append(bm.verts.new((outer_r * cos_a, outer_r * sin_a, z_top)))
            outer_bot.append(bm.verts.new((outer_r * cos_a, outer_r * sin_a, z_bot)))
            inner_top.append(bm.verts.new((inner_r * cos_a, inner_r * sin_a, z_top)))
            inner_bot.append(bm.verts.new((inner_r * cos_a, inner_r * sin_a, z_bot)))

        for i in range(segments):
            j = (i + 1) % segments
            # Top face (ring)
            bm.faces.new([outer_top[i], outer_top[j],
                           inner_top[j], inner_top[i]])
            # Bottom face (ring)
            bm.faces.new([inner_bot[i], inner_bot[j],
                           outer_bot[j], outer_bot[i]])
            # Outer side
            bm.faces.new([outer_top[i], outer_bot[i],
                           outer_bot[j], outer_top[j]])
            # Inner side
            bm.faces.new([inner_top[j], inner_bot[j],
                           inner_bot[i], inner_top[i]])

        return outer_top, inner_top


def bmesh_truncated_cone(bm, r_top, r_bottom, depth, segments=32, z_top=0):
    """Create a truncated cone (frustum). Open at top and bottom.
    z_top is the Z position of the top opening, cone extends downward."""
    z_bottom = z_top - depth
    verts_top = []
    verts_bottom = []

    for i in range(segments):
        angle = 2 * math.pi * i / segments
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)
        verts_top.append(bm.verts.new((r_top * cos_a, r_top * sin_a, z_top)))
        verts_bottom.append(bm.verts.new((r_bottom * cos_a, r_bottom * sin_a, z_bottom)))

    # Side faces
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new([verts_top[i], verts_top[j],
                       verts_bottom[j], verts_bottom[i]])

    return verts_top, verts_bottom


def bmesh_box(bm, sx, sy, sz, offset=(0, 0, 0)):
    """Create a box (centered on XY at offset, extending from oz to oz+sz in Z)."""
    ox, oy, oz = offset
    hx, hy = sx / 2, sy / 2

    v = [
        bm.verts.new((ox - hx, oy - hy, oz)),       # 0: bottom-left-front
        bm.verts.new((ox + hx, oy - hy, oz)),       # 1: bottom-right-front
        bm.verts.new((ox + hx, oy + hy, oz)),       # 2: bottom-right-back
        bm.verts.new((ox - hx, oy + hy, oz)),       # 3: bottom-left-back
        bm.verts.new((ox - hx, oy - hy, oz + sz)),  # 4: top-left-front
        bm.verts.new((ox + hx, oy - hy, oz + sz)),  # 5: top-right-front
        bm.verts.new((ox + hx, oy + hy, oz + sz)),  # 6: top-right-back
        bm.verts.new((ox - hx, oy + hy, oz + sz)),  # 7: top-left-back
    ]

    bm.faces.new([v[0], v[3], v[2], v[1]])  # bottom
    bm.faces.new([v[4], v[5], v[6], v[7]])  # top
    bm.faces.new([v[0], v[1], v[5], v[4]])  # front
    bm.faces.new([v[2], v[3], v[7], v[6]])  # back
    bm.faces.new([v[0], v[4], v[7], v[3]])  # left
    bm.faces.new([v[1], v[2], v[6], v[5]])  # right

    return v


# ---------------------------------------------------------------------------
# Model 1: downlight_recessed.glb
# ---------------------------------------------------------------------------

def gen_downlight_recessed():
    """Ceiling-flush recessed downlight with trim ring, reflector cone, and LED disc.
    Origin at ceiling plane (Z=0). Everything hangs below into negative Z.
    Dimensions in meters (mm / 1000)."""
    clear_scene()

    # Materials
    mat_trim = create_material("Trim_White", (0.95, 0.95, 0.93), roughness=0.3)
    mat_reflector = create_material("Reflector_Silver", (0.8, 0.8, 0.8),
                                     roughness=0.2, metallic=0.9)
    mat_led = create_material("LED_White", (1.0, 1.0, 0.95),
                               emission_color=(1.0, 1.0, 0.95),
                               emission_strength=5.0)

    # --- Trim ring ---
    # Outer r=55mm=0.055, inner r=40mm=0.040, thickness 3mm=0.003
    mesh_trim = bpy.data.meshes.new("Trim_Ring")
    bm = bmesh.new()
    bmesh_ring(bm, outer_r=0.055, inner_r=0.040, z=0, height=0.003, segments=48)
    bm.to_mesh(mesh_trim)
    bm.free()
    obj_trim = make_obj("Trim_Ring", mesh_trim)
    assign_material(obj_trim, mat_trim)

    # --- Reflector cone ---
    # Truncated cone: top r=40mm, bottom r=25mm, depth 50mm
    # Top at Z=-0.003 (just below trim), going down to Z=-0.053
    mesh_cone = bpy.data.meshes.new("Reflector_Cone")
    bm = bmesh.new()
    verts_top, verts_bottom = bmesh_truncated_cone(
        bm, r_top=0.040, r_bottom=0.025, depth=0.050,
        segments=48, z_top=-0.003
    )
    # Close the bottom of the cone
    bm.faces.new(verts_bottom[::-1])
    bm.to_mesh(mesh_cone)
    bm.free()
    obj_cone = make_obj("Reflector_Cone", mesh_cone)
    assign_material(obj_cone, mat_reflector)

    # --- LED disc ---
    # Flat circle at top of reflector, r=20mm, 2mm thick
    # Position: Z=-0.003 to Z=-0.005
    mesh_led = bpy.data.meshes.new("LED_Disc")
    bm = bmesh.new()
    bmesh_cylinder(bm, radius=0.020, depth=0.002, segments=32,
                   offset=(0, 0, -0.005))
    bm.to_mesh(mesh_led)
    bm.free()
    obj_led = make_obj("LED_Disc", mesh_led)
    assign_material(obj_led, mat_led)

    # Export
    filepath = os.path.join(OUTPUT_DIR, "downlight_recessed.glb")
    export_glb(filepath)
    return filepath


# ---------------------------------------------------------------------------
# Model 2: spot_light.glb
# ---------------------------------------------------------------------------

def gen_spot_light():
    """Spot light with compact yoke. Housing hangs below origin.
    Dimensions in meters."""
    clear_scene()

    mat_black = create_material("Matte_Black_Metal", (0.05, 0.05, 0.05),
                                 roughness=0.8, metallic=0.9)
    mat_lens = create_material("Lens_Frosted", (0.85, 0.85, 0.85),
                                roughness=0.3, metallic=0.0)

    segments = 32

    # --- Housing cylinder ---
    # r=40mm=0.040, length=120mm=0.120, hanging from origin downward
    # Z range: 0 to -0.120
    mesh_housing = bpy.data.meshes.new("Housing")
    bm = bmesh.new()
    bmesh_cylinder(bm, radius=0.040, depth=0.120, segments=segments,
                   offset=(0, 0, -0.120))
    bm.to_mesh(mesh_housing)
    bm.free()
    obj_housing = make_obj("Housing", mesh_housing)
    assign_material(obj_housing, mat_black)

    # --- Lens disc ---
    # At bottom of housing, r=35mm, 5mm thick, slightly recessed
    # Z range: -0.115 to -0.120 (recessed 5mm inside housing bottom)
    mesh_lens = bpy.data.meshes.new("Lens")
    bm = bmesh.new()
    bmesh_cylinder(bm, radius=0.035, depth=0.005, segments=segments,
                   offset=(0, 0, -0.120))
    bm.to_mesh(mesh_lens)
    bm.free()
    obj_lens = make_obj("Lens", mesh_lens)
    assign_material(obj_lens, mat_lens)

    # --- Yoke plates ---
    # Two thin plates: 3mm thick, 20mm wide, 25mm tall
    # On each side of housing at X = ±(40mm + 1.5mm) = ±0.0415
    # Z range: 0 to +0.025
    for side, x_sign in [("L", -1), ("R", 1)]:
        mesh_yoke = bpy.data.meshes.new(f"Yoke_{side}")
        bm = bmesh.new()
        # Plate: 3mm (X) x 20mm (Y) x 25mm (Z)
        x_center = x_sign * 0.0415
        bmesh_box(bm, sx=0.003, sy=0.020, sz=0.025,
                  offset=(x_center, 0, 0))
        bm.to_mesh(mesh_yoke)
        bm.free()
        obj_yoke = make_obj(f"Yoke_{side}", mesh_yoke)
        assign_material(obj_yoke, mat_black)

    # --- Mount plate ---
    # 50mm x 30mm x 5mm box on top of yoke
    # Z range: +0.025 to +0.030
    mesh_mount = bpy.data.meshes.new("Mount_Plate")
    bm = bmesh.new()
    bmesh_box(bm, sx=0.050, sy=0.030, sz=0.005,
              offset=(0, 0, 0.025))
    bm.to_mesh(mesh_mount)
    bm.free()
    obj_mount = make_obj("Mount_Plate", mesh_mount)
    assign_material(obj_mount, mat_black)

    # --- Pivot pins ---
    # Small cylinders at yoke-housing junction (Z=0, X=±0.0415)
    for side, x_sign in [("L", -1), ("R", 1)]:
        mesh_pin = bpy.data.meshes.new(f"Pivot_{side}")
        bm = bmesh.new()
        # Pin: r=3mm, length=6mm, oriented along X axis
        # Approximate as a small cylinder along Z at the junction point
        # Actually, pivot pins connect yoke to housing, so they run along X
        # We'll create a small horizontal cylinder at each side
        pin_r = 0.003
        pin_len = 0.008
        x_center = x_sign * 0.0415
        # Create a short cylinder oriented along X by making it along Z then rotating
        # Simpler: create a box approximation for a small pin
        bmesh_box(bm, sx=0.008, sy=0.006, sz=0.006,
                  offset=(x_center, 0, -0.003))
        bm.to_mesh(mesh_pin)
        bm.free()
        obj_pin = make_obj(f"Pivot_{side}", mesh_pin)
        assign_material(obj_pin, mat_black)

    # Export
    filepath = os.path.join(OUTPUT_DIR, "spot_light.glb")
    export_glb(filepath)
    return filepath


# ---------------------------------------------------------------------------
# Model 3: wall_sconce.glb
# ---------------------------------------------------------------------------

def gen_wall_sconce():
    """Wall sconce with wall plate, short arm, and half-cylinder uplight shade.
    Origin at center of wall plate surface (wall at Y=0).
    Y axis = away from wall."""
    clear_scene()

    mat_metal = create_material("Brushed_Metal", (0.7, 0.7, 0.68),
                                 roughness=0.4, metallic=0.7)
    mat_shade = create_material("Shade_White", (0.9, 0.9, 0.88),
                                 roughness=0.5)
    mat_led = create_material("Sconce_LED", (1.0, 1.0, 0.95),
                               emission_color=(1.0, 1.0, 0.95),
                               emission_strength=3.0)

    # --- Wall plate ---
    # 100mm x 100mm x 10mm, flush against wall
    # Centered at origin, Y=0 to Y=0.01
    mesh_plate = bpy.data.meshes.new("Wall_Plate")
    bm = bmesh.new()
    # Box: 100mm (X) x 10mm (Y) x 100mm (Z)
    # offset so Y goes from 0 to 0.01
    bmesh_box(bm, sx=0.100, sy=0.010, sz=0.100,
              offset=(0, 0.005, -0.050))
    bm.to_mesh(mesh_plate)
    bm.free()
    obj_plate = make_obj("Wall_Plate", mesh_plate)
    assign_material(obj_plate, mat_metal)

    # --- Arm ---
    # 20mm (X) x 40mm (Y) x 20mm (Z), extending from wall plate
    # Y: 0.01 to 0.05
    mesh_arm = bpy.data.meshes.new("Arm")
    bm = bmesh.new()
    bmesh_box(bm, sx=0.020, sy=0.040, sz=0.020,
              offset=(0, 0.030, -0.010))
    bm.to_mesh(mesh_arm)
    bm.free()
    obj_arm = make_obj("Arm", mesh_arm)
    assign_material(obj_arm, mat_metal)

    # --- Shade (half-cylinder, uplight) ---
    # Half-cylinder: r=50mm, depth (Y)=45mm
    # Open top for uplight effect
    # Position: Y=0.05 to Y=0.095
    # The half-cylinder has the flat side down, curved side up
    # Open at the top (Z+) for uplight

    segments = 32
    shade_r = 0.050
    shade_depth = 0.045  # along Y
    y_start = 0.050
    y_end = y_start + shade_depth

    mesh_shade = bpy.data.meshes.new("Shade")
    bm = bmesh.new()

    # Half-cylinder: angles from -PI to 0 (bottom half of circle in XZ plane)
    # This creates a bowl shape open at top
    half_segs = segments
    front_verts = []
    back_verts = []

    for i in range(half_segs + 1):
        angle = math.pi + math.pi * i / half_segs  # PI to 2*PI (bottom half)
        x = shade_r * math.cos(angle)
        z = shade_r * math.sin(angle)
        front_verts.append(bm.verts.new((x, y_start, z)))
        back_verts.append(bm.verts.new((x, y_end, z)))

    # Curved surface
    for i in range(half_segs):
        bm.faces.new([front_verts[i], front_verts[i + 1],
                       back_verts[i + 1], back_verts[i]])

    # Front cap (half-circle)
    bm.faces.new(front_verts[::-1])

    # Back cap (half-circle)
    bm.faces.new(back_verts)

    # Flat bottom face (connecting the two straight edges)
    # The straight edges are front_verts[0] to back_verts[0] and
    # front_verts[-1] to back_verts[-1]
    # These are at the open top - we leave this open for uplight

    bm.to_mesh(mesh_shade)
    bm.free()
    obj_shade = make_obj("Shade", mesh_shade)
    assign_material(obj_shade, mat_shade)

    # --- Small LED strip inside shade ---
    mesh_led = bpy.data.meshes.new("LED_Strip")
    bm = bmesh.new()
    # Small emissive box inside the shade
    bmesh_box(bm, sx=0.060, sy=0.030, sz=0.005,
              offset=(0, 0.070, -0.040))
    bm.to_mesh(mesh_led)
    bm.free()
    obj_led = make_obj("LED_Strip", mesh_led)
    assign_material(obj_led, mat_led)

    # Export
    filepath = os.path.join(OUTPUT_DIR, "wall_sconce.glb")
    export_glb(filepath)
    return filepath


# ---------------------------------------------------------------------------
# Model 4: indirect_light_cove.glb
# ---------------------------------------------------------------------------

def gen_indirect_light_cove():
    """Indirect lighting cove - 1m segment.
    Origin at top-front corner (ceiling level, X=0).
    Everything hangs below Z=0."""
    clear_scene()

    mat_gypsum = create_material("White_Gypsum", (0.92, 0.91, 0.89), roughness=0.5)
    mat_led = create_material("LED_Strip", (1.0, 1.0, 0.95),
                               emission_color=(1.0, 1.0, 0.95),
                               emission_strength=5.0)

    length = 1.0  # 1m along X

    # --- Vertical drop piece ---
    # 12mm thick (Y) x 150mm tall (Z), 1m long (X)
    # Hanging from Z=0 downward: Z range 0 to -0.150
    # Front face at Y=0
    mesh_vert = bpy.data.meshes.new("Vertical_Drop")
    bm = bmesh.new()
    # Box: X=1.0, Y=0.012, Z=0.150
    # Positioned so front face at Y=0 and top at Z=0
    bmesh_box(bm, sx=length, sy=0.012, sz=0.150,
              offset=(length / 2, 0.006, -0.150))
    bm.to_mesh(mesh_vert)
    bm.free()
    obj_vert = make_obj("Vertical_Drop", mesh_vert)
    assign_material(obj_vert, mat_gypsum)

    # --- Horizontal shelf ---
    # At bottom of vertical piece, extending 100mm inward (Y direction)
    # 12mm thick (Z), 1m long (X)
    # Z: -0.150 to -0.138 (shelf top at -0.138, bottom at -0.150)
    # Y: 0.012 to 0.112 (extending inward from back of vertical piece)
    mesh_shelf = bpy.data.meshes.new("Horizontal_Shelf")
    bm = bmesh.new()
    bmesh_box(bm, sx=length, sy=0.100, sz=0.012,
              offset=(length / 2, 0.012 + 0.050, -0.150))
    bm.to_mesh(mesh_shelf)
    bm.free()
    obj_shelf = make_obj("Horizontal_Shelf", mesh_shelf)
    assign_material(obj_shelf, mat_gypsum)

    # --- LED strip indicator ---
    # Thin emissive line on shelf inner edge
    # 10mm (Y) x 3mm (Z) x 1m (X), at Z ≈ -0.138 (top of shelf)
    # Position at the inner edge of the shelf (Y near 0.112)
    mesh_led = bpy.data.meshes.new("LED_Strip")
    bm = bmesh.new()
    bmesh_box(bm, sx=length - 0.020, sy=0.010, sz=0.003,
              offset=(length / 2, 0.107, -0.138))
    bm.to_mesh(mesh_led)
    bm.free()
    obj_led = make_obj("LED_Strip", mesh_led)
    assign_material(obj_led, mat_led)

    # Export
    filepath = os.path.join(OUTPUT_DIR, "indirect_light_cove.glb")
    export_glb(filepath)
    return filepath


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("fix-models-batch2.py - Regenerating lighting models")
    print("=" * 60)

    results = []

    generators = [
        ("downlight_recessed.glb", gen_downlight_recessed),
        ("spot_light.glb", gen_spot_light),
        ("wall_sconce.glb", gen_wall_sconce),
        ("indirect_light_cove.glb", gen_indirect_light_cove),
    ]

    for name, gen_func in generators:
        print(f"\n--- Generating: {name} ---")
        try:
            filepath = gen_func()
            file_size = os.path.getsize(filepath)

            # Re-read the scene to get bounds (scene is still loaded after export)
            min_co, max_co, dims = get_scene_bounds()

            results.append({
                "name": name,
                "path": filepath,
                "size_kb": file_size / 1024,
                "dims_mm": [d * 1000 for d in dims],
                "min_mm": [c * 1000 for c in min_co],
                "max_mm": [c * 1000 for c in max_co],
            })
            print(f"  OK: {filepath} ({file_size / 1024:.1f} KB)")
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
            results.append({"name": name, "error": str(e)})

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for r in results:
        if "error" in r:
            print(f"  FAIL  {r['name']}: {r['error']}")
        else:
            dx, dy, dz = r["dims_mm"]
            print(f"  OK    {r['name']}")
            print(f"        Size: {r['size_kb']:.1f} KB")
            print(f"        Bounds: {dx:.1f} x {dy:.1f} x {dz:.1f} mm")
            print(f"        Min: ({r['min_mm'][0]:.1f}, {r['min_mm'][1]:.1f}, {r['min_mm'][2]:.1f}) mm")
            print(f"        Max: ({r['max_mm'][0]:.1f}, {r['max_mm'][1]:.1f}, {r['max_mm'][2]:.1f}) mm")
    print("=" * 60)
    print("Done.")


if __name__ == "__main__":
    main()
