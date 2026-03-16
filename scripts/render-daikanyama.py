#!/usr/bin/env python3
"""
render-daikanyama.py

代官山 NULL Bar — カスタムレンダリングスクリプト。
複数室（バーエリア・廊下・手洗い・トイレ）を持つ非矩形フロアプランのため、
room_builder を使わず手動でジオメトリを構築する。

Usage:
    blender --background --python scripts/render-daikanyama.py -- [--quality=preview|draft|production] [--camera=all|main|counter|booth|corridor]

Examples:
    blender --background --python scripts/render-daikanyama.py -- --quality=preview --camera=main
    blender --background --python scripts/render-daikanyama.py -- --quality=production --camera=all
"""

import sys
import os
import math
import time

# バイトコードキャッシュ無効化
sys.dont_write_bytecode = True

# scripts/ ディレクトリをパスに追加
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)

import bpy
import bmesh
from mathutils import Vector, Matrix

from blender.core import (
    clear_scene, setup_collections, get_output_dir,
    hex_to_rgba, make_material, link_to_collection,
)
from blender.materials.floor_finishes import create_floor_material
from blender.materials.wall_finishes import create_wall_material
from blender.lighting import setup_lighting
from blender.renderer import setup_render, render_scene
from blender.furniture_importer import import_furniture
from blender.models.door_panel import create_door


# ===========================================================================
# 定数 — 代官山 NULL Bar 寸法
# ===========================================================================

# メインバーエリア（原点 = バーエリア中心床面）
BAR_W = 5.10        # 幅 (X軸: 東西) — 木格子エリア含む全幅
BAR_D = 5.46        # 奥行き (Y軸: 南北) — 図面5463mm
BAR_H = 2.598       # 天井高

# 廊下（バーエリア南側）
CORR_W = 5.51       # 全幅
CORR_D = 1.00       # 奥行き
CORR_H = 2.61       # 天井高

# 手洗いエリア（バーエリア東側上部）
WASH_W = 0.94
WASH_D = 0.85
WASH_H = 2.61

# トイレ（バーエリア東側下部）
TOILET_W = 0.94
TOILET_D = 1.73
TOILET_H = 2.41
TOILET_FL = 0.20    # 床レベル +200mm

# 木格子エリア（バーエリア西側）
SLAT_W = 1.135

# 壁の厚み
WALL_T = 0.12

# ドア寸法
DOOR_W = 0.78
DOOR_H = 2.00

# 全体サイズ（scene_data 用）
TOTAL_W = 5.51
TOTAL_D = 7.00


# ===========================================================================
# シーンデータ
# ===========================================================================

SCENE_DATA = {
    "template": {"id": "daikanyama_null_bar", "name": "代官山 NULL Bar"},
    "room": {"width": TOTAL_W, "depth": TOTAL_D, "height": BAR_H},
    "openings": [],
    "style": {
        "name": "industrial_bar",
        "wallColor": "#8A8A8A",
        "floorColor": "#4A4A4A",
        "floorTexture": "concrete",
        "ceilingColor": "#505050",
        "spotlightIntensity": 3.0,
        "spotlightColor": "#FFE0B0",
        "hemisphereSkyColor": "#A0A0A0",
        "hemisphereGroundColor": "#505050",
        "woodType": "walnut",
        "fabricType": "leather",
        "metalFinish": "matte_black",
        "furniturePalette": {
            "primary": "#2A2018",
            "secondary": "#8B2020",
            "accent": "#C8A060",
            "metal": "#1A1A1A",
            "fabric": "#8B2020",
        },
    },
    "furniture": [
        # --- バーカウンター（図面: 部屋中央やや南、東西方向に配置）---
        # app z=+0.15 → Blender y=-0.15（中央やや南）
        {"type": "counter", "name": "バーカウンター",
         "position": [0.5, 0, 0.15], "rotation": [0, 0, 0],
         "scale": [1.8, 1.0, 0.55], "defaultMaterial": "wood"},
        # --- バースツール ×4（カウンター北側=客席側）---
        # app z=-0.6 → Blender y=+0.6（カウンターの北側）
        {"type": "stool", "name": "バースツール1",
         "position": [-0.3, 0, -0.6], "rotation": [0, 0, 0],
         "scale": [0.38, 0.7, 0.38], "defaultMaterial": "metal"},
        {"type": "stool", "name": "バースツール2",
         "position": [0.5, 0, -0.6], "rotation": [0, 0, 0],
         "scale": [0.38, 0.7, 0.38], "defaultMaterial": "metal"},
        {"type": "stool", "name": "バースツール3",
         "position": [1.2, 0, -0.6], "rotation": [0, 0, 0],
         "scale": [0.38, 0.7, 0.38], "defaultMaterial": "metal"},
        {"type": "stool", "name": "バースツール4",
         "position": [1.9, 0, -0.6], "rotation": [0, 0, 0],
         "scale": [0.38, 0.7, 0.38], "defaultMaterial": "metal"},
        # --- ブーステーブル ×3（北東のブースエリア）---
        # 図面: 3つの丸テーブル(φ1000, φ375, φ1000)が曲面ブース内
        # app z=-1.8 → Blender y=+1.8（北側ブース）
        {"type": "table_round", "name": "ブーステーブル1",
         "position": [0.5, 0, -1.8], "rotation": [0, 0, 0],
         "scale": [1.0, 0.65, 1.0], "defaultMaterial": "wood"},
        {"type": "table_round", "name": "ブーステーブル2",
         "position": [1.5, 0, -1.8], "rotation": [0, 0, 0],
         "scale": [1.0, 0.65, 1.0], "defaultMaterial": "wood"},
        {"type": "table_round", "name": "ブーステーブル3",
         "position": [1.0, 0, -1.2], "rotation": [0, 0, 0],
         "scale": [0.65, 0.65, 0.65], "defaultMaterial": "wood"},
        # --- ペンダントライト ×5 ---
        # カウンター上（app z=+0.15 → Blender y=-0.15）
        {"type": "pendant_light", "name": "ペンダント_カウンター1",
         "position": [0.0, 2.3, 0.15], "rotation": [0, 0, 0],
         "scale": [0.25, 0.35, 0.25], "defaultMaterial": "metal"},
        {"type": "pendant_light", "name": "ペンダント_カウンター2",
         "position": [1.0, 2.3, 0.15], "rotation": [0, 0, 0],
         "scale": [0.25, 0.35, 0.25], "defaultMaterial": "metal"},
        {"type": "pendant_light", "name": "ペンダント_カウンター3",
         "position": [2.0, 2.3, 0.15], "rotation": [0, 0, 0],
         "scale": [0.25, 0.35, 0.25], "defaultMaterial": "metal"},
        # ブース上（app z=-1.8 → Blender y=+1.8）
        {"type": "pendant_light", "name": "ペンダント_ブース1",
         "position": [0.5, 2.3, -1.8], "rotation": [0, 0, 0],
         "scale": [0.25, 0.35, 0.25], "defaultMaterial": "metal"},
        {"type": "pendant_light", "name": "ペンダント_ブース2",
         "position": [1.5, 2.3, -1.8], "rotation": [0, 0, 0],
         "scale": [0.25, 0.35, 0.25], "defaultMaterial": "metal"},
    ],
    "modelsDir": os.path.join(PROJECT_DIR, "public", "models"),
}


