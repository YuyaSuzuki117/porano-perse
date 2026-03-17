"""
fix-models-batch1.py
Regenerate 5 problematic GLB models using bmesh (no bpy.ops.mesh).
Models: flush_door, crown_molding, window_single, window_double, outlet_plate

Run:
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --python C:/Users/y-suz/porano-perse/scripts/fix-models-batch1.py
"""

import bpy
import bmesh
import math
import os
import mathutils

OUTPUT_DIR = "C:/Users/y-suz/porano-perse/public/models"


# ============================================================
# Utility functions
# ============================================================

def clear_scene():
    """Remove all objects, meshes, materials from the scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def new_material(name, base_color, roughness=0.5, metallic=0.0, alpha=1.0):
    """Create a Principled BSDF material."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else None
    return mat


def create_mesh_object(name, material=None):
    """Create a new empty mesh + object, link to scene, return (obj, mesh)."""
    mesh = bpy.data.meshes.new(name + "_mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj, mesh


def bmesh_box(bm, sx, sy, sz, cx=0, cy=0, cz=0):
    """Create an axis-aligned box in bmesh centered at (cx, cy, cz)."""
    x0, x1 = cx - sx / 2, cx + sx / 2
    y0, y1 = cy - sy / 2, cy + sy / 2
    z0, z1 = cz - sz / 2, cz + sz / 2

    verts = [
        bm.verts.new((x0, y0, z0)),  # 0
        bm.verts.new((x1, y0, z0)),  # 1
        bm.verts.new((x1, y1, z0)),  # 2
        bm.verts.new((x0, y1, z0)),  # 3
        bm.verts.new((x0, y0, z1)),  # 4
        bm.verts.new((x1, y0, z1)),  # 5
        bm.verts.new((x1, y1, z1)),  # 6
        bm.verts.new((x0, y1, z1)),  # 7
    ]

    faces = [
        (verts[0], verts[3], verts[2], verts[1]),  # bottom
        (verts[4], verts[5], verts[6], verts[7]),  # top
        (verts[0], verts[1], verts[5], verts[4]),  # front (-Y)
        (verts[2], verts[3], verts[7], verts[6]),  # back (+Y)
        (verts[0], verts[4], verts[7], verts[3]),  # left (-X)
        (verts[1], verts[2], verts[6], verts[5]),  # right (+X)
    ]
    for f in faces:
        bm.faces.new(f)

    return verts


def bmesh_cylinder(bm, radius, length, segments=16,
                   center=(0, 0, 0), direction='Y'):
    """Create a cylinder in bmesh along given axis direction."""
    cx, cy, cz = center
    half = length / 2.0

    bottom_verts = []
    top_verts = []

    for i in range(segments):
        angle = 2.0 * math.pi * i / segments
        ca = math.cos(angle) * radius
        sa = math.sin(angle) * radius

        if direction == 'Y':
            bv = bm.verts.new((cx + ca, cy - half, cz + sa))
            tv = bm.verts.new((cx + ca, cy + half, cz + sa))
        elif direction == 'X':
            bv = bm.verts.new((cx - half, cy + ca, cz + sa))
            tv = bm.verts.new((cx + half, cy + ca, cz + sa))
        elif direction == 'Z':
            bv = bm.verts.new((cx + ca, cy + sa, cz - half))
            tv = bm.verts.new((cx + ca, cy + sa, cz + half))
        else:
            bv = bm.verts.new((cx + ca, cy - half, cz + sa))
            tv = bm.verts.new((cx + ca, cy + half, cz + sa))

        bottom_verts.append(bv)
        top_verts.append(tv)

    # Side faces
    for i in range(segments):
        ni = (i + 1) % segments
        bm.faces.new((bottom_verts[i], bottom_verts[ni],
                       top_verts[ni], top_verts[i]))

    # Cap faces
    bm.faces.new(list(reversed(bottom_verts)))
    bm.faces.new(top_verts)

    return bottom_verts, top_verts


def set_origin_bottom_center(obj):
    """Move origin to bottom center of bounding box."""
    # Calculate bounding box
    bbox = [obj.matrix_world @ mathutils.Vector(corner) for corner in obj.bound_box]
    min_x = min(v.x for v in bbox)
    max_x = max(v.x for v in bbox)
    min_y = min(v.y for v in bbox)
    max_y = max(v.y for v in bbox)
    min_z = min(v.z for v in bbox)

    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    bottom = min_z

    offset = mathutils.Vector((center_x, center_y, bottom))

    # Move mesh data
    mesh = obj.data
    for v in mesh.vertices:
        v.co -= offset

    obj.location += offset


def export_glb(filepath):
    """Export the scene as GLB."""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_active_collection=False,
        export_apply=True,
    )


