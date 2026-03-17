"""
GLBモデル品質検査スクリプト
- 寸法チェック（実寸との整合性）
- ジオメトリ品質（頂点数、非多様体、孤立頂点）
- マテリアル検証
- サムネイル生成
"""
import bpy
import bmesh
import os
import sys
import json
from mathutils import Vector

MODEL_DIR = r"C:\Users\y-suz\porano-perse\public\models"
THUMB_DIR = r"C:\Users\y-suz\porano-perse\output\model-inspection"
os.makedirs(THUMB_DIR, exist_ok=True)

# Expected dimensions (meters) - width, height, depth with ±20% tolerance
EXPECTED = {
    "flush_door":           {"w": 0.80, "h": 2.10, "d": 0.04, "desc": "フラッシュドア"},
    "glass_door":           {"w": 0.90, "h": 2.20, "d": 0.05, "desc": "ガラスドア"},
    "sliding_door":         {"w": 0.90, "h": 2.10, "d": 0.05, "desc": "片引戸"},
    "double_sliding_door":  {"w": 1.80, "h": 2.10, "d": 0.05, "desc": "引違い戸"},
    "door_frame":           {"w": 0.85, "h": 2.15, "d": 0.12, "desc": "ドア枠"},
    "window_single":        {"w": 0.90, "h": 1.20, "d": 0.10, "desc": "単窓"},
    "window_fix":           {"w": 1.20, "h": 0.60, "d": 0.10, "desc": "FIX窓"},
    "window_double":        {"w": 1.80, "h": 1.20, "d": 0.10, "desc": "引違い窓"},
    "shopfront_glass":      {"w": 3.00, "h": 2.50, "d": 0.10, "desc": "ショップフロント"},
    "baseboard":            {"w": 1.00, "h": 0.06, "d": 0.01, "desc": "巾木"},
    "baseboard_wood":       {"w": 1.00, "h": 0.06, "d": 0.01, "desc": "木製巾木"},
    "crown_molding":        {"w": 1.00, "h": 0.04, "d": 0.04, "desc": "廻縁"},
    "trim_reveal":          {"w": 1.00, "h": 0.02, "d": 0.02, "desc": "見切り材"},
    "counter_straight":     {"w": 2.00, "h": 0.85, "d": 0.60, "desc": "カウンター"},
    "counter_l_shape":      {"w": 2.00, "h": 0.85, "d": 1.50, "desc": "L型カウンター"},
    "bar_counter":          {"w": 2.50, "h": 1.05, "d": 0.50, "desc": "バーカウンター"},
    "glass_partition":      {"w": 1.00, "h": 2.10, "d": 0.05, "desc": "ガラスパーティション"},
    "decorative_column":    {"w": 0.30, "h": 2.70, "d": 0.30, "desc": "化粧柱"},
    "dropped_ceiling_frame":{"w": 1.00, "h": 0.20, "d": 0.05, "desc": "下がり天井"},
    "niche_alcove":         {"w": 1.00, "h": 1.20, "d": 0.15, "desc": "ニッチ"},
    "downlight_recessed":   {"w": 0.10, "h": 0.08, "d": 0.10, "desc": "ダウンライト"},
    "spot_light":           {"w": 0.08, "h": 0.12, "d": 0.08, "desc": "スポットライト"},
    "track_light_rail":     {"w": 1.00, "h": 0.02, "d": 0.03, "desc": "ライティングレール"},
    "wall_sconce":          {"w": 0.10, "h": 0.10, "d": 0.10, "desc": "ブラケット照明"},
    "indirect_light_cove":  {"w": 1.00, "h": 0.15, "d": 0.10, "desc": "間接照明コーブ"},
    "pendant_light_simple": {"w": 0.25, "h": 0.70, "d": 0.25, "desc": "ペンダントライト"},
    "air_diffuser":         {"w": 0.30, "h": 0.02, "d": 0.30, "desc": "空調吹出口"},
    "access_panel":         {"w": 0.45, "h": 0.02, "d": 0.45, "desc": "点検口"},
    "exit_sign":            {"w": 0.30, "h": 0.15, "d": 0.03, "desc": "非常口サイン"},
    "sprinkler_head":       {"w": 0.06, "h": 0.05, "d": 0.06, "desc": "スプリンクラ"},
    "smoke_detector":       {"w": 0.10, "h": 0.03, "d": 0.10, "desc": "煙感知器"},
    "outlet_plate":         {"w": 0.07, "h": 0.12, "d": 0.01, "desc": "コンセント"},
    "switch_plate":         {"w": 0.07, "h": 0.12, "d": 0.01, "desc": "スイッチ"},
}


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)