# ===========================================================================
# カメラ名マッピング
# ===========================================================================

CAMERA_MAP = {
    'main': 'Cam_Main',
    'counter': 'Cam_Counter',
    'booth': 'Cam_Booth',
    'corridor': 'Cam_Corridor',
}
ALL_CAMERA_NAMES = list(CAMERA_MAP.values())


# ===========================================================================
# 引数パース
# ===========================================================================

def parse_args():
    """Blender の '--' 以降の引数をパース。"""
    argv = sys.argv
    try:
        idx = argv.index('--')
        args = argv[idx + 1:]
    except ValueError:
        args = []

    quality = 'preview'
    camera = 'all'

    for a in args:
        if a.startswith('--quality='):
            quality = a.split('=', 1)[1]
        elif a.startswith('--camera='):
            camera = a.split('=', 1)[1]

    return quality, camera


# ===========================================================================
# ジオメトリ生成ヘルパー
# ===========================================================================

def _create_plane(name, width, depth, location, rotation=(0, 0, 0), material=None):
    """bmesh で平面を生成して配置する。

    Args:
        name: オブジェクト名
        width: X軸サイズ
        depth: Y軸サイズ
        location: (x, y, z) 配置位置
        rotation: (rx, ry, rz) ラジアン回転
        material: 適用するマテリアル

    Returns:
        bpy.types.Object
    """
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    # 4頂点の平面
    hw, hd = width / 2.0, depth / 2.0
    v1 = bm.verts.new((-hw, -hd, 0))
    v2 = bm.verts.new((hw, -hd, 0))
    v3 = bm.verts.new((hw, hd, 0))
    v4 = bm.verts.new((-hw, hd, 0))
    bm.faces.new([v1, v2, v3, v4])

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation

    if material:
        obj.data.materials.append(material)

    return obj


def _create_wall_segment(name, width, height, thickness, location,
                         rotation=(0, 0, 0), material=None):
    """壁セグメントを bmesh で生成（薄い直方体）。

    Args:
        name: オブジェクト名
        width: 壁幅
        height: 壁高さ
        thickness: 壁厚
        location: 中心位置 (x, y, z)
        rotation: 回転 (rx, ry, rz) ラジアン
        material: 壁マテリアル

    Returns:
        bpy.types.Object
    """
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)

    # スケーリング: X=幅, Y=厚み, Z=高さ
    scale_mat = Matrix.Diagonal(Vector((width, thickness, height, 1.0)))
    bmesh.ops.transform(bm, matrix=scale_mat, verts=bm.verts)

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation

    if material:
        obj.data.materials.append(material)

    return obj


def _create_baseboard(name, width, location, rotation=(0, 0, 0), material=None):
    """巾木（ベースボード）を生成。高さ60mm, 奥行き10mm。"""
    baseboard_h = 0.06
    baseboard_d = 0.01
    return _create_wall_segment(
        name, width, baseboard_h, baseboard_d,
        location=(location[0], location[1], baseboard_h / 2.0),
        rotation=rotation,
        material=material,
    )


# ===========================================================================
# 壁構築（ドア開口部考慮のセグメント分割）
# ===========================================================================

def _build_wall_with_door(prefix, wall_width, wall_height, wall_thickness,
                          wall_center, door_offset_x, door_w, door_h,
                          rotation=(0, 0, 0), wall_mat=None, collection=None):
    """ドア開口部を持つ壁を3セグメントで構築。

    壁の長さ方向を X、高さを Z とする（回転前のローカル座標）。
    door_offset_x はセグメントの左端からドア中心までの距離。

    Args:
        prefix: オブジェクト名プレフィックス
        wall_width: 壁の全幅
        wall_height: 壁の全高
        wall_thickness: 壁の厚み
        wall_center: 壁中心の (x, y, z) — ドアなし時の壁中心底面
        door_offset_x: 壁左端からドア中心までの距離
        door_w: ドア幅
        door_h: ドア高さ
        rotation: 壁の回転
        wall_mat: 壁マテリアル
        collection: 所属コレクション

    Returns:
        list of bpy.types.Object — 生成された壁セグメント
    """
    segments = []
    half_wall = wall_width / 2.0
    half_door = door_w / 2.0

    # ドア位置（壁ローカル X 座標、壁左端 = -half_wall）
    door_cx = -half_wall + door_offset_x
    door_left = door_cx - half_door
    door_right = door_cx + half_door

    # --- 左セグメント ---
    left_w = door_left - (-half_wall)
    if left_w > 0.01:
        left_cx = (-half_wall + door_left) / 2.0
        seg = _create_wall_segment(
            f"{prefix}_L", left_w, wall_height, wall_thickness,
            location=(wall_center[0] + left_cx * math.cos(rotation[2]),
                      wall_center[1] + left_cx * math.sin(rotation[2]),
                      wall_center[2] + wall_height / 2.0),
            rotation=rotation,
            material=wall_mat,
        )
        segments.append(seg)
        if collection:
            link_to_collection(seg, collection)

    # --- 右セグメント ---
    right_w = half_wall - door_right
    if right_w > 0.01:
        right_cx = (door_right + half_wall) / 2.0
        seg = _create_wall_segment(
            f"{prefix}_R", right_w, wall_height, wall_thickness,
            location=(wall_center[0] + right_cx * math.cos(rotation[2]),
                      wall_center[1] + right_cx * math.sin(rotation[2]),
                      wall_center[2] + wall_height / 2.0),
            rotation=rotation,
            material=wall_mat,
        )
        segments.append(seg)
        if collection:
            link_to_collection(seg, collection)

    # --- 上部セグメント（ドア上の壁） ---
    top_h = wall_height - door_h
    if top_h > 0.01:
        seg = _create_wall_segment(
            f"{prefix}_Top", door_w, top_h, wall_thickness,
            location=(wall_center[0] + door_cx * math.cos(rotation[2]),
                      wall_center[1] + door_cx * math.sin(rotation[2]),
                      wall_center[2] + door_h + top_h / 2.0),
            rotation=rotation,
            material=wall_mat,
        )
        segments.append(seg)
        if collection:
            link_to_collection(seg, collection)

    return segments


def _build_solid_wall(name, width, height, thickness, center_bottom,
                      rotation=(0, 0, 0), material=None, collection=None):
    """開口部なしの単一壁セグメントを構築。

    Args:
        center_bottom: 壁中心底面の (x, y, z)

    Returns:
        bpy.types.Object
    """
    seg = _create_wall_segment(
        name, width, height, thickness,
        location=(center_bottom[0], center_bottom[1],
                  center_bottom[2] + height / 2.0),
        rotation=rotation,
        material=material,
    )
    if collection:
        link_to_collection(seg, collection)
    return seg


# ===========================================================================
# 木格子パーティション
# ===========================================================================

