"""
render-thumbnails.py
Renders thumbnail preview images of key architectural models for visual inspection.

Usage:
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --python render-thumbnails.py
"""

import bpy
import os
import sys
import math
from mathutils import Vector

# ── Configuration ──────────────────────────────────────────────────────────────

MODELS_DIR = "C:/Users/y-suz/porano-perse/public/models"
OUTPUT_DIR = "C:/Users/y-suz/porano-perse/output/model-inspection"

MODEL_NAMES = [
    "flush_door", "glass_door", "sliding_door",
    "door_frame", "window_single", "shopfront_glass",
    "baseboard", "crown_molding", "counter_straight",
    "downlight_recessed", "spot_light", "wall_sconce",
]

RENDER_WIDTH = 400
RENDER_HEIGHT = 300
RENDER_SAMPLES = 16
CAMERA_DISTANCE_FACTOR = 2.5
BACKGROUND_COLOR = (0.85, 0.85, 0.85)
SUN_ENERGY = 3.0


# ── Helper Functions ───────────────────────────────────────────────────────────

def clear_scene():
    """Completely clear the scene using factory settings, then remove all remaining objects."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Remove any objects that might remain
    for obj in bpy.data.objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    # Clean orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)
    for block in bpy.data.cameras:
        if block.users == 0:
            bpy.data.cameras.remove(block)
    for block in bpy.data.lights:
        if block.users == 0:
            bpy.data.lights.remove(block)


def import_glb(filepath):
    """Import a GLB file and return the list of imported objects."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=filepath)
    after = set(bpy.data.objects)
    imported = list(after - before)
    return imported


def get_scene_bounds(objects):
    """Calculate the overall bounding box of all given objects in world space."""
    min_co = Vector((float('inf'), float('inf'), float('inf')))
    max_co = Vector((float('-inf'), float('-inf'), float('-inf')))

    for obj in objects:
        if obj.type == 'MESH' and obj.data and len(obj.data.vertices) > 0:
            for v in obj.data.vertices:
                world_co = obj.matrix_world @ v.co
                min_co.x = min(min_co.x, world_co.x)
                min_co.y = min(min_co.y, world_co.y)
                min_co.z = min(min_co.z, world_co.z)
                max_co.x = max(max_co.x, world_co.x)
                max_co.y = max(max_co.y, world_co.y)
                max_co.z = max(max_co.z, world_co.z)
        elif obj.type == 'EMPTY':
            # Use object location for empties
            loc = obj.matrix_world.translation
            min_co.x = min(min_co.x, loc.x)
            min_co.y = min(min_co.y, loc.y)
            min_co.z = min(min_co.z, loc.z)
            max_co.x = max(max_co.x, loc.x)
            max_co.y = max(max_co.y, loc.y)
            max_co.z = max(max_co.z, loc.z)

    # Fallback if no valid geometry found
    if min_co.x == float('inf'):
        min_co = Vector((-1, -1, -1))
        max_co = Vector((1, 1, 1))

    return min_co, max_co