def import_glb(filepath):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=filepath)
    return [o for o in bpy.data.objects if o.type == 'MESH']


def get_bbox_dimensions(objects):
    """Get overall bounding box of all objects"""
    if not objects:
        return (0, 0, 0), (0, 0, 0), (0, 0, 0)

    all_min = Vector((float('inf'),) * 3)
    all_max = Vector((float('-inf'),) * 3)

    for obj in objects:
        bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        for v in bbox:
            for i in range(3):
                all_min[i] = min(all_min[i], v[i])
                all_max[i] = max(all_max[i], v[i])

    dims = all_max - all_min
    # Return dimensions sorted as width(X), height(Z), depth(Y) in Blender coords
    return {
        "width": round(dims.x, 4),
        "height": round(dims.z, 4),
        "depth": round(dims.y, 4),
        "min": [round(all_min.x, 4), round(all_min.y, 4), round(all_min.z, 4)],
        "max": [round(all_max.x, 4), round(all_max.y, 4), round(all_max.z, 4)],
    }


def check_mesh_quality(obj):
    """Check mesh for issues"""
    issues = []
    bm = bmesh.new()
    bm.from_mesh(obj.data)

    # Loose vertices
    loose_verts = sum(1 for v in bm.verts if not v.link_edges)
    if loose_verts > 0:
        issues.append(f"孤立頂点: {loose_verts}")

    # Non-manifold edges
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary)
    if non_manifold > 0:
        issues.append(f"非多様体エッジ: {non_manifold}")

    # Degenerate faces (zero area)
    degen = sum(1 for f in bm.faces if f.calc_area() < 1e-8)
    if degen > 0:
        issues.append(f"退化面: {degen}")

    # Double vertices
    doubles = bmesh.ops.find_doubles(bm, verts=bm.verts, dist=0.0001)
    if doubles['targetmap']:
        issues.append(f"重複頂点: {len(doubles['targetmap'])}")

    stats = {
        "verts": len(bm.verts),
        "faces": len(bm.faces),
        "edges": len(bm.edges),
    }
    bm.free()
    return stats, issues


def check_materials(obj):
    """Check material setup"""
    issues = []
    mat_info = []

    if not obj.data.materials:
        issues.append("マテリアル未設定")
        return mat_info, issues

    for mat in obj.data.materials:
        if mat is None:
            issues.append("空マテリアルスロット")
            continue

        info = {"name": mat.name, "has_nodes": mat.use_nodes}

        if mat.use_nodes:
            bsdf = None
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    bsdf = node
                    break

            if bsdf:
                bc = bsdf.inputs.get("Base Color")
                if bc:
                    info["base_color"] = [round(c, 3) for c in bc.default_value[:3]]
                rough = bsdf.inputs.get("Roughness")
                if rough:
                    info["roughness"] = round(rough.default_value, 3)
                metal = bsdf.inputs.get("Metallic")
                if metal:
                    info["metallic"] = round(metal.default_value, 3)

                # Check for pure black base color (often a mistake)
                if bc and all(c < 0.01 for c in bc.default_value[:3]):
                    issues.append(f"真っ黒マテリアル: {mat.name}")
            else:
                issues.append(f"Principled BSDF未使用: {mat.name}")
        else:
            issues.append(f"ノード未使用: {mat.name}")

        mat_info.append(info)

    return mat_info, issues


def render_thumbnail(name, objects):
    """Render a small thumbnail for visual inspection"""
    scene = bpy.context.scene

    # Setup camera
    cam_data = bpy.data.cameras.new("InspectCam")
    cam_obj = bpy.data.objects.new("InspectCam", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    # Calculate camera position based on object bounds
    bbox = get_bbox_dimensions(objects)
    cx = (bbox["min"][0] + bbox["max"][0]) / 2
    cy = (bbox["min"][1] + bbox["max"][1]) / 2
    cz = (bbox["min"][2] + bbox["max"][2]) / 2
    max_dim = max(bbox["width"], bbox["height"], bbox["depth"])
    dist = max_dim * 2.5

    cam_obj.location = (cx + dist * 0.7, cy - dist * 0.7, cz + dist * 0.5)

    # Point camera at center
    from mathutils import Matrix
    direction = Vector((cx, cy, cz)) - cam_obj.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot_quat.to_euler()

    # Add light
    light_data = bpy.data.lights.new("InspectLight", 'SUN')
    light_data.energy = 3.0
    light_obj = bpy.data.objects.new("InspectLight", light_data)
    bpy.context.scene.collection.objects.link(light_obj)
    light_obj.location = (cx + dist, cy - dist, cz + dist * 2)

    # Render settings
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 400
    scene.render.resolution_y = 300
    scene.render.film_transparent = True
    scene.render.filepath = os.path.join(THUMB_DIR, f"{name}.png")
    scene.render.image_settings.file_format = 'PNG'

    # World background
    if not scene.world:
        scene.world = bpy.data.worlds.new("InspectWorld")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.85, 0.85, 0.85, 1.0)

    bpy.ops.render.render(write_still=True)