def _build_wood_slat_partition(x_pos, y_start, y_end, height,
                               slat_width=0.03, slat_depth=0.06,
                               gap=0.04, collection=None):
    """木格子（縦スラット）パーティションを生成。

    Args:
        x_pos: X座標（壁面位置）
        y_start: Y開始位置
        y_end: Y終了位置
        height: パーティション高さ
        slat_width: スラット幅（Y方向）
        slat_depth: スラット奥行き（X方向）
        gap: スラット間の隙間
        collection: コレクション

    Returns:
        list of bpy.types.Object
    """
    # スラット用マテリアル（ダークウォールナット）
    mat = make_material("M_WoodSlat", hex_to_rgba('#3A2A1A'), roughness=0.4)

    slats = []
    pitch = slat_width + gap
    span = y_end - y_start
    num_slats = int(span / pitch)

    for i in range(num_slats):
        y = y_start + pitch * i + slat_width / 2.0
        slat = _create_wall_segment(
            f"WoodSlat_{i:03d}",
            slat_depth,   # X方向の厚み
            height,       # Z方向の高さ
            slat_width,   # Y方向の幅
            location=(x_pos, y, height / 2.0),
            material=mat,
        )
        slats.append(slat)
        if collection:
            link_to_collection(slat, collection)

    print(f"[room] Wood slat partition: {num_slats} slats")
    return slats


# ===========================================================================
# 部屋ジオメトリ構築（v2 — 明示座標指定）
# ===========================================================================

def _wall_x(name, length, height, x, y_center, z_base, t, mat, col):
    """X方向に延びる壁（北壁/南壁タイプ）。中心座標で配置。"""
    seg = _create_wall_segment(
        name, length, height, t,
        location=(x, y_center, z_base + height / 2.0),
        rotation=(0, 0, 0),
        material=mat,
    )
    link_to_collection(seg, col)
    return seg


def _wall_y(name, length, height, x_center, y, z_base, t, mat, col):
    """Y方向に延びる壁（東壁/西壁タイプ）。中心座標で配置。"""
    seg = _create_wall_segment(
        name, length, height, t,
        location=(x_center, y, z_base + height / 2.0),
        rotation=(0, 0, math.pi / 2.0),
        material=mat,
    )
    link_to_collection(seg, col)
    return seg


