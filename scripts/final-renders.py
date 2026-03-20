"""修正後の最終レンダリング確認"""
import bpy
import os
from mathutils import Vector

MODEL_DIR = r"C:\Users\y-suz\porano-perse\public\models"
THUMB_DIR = r"C:\Users\y-suz\porano-perse\output\model-inspection"

# Render all previously problematic models + key ones
MODELS = [
    "flush_door", "crown_molding", "counter_straight", "bar_counter",
    "baseboard_wood", "glass_partition", "outlet_plate", "niche_alcove",
    "downlight_recessed", "spot_light", "wall_sconce",
]

for name in MODELS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)

    path = os.path.join(MODEL_DIR, f"{name}.glb")
    if not os.path.exists(path):
        continue

    bpy.ops.import_scene.gltf(filepath=path)
    objects = [o for o in bpy.data.objects if o.type == 'MESH']
    if not objects:
        continue

    # Bounding box
    all_min = Vector((float('inf'),) * 3)
    all_max = Vector((float('-inf'),) * 3)
    for obj in objects:
        for corner in obj.bound_box:
            v = obj.matrix_world @ Vector(corner)
            for i in range(3):
                all_min[i] = min(all_min[i], v[i])
                all_max[i] = max(all_max[i], v[i])

    cx = (all_min.x + all_max.x) / 2
    cy = (all_min.y + all_max.y) / 2
    cz = (all_min.z + all_max.z) / 2
    dims = all_max - all_min
    dist = max(dims) * 2.2

    # Camera
    cam = bpy.data.cameras.new("Cam")
    cam_obj = bpy.data.objects.new("Cam", cam)
    bpy.context.scene.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj
    cam_obj.location = (cx + dist * 0.65, cy - dist * 0.65, cz + dist * 0.45)
    direction = Vector((cx, cy, cz)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    # Sun light
    sun = bpy.data.lights.new("Sun", 'SUN')
    sun.energy = 3.0
    sun_obj = bpy.data.objects.new("Sun", sun)
    bpy.context.scene.collection.objects.link(sun_obj)
    sun_obj.location = (cx + dist * 1.5, cy - dist, cz + dist * 2)
    sun_obj.rotation_euler = (0.8, 0.2, -0.5)

    # Fill light
    fill = bpy.data.lights.new("Fill", 'SUN')
    fill.energy = 1.0
    fill_obj = bpy.data.objects.new("Fill", fill)
    bpy.context.scene.collection.objects.link(fill_obj)
    fill_obj.location = (cx - dist, cy + dist * 0.5, cz + dist * 0.3)
    fill_obj.rotation_euler = (1.2, 0, 2.5)

    # World
    scene = bpy.context.scene
    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    for node in scene.world.node_tree.nodes:
        if node.type == 'BACKGROUND':
            node.inputs[0].default_value = (0.88, 0.88, 0.88, 1.0)

    # Render
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 480
    scene.render.resolution_y = 360
    scene.render.filepath = os.path.join(THUMB_DIR, f"{name}_final.png")
    scene.render.image_settings.file_format = 'PNG'

    bpy.ops.render.render(write_still=True)
    print(f"[DONE] {name}_final.png")

print("\nAll final renders complete.")
