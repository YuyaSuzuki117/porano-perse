#!/usr/bin/env python3
"""
render-batch.py

複数のシーンJSONを一括レンダリングするバッチスクリプト。
template-to-json.ts で生成された output/scene-json/*.json を順次処理する。

Usage:
    blender --background --python scripts/render-batch.py -- --all --quality=preview
    blender --background --python scripts/render-batch.py -- --templates=rt_small_cafe,cafe_30 --quality=draft
    blender --background --python scripts/render-batch.py -- --all --quality=production --camera=main

Options:
    --all                       全てのシーンJSONを処理
    --templates=id1,id2,...     指定テンプレートIDのみ処理（部分一致）
    --quality=preview|draft|production   レンダリング品質 (default: preview)
    --camera=all|main|counter|window|topdown   カメラ選択 (default: main)
"""

import sys
import os
import json
import time
import glob

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


def parse_args():
    """Parse arguments after Blender's '--' separator."""
    argv = sys.argv
    try:
        idx = argv.index('--')
        args = argv[idx + 1:]
    except ValueError:
        args = []

    quality = 'preview'
    camera = 'main'
    template_filter = None
    select_all = False

    for a in args:
        if a.startswith('--quality='):
            quality = a.split('=', 1)[1]
        elif a.startswith('--camera='):
            camera = a.split('=', 1)[1]
        elif a.startswith('--templates='):
            template_filter = a.split('=', 1)[1].split(',')
        elif a == '--all':
            select_all = True

    if not select_all and template_filter is None:
        print("Usage: blender --background --python render-batch.py -- "
              "[--all | --templates=id1,id2,...] "
              "[--quality=preview|draft|production] "
              "[--camera=all|main|counter|window|topdown]")
        sys.exit(1)

    return quality, camera, template_filter


def discover_scene_files(template_filter=None):
    """Find scene JSON files in output/scene-json/ directory."""
    scene_dir = os.path.join(PROJECT_DIR, 'output', 'scene-json')
    if not os.path.exists(scene_dir):
        print(f"[Error] No scene JSON directory found: {scene_dir}")
        print("Run template-to-json.ts first to generate scene JSONs:")
        print("  npx tsx scripts/template-to-json.ts --template=<id>")
        sys.exit(1)

    json_files = sorted(glob.glob(os.path.join(scene_dir, '*.json')))

    if template_filter:
        json_files = [
            f for f in json_files
            if any(t in os.path.basename(f) for t in template_filter)
        ]

    return json_files


def render_one(scene_path, quality='preview', camera='main'):
    """Render a single scene JSON file.

    Returns:
        str: template_id on success
    Raises:
        Exception on failure
    """
    import bpy

    with open(scene_path, 'r', encoding='utf-8') as f:
        scene_data = json.load(f)

    template_id = scene_data['template']['id']
    template_name = scene_data['template']['name']
    room = scene_data['room']

    print(f"\n{'─' * 50}")
    print(f"Rendering: {template_name} ({template_id})")
    print(f"Room: {room['width']}m x {room['depth']}m, "
          f"Furniture: {len(scene_data['furniture'])}, "
          f"Quality: {quality}")
    print(f"{'─' * 50}")

    # Build scene
    clear_scene()
    collections = setup_collections()
    build_room(scene_data, collections)
    import_furniture(scene_data, collections)
    setup_lighting(scene_data, collections)
    setup_cameras(scene_data, collections)
    apply_style(scene_data)

    output_dir = get_output_dir()

    # Save .blend
    blend_path = os.path.join(output_dir, f"{template_id}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"  [Save] {blend_path}")

    # Render
    if camera == 'all':
        camera_names = list(CAMERA_MAP.values())
    else:
        cam_name = CAMERA_MAP.get(camera, 'Cam_Main')
        camera_names = [cam_name]

    for cam_name in camera_names:
        cam_obj = bpy.data.objects.get(cam_name)
        if not cam_obj:
            print(f"  [Skip] Camera '{cam_name}' not found")
            continue

        bpy.context.scene.camera = cam_obj
        render_path = os.path.join(output_dir, f"{template_id}_{cam_name}.png")
        setup_render(quality=quality, output_path=render_path)
        render_scene(render_path)
        print(f"  [Render] {render_path}")

    return template_id


def main():
    start_time = time.time()

    quality, camera, template_filter = parse_args()
    json_files = discover_scene_files(template_filter)

    if not json_files:
        print("[Error] No scene JSON files found matching the filter.")
        if template_filter:
            print(f"  Filter: {template_filter}")
        print("  Directory: output/scene-json/")
        sys.exit(1)

    print("=" * 60)
    print("Porano Perse — Batch Render Pipeline")
    print(f"Scenes: {len(json_files)}")
    print(f"Quality: {quality}")
    print(f"Camera: {camera}")
    print("=" * 60)

    for i, jf in enumerate(json_files, 1):
        print(f"\n[{i}/{len(json_files)}] {os.path.basename(jf)}")

    results = []
    ok_count = 0
    fail_count = 0

    for i, jf in enumerate(json_files, 1):
        scene_start = time.time()
        try:
            template_id = render_one(jf, quality, camera)
            scene_elapsed = time.time() - scene_start
            results.append((template_id, 'OK', f'{scene_elapsed:.1f}s'))
            ok_count += 1
        except Exception as e:
            scene_elapsed = time.time() - scene_start
            basename = os.path.splitext(os.path.basename(jf))[0]
            results.append((basename, 'FAIL', str(e)))
            fail_count += 1
            print(f"  [FAIL] {os.path.basename(jf)}: {e}")

    total_elapsed = time.time() - start_time

    # Summary
    print("\n" + "=" * 60)
    print("Batch Render Summary")
    print("=" * 60)
    print(f"{'Template':<25} {'Status':<8} {'Detail'}")
    print("-" * 60)
    for template_id, status, detail in results:
        status_mark = '  OK' if status == 'OK' else 'FAIL'
        print(f"{template_id:<25} {status_mark:<8} {detail}")
    print("-" * 60)
    print(f"Total: {ok_count} OK, {fail_count} FAIL, {total_elapsed:.1f}s elapsed")
    print("=" * 60)


if __name__ == "__main__":
    main()