def build_room_geometry(collections):
    """代官山 NULL Bar の全ルームジオメトリを構築（v2）。

    全壁セグメントを明示座標で配置。回転数学のバグを排除。

    座標系:
      原点 (0,0,0) = メインバーエリアの中心床面
      X = 東西 (+X=東), Y = 南北 (+Y=北), Z = 上下
    """
    room_col = collections["01_Room"]
    T = WALL_T  # 0.12m

    # --- マテリアル ---
    wall_mat = create_wall_material(color_hex='#8A8A8A', roughness=0.85)
    floor_mat = create_floor_material(texture_type='concrete', color=hex_to_rgba('#2A2A2A'))
    ceiling_mat = make_material("M_Ceiling_Dark", hex_to_rgba('#505050'), roughness=0.9)
    baseboard_mat = make_material("M_Baseboard", hex_to_rgba('#1A1A1A'), roughness=0.5)
    toilet_wall_mat = create_wall_material(color_hex='#D0D0D0', roughness=0.75)
    toilet_floor_mat = create_floor_material(texture_type='tile', color=hex_to_rgba('#C8C8C8'))

    # =========================================================================
    # 座標定義（全て内寸の端を基準）
    # =========================================================================
    # メインバーエリア
    bx0, bx1 = -BAR_W / 2.0, BAR_W / 2.0    # -2.55, +2.55
    by0, by1 = -BAR_D / 2.0, BAR_D / 2.0    # -2.73, +2.73
    bh = BAR_H                                # 2.598

    # 廊下（バーの南、同じ幅）
    cy0 = by0 - CORR_D                        # -3.73
    cy1 = by0                                  # -2.73
    ch = CORR_H                                # 2.61

    # 東側小部屋（バー東壁の外側に付く）
    ex0 = bx1                                  # +2.55 (バー東壁)
    ex1 = bx1 + WASH_W                         # +3.49

    # 手洗い（東側上部）
    wy_center = 1.5
    wy0 = wy_center - WASH_D / 2.0            # +1.075
    wy1 = wy_center + WASH_D / 2.0            # +1.925

    # トイレ（東側下部）
    ty_center = -0.5
    ty0 = ty_center - TOILET_D / 2.0          # -1.365
    ty1 = ty_center + TOILET_D / 2.0          # +0.365

    # ドア開口（0.78m幅, 2.0m高）
    dw = DOOR_W  # 0.78
    dh = DOOR_H  # 2.00

    print("[room] Building room geometry v2...")

    # =========================================================================
    # 1. メインバーエリア — 床・天井
    # =========================================================================
    _tmp = _create_plane("Floor_Bar", BAR_W, BAR_D, (0, 0, 0), material=floor_mat)
    link_to_collection(_tmp, room_col)

    _tmp = _create_plane("Ceiling_Bar", BAR_W, BAR_D, (0, 0, bh),
                         rotation=(math.pi, 0, 0), material=ceiling_mat)
    link_to_collection(_tmp, room_col)

    # =========================================================================
    # 2. メインバーエリア — 壁
    # =========================================================================
    # 北壁（全幅、開口なし）
    _wall_x("Wall_N", BAR_W, bh, 0, by1, 0, T, wall_mat, room_col)

    # 西壁（全長、開口なし）
    _wall_y("Wall_W", BAR_D, bh, bx0, 0, 0, T, wall_mat, room_col)

    # 南壁（廊下への開口を左側に設ける — 右2/3は壁、左1/3は開口）
    # 廊下接続開口: x = -0.5 付近、幅 1.5m（バーから廊下へ通路）
    south_open_x = 0.0
    south_open_w = 2.0
    # 開口の左側壁
    south_left_w = (south_open_x - south_open_w / 2.0) - bx0
    if south_left_w > 0.05:
        south_left_cx = bx0 + south_left_w / 2.0
        _wall_x("Wall_S_L", south_left_w, bh, south_left_cx, by0, 0, T, wall_mat, room_col)
    # 開口の右側壁
    south_right_start = south_open_x + south_open_w / 2.0
    south_right_w = bx1 - south_right_start
    if south_right_w > 0.05:
        south_right_cx = south_right_start + south_right_w / 2.0
        _wall_x("Wall_S_R", south_right_w, bh, south_right_cx, by0, 0, T, wall_mat, room_col)
    # 開口上部
    south_top_h = bh - bh  # バーから廊下は天井高同等なので上部壁なし（通路）

    # 東壁（ドア2つの開口あり — 3セグメント + 2ドア上部）
    # セグメント配置: 北端→手洗いドア→中間→トイレドア→南端
    wash_door_y0 = wy_center - dw / 2.0   # 1.11
    wash_door_y1 = wy_center + dw / 2.0   # 1.89
    toilet_door_y0 = ty_center - dw / 2.0  # -0.89
    toilet_door_y1 = ty_center + dw / 2.0  # -0.11

    # E-1: 北端 → 手洗いドア上端 (by1 to wash_door_y1)
    e1_len = by1 - wash_door_y1
    e1_cy = (by1 + wash_door_y1) / 2.0
    _wall_y("Wall_E_1", e1_len, bh, bx1, e1_cy, 0, T, wall_mat, room_col)

    # E-2: 手洗いドア下端 → トイレドア上端 (wash_door_y0 to toilet_door_y1)
    e2_len = wash_door_y0 - toilet_door_y1
    e2_cy = (wash_door_y0 + toilet_door_y1) / 2.0
    _wall_y("Wall_E_2", e2_len, bh, bx1, e2_cy, 0, T, wall_mat, room_col)

    # E-3: トイレドア下端 → 南端 (toilet_door_y0 to by0)
    e3_len = toilet_door_y0 - by0
    e3_cy = (toilet_door_y0 + by0) / 2.0
    _wall_y("Wall_E_3", e3_len, bh, bx1, e3_cy, 0, T, wall_mat, room_col)

    # ドア上部（手洗い・トイレ）
    door_top_h = bh - dh
    if door_top_h > 0.01:
        _wall_y("Wall_E_WashTop", dw, door_top_h, bx1, wy_center, dh, T, wall_mat, room_col)
        _wall_y("Wall_E_ToiletTop", dw, door_top_h, bx1, ty_center, dh, T, wall_mat, room_col)

    # =========================================================================
    # 3. 木格子パーティション
    # =========================================================================
    slat_x = bx0 + 1.14
    _build_wood_slat_partition(slat_x, by0, by1, bh, collection=room_col)

    # =========================================================================
    # 4. 廊下
    # =========================================================================
    print("[room] Building corridor...")
    corr_cx = 0
    corr_cy = (cy0 + cy1) / 2.0

    _tmp = _create_plane("Floor_Corr", BAR_W, CORR_D, (corr_cx, corr_cy, 0), material=floor_mat)
    link_to_collection(_tmp, room_col)

    _tmp = _create_plane("Ceiling_Corr", BAR_W, CORR_D, (corr_cx, corr_cy, ch),
                         rotation=(math.pi, 0, 0), material=ceiling_mat)
    link_to_collection(_tmp, room_col)

    # 廊下西壁
    _wall_y("Wall_Corr_W", CORR_D, ch, bx0, corr_cy, 0, T, wall_mat, room_col)
    # 廊下東壁
    _wall_y("Wall_Corr_E", CORR_D, ch, bx1, corr_cy, 0, T, wall_mat, room_col)

    # 廊下南壁（エントランスドア付き）
    ent_door_x = 0.0
    ent_left_w = (ent_door_x - dw / 2.0) - bx0
    ent_right_start = ent_door_x + dw / 2.0
    ent_right_w = bx1 - ent_right_start
    if ent_left_w > 0.05:
        _wall_x("Wall_Corr_S_L", ent_left_w, ch, bx0 + ent_left_w / 2.0, cy0, 0, T, wall_mat, room_col)
    if ent_right_w > 0.05:
        _wall_x("Wall_Corr_S_R", ent_right_w, ch, ent_right_start + ent_right_w / 2.0, cy0, 0, T, wall_mat, room_col)
    # ドア上部
    corr_door_top_h = ch - dh
    if corr_door_top_h > 0.01:
        _wall_x("Wall_Corr_S_Top", dw, corr_door_top_h, ent_door_x, cy0, dh, T, wall_mat, room_col)

    # =========================================================================
    # 5. 手洗いエリア
    # =========================================================================
    print("[room] Building washroom...")
    wash_cx = (ex0 + ex1) / 2.0

    _tmp = _create_plane("Floor_Wash", WASH_W, WASH_D, (wash_cx, wy_center, 0), material=floor_mat)
    link_to_collection(_tmp, room_col)
    _tmp = _create_plane("Ceil_Wash", WASH_W, WASH_D, (wash_cx, wy_center, WASH_H),
                         rotation=(math.pi, 0, 0), material=ceiling_mat)
    link_to_collection(_tmp, room_col)

    # 手洗い北壁・南壁・東壁
    _wall_x("Wall_Wash_N", WASH_W, WASH_H, wash_cx, wy1, 0, T, toilet_wall_mat, room_col)
    _wall_x("Wall_Wash_S", WASH_W, WASH_H, wash_cx, wy0, 0, T, toilet_wall_mat, room_col)
    _wall_y("Wall_Wash_E", WASH_D, WASH_H, ex1, wy_center, 0, T, toilet_wall_mat, room_col)

    # =========================================================================
    # 6. トイレ
    # =========================================================================
    print("[room] Building toilet...")
    toilet_cx = (ex0 + ex1) / 2.0

    _tmp = _create_plane("Floor_Toilet", TOILET_W, TOILET_D,
                         (toilet_cx, ty_center, TOILET_FL), material=toilet_floor_mat)
    link_to_collection(_tmp, room_col)
    _tmp = _create_plane("Ceil_Toilet", TOILET_W, TOILET_D,
                         (toilet_cx, ty_center, TOILET_FL + TOILET_H),
                         rotation=(math.pi, 0, 0), material=ceiling_mat)
    link_to_collection(_tmp, room_col)

    # トイレ北壁・南壁・東壁
    _wall_x("Wall_Toilet_N", TOILET_W, TOILET_H, toilet_cx, ty1, TOILET_FL, T, toilet_wall_mat, room_col)
    _wall_x("Wall_Toilet_S", TOILET_W, TOILET_H, toilet_cx, ty0, TOILET_FL, T, toilet_wall_mat, room_col)
    _wall_y("Wall_Toilet_E", TOILET_D, TOILET_H, ex1, ty_center, TOILET_FL, T, toilet_wall_mat, room_col)

    # =========================================================================
    # 7. ドア配置
    # =========================================================================
    print("[room] Placing doors...")
    from blender.models.door_panel import create_door

    # 手洗いドア（東壁のドア開口に配置、Y方向に開く）
    create_door("Door_Wash", width=dw, height=dh, open_angle=math.radians(15),
                location=(bx1, wy_center, 0))

    # トイレドア
    create_door("Door_Toilet", width=dw, height=dh, open_angle=0,
                location=(bx1, ty_center, TOILET_FL))

    # エントランスドア（南壁のドア開口）
    create_door("Door_Entrance", width=dw, height=dh, open_angle=math.radians(25),
                location=(ent_door_x, cy0, 0))

    # =========================================================================
    # 8. 曲面ブース（バンケットソファ）— 北東エリア
    # =========================================================================
    print("[room] Building booth banquette...")
    banquette_mat = make_material("M_Banquette",
                                  hex_to_rgba('#6B1515'), roughness=0.7)

    # アーチ型バンケット（半円弧 + ストレート部分）
    # 図面: 北壁沿い x=0.0〜+2.2, y=+1.5〜+2.5 に曲面ブース
    booth_cx = 1.1       # アーチ中心 X
    booth_cy = by1 - 0.1  # 北壁際
    booth_r_outer = 1.3   # 外側半径
    booth_r_inner = 1.0   # 内側半径（座面奥行き0.3m）
    booth_h_seat = 0.45   # 座面高さ
    booth_h_back = 1.2    # 背もたれ高さ
    n_segments = 24

    # 座面（半円弧の厚みのあるメッシュ）
    seat_mesh = bpy.data.meshes.new("Banquette_Seat")
    seat_bm = bmesh.new()
    for i in range(n_segments + 1):
        angle = math.pi * i / n_segments  # 0 to π（半円）
        x_out = booth_cx + booth_r_outer * math.cos(angle)
        y_out = booth_cy - booth_r_outer * math.sin(angle)
        x_in = booth_cx + booth_r_inner * math.cos(angle)
        y_in = booth_cy - booth_r_inner * math.sin(angle)
        # 4頂点: 外側下、外側上、内側上、内側下
        seat_bm.verts.new((x_out, y_out, 0))
        seat_bm.verts.new((x_out, y_out, booth_h_seat))
        seat_bm.verts.new((x_in, y_in, booth_h_seat))
        seat_bm.verts.new((x_in, y_in, 0))
    seat_bm.verts.ensure_lookup_table()
    # 面を貼る
    for i in range(n_segments):
        base = i * 4
        nxt = (i + 1) * 4
        # 外面
        seat_bm.faces.new([seat_bm.verts[base], seat_bm.verts[base + 1],
                           seat_bm.verts[nxt + 1], seat_bm.verts[nxt]])
        # 上面（座面）
        seat_bm.faces.new([seat_bm.verts[base + 1], seat_bm.verts[base + 2],
                           seat_bm.verts[nxt + 2], seat_bm.verts[nxt + 1]])
        # 内面
        seat_bm.faces.new([seat_bm.verts[base + 2], seat_bm.verts[base + 3],
                           seat_bm.verts[nxt + 3], seat_bm.verts[nxt + 2]])
        # 底面
        seat_bm.faces.new([seat_bm.verts[base + 3], seat_bm.verts[base],
                           seat_bm.verts[nxt], seat_bm.verts[nxt + 3]])
    seat_bm.to_mesh(seat_mesh)
    seat_bm.free()
    seat_obj = bpy.data.objects.new("Banquette_Seat", seat_mesh)
    bpy.context.collection.objects.link(seat_obj)
    seat_obj.data.materials.append(banquette_mat)
    link_to_collection(seat_obj, room_col)

    # 背もたれ（外側の薄い弧状壁）
    back_mesh = bpy.data.meshes.new("Banquette_Back")
    back_bm = bmesh.new()
    back_thickness = 0.08
    for i in range(n_segments + 1):
        angle = math.pi * i / n_segments
        x_out = booth_cx + (booth_r_outer + back_thickness) * math.cos(angle)
        y_out = booth_cy - (booth_r_outer + back_thickness) * math.sin(angle)
        x_in = booth_cx + booth_r_outer * math.cos(angle)
        y_in = booth_cy - booth_r_outer * math.sin(angle)
        back_bm.verts.new((x_out, y_out, booth_h_seat))
        back_bm.verts.new((x_out, y_out, booth_h_back))
        back_bm.verts.new((x_in, y_in, booth_h_back))
        back_bm.verts.new((x_in, y_in, booth_h_seat))
    back_bm.verts.ensure_lookup_table()
    for i in range(n_segments):
        base = i * 4
        nxt = (i + 1) * 4
        back_bm.faces.new([back_bm.verts[base], back_bm.verts[base + 1],
                           back_bm.verts[nxt + 1], back_bm.verts[nxt]])
        back_bm.faces.new([back_bm.verts[base + 1], back_bm.verts[base + 2],
                           back_bm.verts[nxt + 2], back_bm.verts[nxt + 1]])
        back_bm.faces.new([back_bm.verts[base + 2], back_bm.verts[base + 3],
                           back_bm.verts[nxt + 3], back_bm.verts[nxt + 2]])
        back_bm.faces.new([back_bm.verts[base + 3], back_bm.verts[base],
                           back_bm.verts[nxt], back_bm.verts[nxt + 3]])
    back_bm.to_mesh(back_mesh)
    back_bm.free()
    back_obj = bpy.data.objects.new("Banquette_Back", back_mesh)
    bpy.context.collection.objects.link(back_obj)
    back_obj.data.materials.append(banquette_mat)
    link_to_collection(back_obj, room_col)

    print("[room] Booth banquette complete (seat + back)")

    # =========================================================================
    # 9. 巾木
    # =========================================================================
    print("[room] Adding baseboards...")
    bb_h = 0.06
    # 北壁
    _tmp = _create_baseboard("BB_N", BAR_W, location=(0, by1 - 0.006, 0), material=baseboard_mat)
    link_to_collection(_tmp, room_col)
    # 西壁
    _tmp = _create_baseboard("BB_W", BAR_D, location=(bx0 + 0.006, 0, 0),
                             rotation=(0, 0, math.pi / 2.0), material=baseboard_mat)
    link_to_collection(_tmp, room_col)

    print("[room] Room geometry v2 complete.")