def get_scene_bbox():
    """Get the bounding box of all mesh objects in the scene."""
    all_min = [float('inf')] * 3
    all_max = [float('-inf')] * 3
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            for corner in obj.bound_box:
                world_corner = obj.matrix_world @ mathutils.Vector(corner)
                for i in range(3):
                    all_min[i] = min(all_min[i], world_corner[i])
                    all_max[i] = max(all_max[i], world_corner[i])
    dims = [all_max[i] - all_min[i] for i in range(3)]
    return all_min, all_max, dims


def remove_degenerate_faces(bm, threshold=1e-6):
    """Remove faces with zero or near-zero area."""
    to_remove = []
    for f in bm.faces:
        if f.calc_area() < threshold:
            to_remove.append(f)
    for f in to_remove:
        bm.faces.remove(f)
    return len(to_remove)


# ============================================================
# Model 1: flush_door.glb
# ============================================================

def gen_flush_door():
    clear_scene()

    mat_wood = new_material("DoorWood", (0.55, 0.38, 0.25), roughness=0.6)
    mat_handle = new_material("HandleMetal", (0.15, 0.15, 0.15),
                              roughness=0.3, metallic=0.9)

    # --- Door panel ---
    # W=0.8, H=2.1, D=0.04, centered at Y=0
    # Origin at bottom center, so door spans Z=0..2.1, X=-0.4..+0.4
    obj_door, mesh_door = create_mesh_object("DoorPanel", mat_wood)
    bm = bmesh.new()
    bmesh_box(bm, 0.8, 0.04, 2.1, cx=0, cy=0, cz=2.1 / 2)
    bm.to_mesh(mesh_door)
    bm.free()

    # --- Handle (front side only, +Y direction) ---
    # Rose plate: 30mm(W) x 10mm(D) x 120mm(H) box
    # Position: X = -0.4 + 0.32 = -0.08 from center (0.32m from left/hinge edge)
    # Z = 1.0m height
    # Y = door surface (0.02) + 5mm offset + half depth = 0.02 + 0.005 + 0.005 = 0.03
    handle_x = -0.4 + 0.32  # = -0.08
    handle_z = 1.0
    door_surface_y = 0.02  # half of door depth
    rose_depth = 0.010  # 10mm
    rose_y = door_surface_y + 0.005 + rose_depth / 2  # 0.02 + 0.005 + 0.005 = 0.03

    obj_handle, mesh_handle = create_mesh_object("Handle", mat_handle)
    bm = bmesh.new()

    # Rose plate: 30mm x 10mm x 120mm
    bmesh_box(bm, 0.030, rose_depth, 0.120, cx=handle_x, cy=rose_y, cz=handle_z)

    # Lever: cylinder r=8mm, length=50mm, extending outward (+Y)
    # Lever starts at rose plate outer surface and goes +Y
    lever_radius = 0.008
    lever_length = 0.050
    rose_outer_y = rose_y + rose_depth / 2  # 0.035
    lever_center_y = rose_outer_y + lever_length / 2  # 0.035 + 0.025 = 0.06

    bmesh_cylinder(bm, lever_radius, lever_length, segments=12,
                   center=(handle_x, lever_center_y, handle_z),
                   direction='Y')

    bm.to_mesh(mesh_handle)
    bm.free()

    # Verify total handle depth:
    # From door center (Y=0): door surface at 0.02, rose plate from 0.025 to 0.035,
    # lever from 0.035 to 0.085. Total from door back (-0.02) to lever tip (0.085) = 0.105m
    # But visible depth from front surface = 0.085 - 0.02 = 0.065m ~ 65mm (well under 80mm)

    filepath = os.path.join(OUTPUT_DIR, "flush_door.glb")
    export_glb(filepath)

    mins, maxs, dims = get_scene_bbox()
    print(f"  flush_door.glb: dims W={dims[0]:.3f} H={dims[2]:.3f} D={dims[1]:.3f}")
    print(f"    bbox min=({mins[0]:.4f}, {mins[1]:.4f}, {mins[2]:.4f}) "
          f"max=({maxs[0]:.4f}, {maxs[1]:.4f}, {maxs[2]:.4f})")

    return filepath


# ============================================================
# Model 2: crown_molding.glb
# ============================================================

