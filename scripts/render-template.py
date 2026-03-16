#!/usr/bin/env python3
"""
render-template.py

Blender レンダリングパイプラインのメインエントリポイント。
template-to-json.ts で生成したシーンJSONを読み込み、
Blender内で3Dシーンを構築・レンダリングする。

Usage:
    blender --background --python scripts/render-template.py -- scene.json [--quality=preview|draft|production] [--camera=all|main|counter|window|topdown]

Examples:
    blender --background --python scripts/render-template.py -- output/scene-json/rt_small_cafe.json --quality=preview
    blender --background --python scripts/render-template.py -- output/scene-json/cafe_30.json --quality=production --camera=main
"""

import sys
import os
import json
import time

# Add scripts dir to path so blender module can be found
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)

from blender.core import clear_scene, setup_collections, get_output_dir
from blender.room_builder import build_room
from blender.furniture_importer import import_furniture
from blender.lighting import setup_lighting
from blender.cameras import setup_cameras
from blender.style_applicator import apply_style
from blender.renderer import setup_render, render_scene


# Camera name mapping
CAMERA_MAP = {
    'main': 'Cam_Main',
    'counter': 'Cam_Counter',
    'window': 'Cam_Window',
    'topdown': 'Cam_TopDown',
}

ALL_CAMERA_NAMES = list(CAMERA_MAP.values())


def parse_args():
    """Parse arguments after Blender's '--' separator."""
    argv = sys.argv
    try:
        idx = argv.index('--')
        args = argv[idx + 1:]
    except ValueError:
        args = []

    if len(args) < 1:
        print("Usage: blender --background --python render-template.py -- <scene.json> "
              "[--quality=preview|draft|production] [--camera=all|main|counter|window|topdown]")
        sys.exit(1)

    scene_path = args[0]
    quality = 'preview'
    camera = 'all'

    for a in args[1:]:
        if a.startswith('--quality='):
            quality = a.split('=', 1)[1]
        elif a.startswith('--camera='):
            camera = a.split('=', 1)[1]

    return scene_path, quality, camera


def load_scene(scene_path):
    """Load and validate the scene JSON file."""
    if not os.path.isabs(scene_path):
        scene_path = os.path.join(PROJECT_DIR, scene_path)

    if not os.path.exists(scene_path):
        print(f"[Error] Scene file not found: {scene_path}")
        sys.exit(1)

    with open(scene_path, 'r', encoding='utf-8') as f:
        scene_data = json.load(f)

    # Basic validation
    required_keys = ['template', 'room', 'openings', 'style', 'furniture']
    for key in required_keys:
        if key not in scene_data:
            print(f"[Error] Missing required key in scene JSON: '{key}'")
            sys.exit(1)

    return scene_data


def render_cameras(scene_data, quality, camera_selection):
    """Set up rendering and render selected cameras."""
    import bpy

    template_id = scene_data['template']['id']
    output_dir = get_output_dir()

    # Determine which cameras to render
    if camera_selection == 'all':
        camera_names = ALL_CAMERA_NAMES
    else:
        cam_name = CAMERA_MAP.get(camera_selection, 'Cam_Main')
        camera_names = [cam_name]

    rendered = 0
    for cam_name in camera_names:
        cam_obj = bpy.data.objects.get(cam_name)
        if not cam_obj:
            print(f"[Skip] Camera '{cam_name}' not found in scene")
            continue

        bpy.context.scene.camera = cam_obj
        render_path = os.path.join(output_dir, f"{template_id}_{cam_name}.png")
        setup_render(quality=quality, output_path=render_path)
        render_scene(render_path)
        rendered += 1
        print(f"[Render] {render_path}")

    return rendered


def main():
    import bpy

    start_time = time.time()

    scene_path, quality, camera = parse_args()
    scene_data = load_scene(scene_path)

    template_id = scene_data['template']['id']
    template_name = scene_data['template']['name']
    room = scene_data['room']

    print("=" * 60)
    print("Porano Perse — Blender Render Pipeline")
    print(f"Template: {template_name} ({template_id})")
    print(f"Room: {room['width']}m x {room['depth']}m x {room['height']}m")
    print(f"Quality: {quality}")
    print(f"Camera: {camera}")
    print(f"Furniture: {len(scene_data['furniture'])} items")
    print(f"Openings: {len(scene_data['openings'])} items")
    print("=" * 60)

    # --- Build Scene ---
    print("\n[Phase 1] Clearing scene...")
    clear_scene()

    print("[Phase 2] Setting up collections...")
    collections = setup_collections()

    print("[Phase 3] Building room geometry...")
    build_room(scene_data, collections)

    print(f"[Phase 4] Importing {len(scene_data['furniture'])} furniture items...")
    import_furniture(scene_data, collections)

    print("[Phase 5] Setting up lighting...")
    setup_lighting(scene_data, collections)

    print("[Phase 6] Setting up cameras...")
    cams = setup_cameras(scene_data, collections)

    print("[Phase 7] Applying style...")
    apply_style(scene_data)

    # --- Save .blend ---
    output_dir = get_output_dir()
    blend_path = os.path.join(output_dir, f"{template_id}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"\n[Save] {blend_path}")

    # --- Render ---
    print(f"\n[Phase 8] Rendering (quality={quality})...")
    rendered_count = render_cameras(scene_data, quality, camera)

    elapsed = time.time() - start_time

    print("\n" + "=" * 60)
    print("Complete!")
    print(f"  Rendered: {rendered_count} image(s)")
    print(f"  Blend file: {blend_path}")
    print(f"  Time: {elapsed:.1f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