# ===========================================================================
# 旧版（使わない）
# ===========================================================================

def build_room_geometry_OLD(collections):
    """旧版 — 使わない。

    原点 (0, 0, 0) = メインバーエリアの中心床面。
    Blender 座標系: X=東西, Y=南北, Z=上下。
    北 = +Y, 東 = +X。
    """
    room_col = collections["01_Room"]
    openings_col = collections["03_Openings"]

    # --- マテリアル生成 ---
    wall_mat = create_wall_material(color_hex='#8A8A8A', roughness=0.85)
    floor_mat = create_floor_material(
        texture_type='concrete',
        color=hex_to_rgba('#4A4A4A'),
    )
    ceiling_mat = make_material("M_Ceiling_Dark", hex_to_rgba('#505050'), roughness=0.9)
    baseboard_mat = make_material("M_Baseboard", hex_to_rgba('#1A1A1A'), roughness=0.5)

    # トイレ用白い壁・タイル床
    toilet_wall_mat = create_wall_material(color_hex='#D0D0D0', roughness=0.75)
    toilet_floor_mat = create_floor_material(
        texture_type='tile',
        color=hex_to_rgba('#C8C8C8'),
    )

    # =========================================================================
    # 1. メインバーエリア
    # =========================================================================
    print("[room] Building main bar area...")

    bar_x0 = -BAR_W / 2.0  # 西端: -1.925
    bar_x1 = BAR_W / 2.0   # 東端: +1.925
    bar_y0 = -BAR_D / 2.0  # 南端: -2.5
    bar_y1 = BAR_D / 2.0   # 北端: +2.5

    # 床
    bar_floor = _create_plane(
        "Floor_Bar", BAR_W, BAR_D,
        location=(0, 0, 0),
        material=floor_mat,
    )
    link_to_collection(bar_floor, room_col)

    # 天井
    bar_ceiling = _create_plane(
        "Ceiling_Bar", BAR_W, BAR_D,
        location=(0, 0, BAR_H),
        rotation=(math.pi, 0, 0),  # 法線を下向き
        material=ceiling_mat,
    )
    link_to_collection(bar_ceiling, room_col)

    # --- 北壁（ソリッド — ブース背面） ---
    north_wall = _build_solid_wall(
        "Wall_Bar_N", BAR_W, BAR_H, WALL_T,
        center_bottom=(0, bar_y1 + WALL_T / 2.0, 0),
        material=wall_mat, collection=room_col,
    )

    # --- 南壁（西半分のみ — 東側は廊下へ開口） ---
    # 南壁: 廊下との接続のため、西端から東端までの部分壁
    # 東側 ~2.0m は廊下への開口
    south_open_width = 2.0  # 開口幅
    south_wall_width = BAR_W - south_open_width
    if south_wall_width > 0.01:
        south_wall = _build_solid_wall(
            "Wall_Bar_S_Part",
            south_wall_width, BAR_H, WALL_T,
            center_bottom=(bar_x0 + south_wall_width / 2.0,
                           bar_y0 - WALL_T / 2.0, 0),
            material=wall_mat, collection=room_col,
        )

    # --- 東壁（ドア2箇所: 手洗い入口 + トイレ入口） ---
    # 東壁は手洗いとトイレへの開口部を持つ
    # 手洗いドア: Y=+1.5 付近
    # トイレドア: Y=-0.5 付近
    # 東壁を3つのソリッドセグメント + 2つの開口上壁で構成

    east_x = bar_x1 + WALL_T / 2.0

    # ドア1（手洗い）: 北寄り Y=+1.5
    wash_door_cy = 1.5
    # ドア2（トイレ）: 中央寄り Y=-0.5
    toilet_door_cy = -0.5

    # 東壁セグメント: 北端 → 手洗いドア上端
    seg_n_start = bar_y1
    seg_n_end = wash_door_cy + DOOR_W / 2.0
    seg1_h_start = wash_door_cy - DOOR_W / 2.0
    seg1_h_end = wash_door_cy + DOOR_W / 2.0

    # セグメント: 北端 ～ 手洗いドア北端
    seg_a_len = bar_y1 - (wash_door_cy + DOOR_W / 2.0)
    if seg_a_len > 0.01:
        _build_solid_wall(
            "Wall_Bar_E_A", WALL_T, BAR_H, seg_a_len,
            center_bottom=(east_x, wash_door_cy + DOOR_W / 2.0 + seg_a_len / 2.0, 0),
            rotation=(0, 0, math.pi / 2.0),
            material=wall_mat, collection=room_col,
        )

    # 手洗いドア開口上壁
    wash_top_h = BAR_H - DOOR_H
    if wash_top_h > 0.01:
        _build_solid_wall(
            "Wall_Bar_E_WashTop", WALL_T, wash_top_h, DOOR_W,
            center_bottom=(east_x, wash_door_cy, DOOR_H),
            rotation=(0, 0, math.pi / 2.0),
            material=wall_mat, collection=room_col,
        )

    # セグメント: 手洗いドア南端 ～ トイレドア北端
    seg_b_start = wash_door_cy - DOOR_W / 2.0
    seg_b_end = toilet_door_cy + DOOR_W / 2.0
    seg_b_len = seg_b_start - seg_b_end
    if seg_b_len > 0.01:
        _build_solid_wall(
            "Wall_Bar_E_B", WALL_T, BAR_H, seg_b_len,
            center_bottom=(east_x, seg_b_end + seg_b_len / 2.0, 0),
            rotation=(0, 0, math.pi / 2.0),
            material=wall_mat, collection=room_col,
        )

    # トイレドア開口上壁
    toilet_top_h = BAR_H - DOOR_H
    if toilet_top_h > 0.01:
        _build_solid_wall(
            "Wall_Bar_E_ToiletTop", WALL_T, toilet_top_h, DOOR_W,
            center_bottom=(east_x, toilet_door_cy, DOOR_H),
            rotation=(0, 0, math.pi / 2.0),
            material=wall_mat, collection=room_col,
        )

    # セグメント: トイレドア南端 ～ 南端
    seg_c_start = toilet_door_cy - DOOR_W / 2.0
    seg_c_end = bar_y0
    seg_c_len = seg_c_start - seg_c_end
    if seg_c_len > 0.01:
        _build_solid_wall(
            "Wall_Bar_E_C", WALL_T, BAR_H, seg_c_len,
            center_bottom=(east_x, seg_c_end + seg_c_len / 2.0, 0),
            rotation=(0, 0, math.pi / 2.0),
            material=wall_mat, collection=room_col,
        )

    # --- 西壁: ソリッド壁 + 木格子パーティション ---
    # 西壁（実際の外壁）
    _build_solid_wall(
        "Wall_Bar_W", WALL_T, BAR_H, BAR_D,
        center_bottom=(bar_x0, 0, 0),
        rotation=(0, 0, math.pi / 2.0),
        material=wall_mat, collection=room_col,
    )
    # 木格子パーティション（西壁から1.14m内側、図面の1135mm位置）
    slat_partition_x = bar_x0 + 1.14
    _build_wood_slat_partition(
        x_pos=slat_partition_x,
        y_start=bar_y0,
        y_end=bar_y1,
        height=BAR_H,
        collection=room_col,
    )

    # 木格子エリアの床・天井はメインバーエリアに含まれるため不要

    # =========================================================================
    # 2. 廊下（バーエリア南側）
    # =========================================================================
    print("[room] Building corridor...")

    corr_y_center = bar_y0 - CORR_D / 2.0
    corr_x0 = -CORR_W / 2.0
    corr_x1 = CORR_W / 2.0

    # 廊下 床
    corr_floor = _create_plane(
        "Floor_Corridor", CORR_W, CORR_D,
        location=(0, corr_y_center, 0),
        material=floor_mat,
    )
    link_to_collection(corr_floor, room_col)

    # 廊下 天井
    corr_ceiling = _create_plane(
        "Ceiling_Corridor", CORR_W, CORR_D,
        location=(0, corr_y_center, CORR_H),
        rotation=(math.pi, 0, 0),
        material=ceiling_mat,
    )
    link_to_collection(corr_ceiling, room_col)

    # 廊下 南壁（メインエントランスドア付き）
    corr_south_y = bar_y0 - CORR_D
    # エントランスドア: 中央
    entrance_door_offset = CORR_W / 2.0  # 壁左端からドア中心まで
    _build_wall_with_door(
        "Wall_Corr_S", CORR_W, CORR_H, WALL_T,
        wall_center=(0, corr_south_y - WALL_T / 2.0, 0),
        door_offset_x=entrance_door_offset,
        door_w=DOOR_W, door_h=DOOR_H,
        wall_mat=wall_mat, collection=room_col,
    )

    # 廊下 西壁
    _build_solid_wall(
        "Wall_Corr_W", WALL_T, CORR_H, CORR_D,
        center_bottom=(corr_x0 - WALL_T / 2.0, corr_y_center, 0),
        rotation=(0, 0, math.pi / 2.0),
        material=wall_mat, collection=room_col,
    )

    # 廊下 東壁
    _build_solid_wall(
        "Wall_Corr_E", WALL_T, CORR_H, CORR_D,
        center_bottom=(corr_x1 + WALL_T / 2.0, corr_y_center, 0),
        rotation=(0, 0, math.pi / 2.0),
        material=wall_mat, collection=room_col,
    )

    # =========================================================================
    # 3. 手洗いエリア（東側上部）
    # =========================================================================
    print("[room] Building washroom...")

    wash_x_center = bar_x1 + WALL_T + WASH_W / 2.0
    wash_y_center = wash_door_cy

    # 手洗い 床
    wash_floor = _create_plane(
        "Floor_Washroom", WASH_W, WASH_D,
        location=(wash_x_center, wash_y_center, 0),
        material=floor_mat,
    )
    link_to_collection(wash_floor, room_col)

    # 手洗い 天井
    wash_ceiling = _create_plane(
        "Ceiling_Washroom", WASH_W, WASH_D,
        location=(wash_x_center, wash_y_center, WASH_H),
        rotation=(math.pi, 0, 0),
        material=ceiling_mat,
    )
    link_to_collection(wash_ceiling, room_col)

    # 手洗い 壁（北・南・東）— 西壁はバーエリア東壁
    # 北壁
    _build_solid_wall(
        "Wall_Wash_N", WASH_W, WASH_H, WALL_T,
        center_bottom=(wash_x_center,
                       wash_y_center + WASH_D / 2.0 + WALL_T / 2.0, 0),
        material=toilet_wall_mat, collection=room_col,
    )
    # 南壁
    _build_solid_wall(
        "Wall_Wash_S", WASH_W, WASH_H, WALL_T,
        center_bottom=(wash_x_center,
                       wash_y_center - WASH_D / 2.0 - WALL_T / 2.0, 0),
        material=toilet_wall_mat, collection=room_col,
    )
    # 東壁
    _build_solid_wall(
        "Wall_Wash_E", WALL_T, WASH_H, WASH_D,
        center_bottom=(wash_x_center + WASH_W / 2.0 + WALL_T / 2.0,
                       wash_y_center, 0),
        rotation=(0, 0, math.pi / 2.0),
        material=toilet_wall_mat, collection=room_col,
    )

    # =========================================================================
    # 4. トイレ（東側下部 — 床 +200mm）
    # =========================================================================
    print("[room] Building toilet...")

    toilet_x_center = bar_x1 + WALL_T + TOILET_W / 2.0
    toilet_y_center = toilet_door_cy

    # トイレ 床（+200mm）
    toilet_floor = _create_plane(
        "Floor_Toilet", TOILET_W, TOILET_D,
        location=(toilet_x_center, toilet_y_center, TOILET_FL),
        material=toilet_floor_mat,
    )
    link_to_collection(toilet_floor, room_col)

    # トイレ 天井
    toilet_ceiling = _create_plane(
        "Ceiling_Toilet", TOILET_W, TOILET_D,
        location=(toilet_x_center, toilet_y_center, TOILET_FL + TOILET_H),
        rotation=(math.pi, 0, 0),
        material=ceiling_mat,
    )
    link_to_collection(toilet_ceiling, room_col)

    # トイレ 壁（北・南・東）
    # 北壁
    _build_solid_wall(
        "Wall_Toilet_N", TOILET_W, TOILET_H, WALL_T,
        center_bottom=(toilet_x_center,
                       toilet_y_center + TOILET_D / 2.0 + WALL_T / 2.0,
                       TOILET_FL),
        material=toilet_wall_mat, collection=room_col,
    )
    # 南壁
    _build_solid_wall(
        "Wall_Toilet_S", TOILET_W, TOILET_H, WALL_T,
        center_bottom=(toilet_x_center,
                       toilet_y_center - TOILET_D / 2.0 - WALL_T / 2.0,
                       TOILET_FL),
        material=toilet_wall_mat, collection=room_col,
    )
    # 東壁
    _build_solid_wall(
        "Wall_Toilet_E", WALL_T, TOILET_H, TOILET_D,
        center_bottom=(toilet_x_center + TOILET_W / 2.0 + WALL_T / 2.0,
                       toilet_y_center, TOILET_FL),
        rotation=(0, 0, math.pi / 2.0),
        material=toilet_wall_mat, collection=room_col,
    )

    # トイレ入り口の段差（高さ200mmの段差面）
    step_depth = 0.15
    step = _create_wall_segment(
        "Toilet_Step", DOOR_W, TOILET_FL, step_depth,
        location=(bar_x1 + WALL_T / 2.0, toilet_door_cy, TOILET_FL / 2.0),
        material=floor_mat,
    )
    link_to_collection(step, room_col)

    # =========================================================================
    # 5. ドア配置
    # =========================================================================
    print("[room] Placing doors...")

    # 手洗いドア（東壁、Y=wash_door_cy）— 少し開いた状態
    wash_door = create_door(
        name="Door_Washroom",
        width=DOOR_W, height=DOOR_H,
        frame_depth=WALL_T,
        open_angle=15.0,
        location=(bar_x1 + WALL_T / 2.0, wash_door_cy, 0),
    )
    wash_door.rotation_euler = (0, 0, math.pi / 2.0)  # 東壁に合わせて回転
    link_to_collection(wash_door, openings_col)
    # 子オブジェクトもコレクションに移動
    for child in wash_door.children_recursive:
        link_to_collection(child, openings_col)

    # トイレドア（東壁、Y=toilet_door_cy）— 閉じた状態
    toilet_door = create_door(
        name="Door_Toilet",
        width=DOOR_W, height=DOOR_H,
        frame_depth=WALL_T,
        open_angle=0.0,
        location=(bar_x1 + WALL_T / 2.0, toilet_door_cy, 0),
    )
    toilet_door.rotation_euler = (0, 0, math.pi / 2.0)
    link_to_collection(toilet_door, openings_col)
    for child in toilet_door.children_recursive:
        link_to_collection(child, openings_col)

    # エントランスドア（廊下南壁中央）— 少し開いた状態
    entrance_door = create_door(
        name="Door_Entrance",
        width=DOOR_W, height=DOOR_H,
        frame_depth=WALL_T,
        open_angle=25.0,
        location=(0, corr_south_y, 0),
    )
    link_to_collection(entrance_door, openings_col)
    for child in entrance_door.children_recursive:
        link_to_collection(child, openings_col)

    # =========================================================================
    # 6. 巾木（全エリア）
    # =========================================================================
    print("[room] Adding baseboards...")

    # メインバーエリア北壁巾木
    bb_n = _create_baseboard(
        "Baseboard_Bar_N", BAR_W,
        location=(0, bar_y1, 0),
        material=baseboard_mat,
    )
    link_to_collection(bb_n, room_col)

    # 東壁巾木（簡略化 — ドア間にのみ）
    bb_e = _create_baseboard(
        "Baseboard_Bar_E", BAR_D * 0.3,
        location=(bar_x1, 0.5, 0),
        rotation=(0, 0, math.pi / 2.0),
        material=baseboard_mat,
    )
    link_to_collection(bb_e, room_col)

    print("[room] Room geometry complete.")