def gen_crown_molding():
    clear_scene()

    mat_white = new_material("WhitePaint", (0.92, 0.91, 0.89), roughness=0.3)

    obj, mesh = create_mesh_object("CrownMolding", mat_white)
    bm = bmesh.new()

    # Profile: quarter-round concave shape, 40mm x 40mm
    # Wall-ceiling corner at (0,0) in profile space (Y,Z local)
    # Arc from (0, -0.04) to (-0.04, 0) — concave quarter circle
    # We map profile Y -> scene Y, profile Z -> scene Z
    # Profile origin at (Y=0, Z=0) = wall-ceiling corner
    #
    # Points along the concave arc (inward curve):
    # Center of the arc circle: (-0.04, -0.04)
    # Radius: 0.04
    # Arc goes from angle 0 (point (0, -0.04)) to angle pi/2 (point (-0.04, 0))
    #
    # With 8 intermediate points: total 10 points on the arc
    # Indices 0..9 for angles 0, pi/20, 2*pi/20, ..., 9*pi/20 = pi/2

    R = 0.04
    arc_cx, arc_cz = -R, -R  # center of arc circle in profile (Y,Z)
    num_arc_points = 10  # 0 to 9, giving start + 8 intermediate + end

    profile_points = []
    for i in range(num_arc_points):
        angle = (math.pi / 2.0) * i / (num_arc_points - 1)
        py = arc_cx + R * math.cos(angle)  # Y in scene
        pz = arc_cz + R * math.sin(angle)  # Z in scene
        profile_points.append((py, pz))

    # Extrude along X from 0 to 1.0m
    x_start = 0.0
    x_end = 1.0
    n_prof = len(profile_points)

    # Create vertex rings at x_start and x_end
    ring_start = []
    ring_end = []
    for (py, pz) in profile_points:
        v0 = bm.verts.new((x_start, py, pz))
        ring_start.append(v0)
    for (py, pz) in profile_points:
        v1 = bm.verts.new((x_end, py, pz))
        ring_end.append(v1)

    # Side faces (connecting the two rings along the arc)
    for i in range(n_prof - 1):
        bm.faces.new((ring_start[i], ring_start[i + 1],
                       ring_end[i + 1], ring_end[i]))

    # Back face (flat quad connecting first and last profile points on each end)
    # This closes the profile: from point[0] straight to point[-1]
    # We need the back face along the extrusion as well
    # Back panel: ring_start[0] -> ring_end[0] -> ring_end[-1] -> ring_start[-1]
    bm.faces.new((ring_start[0], ring_end[0], ring_end[-1], ring_start[-1]))

    # Side cap faces (triangulate the profile cross-section at each end)
    # Cap at x_start (facing -X, so reversed winding)
    # Fan triangulation from point[0]
    for i in range(1, n_prof - 1):
        bm.faces.new((ring_start[0], ring_start[i + 1], ring_start[i]))

    # Cap at x_end (facing +X, normal winding)
    for i in range(1, n_prof - 1):
        bm.faces.new((ring_end[0], ring_end[i], ring_end[i + 1]))

    # Remove degenerate faces
    removed = remove_degenerate_faces(bm)
    if removed > 0:
        print(f"  crown_molding: removed {removed} degenerate face(s)")

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    filepath = os.path.join(OUTPUT_DIR, "crown_molding.glb")
    export_glb(filepath)

    mins, maxs, dims = get_scene_bbox()
    print(f"  crown_molding.glb: dims L={dims[0]:.3f} W={dims[1]:.3f} H={dims[2]:.3f}")
    print(f"    bbox min=({mins[0]:.4f}, {mins[1]:.4f}, {mins[2]:.4f}) "
          f"max=({maxs[0]:.4f}, {maxs[1]:.4f}, {maxs[2]:.4f})")

    return filepath


# ============================================================
# Model 3 & 4: window_single.glb / window_double.glb
# ============================================================

