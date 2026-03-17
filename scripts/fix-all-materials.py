"""
全モデルのマテリアル一括修正
Blender 5.0ではPrincipled BSDFノード名が日本語化される問題に対応
node.type == 'BSDF_PRINCIPLED' でノードを特定し、正しい色を設定
"""
import bpy
import os

MODEL_DIR = r"C:\Users\y-suz\porano-perse\public\models"

# Material name -> (Base Color RGB, Roughness, Metallic, Transmission, Emission Strength)
MATERIAL_COLORS = {
    # Wood
    "DoorWood":       ((0.55, 0.38, 0.25), 0.6, 0.0, 0.0, 0.0),
    "WoodLight":      ((0.65, 0.50, 0.35), 0.55, 0.0, 0.0, 0.0),
    "WoodMedium":     ((0.45, 0.30, 0.18), 0.5, 0.0, 0.0, 0.0),
    "WoodFront":      ((0.50, 0.35, 0.22), 0.55, 0.0, 0.0, 0.0),
    "DarkWoodTop":    ((0.25, 0.15, 0.08), 0.4, 0.0, 0.0, 0.0),
    "Wood":           ((0.55, 0.38, 0.25), 0.6, 0.0, 0.0, 0.0),

    # Metal
    "HandleMetal":    ((0.15, 0.15, 0.15), 0.3, 0.9, 0.0, 0.0),
    "MetalDarkGray":  ((0.12, 0.12, 0.12), 0.35, 0.85, 0.0, 0.0),
    "MetalRail":      ((0.30, 0.30, 0.28), 0.35, 0.85, 0.0, 0.0),
    "Aluminum":       ((0.75, 0.75, 0.73), 0.25, 0.9, 0.0, 0.0),
    "AluminumSilver": ((0.78, 0.78, 0.76), 0.2, 0.9, 0.0, 0.0),
    "AluminumFrame":  ((0.70, 0.70, 0.68), 0.3, 0.85, 0.0, 0.0),
    "Chrome":         ((0.85, 0.85, 0.85), 0.1, 1.0, 0.0, 0.0),
    "BrushedMetal":   ((0.70, 0.70, 0.68), 0.4, 0.7, 0.0, 0.0),
    "MatteBlack":     ((0.05, 0.05, 0.05), 0.8, 0.9, 0.0, 0.0),

    # Paint
    "WhitePaint":     ((0.92, 0.91, 0.89), 0.3, 0.0, 0.0, 0.0),
    "PaintedPanel":   ((0.35, 0.33, 0.30), 0.4, 0.0, 0.0, 0.0),

    # Glass
    "Glass":          ((0.95, 0.97, 1.00), 0.05, 0.0, 0.9, 0.0),
    "GlassPanel":     ((0.95, 0.97, 1.00), 0.05, 0.0, 0.9, 0.0),

    # Stone/Counter
    "StoneTop":       ((0.85, 0.83, 0.80), 0.2, 0.0, 0.0, 0.0),

    # Wall/Ceiling
    "WallWhite":      ((0.92, 0.91, 0.89), 0.5, 0.0, 0.0, 0.0),
    "GypsumWhite":    ((0.90, 0.89, 0.87), 0.5, 0.0, 0.0, 0.0),
    "NicheInterior":  ((0.82, 0.80, 0.78), 0.5, 0.0, 0.0, 0.0),

    # Plastic
    "WhitePlastic":   ((0.92, 0.92, 0.90), 0.4, 0.0, 0.0, 0.0),
    "DarkSlot":       ((0.10, 0.10, 0.10), 0.6, 0.0, 0.0, 0.0),

    # Window frame
    "WindowFrame":    ((0.93, 0.93, 0.91), 0.3, 0.0, 0.0, 0.0),
    "FrameWhite":     ((0.93, 0.93, 0.91), 0.3, 0.0, 0.0, 0.0),

    # Lighting (emissive)
    "LEDWhite":       ((1.0, 0.98, 0.95), 0.1, 0.0, 0.0, 5.0),
    "EmissiveGreen":  ((0.0, 0.8, 0.2), 0.3, 0.0, 0.0, 3.0),
    "LEDRed":         ((0.9, 0.0, 0.0), 0.3, 0.0, 0.0, 2.0),

    # Reflector
    "SilverReflector":((0.85, 0.85, 0.85), 0.2, 0.9, 0.0, 0.0),
    "TrimWhite":      ((0.95, 0.95, 0.93), 0.3, 0.0, 0.0, 0.0),
}

# Models that need fixing (15 with DEFAULT_GRAY)
PROBLEM_MODELS = [
    "flush_door", "window_single", "window_double",
    "baseboard", "baseboard_wood", "crown_molding", "trim_reveal",
    "counter_straight", "counter_l_shape", "bar_counter",
    "glass_partition", "decorative_column", "dropped_ceiling_frame",
    "niche_alcove", "outlet_plate"
]

fixed_count = 0
unfixed_mats = []

for name in PROBLEM_MODELS:
    # Clear scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)

    path = os.path.join(MODEL_DIR, f"{name}.glb")
    if not os.path.exists(path):
        print(f"[SKIP] {name}: file not found")
        continue

    # Import
    bpy.ops.import_scene.gltf(filepath=path)
    objects = [o for o in bpy.data.objects if o.type == 'MESH']

    if not objects:
        print(f"[SKIP] {name}: no mesh objects")
        continue

    mat_fixed = 0
    for obj in objects:
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or not mat.use_nodes:
                continue

            # Find Principled BSDF by type (not name - avoids Japanese locale issue)
            bsdf = None
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    bsdf = node
                    break

            if not bsdf:
                continue

            # Look up color definition
            mat_name = mat.name
            # Handle suffixed names like "WhitePaint.001"
            base_name = mat_name.split(".")[0]

            if base_name in MATERIAL_COLORS:
                color, rough, metal, trans, emission = MATERIAL_COLORS[base_name]

                bsdf.inputs["Base Color"].default_value = (*color, 1.0)
                bsdf.inputs["Roughness"].default_value = rough
                bsdf.inputs["Metallic"].default_value = metal

                # Transmission
                tw = bsdf.inputs.get("Transmission Weight")
                if tw:
                    tw.default_value = trans

                # Emission
                if emission > 0:
                    ec = bsdf.inputs.get("Emission Color")
                    es = bsdf.inputs.get("Emission Strength")
                    if ec:
                        ec.default_value = (*color, 1.0)
                    if es:
                        es.default_value = emission

                mat_fixed += 1
            else:
                unfixed_mats.append(f"{name}/{base_name}")

    # Export
    export_path = os.path.join(MODEL_DIR, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=export_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True
    )

    size = os.path.getsize(export_path)
    print(f"[FIXED] {name}: {mat_fixed} materials fixed, {size} bytes")
    fixed_count += 1

print(f"\n{'='*60}")
print(f"Fixed {fixed_count}/{len(PROBLEM_MODELS)} models")
if unfixed_mats:
    print(f"Unknown materials (not in lookup): {unfixed_mats}")
else:
    print("All materials matched successfully")