# ===========================================================================
# カメラ配置
# ===========================================================================

def setup_custom_cameras(collections):
    """代官山 NULL Bar 用のカスタムカメラ配置。

    矩形でない間取りに合わせた4視点。
    """
    cam_col = collections["05_Cameras"]
    cameras = {}

    bar_x0 = -BAR_W / 2.0
    bar_x1 = BAR_W / 2.0
    bar_y0 = -BAR_D / 2.0
    bar_y1 = BAR_D / 2.0

    camera_defs = {
        # Cam_Main: 南西から北東を俯瞰（全体構図）
        'Cam_Main': {
            'location': (-0.8, -1.5, 1.8),
            'target': (1.0, 1.2, 0.6),
            'lens': 20,
        },
        # Cam_Counter: 客席側からカウンター＋バックバー方向を見る
        'Cam_Counter': {
            'location': (0.5, 1.0, 1.2),
            'target': (0.5, -1.0, 0.8),
            'lens': 24,
        },
        # Cam_Booth: カウンター付近から北のブースエリアを見る
        'Cam_Booth': {
            'location': (-0.5, -0.3, 1.5),
            'target': (1.0, 2.0, 0.5),
            'lens': 22,
        },
        # Cam_Corridor: 入口から店内全体を見る
        'Cam_Corridor': {
            'location': (0.0, bar_y0 + 0.3, 1.5),
            'target': (0.3, 1.5, 0.8),
            'lens': 18,
        },
    }

    for cam_name, params in camera_defs.items():
        # カメラオブジェクト
        cam_data = bpy.data.cameras.new(cam_name)
        cam_data.lens = params['lens']
        cam_data.clip_start = 0.05
        cam_data.clip_end = 50
        cam_data.sensor_width = 36

        cam_obj = bpy.data.objects.new(cam_name, cam_data)
        bpy.context.collection.objects.link(cam_obj)
        cam_obj.location = params['location']

        # ターゲット Empty
        target = bpy.data.objects.new(f"{cam_name}_Target", None)
        bpy.context.collection.objects.link(target)
        target.location = params['target']
        target.empty_display_size = 0.1

        # TrackTo コンストレイント
        constraint = cam_obj.constraints.new('TRACK_TO')
        constraint.target = target
        constraint.track_axis = 'TRACK_NEGATIVE_Z'
        constraint.up_axis = 'UP_Y'

        # コレクション移動
        link_to_collection(cam_obj, cam_col)
        link_to_collection(target, cam_col)

        cameras[cam_name] = cam_obj
        print(f"[camera] {cam_name} — loc={params['location']}, "
              f"target={params['target']}, lens={params['lens']}mm")

    return cameras


