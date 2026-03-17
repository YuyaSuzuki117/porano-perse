"""全33モデルのマテリアル診断"""
import bpy
import os
import json

MODEL_DIR = r"C:\Users\y-suz\porano-perse\public\models"

# All 33 new models
MODELS = [
    "flush_door", "glass_door", "sliding_door", "double_sliding_door",
    "door_frame", "window_single", "window_fix", "window_double",
    "shopfront_glass", "baseboard", "baseboard_wood", "crown_molding",
    "trim_reveal", "counter_straight", "counter_l_shape", "bar_counter",
    "glass_partition", "decorative_column", "dropped_ceiling_frame",
    "niche_alcove", "downlight_recessed", "spot_light", "track_light_rail",
    "wall_sconce", "indirect_light_cove", "pendant_light_simple",
    "air_diffuser", "access_panel", "exit_sign", "sprinkler_head",
    "smoke_detector", "outlet_plate", "switch_plate"
]

results = {}

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

    mat_report = []
    has_color = False
    has_issue = False

    for obj in objects:
        for slot in obj.material_slots:
            mat = slot.material
            if not mat:
                mat_report.append(f"  {obj.name}: EMPTY SLOT")
                has_issue = True
                continue

            info = {"obj": obj.name, "mat": mat.name}

            if mat.use_nodes:
                bsdf = None
                for node in mat.node_tree.nodes:
                    if node.type == 'BSDF_PRINCIPLED':
                        bsdf = node
                        break

                if bsdf:
                    bc = bsdf.inputs.get("Base Color")
                    if bc:
                        c = [round(x, 3) for x in bc.default_value[:3]]
                        info["color"] = c
                        # Check if it's non-default (not 0.8, 0.8, 0.8 default gray)
                        if not (0.75 < c[0] < 0.85 and 0.75 < c[1] < 0.85 and 0.75 < c[2] < 0.85):
                            has_color = True
                        else:
                            info["issue"] = "DEFAULT_GRAY"

                    rough = bsdf.inputs.get("Roughness")
                    if rough:
                        info["roughness"] = round(rough.default_value, 3)

                    metal = bsdf.inputs.get("Metallic")
                    if metal:
                        info["metallic"] = round(metal.default_value, 3)

                    # Check transmission for glass
                    trans = bsdf.inputs.get("Transmission Weight")
                    if trans and trans.default_value > 0.01:
                        info["transmission"] = round(trans.default_value, 3)
                else:
                    info["issue"] = "NO_BSDF"
                    has_issue = True
            else:
                info["issue"] = "NO_NODES"
                has_issue = True

            mat_report.append(info)

    status = "OK" if has_color and not has_issue else ("NO_COLOR" if not has_color else "ISSUE")
    results[name] = {"status": status, "materials": mat_report, "obj_count": len(objects)}

# Print summary
print("=" * 70)
print("MATERIAL DIAGNOSIS REPORT")
print("=" * 70)

problems = []
for name, data in results.items():
    if data["status"] != "OK":
        problems.append(name)
        print(f"\n[{data['status']}] {name} ({data['obj_count']} objects)")
        for m in data["materials"]:
            if isinstance(m, str):
                print(f"  {m}")
            else:
                issue = m.get("issue", "")
                color = m.get("color", "?")
                print(f"  {m['obj']}: {m['mat']} color={color} {issue}")

print(f"\n{'=' * 70}")
print(f"Total: {len(results)} models, {len(problems)} with issues")
print(f"Problems: {problems}")
