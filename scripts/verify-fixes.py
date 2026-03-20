"""修正モデルの検証: サムネイル生成 + 寸法チェック"""
import bpy
import bmesh
import os
from mathutils import Vector

MODEL_DIR = r"C:\Users\y-suz\porano-perse\public\models"
THUMB_DIR = r"C:\Users\y-suz\porano-perse\output\model-inspection"

MODELS = [
    "flush_door", "crown_molding", "window_single", "window_double",
    "outlet_plate", "downlight_recessed", "spot_light", "wall_sconce",
    "indirect_light_cove"
]

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)

def get_bbox(objects):
    all_min = Vector((float('inf'),) * 3)
    all_max = Vector((float('-inf'),) * 3)
    for obj in objects:
        bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        for v in bbox:
            for i in range(3):
                all_min[i] = min(all_min[i], v[i])
                all_max[i] = max(all_max[i], v[i])
    return all_min, all_max

def check_degenerate(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    degen = sum(1 for f in bm.faces if f.calc_area() < 1e-8)
    bm.free()
    return degen

for name in MODELS:
    clear_scene()
    path = os.path.join(MODEL_DIR, f"{name}.glb")
    if not os.path.exists(path):
        print(f"[MISSING] {name}")
        continue

    bpy.ops.import_scene.gltf(filepath=path)
    objects = [o for o in bpy.data.objects if o.type == 'MESH']

    if not objects:
        print(f"[EMPTY] {name}")
        continue

    mn, mx = get_bbox(objects)
    w = mx.x - mn.x
    h = mx.z - mn.z
    d = mx.y - mn.y
    degen = sum(check_degenerate(o) for o in objects)

    status = "OK"
    notes = []
    if mn.z < -0.01 and h > 0.5:
        notes.append(f"Z_min={mn.z:.3f}")
    if degen > 0:
        notes.append(f"退化面={degen}")
        status = "NG"

    note_str = " | ".join(notes) if notes else ""
    print(f"[{status}] {name}: W{w:.3f} H{h:.3f} D{d:.3f} Z[{mn.z:.3f}..{mx.z:.3f}] {note_str}")

    # Render thumbnail
    cam_data = bpy.data.cameras.new("Cam")
    cam_obj = bpy.data.objects.new("Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    cx = (mn.x + mx.x) / 2
    cy = (mn.y + mx.y) / 2
    cz = (mn.z + mx.z) / 2
    dist = max(w, h, d) * 2.5
    cam_obj.location = (cx + dist * 0.7, cy - dist * 0.7, cz + dist * 0.5)
    direction = Vector((cx, cy, cz)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    light_data = bpy.data.lights.new("Sun", 'SUN')
    light_data.energy = 3.0
    light_obj = bpy.data.objects.new("Sun", light_data)
    bpy.context.scene.collection.objects.link(light_obj)
    light_obj.location = (cx + dist, cy - dist, cz + dist * 2)

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 400
    scene.render.resolution_y = 300
    scene.render.filepath = os.path.join(THUMB_DIR, f"{name}_fixed.png")
    scene.render.image_settings.file_format = 'PNG'

    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    for node in scene.world.node_tree.nodes:
        if node.type == 'BACKGROUND':
            node.inputs[0].default_value = (0.85, 0.85, 0.85, 1.0)

    bpy.ops.render.render(write_still=True)

print("\nDone - all fixed models verified.")