# ===========================================================================
# レンダリング
# ===========================================================================

def render_cameras(quality, camera_selection):
    """選択されたカメラでレンダリング実行。"""
    template_id = SCENE_DATA['template']['id']
    output_dir = get_output_dir()

    if camera_selection == 'all':
        camera_names = ALL_CAMERA_NAMES
    else:
        cam_name = CAMERA_MAP.get(camera_selection, 'Cam_Main')
        camera_names = [cam_name]

    rendered = 0
    for cam_name in camera_names:
        cam_obj = bpy.data.objects.get(cam_name)
        if not cam_obj:
            print(f"[Skip] Camera '{cam_name}' not found")
            continue

        bpy.context.scene.camera = cam_obj
        render_path = os.path.join(output_dir, f"{template_id}_{cam_name}.png")
        setup_render(quality=quality, output_path=render_path)
        render_scene(render_path)
        rendered += 1
        print(f"[Render] {render_path}")

    return rendered


# ===========================================================================
# メイン
# ===========================================================================

def main():
    start_time = time.time()

    quality, camera = parse_args()

    print("=" * 60)
    print("Porano Perse — 代官山 NULL Bar Custom Renderer")
    print(f"Quality: {quality}")
    print(f"Camera: {camera}")
    print(f"Furniture: {len(SCENE_DATA['furniture'])} items")
    print("=" * 60)

    # --- Phase 1: シーンクリア ---
    print("\n[Phase 1] Clearing scene...")
    clear_scene()

    # --- Phase 2: コレクション設定 ---
    print("[Phase 2] Setting up collections...")
    collections = setup_collections()

    # --- Phase 3: ルームジオメトリ構築 ---
    print("[Phase 3] Building room geometry (custom)...")
    build_room_geometry(collections)

    # --- Phase 4: 家具インポート ---
    print(f"[Phase 4] Importing {len(SCENE_DATA['furniture'])} furniture items...")
    import_furniture(SCENE_DATA, collections)

    # --- Phase 5: ライティング ---
    print("[Phase 5] Setting up lighting...")
    setup_lighting(SCENE_DATA, collections)

    # --- Phase 5b: カスタム追加ライティング ---
    print("[Phase 5b] Adding custom fill lights...")
    lighting_col = collections.get("04_Lighting")

    # 天井面の均一な間接照明（大きいエリアライト2枚）
    bpy.ops.object.light_add(type='AREA', location=(0, 0.5, BAR_H - 0.08))
    ceil_fill1 = bpy.context.active_object
    ceil_fill1.name = "Light_CeilFill_1"
    ceil_fill1.data.energy = 80
    ceil_fill1.data.size = 3.0
    ceil_fill1.data.color = (1.0, 0.95, 0.88)
    ceil_fill1.data.use_shadow = False
    if lighting_col:
        link_to_collection(ceil_fill1, lighting_col)

    bpy.ops.object.light_add(type='AREA', location=(0, -1.5, BAR_H - 0.08))
    ceil_fill2 = bpy.context.active_object
    ceil_fill2.name = "Light_CeilFill_2"
    ceil_fill2.data.energy = 50
    ceil_fill2.data.size = 2.5
    ceil_fill2.data.color = (1.0, 0.95, 0.88)
    ceil_fill2.data.use_shadow = False
    if lighting_col:
        link_to_collection(ceil_fill2, lighting_col)

    # ブースエリア暖色ダウンライト
    bpy.ops.object.light_add(type='SPOT', location=(1.1, 1.8, BAR_H - 0.05))
    booth_spot = bpy.context.active_object
    booth_spot.name = "Light_Booth_Down"
    booth_spot.data.energy = 60
    booth_spot.data.spot_size = 1.4
    booth_spot.data.spot_blend = 0.7
    booth_spot.data.color = (1.0, 0.85, 0.65)
    booth_spot.rotation_euler = (0, 0, 0)
    if lighting_col:
        link_to_collection(booth_spot, lighting_col)

    print("[lighting] Custom fill lights added")

    # --- Phase 6: カメラ設定（カスタム） ---
    print("[Phase 6] Setting up cameras (custom)...")
    cameras = setup_custom_cameras(collections)

    # --- Phase 7: .blend 保存 ---
    output_dir = get_output_dir()
    template_id = SCENE_DATA['template']['id']
    blend_path = os.path.join(output_dir, f"{template_id}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"\n[Save] {blend_path}")

    # --- Phase 8: レンダリング ---
    print(f"\n[Phase 8] Rendering (quality={quality})...")
    rendered_count = render_cameras(quality, camera)

    elapsed = time.time() - start_time

    print("\n" + "=" * 60)
    print("Complete!")
    print(f"  Rendered: {rendered_count} image(s)")
    print(f"  Blend file: {blend_path}")
    print(f"  Time: {elapsed:.1f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