def setup_camera(objects):
    """Create and position a camera to see the whole model from a 3/4 angle."""
    min_co, max_co = get_scene_bounds(objects)
    center = (min_co + max_co) / 2.0
    dimensions = max_co - min_co
    max_dim = max(dimensions.x, dimensions.y, dimensions.z, 0.01)  # avoid zero

    # Camera distance based on max dimension
    distance = max_dim * CAMERA_DISTANCE_FACTOR

    # 3/4 view angle: front-right-above
    # Azimuth ~45 degrees from front-right, elevation ~30 degrees above
    azimuth = math.radians(35)   # angle from Y axis toward X axis
    elevation = math.radians(30)  # angle above horizontal

    cam_x = center.x + distance * math.sin(azimuth) * math.cos(elevation)
    cam_y = center.y - distance * math.cos(azimuth) * math.cos(elevation)
    cam_z = center.z + distance * math.sin(elevation)

    # Create camera
    cam_data = bpy.data.cameras.new("ThumbnailCamera")
    cam_data.lens = 50  # 50mm focal length
    cam_data.clip_start = 0.01
    cam_data.clip_end = max_dim * 20

    cam_obj = bpy.data.objects.new("ThumbnailCamera", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    cam_obj.location = (cam_x, cam_y, cam_z)

    # Point camera at the center using a Track To constraint
    constraint = cam_obj.constraints.new(type='TRACK_TO')
    constraint.target = create_target_empty(center)
    constraint.track_axis = 'TRACK_NEGATIVE_Z'
    constraint.up_axis = 'UP_Y'

    # Set as scene camera
    bpy.context.scene.camera = cam_obj

    return cam_obj


def create_target_empty(location):
    """Create an empty at the given location to serve as a camera target."""
    empty = bpy.data.objects.new("CameraTarget", None)
    empty.location = location
    bpy.context.scene.collection.objects.link(empty)
    return empty


def setup_lighting():
    """Create a sun light angled from top-right."""
    sun_data = bpy.data.lights.new("Sun", type='SUN')
    sun_data.energy = SUN_ENERGY
    sun_obj = bpy.data.objects.new("Sun", sun_data)
    bpy.context.scene.collection.objects.link(sun_obj)

    # Angle from top-right (rotating around X and Z)
    sun_obj.rotation_euler = (math.radians(45), math.radians(15), math.radians(30))

    return sun_obj


def setup_world_background():
    """Set world background to light gray."""
    world = bpy.data.worlds.new("ThumbnailWorld")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links

    # Clear default nodes
    nodes.clear()

    # Create background node
    bg_node = nodes.new(type='ShaderNodeBackground')
    bg_node.inputs['Color'].default_value = (*BACKGROUND_COLOR, 1.0)
    bg_node.inputs['Strength'].default_value = 1.0

    # Create output node
    output_node = nodes.new(type='ShaderNodeOutputWorld')

    # Link
    links.new(bg_node.outputs['Background'], output_node.inputs['Surface'])

    bpy.context.scene.world = world


def configure_render_settings():
    """Configure Cycles render settings for quick preview."""
    scene = bpy.context.scene

    # Use Cycles
    scene.render.engine = 'CYCLES'

    # CPU device
    prefs = bpy.context.preferences.addons.get('cycles')
    if prefs:
        prefs.preferences.compute_device_type = 'NONE'  # CPU
    scene.cycles.device = 'CPU'

    # Resolution
    scene.render.resolution_x = RENDER_WIDTH
    scene.render.resolution_y = RENDER_HEIGHT
    scene.render.resolution_percentage = 100

    # Samples
    scene.cycles.samples = RENDER_SAMPLES
    scene.cycles.preview_samples = RENDER_SAMPLES

    # No transparent film - use background color
    scene.render.film_transparent = False

    # Denoising
    scene.cycles.use_denoising = True

    # Output format
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.compression = 15


def render_model(name):
    """Render a single model and save the thumbnail."""
    glb_path = os.path.join(MODELS_DIR, f"{name}.glb")
    output_path = os.path.join(OUTPUT_DIR, f"{name}.png")

    if not os.path.exists(glb_path):
        print(f"  SKIP: {glb_path} not found")
        return False

    # Step 1: Clear scene
    clear_scene()

    # Step 2: Import GLB
    print(f"  Importing {name}.glb ...")
    imported_objects = import_glb(glb_path)

    if not imported_objects:
        print(f"  WARNING: No objects imported from {name}.glb")
        # Still try to render - objects might be nested in collections
        imported_objects = list(bpy.data.objects)

    all_objects = list(bpy.data.objects)
    print(f"  Imported {len(imported_objects)} objects (total in scene: {len(all_objects)})")

    # Step 3: Setup scene
    setup_world_background()
    configure_render_settings()
    setup_lighting()
    setup_camera(all_objects)

    # Step 4: Update scene to apply constraints
    bpy.context.view_layer.update()

    # Step 5: Render
    print(f"  Rendering to {output_path} ...")
    bpy.context.scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)

    if os.path.exists(output_path):
        size_kb = os.path.getsize(output_path) / 1024
        print(f"  OK: {name}.png ({size_kb:.1f} KB)")
        return True
    else:
        print(f"  ERROR: Failed to write {output_path}")
        return False


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Render Thumbnails - Architectural Model Preview")
    print("=" * 60)
    print(f"Models directory: {MODELS_DIR}")
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Models to render: {len(MODEL_NAMES)}")
    print()

    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    success_count = 0
    fail_count = 0

    for i, name in enumerate(MODEL_NAMES, 1):
        print(f"[{i}/{len(MODEL_NAMES)}] {name}")
        try:
            if render_model(name):
                success_count += 1
            else:
                fail_count += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
            fail_count += 1
        print()

    print("=" * 60)
    print(f"Done: {success_count} succeeded, {fail_count} failed")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
