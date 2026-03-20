"""修正家具モデルのレンダリング"""
import bpy, os
from mathutils import Vector

MODEL_DIR = r"C:\Users\y-suz\porano-perse\public\models"
THUMB_DIR = r"C:\Users\y-suz\porano-perse\output\model-inspection"

for name in ["chair", "table_square", "sofa", "armchair", "booth_sofa", "counter"]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)

    path = os.path.join(MODEL_DIR, f"{name}.glb")
    bpy.ops.import_scene.gltf(filepath=path)
    objects = [o for o in bpy.data.objects if o.type == 'MESH']

    mn = Vector((float('inf'),)*3)
    mx = Vector((float('-inf'),)*3)
    for obj in objects:
        for c in obj.bound_box:
            v = obj.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], v[i])
                mx[i] = max(mx[i], v[i])

    cx, cy, cz = (mn.x+mx.x)/2, (mn.y+mx.y)/2, (mn.z+mx.z)/2
    dist = max(mx.x-mn.x, mx.z-mn.z, mx.y-mn.y) * 2.2

    cam = bpy.data.cameras.new("Cam")
    cam_obj = bpy.data.objects.new("Cam", cam)
    bpy.context.scene.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj
    cam_obj.location = (cx+dist*0.65, cy-dist*0.65, cz+dist*0.45)
    d = Vector((cx,cy,cz)) - cam_obj.location
    cam_obj.rotation_euler = d.to_track_quat('-Z','Y').to_euler()

    sun = bpy.data.lights.new("Sun",'SUN')
    sun.energy = 3.0
    s = bpy.data.objects.new("Sun", sun)
    bpy.context.scene.collection.objects.link(s)
    s.location = (cx+dist*1.5, cy-dist, cz+dist*2)

    sc = bpy.context.scene
    if not sc.world:
        sc.world = bpy.data.worlds.new("W")
    sc.world.use_nodes = True
    for n in sc.world.node_tree.nodes:
        if n.type == 'BACKGROUND':
            n.inputs[0].default_value = (0.88,0.88,0.88,1)

    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 32
    sc.cycles.use_denoising = True
    sc.render.resolution_x = 480
    sc.render.resolution_y = 360
    sc.render.filepath = os.path.join(THUMB_DIR, f"{name}_v2.png")
    sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    w, h, dep = mx.x-mn.x, mx.z-mn.z, mx.y-mn.y
    print(f"[OK] {name}: W{w:.3f} H{h:.3f} D{dep:.3f}")
print("Done")