def gen_window(width, num_panes, output_name):
    """
    Generate a window model.
    - width: total window width
    - num_panes: 1 or 2
    - output_name: filename without path
    """
    clear_scene()

    height = 1.2
    frame_w = 0.05  # 50mm frame profile width
    frame_d = 0.06  # 60mm frame depth
    glass_d = 0.004  # 4mm glass thickness
    sill_depth = 0.05  # 50mm sill protrusion
    sill_h = 0.02  # 20mm sill height

    mat_frame = new_material("WindowFrame", (0.95, 0.95, 0.95), roughness=0.3)
    mat_glass = new_material("Glass", (0.85, 0.92, 0.95), roughness=0.05, alpha=0.3)
    mat_glass.use_nodes = True
    # Make glass slightly transparent via alpha
    bsdf = mat_glass.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Alpha"].default_value = 0.3
        # Set transmission if available
        for inp_name in ["Transmission Weight", "Transmission"]:
            if inp_name in bsdf.inputs:
                bsdf.inputs[inp_name].default_value = 0.8
                break

    # Origin at bottom center. Window spans Z=0..height, X=-width/2..+width/2
    hw = width / 2.0

    # --- Frame object ---
    obj_frame, mesh_frame = create_mesh_object("WindowFrame", mat_frame)
    bm = bmesh.new()

    # Outer frame: 4 pieces (left, right, top, bottom)
    # Bottom rail: full width, frame_w tall, at Z=0
    bmesh_box(bm, width, frame_d, frame_w,
              cx=0, cy=0, cz=frame_w / 2)
    # Top rail
    bmesh_box(bm, width, frame_d, frame_w,
              cx=0, cy=0, cz=height - frame_w / 2)
    # Left stile
    bmesh_box(bm, frame_w, frame_d, height - 2 * frame_w,
              cx=-hw + frame_w / 2, cy=0, cz=height / 2)
    # Right stile
    bmesh_box(bm, frame_w, frame_d, height - 2 * frame_w,
              cx=hw - frame_w / 2, cy=0, cz=height / 2)

    # Center mullion for double window
    if num_panes == 2:
        mullion_w = frame_w * 0.8  # slightly thinner
        bmesh_box(bm, mullion_w, frame_d, height - 2 * frame_w,
                  cx=0, cy=0, cz=height / 2)

    bm.to_mesh(mesh_frame)
    bm.free()

    # --- Glass pane(s) ---
    obj_glass, mesh_glass = create_mesh_object("Glass", mat_glass)
    bm = bmesh.new()

    if num_panes == 1:
        glass_w = width - 2 * frame_w
        glass_h = height - 2 * frame_w
        bmesh_box(bm, glass_w, glass_d, glass_h,
                  cx=0, cy=0, cz=height / 2)
    else:
        mullion_w = frame_w * 0.8
        pane_w = (width - 2 * frame_w - mullion_w) / 2
        glass_h = height - 2 * frame_w
        # Left pane
        left_cx = -hw + frame_w + pane_w / 2
        bmesh_box(bm, pane_w, glass_d, glass_h,
                  cx=left_cx, cy=0, cz=height / 2)
        # Right pane
        right_cx = hw - frame_w - pane_w / 2
        bmesh_box(bm, pane_w, glass_d, glass_h,
                  cx=right_cx, cy=0, cz=height / 2)

    bm.to_mesh(mesh_glass)
    bm.free()

    # --- Sill ---
    # Sill sits ON the bottom frame: Z=0 to Z=sill_h (0.02)
    # Extends outward in +Y direction by sill_depth
    # Sill width slightly wider than frame
    sill_w = width + 0.02  # 10mm overhang each side
    obj_sill, mesh_sill = create_mesh_object("Sill", mat_frame)
    bm = bmesh.new()
    # Center sill at Y = frame_d/2 + sill_depth/2 so it protrudes forward
    # Actually sill should span from frame front face to outward
    # Frame is centered at Y=0, so front is at Y=-frame_d/2
    # Sill: from Y = -frame_d/2 to Y = -frame_d/2 - sill_depth
    sill_cy = -(frame_d / 2) - (sill_depth / 2)
    bmesh_box(bm, sill_w, sill_depth, sill_h,
              cx=0, cy=sill_cy, cz=sill_h / 2)

    bm.to_mesh(mesh_sill)
    bm.free()

    filepath = os.path.join(OUTPUT_DIR, output_name)
    export_glb(filepath)

    mins, maxs, dims = get_scene_bbox()
    print(f"  {output_name}: dims W={dims[0]:.3f} H={dims[2]:.3f} D={dims[1]:.3f}")
    print(f"    bbox min=({mins[0]:.4f}, {mins[1]:.4f}, {mins[2]:.4f}) "
          f"max=({maxs[0]:.4f}, {maxs[1]:.4f}, {maxs[2]:.4f})")
    print(f"    Sill bottom Z = {mins[2]:.4f} (should be 0.0000)")

    return filepath


# ============================================================
# Model 5: outlet_plate.glb
# ============================================================

