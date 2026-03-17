"""
gen-arch-essentials2.py
Generate 4 interior finishing GLB models using bmesh:
  1. overhead_cabinet.glb (吊戸棚)
  2. curtain_box.glb (カーテンボックス)
  3. entrance_step.glb (上がり框)
  4. auto_door.glb (自動ドア)
"""

import bpy
import bmesh
import os
import math
from mathutils import Vector

OUTPUT_DIR = r"C:\Users\y-suz\porano-perse\public\models"


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def clear_scene():
    """Remove all objects, meshes, materials from the scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def new_material(name, color, roughness=0.5, metallic=0.0, transmission=0.0):
    """Create a Principled BSDF material."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = None
    for node in nodes:
        if node.type == 'BSDF_PRINCIPLED':
            bsdf = node
            break
    if bsdf is None:
        return mat
    bsdf.inputs['Base Color'].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if transmission > 0:
        bsdf.inputs['Transmission Weight'].default_value = transmission
    return mat


def make_box(name, sx, sy, sz, material, origin_offset=(0, 0, 0)):
    """Create a box mesh using bmesh. Dimensions sx,sy,sz in meters.
    The box is centered at (0,0,0) then shifted by origin_offset."""
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    # Scale to desired dimensions
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
        # Shift so that the box bottom is at z=0 (center was at 0)
        v.co.z += sz / 2.0
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    bpy.context.scene.collection.objects.link(obj)

    # Apply origin offset (move geometry relative to origin)
    obj.location = origin_offset
    return obj


