"""
DXF → Blender レンダリング パイプライン

DXFファイルを入力として、3Dパースを自動生成する。
1. システムPython で dxf-to-scene.py を呼び出し → シーンJSON生成
2. Blender Python で JSON を読み込み → 3Dシーン構築 → レンダリング

使い方 (Blender --background):
  "/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \\
    --background --python scripts/render-from-dxf.py \\
    -- input.dxf --quality preview --camera eye_level

  # gen-dxf.py と連携（1コマンドで図面→パース）:
  python scripts/gen-dxf.py --sample -o output/drawings/shop.dxf && \\
  "/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \\
    --background --python scripts/render-from-dxf.py \\
    -- output/drawings/shop.dxf
"""

import bpy
import json
import math
import os
import sys
import subprocess

# --- Blender Python から "--" 以降の引数を取得 ---
argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = []

# --- 引数パース（argparse はBlenderと相性が悪いので手動） ---
dxf_path = None
quality = "preview"
camera_preset = "eye_level"
output_dir = None
meta_path = None
style_json = None

i = 0
while i < len(argv):
    if argv[i] == "--quality" and i + 1 < len(argv):
        quality = argv[i + 1]
        i += 2
    elif argv[i] == "--camera" and i + 1 < len(argv):
        camera_preset = argv[i + 1]
        i += 2
    elif argv[i] == "--output" and i + 1 < len(argv):
        output_dir = argv[i + 1]
        i += 2
    elif argv[i] == "--meta" and i + 1 < len(argv):
        meta_path = argv[i + 1]
        i += 2
    elif argv[i] == "--style" and i + 1 < len(argv):
        style_json = argv[i + 1]
        i += 2
    elif not argv[i].startswith("--"):
        dxf_path = argv[i]
        i += 1
    else:
        i += 1

if not dxf_path:
    print("ERROR: DXFファイルパスを指定してください")
    print("Usage: blender --background --python render-from-dxf.py -- input.dxf [--quality preview] [--camera eye_level]")
    sys.exit(1)

# --- パス解決 ---
scripts_dir = os.path.dirname(os.path.abspath(__file__))
project_dir = os.path.dirname(scripts_dir)
dxf_path = os.path.abspath(dxf_path)
dxf_basename = os.path.splitext(os.path.basename(dxf_path))[0]

if not output_dir:
    output_dir = os.path.join(project_dir, "output", "drawings")

scene_json_path = os.path.join(output_dir, f"{dxf_basename}.scene.json")
blend_output = os.path.join(output_dir, f"{dxf_basename}.blend")
png_output = os.path.join(output_dir, f"{dxf_basename}.png")

os.makedirs(output_dir, exist_ok=True)

# =============================================================
# Step 1: DXF → シーンJSON（システムPythonで実行）
# =============================================================
print(f"\n{'='*60}")
print(f"Step 1: DXF → Scene JSON")
print(f"  DXF: {dxf_path}")
print(f"{'='*60}\n")

dxf_to_scene_script = os.path.join(scripts_dir, "dxf-to-scene.py")