def gen_outlet_plate():
    clear_scene()

    mat_white = new_material("WhitePlastic", (0.92, 0.92, 0.90), roughness=0.4)
    mat_dark = new_material("DarkSlot", (0.15, 0.15, 0.15), roughness=0.6)

    plate_w = 0.070   # 70mm
    plate_d = 0.005   # 5mm
    plate_h = 0.120   # 120mm

    bevel_w = 0.074   # 74mm
    bevel_d = 0.002   # 2mm
    bevel_h = 0.124   # 124mm

    # Plate spans Z=0 to Z=0.120
    plate_cz = plate_h / 2  # 0.06

    # --- Main plate ---
    obj_plate, mesh_plate = create_mesh_object("OutletPlate", mat_white)
    bm = bmesh.new()
    bmesh_box(bm, plate_w, plate_d, plate_h,
              cx=0, cy=0, cz=plate_cz)
    bm.to_mesh(mesh_plate)
    bm.free()

    # --- Bevel frame (slightly larger, behind the main plate) ---
    # Bevel is 2mm larger on each side but must stay within Z=0..0.120
    # So we clamp bevel to same Z center as plate, and just make it 120mm tall
    # The 2mm extra is only on the X (width) sides
    obj_bevel, mesh_bevel = create_mesh_object("BevelFrame", mat_white)
    bm = bmesh.new()
    # Bevel sits behind the main plate
    bevel_cy = -plate_d / 2 - bevel_d / 2  # behind
    # Use plate_h for height so bevel doesn't exceed Z bounds
    # The bevel is wider (74mm vs 70mm) but same height as plate
    bmesh_box(bm, bevel_w, bevel_d, plate_h,
              cx=0, cy=bevel_cy, cz=plate_cz)
    bm.to_mesh(mesh_bevel)
    bm.free()

    # --- Outlet slots (two outlets, stacked vertically) ---
    # Center of plate at Z=0.06
    # Two outlets spaced 30mm apart: centers at Z=0.06+0.015=0.075 and Z=0.06-0.015=0.045
    slot_positions_z = [plate_cz + 0.015, plate_cz - 0.015]

    obj_slots, mesh_slots = create_mesh_object("OutletSlots", mat_dark)
    bm = bmesh.new()

    for sz in slot_positions_z:
        # Each outlet has: hot slot (left), neutral slot (right), ground pin (bottom)
        # Slot dimensions: 8mm wide x 2mm deep x 3mm tall
        slot_w = 0.008
        slot_d = 0.002
        slot_h = 0.003

        # Hot and neutral slots side by side, ~10mm apart
        slot_spacing = 0.012  # distance between slot centers

        # Hot slot (left)
        slot_y_front = plate_d / 2 + slot_d / 2  # slightly in front of plate surface
        bmesh_box(bm, slot_w, slot_d, slot_h,
                  cx=-slot_spacing / 2, cy=slot_y_front, cz=sz)

        # Neutral slot (right)
        bmesh_box(bm, slot_w, slot_d, slot_h,
                  cx=slot_spacing / 2, cy=slot_y_front, cz=sz)

        # Ground pin (below, centered)
        ground_size = 0.005
        ground_cz = sz - 0.010  # 10mm below outlet center
        bmesh_box(bm, ground_size, slot_d, ground_size,
                  cx=0, cy=slot_y_front, cz=ground_cz)

    bm.to_mesh(mesh_slots)
    bm.free()

    filepath = os.path.join(OUTPUT_DIR, "outlet_plate.glb")
    export_glb(filepath)

    mins, maxs, dims = get_scene_bbox()
    print(f"  outlet_plate.glb: dims W={dims[0]:.3f} H={dims[2]:.3f} D={dims[1]:.3f}")
    print(f"    bbox min=({mins[0]:.4f}, {mins[1]:.4f}, {mins[2]:.4f}) "
          f"max=({maxs[0]:.4f}, {maxs[1]:.4f}, {maxs[2]:.4f})")
    print(f"    Plate Z range: {mins[2]:.4f} to {maxs[2]:.4f} "
          f"(target: 0.0000 to 0.1200)")

    return filepath


# ============================================================
# Main
# ============================================================

def main():
    print("=" * 60)
    print("fix-models-batch1.py — Regenerating 5 models")
    print("=" * 60)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    results = {}

    print("\n[1/5] flush_door.glb")
    results["flush_door.glb"] = gen_flush_door()

    print("\n[2/5] crown_molding.glb")
    results["crown_molding.glb"] = gen_crown_molding()

    print("\n[3/5] window_single.glb")
    results["window_single.glb"] = gen_window(0.9, 1, "window_single.glb")

    print("\n[4/5] window_double.glb")
    results["window_double.glb"] = gen_window(1.8, 2, "window_double.glb")

    print("\n[5/5] outlet_plate.glb")
    results["outlet_plate.glb"] = gen_outlet_plate()

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    for name, path in results.items():
        size = os.path.getsize(path)
        print(f"  {name:25s}  {size:>8,d} bytes  {path}")

    print("\nAll 5 models regenerated successfully.")


if __name__ == "__main__":
    main()
