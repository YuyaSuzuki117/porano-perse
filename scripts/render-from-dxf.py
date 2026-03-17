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

# 2.3 什器配置（プレースホルダー）
furniture_col = collections.get("02_Furniture")
for furn in scene_data.get("furniture", []):
    name = furn.get("name", furn.get("type", "Furniture"))
    pos = furn.get("position", [0, 0, 0])
    scale = furn.get("scale", [0.6, 0.75, 0.6])
    rot = furn.get("rotation", [0, 0, 0])

    # 座標変換: アプリ(x,y,z) → Blender(x,-z,y) + 中心原点オフセット
    bl_pos = to_blender(pos)
    bl_x = bl_pos[0] - W / 2
    bl_y = bl_pos[1] + D / 2
    bl_z = bl_pos[2]

    import bmesh
    mesh = bpy.data.meshes.new(f"Mesh_{name}")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    obj.location = (bl_x, bl_y, bl_z)
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

    print(f"  Furniture: {name} at ({bl_x:.2f}, {bl_y:.2f}, {bl_z:.2f})")

# 2.4 照明
setup_lighting(scene_data, collections)

# 2.5 カメラ
camera_name = scene_data.get("camera", camera_preset)
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