# Main inspection
results = {}
all_issues = []

for name, spec in EXPECTED.items():
    glb_path = os.path.join(MODEL_DIR, f"{name}.glb")
    if not os.path.exists(glb_path):
        results[name] = {"status": "MISSING", "desc": spec["desc"]}
        all_issues.append(f"[MISSING] {name}: ファイルが存在しない")
        continue

    print(f"\n{'='*60}")
    print(f"検査: {name} ({spec['desc']})")
    print(f"{'='*60}")

    objects = import_glb(glb_path)

    if not objects:
        results[name] = {"status": "EMPTY", "desc": spec["desc"]}
        all_issues.append(f"[EMPTY] {name}: メッシュオブジェクトなし")
        continue

    # Dimensions
    dims = get_bbox_dimensions(objects)

    # Dimension check with tolerance
    model_issues = []
    tol = 0.30  # 30% tolerance
    dim_checks = [
        ("幅", dims["width"], spec["w"]),
        ("高さ", dims["height"], spec["h"]),
        ("奥行", dims["depth"], spec["d"]),
    ]

    for label, actual, expected in dim_checks:
        if expected > 0:
            ratio = actual / expected if expected > 0 else 0
            if ratio < (1 - tol) or ratio > (1 + tol):
                model_issues.append(f"寸法異常 {label}: 実測{actual:.3f}m vs 期待{expected:.3f}m (比率{ratio:.1%})")

    # Mesh quality
    total_verts = 0
    total_faces = 0
    for obj in objects:
        stats, mesh_issues = check_mesh_quality(obj)
        total_verts += stats["verts"]
        total_faces += stats["faces"]
        model_issues.extend(mesh_issues)

    # Material check
    all_mats = []
    for obj in objects:
        mats, mat_issues = check_materials(obj)
        all_mats.extend(mats)
        model_issues.extend(mat_issues)

    # Origin check (should be at logical point)
    if dims["min"][2] < -0.01 and spec["h"] > 0.5:
        model_issues.append(f"原点問題: Z最小値={dims['min'][2]:.3f}m（床より下にはみ出し）")

    status = "OK" if not model_issues else "ISSUES"

    results[name] = {
        "status": status,
        "desc": spec["desc"],
        "dims": dims,
        "verts": total_verts,
        "faces": total_faces,
        "objects": len(objects),
        "materials": all_mats,
        "issues": model_issues,
    }

    # Print summary
    print(f"  ステータス: {status}")
    print(f"  寸法: W{dims['width']:.3f} × H{dims['height']:.3f} × D{dims['depth']:.3f}")
    print(f"  期待: W{spec['w']:.3f} × H{spec['h']:.3f} × D{spec['d']:.3f}")
    print(f"  頂点: {total_verts}, 面: {total_faces}, オブジェクト: {len(objects)}")
    print(f"  マテリアル: {len(all_mats)}")
    if model_issues:
        for issue in model_issues:
            print(f"  ⚠ {issue}")
            all_issues.append(f"[{name}] {issue}")

    # Render thumbnail
    try:
        render_thumbnail(name, objects)
        print(f"  サムネイル: {name}.png")
    except Exception as e:
        print(f"  サムネイル失敗: {e}")

# Save report
report_path = os.path.join(THUMB_DIR, "inspection_report.json")
with open(report_path, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"\n\n{'='*60}")
print(f"検査完了: {len(results)} モデル")
print(f"{'='*60}")
ok = sum(1 for r in results.values() if r["status"] == "OK")
issues = sum(1 for r in results.values() if r["status"] == "ISSUES")
missing = sum(1 for r in results.values() if r["status"] in ("MISSING", "EMPTY"))
print(f"  OK: {ok}  問題あり: {issues}  欠落: {missing}")

if all_issues:
    print(f"\n全問題一覧 ({len(all_issues)}件):")
    for issue in all_issues:
        print(f"  {issue}")

print(f"\nレポート保存: {report_path}")
print(f"サムネイル: {THUMB_DIR}/")