# システムPythonを探す（Blender内蔵Pythonではなく）
system_python = "python"
# Windows: 一般的なパス
for candidate in [
    "python",
    "python3",
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Python", "Python311", "python.exe"),
    r"C:\Users\y-suz\AppData\Local\Programs\Python\Python311\python.exe",
]:
    try:
        result = subprocess.run(
            [candidate, "--version"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and "Python" in result.stdout:
            # ezdxf が入っているか確認
            check = subprocess.run(
                [candidate, "-c", "import ezdxf; print('ok')"],
                capture_output=True, text=True, timeout=5
            )
            if check.returncode == 0:
                system_python = candidate
                break
    except (FileNotFoundError, subprocess.TimeoutExpired):
        continue

cmd = [system_python, dxf_to_scene_script, dxf_path, "-o", scene_json_path, "--pretty"]
if meta_path:
    cmd.extend(["--meta", meta_path])

print(f"Running: {' '.join(cmd)}")
result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
print(result.stdout)
if result.returncode != 0:
    print(f"ERROR: dxf-to-scene.py failed:\n{result.stderr}")
    sys.exit(1)

# =============================================================
# Step 2: シーンJSON → Blender 3Dシーン構築
# =============================================================
print(f"\n{'='*60}")
print(f"Step 2: Scene JSON → Blender 3D")
print(f"{'='*60}\n")

with open(scene_json_path, "r", encoding="utf-8") as f:
    scene_data = json.load(f)

# --style オーバーライド（JSON文字列 or ファイルパス）
if style_json:
    if os.path.isfile(style_json):
        with open(style_json, "r", encoding="utf-8") as f:
            style_override = json.load(f)
    else:
        style_override = json.loads(style_json)
    if "style" not in scene_data:
        scene_data["style"] = {}
    scene_data["style"].update(style_override)
    print(f"Style override: {scene_data['style']}")

# Blenderモジュールのインポート（scripts/ をパスに追加 → blender.xxx でインポート）
if scripts_dir not in sys.path:
    sys.path.insert(0, scripts_dir)
sys.dont_write_bytecode = True

from blender.core import (
    clear_scene, setup_collections, hex_to_rgba, make_material,
    link_to_collection, to_blender, scale_to_blender, rot_to_blender,
)
from blender.room_builder import build_room
from blender.lighting import setup_lighting
from blender.presets import apply_render_quality, setup_camera_from_preset, apply_material_preset

# 2.1 シーンクリア
clear_scene()
collections = setup_collections()

# 2.2 部屋構築（壁・床・天井）
room = scene_data.get("room", {})
W = room.get("width", 5.0)
D = room.get("depth", 4.0)
H = room.get("height", 2.7)

print(f"Room: {W}m x {D}m x {H}m")

room_objects = build_room(scene_data, collections)

# 2.3 什器配置（GLBモデル優先、フォールバックでプレースホルダーキューブ）

# 什器タイプ → GLBファイル名のマッピング
TYPE_TO_GLB = {
    "table_square": "table_square",
    "table_round": "table_round",
    "chair": "chair",
    "counter": "counter",
    "stool": "bar_stool",
    "sofa": "sofa",
    "shelf": "display_shelf",
    "custom": None,  # キューブフォールバック使用
}

# modelsDir を scene_data に設定（furniture_importer が参照する）
models_dir = os.path.join(project_dir, "public", "models")
scene_data["modelsDir"] = models_dir

# 什器タイプをGLBファイル名にマッピング（furniture_importerがtype名でGLBを探すため）
for furn in scene_data.get("furniture", []):
    ftype = furn.get("type", "")
    if ftype in TYPE_TO_GLB and TYPE_TO_GLB[ftype] is not None:
        furn["type"] = TYPE_TO_GLB[ftype]

# furniture_importer は to_blender() で座標変換するが、
# 部屋の中心原点オフセット（-W/2, +D/2）は適用しない。
# アプリ座標系で事前にオフセットを加算しておく。
# to_blender: (x, y, z) → (x, -z, y)
# 目標Blender座標: (x - W/2, -z + D/2, y)
# → アプリ座標を (x - W/2, y, z - D/2) に調整すれば to_blender で正しい結果になる
for furn in scene_data.get("furniture", []):
    pos = furn.get("position", [0, 0, 0])
    furn["position"] = [pos[0] - W / 2, pos[1], pos[2] - D / 2]

# furniture_importer でGLBモデルをインポート
_furniture_import_success = False
try:
    from blender.furniture_importer import import_furniture
    import_furniture(scene_data, collections)
    _furniture_import_success = True
    print(f"  GLBモデルインポート完了（modelsDir: {models_dir}）")
except Exception as e:
    print(f"  WARNING: furniture_importer 失敗: {e}")
    print(f"  フォールバック: プレースホルダーキューブを使用")

# フォールバック: furniture_importer が失敗した場合、キューブで配置
if not _furniture_import_success:
    furniture_col = collections.get("02_Furniture")
    for furn in scene_data.get("furniture", []):
        name = furn.get("name", furn.get("type", "Furniture"))
        pos = furn.get("position", [0, 0, 0])
        scale = furn.get("scale", [0.6, 0.75, 0.6])
        rot = furn.get("rotation", [0, 0, 0])

        # position は既にオフセット適用済みなので to_blender で変換
        bl_pos = to_blender(pos)

        import bmesh
        mesh = bpy.data.meshes.new(f"Mesh_{name}")
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bm.to_mesh(mesh)
        bm.free()

        obj = bpy.data.objects.new(name, mesh)
        obj.location = bl_pos
        obj.scale = scale_to_blender(scale)
        obj.rotation_euler = rot_to_blender(rot)

        # マテリアル
        ftype = furn.get("type", "")
        if "counter" in ftype or "table" in ftype or "desk" in ftype:
            apply_material_preset(obj, "wood_medium")
        elif "chair" in ftype or "stool" in ftype or "sofa" in ftype:
            apply_material_preset(obj, "fabric_gray")
        else:
            apply_material_preset(obj, "wood_light")

        if furniture_col:
            link_to_collection(obj, furniture_col)

        print(f"  Furniture(fallback): {name} at ({bl_pos[0]:.2f}, {bl_pos[1]:.2f}, {bl_pos[2]:.2f})")

# 2.4 照明
setup_lighting(scene_data, collections)

# 2.5 カメラ
style = scene_data.get("style", {})
custom_cam_pos = style.get("cameraPosition")  # [x_dxf_mm, y_dxf_mm, z_m]
custom_cam_target = style.get("cameraTarget")  # [x_dxf_mm, y_dxf_mm, z_m]
custom_cam_fov = style.get("cameraFov", 65)

# カスタムカメラ位置はeye_level（デフォルト）の場合のみ使用
# bird_eye等を明示的に指定した場合はプリセットを優先
use_custom_camera = (custom_cam_pos and custom_cam_target
                     and camera_preset == "eye_level")
if use_custom_camera:
    # DXF mm座標をBlender座標に変換（建物中心=原点）
    cam_data = bpy.data.cameras.new(name="Camera_Custom")
    cam_data.lens = 36 / (2 * __import__('math').tan(__import__('math').radians(custom_cam_fov / 2)))
    cam_data.clip_start = 0.05
    cam_data.clip_end = 100
    cam_data.sensor_width = 36
    cam_data.dof.use_dof = True
    cam_data.dof.aperture_fstop = 5.6

    cam_obj = bpy.data.objects.new("Camera_Custom", cam_data)
    bpy.context.collection.objects.link(cam_obj)

    # DXF mm → Blender m (中心原点)
    cx = custom_cam_pos[0] / 1000 - W / 2
    cy = -(custom_cam_pos[1] / 1000 - D / 2)
    cz = custom_cam_pos[2] if len(custom_cam_pos) > 2 else 1.5
    cam_obj.location = (cx, cy, cz)

    tx = custom_cam_target[0] / 1000 - W / 2
    ty = -(custom_cam_target[1] / 1000 - D / 2)
    tz = custom_cam_target[2] if len(custom_cam_target) > 2 else 1.0

    target_empty = bpy.data.objects.new("Camera_Custom_Target", None)
    bpy.context.collection.objects.link(target_empty)
    target_empty.location = (tx, ty, tz)
    target_empty.empty_display_size = 0.1

    constraint = cam_obj.constraints.new('TRACK_TO')
    constraint.target = target_empty
    constraint.track_axis = 'TRACK_NEGATIVE_Z'
    constraint.up_axis = 'UP_Y'

    # DOF
    import math as _m
    dx, dy, dz = tx - cx, ty - cy, tz - cz
    dist = _m.sqrt(dx*dx + dy*dy + dz*dz)
    cam_data.dof.focus_distance = dist * 0.8

    bpy.context.scene.camera = cam_obj
    print(f"Camera: custom pos=({cx:.1f},{cy:.1f},{cz:.1f}) "
          f"target=({tx:.1f},{ty:.1f},{tz:.1f}) fov={custom_cam_fov}")
else:
    camera_name = camera_preset
    cam_obj = setup_camera_from_preset(
        camera_name,
        room_center=(0, 0),
        room_width=W,
        room_depth=D,
    )
    bpy.context.scene.camera = cam_obj
    print(f"Camera: {camera_name}")

# 2.6 レンダリング設定
render_quality = scene_data.get("render_quality", quality)
apply_render_quality(render_quality)

# スタイルのexposure上書き（暗いシーンの補正用）
style_exposure = style.get("exposure")
if style_exposure is not None:
    bpy.context.scene.view_settings.exposure = float(style_exposure)
    print(f"Style exposure override: {style_exposure}")

print(f"Quality: {render_quality}")

# =============================================================
# Step 3: レンダリング + 保存
# =============================================================
print(f"\n{'='*60}")
print(f"Step 3: Render")
print(f"  Output: {png_output}")
print(f"{'='*60}\n")

# .blend 保存
bpy.ops.wm.save_as_mainfile(filepath=blend_output)
print(f"Blend saved: {blend_output}")

# レンダリング
bpy.context.scene.render.filepath = png_output
bpy.ops.render.render(write_still=True)
print(f"Render saved: {png_output}")

print(f"\n{'='*60}")
print(f"DONE! DXF → Blender パース完了")
print(f"  DXF:   {dxf_path}")
print(f"  Blend: {blend_output}")
print(f"  PNG:   {png_output}")
print(f"{'='*60}")