def make_cylinder(name, radius, depth, segments, material):
    """Create a cylinder using bmesh."""
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius,
        depth=depth,
    )
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_dome(name, radius, segments, material):
    """Create a hemisphere (dome) using bmesh - upper half of UV sphere."""
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=segments, radius=radius)
    # Remove lower hemisphere vertices (z < 0)
    verts_to_remove = [v for v in bm.verts if v.co.z < -0.001]
    bmesh.ops.delete(bm, geom=verts_to_remove, context='VERTS')
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_box_at(name, sx, sy, sz, loc, material):
    """Create a box with bottom-center at loc."""
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
        v.co.z += sz / 2.0
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    obj.location = loc
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_chamfered_box(name, sx, sy, sz, chamfer, material):
    """Create a box with chamfered top front edge using bmesh."""
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
        v.co.z += sz / 2.0

    bm.edges.ensure_lookup_table()
    bm.verts.ensure_lookup_table()

    # Find the top-front edge (z = sz, y = -sy/2)
    target_edges = []
    for e in bm.edges:
        v1, v2 = e.verts
        if (abs(v1.co.z - sz) < 0.001 and abs(v2.co.z - sz) < 0.001 and
            abs(v1.co.y - (-sy / 2)) < 0.001 and abs(v2.co.y - (-sy / 2)) < 0.001):
            target_edges.append(e)

    if target_edges:
        bmesh.ops.bevel(
            bm,
            geom=target_edges,
            offset=chamfer,
            segments=2,
            affect='EDGES',
        )

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def select_only(obj):
    """Select only the given object."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def join_objects(objects):
    """Join a list of objects into one."""
    if not objects:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    return bpy.context.active_object


def set_origin_to_point(obj, point):
    """Set the object origin to a world-space point by shifting mesh data."""
    # Move mesh vertices so that 'point' becomes the new origin
    offset = Vector(point) - Vector(obj.location)
    for v in obj.data.vertices:
        v.co -= offset
    obj.location = Vector(point)


def export_glb(filepath):
    """Export all objects in scene as GLB."""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
    )


def get_scene_bounds():
    """Return bounding box of all mesh objects in scene."""
    min_co = Vector((float('inf'), float('inf'), float('inf')))
    max_co = Vector((float('-inf'), float('-inf'), float('-inf')))
    for obj in bpy.context.scene.collection.objects:
        if obj.type == 'MESH':
            for v in obj.data.vertices:
                world_co = obj.matrix_world @ v.co
                for i in range(3):
                    if world_co[i] < min_co[i]:
                        min_co[i] = world_co[i]
                    if world_co[i] > max_co[i]:
                        max_co[i] = world_co[i]
    return min_co, max_co


def print_model_info(name, filepath):
    """Print file size and bounding box info."""
    size_bytes = os.path.getsize(filepath)
    if size_bytes > 1024 * 1024:
        size_str = f"{size_bytes / (1024*1024):.2f} MB"
    else:
        size_str = f"{size_bytes / 1024:.1f} KB"
    min_co, max_co = get_scene_bounds()
    dims = max_co - min_co
    print(f"  {name}")
    print(f"    Size: {size_str}")
    print(f"    Bounds: min=({min_co.x:.4f}, {min_co.y:.4f}, {min_co.z:.4f}) "
          f"max=({max_co.x:.4f}, {max_co.y:.4f}, {max_co.z:.4f})")
    print(f"    Dimensions: {dims.x:.4f} x {dims.y:.4f} x {dims.z:.4f} m")


# ===========================================================================
# Model 1: overhead_cabinet.glb (吊戸棚) W900 x D350 x H700
# ===========================================================================

def build_overhead_cabinet():
    clear_scene()
    W, D, H = 0.900, 0.350, 0.700
    T = 0.018  # panel thickness

    # Materials
    mat_body = new_material("Cabinet_Body", (0.93, 0.93, 0.91), roughness=0.3)
    mat_door = new_material("Cabinet_Door", (0.91, 0.91, 0.89), roughness=0.25)
    mat_handle = new_material("Cabinet_Handle", (0.85, 0.85, 0.85), roughness=0.1, metallic=0.95)

    parts = []

    # Bottom panel
    parts.append(make_box_at("bottom_panel", W, D, T, (0, 0, 0), mat_body))
    # Top panel
    parts.append(make_box_at("top_panel", W, D, T, (0, 0, H - T), mat_body))
    # Left side panel
    parts.append(make_box_at("left_panel", T, D, H - 2 * T, (-W / 2 + T / 2, 0, T), mat_body))
    # Right side panel
    parts.append(make_box_at("right_panel", T, D, H - 2 * T, (W / 2 - T / 2, 0, T), mat_body))
    # Back panel
    parts.append(make_box_at("back_panel", W - 2 * T, T, H - 2 * T, (0, D / 2 - T / 2, T), mat_body))
    # Shelf at mid height
    shelf_z = T + (H - 2 * T) / 2 - T / 2
    parts.append(make_box_at("shelf", W - 2 * T, D - T, T, (0, -T / 2, shelf_z), mat_body))

    # Doors - each 448mm x 698mm x 18mm
    door_w = 0.448
    door_h = 0.698
    gap = 0.002  # 2mm gap
    door_z = (H - door_h) / 2  # center vertically (1mm gap top and bottom)
    door_y = -D / 2 + T / 2  # front face

    # Left door
    parts.append(make_box_at("door_left", door_w, T, door_h,
                             (-door_w / 2 - gap / 2, door_y, door_z), mat_door))
    # Right door
    parts.append(make_box_at("door_right", door_w, T, door_h,
                             (door_w / 2 + gap / 2, door_y, door_z), mat_door))

    # Handles - bar 100mm long, 10mm diameter approximated as box
    handle_len = 0.100
    handle_r = 0.005
    handle_standoff = 0.015
    handle_z = H / 2  # centered vertically

    # Left door handle (near center edge = near x=0 side)
    lh_x = -gap / 2 - 0.025  # 25mm from center edge of left door
    parts.append(make_box_at("handle_left_bar", handle_r * 2, handle_r * 2, handle_len,
                             (lh_x, door_y - T / 2 - handle_standoff, handle_z - handle_len / 2),
                             mat_handle))
    # Handle standoffs (top and bottom)
    parts.append(make_box_at("handle_left_top", handle_r * 2, handle_standoff, handle_r * 2,
                             (lh_x, door_y - T / 2 - handle_standoff / 2, handle_z + handle_len / 2 - handle_r),
                             mat_handle))
    parts.append(make_box_at("handle_left_bot", handle_r * 2, handle_standoff, handle_r * 2,
                             (lh_x, door_y - T / 2 - handle_standoff / 2, handle_z - handle_len / 2),
                             mat_handle))

    # Right door handle (near center edge = near x=0 side)
    rh_x = gap / 2 + 0.025
    parts.append(make_box_at("handle_right_bar", handle_r * 2, handle_r * 2, handle_len,
                             (rh_x, door_y - T / 2 - handle_standoff, handle_z - handle_len / 2),
                             mat_handle))
    parts.append(make_box_at("handle_right_top", handle_r * 2, handle_standoff, handle_r * 2,
                             (rh_x, door_y - T / 2 - handle_standoff / 2, handle_z + handle_len / 2 - handle_r),
                             mat_handle))
    parts.append(make_box_at("handle_right_bot", handle_r * 2, handle_standoff, handle_r * 2,
                             (rh_x, door_y - T / 2 - handle_standoff / 2, handle_z - handle_len / 2),
                             mat_handle))

    # Origin is already at bottom-center (z=0 is bottom of cabinet, x=0,y=0 is center)
    filepath = os.path.join(OUTPUT_DIR, "overhead_cabinet.glb")
    export_glb(filepath)
    print_model_info("overhead_cabinet.glb", filepath)


# ===========================================================================
# Model 2: curtain_box.glb (カーテンボックス) 1m segment
# ===========================================================================

def build_curtain_box():
    clear_scene()
    W = 1.000
    H_box = 0.100  # height (hangs down)
    D_box = 0.150  # depth from wall
    T = 0.012  # panel thickness

    mat_box = new_material("CurtainBox_Body", (0.93, 0.92, 0.90), roughness=0.3)
    mat_rail = new_material("CurtainBox_Rail", (0.75, 0.75, 0.73), roughness=0.25, metallic=0.85)

    parts = []

    # Top panel (ceiling mount) - at Z=0, extends in -Y direction
    # Origin: top-left corner means X=0 is left edge, Z=0 is ceiling
    # Top panel: from x=0 to x=W, y=0 to y=-D_box, z=-T/2 to z=0...
    # Actually let's build at convenient coords then adjust origin.

    # Build centered first, then shift for origin at top-left
    # Top panel
    parts.append(make_box_at("top_panel", W, D_box, T, (W / 2, -D_box / 2, -T), mat_box))
    # Front face panel (hangs down from front edge of top panel)
    parts.append(make_box_at("front_face", W, T, H_box - T, (W / 2, -D_box + T / 2, -H_box), mat_box))

    # Curtain rail inside the box
    rail_w = W
    rail_h = 0.020
    rail_d = 0.003
    # Positioned at Y = -0.075 (center of box depth), Z = -0.050 (mid-height)
    parts.append(make_box_at("curtain_rail", rail_w, rail_d, rail_h,
                             (W / 2, -0.075, -0.050 - rail_h / 2), mat_rail))

    # Origin at top-left corner: x=0, y=0, z=0
    # Objects are already positioned so that top-left is at origin
    filepath = os.path.join(OUTPUT_DIR, "curtain_box.glb")
    export_glb(filepath)
    print_model_info("curtain_box.glb", filepath)


# ===========================================================================
# Model 3: entrance_step.glb (上がり框) W1200 x D300 x H150
# ===========================================================================

def build_entrance_step():
    clear_scene()
    W = 1.200
    D = 0.300
    H = 0.150
    chamfer = 0.002

    mat_frame = new_material("Step_Frame", (0.30, 0.18, 0.08), roughness=0.3)
    mat_top = new_material("Step_Top", (0.55, 0.40, 0.28), roughness=0.5)

    # The step is a box: W x D x H
    # Front face (框) is the decorative vertical face
    # Origin: bottom-front-center

    # Build the main step body with chamfered top-front edge
    # The front face is at Y = -D/2, we want origin at bottom-front-center
    # So shift: y offset = +D/2 so front face is at y=0

    # Create the chamfered box for the frame face (front portion)
    # The frame face is the front vertical slice, about 30mm deep for visual distinction
    frame_depth = 0.030

    # Main body with chamfer on top-front edge
    obj_main = make_chamfered_box("step_main", W, D, H, chamfer, mat_frame)
    # Shift so origin is at bottom-front-center
    # Currently: centered at x=0, y=0, bottom at z=0
    # Need front face at y=0 => shift y by +D/2
    obj_main.location = (0, D / 2, 0)

    # Apply a different material to the top face and sides
    # We'll create separate objects for cleaner material assignment

    # Actually, let's rebuild with separate pieces for proper materials:
    # Remove the main object
    bpy.data.objects.remove(obj_main, do_unlink=True)

    parts = []

    # Front face (框) - the decorative piece with chamfered top edge
    # This is the full-width front face
    front_obj = make_chamfered_box("frame_face", W, frame_depth, H, chamfer, mat_frame)
    front_obj.location = (0, frame_depth / 2, 0)
    parts.append(front_obj)

    # Top surface (floor continuation)
    parts.append(make_box_at("top_surface", W, D - frame_depth, 0.012,
                             (0, frame_depth + (D - frame_depth) / 2, H - 0.012), mat_top))

    # Remaining body (sides and back, same material as top)
    # Left side
    parts.append(make_box_at("left_side", 0.018, D - frame_depth, H - 0.012,
                             (-W / 2 + 0.009, frame_depth + (D - frame_depth) / 2, 0), mat_top))
    # Right side
    parts.append(make_box_at("right_side", 0.018, D - frame_depth, H - 0.012,
                             (W / 2 - 0.009, frame_depth + (D - frame_depth) / 2, 0), mat_top))
    # Back face
    parts.append(make_box_at("back_face", W - 0.036, 0.018, H - 0.012,
                             (0, D - 0.009, 0), mat_top))
    # Bottom
    parts.append(make_box_at("bottom_face", W - 0.036, D - frame_depth - 0.018, 0.012,
                             (0, frame_depth + 0.009 + (D - frame_depth - 0.018) / 2, 0), mat_top))
    # Fill interior top under the top surface
    parts.append(make_box_at("interior_fill", W - 0.036, D - frame_depth - 0.018, H - 0.024,
                             (0, frame_depth + 0.009 + (D - frame_depth - 0.018) / 2, 0.012), mat_top))

    filepath = os.path.join(OUTPUT_DIR, "entrance_step.glb")
    export_glb(filepath)
    print_model_info("entrance_step.glb", filepath)


# ===========================================================================
# Model 4: auto_door.glb (自動ドア) W1800 x H2200
# ===========================================================================

def build_auto_door():
    clear_scene()
    W = 1.800
    H = 2.200
    post_size = 0.050

    mat_rail = new_material("AutoDoor_Rail", (0.25, 0.25, 0.25), roughness=0.4, metallic=0.7)
    mat_frame = new_material("AutoDoor_Frame", (0.75, 0.75, 0.73), roughness=0.25, metallic=0.85)
    mat_glass = new_material("AutoDoor_Glass", (0.95, 0.97, 1.0), roughness=0.05, transmission=0.9)
    mat_sensor = new_material("AutoDoor_Sensor", (0.1, 0.1, 0.1), roughness=0.5)

    parts = []

    # Top rail housing: 1800 x 100 x 150mm at top of door
    rail_h = 0.100
    rail_d = 0.150
    parts.append(make_box_at("top_rail", W, rail_d, rail_h,
                             (0, 0, H - rail_h), mat_rail))

    # Sensor dome: 20mm radius hemisphere on front face of rail housing, centered
    sensor = make_dome("sensor_dome", 0.020, 12, mat_sensor)
    sensor.location = (0, -rail_d / 2, H - rail_h / 2)
    sensor.rotation_euler = (math.radians(-90), 0, 0)
    parts.append(sensor)

    # Left vertical post
    parts.append(make_box_at("left_post", post_size, post_size, H - rail_h,
                             (-W / 2 + post_size / 2, 0, 0), mat_frame))
    # Right vertical post
    parts.append(make_box_at("right_post", post_size, post_size, H - rail_h,
                             (W / 2 - post_size / 2, 0, 0), mat_frame))

    # Glass panels: two panels meeting at center
    # Each: 870mm x 2050mm x 10mm
    glass_w = 0.870
    glass_h = 2.050
    glass_t = 0.010
    glass_z = 0.0  # from floor
    # Leave gap from posts: (W - 2*post_size) / 2 area for each panel
    # Panels slightly overlap or meet at center

    # Left glass panel
    parts.append(make_box_at("glass_left", glass_w, glass_t, glass_h,
                             (-glass_w / 2 + 0.005, 0, glass_z), mat_glass))
    # Right glass panel
    parts.append(make_box_at("glass_right", glass_w, glass_t, glass_h,
                             (glass_w / 2 - 0.005, 0, glass_z), mat_glass))

    # Floor guide rail: 1800 x 5 x 20mm
    parts.append(make_box_at("floor_guide", W, 0.020, 0.005,
                             (0, 0, 0), mat_frame))

    # Origin at bottom-center (already there)
    filepath = os.path.join(OUTPUT_DIR, "auto_door.glb")
    export_glb(filepath)
    print_model_info("auto_door.glb", filepath)


# ===========================================================================
# Main
# ===========================================================================

if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("=" * 60)
    print("Generating interior finishing models...")
    print("=" * 60)

    print("\n[1/4] Building overhead_cabinet.glb...")
    build_overhead_cabinet()

    print("\n[2/4] Building curtain_box.glb...")
    build_curtain_box()

    print("\n[3/4] Building entrance_step.glb...")
    build_entrance_step()

    print("\n[4/4] Building auto_door.glb...")
    build_auto_door()

    print("\n" + "=" * 60)
    print("All 4 models generated successfully!")
    print("=" * 60)
