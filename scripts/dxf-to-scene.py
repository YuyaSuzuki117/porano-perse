"""
DXF → Blender シーンJSON 変換器

DXFファイル（+ オプションの .meta.json）を読み込み、
Blender の room_builder.py / lighting.py が受け取れるシーンJSONを出力する。

入力:
  1. DXF + .meta.json（gen-dxf.py が生成）→ 最高精度
  2. DXF のみ（JW_CADで編集後など）→ レイヤーからヒューリスティック解析

出力: Blenderシーン JSON（room_builder.py の scene_data 形式）

使い方:
  python scripts/dxf-to-scene.py input.dxf -o scene.json
  python scripts/dxf-to-scene.py input.dxf --meta input.dxf.meta.json -o scene.json
"""

import argparse
import json
import math
import os
import sys

import ezdxf

# デフォルト値
DEFAULT_CEILING_HEIGHT_MM = 2700
DEFAULT_WALL_THICKNESS_MM = 120
EPS = 5  # mm 精度の閾値


def parse_dxf_walls(msp):
    """壁芯レイヤーからLINEを抽出 → 壁セグメント"""
    walls = []
    for entity in msp.query('LINE[layer=="壁芯"]'):
        s = entity.dxf.start
        e = entity.dxf.end
        walls.append({
            "start": [round(s.x, 1), round(s.y, 1)],
            "end": [round(e.x, 1), round(e.y, 1)],
        })
    return walls


def parse_dxf_wall_thickness(msp, walls):
    """壁レイヤーのダブルラインから壁厚を推定"""
    wall_lines = []
    for entity in msp.query('LINE[layer=="壁"]'):
        s = entity.dxf.start
        e = entity.dxf.end
        wall_lines.append(((s.x, s.y), (e.x, e.y)))

    if not wall_lines or not walls:
        return DEFAULT_WALL_THICKNESS_MM

    # 最初の壁芯に対する壁ラインの距離から壁厚を推定
    w = walls[0]
    cx, cy = w["start"]
    # 壁芯に最も近い壁ラインを探す
    min_dist = float("inf")
    for (lx1, ly1), (lx2, ly2) in wall_lines:
        mid_x = (lx1 + lx2) / 2
        mid_y = (ly1 + ly2) / 2
        wall_mid_x = (w["start"][0] + w["end"][0]) / 2
        wall_mid_y = (w["start"][1] + w["end"][1]) / 2
        # 中点間距離
        dist = math.sqrt((mid_x - wall_mid_x) ** 2 + (mid_y - wall_mid_y) ** 2)
        if dist < min_dist:
            min_dist = dist
            # 壁芯と壁ラインの距離 = 壁厚/2
            # 点と線の距離を計算
            dx = w["end"][0] - w["start"][0]
            dy = w["end"][1] - w["start"][1]
            length = math.sqrt(dx * dx + dy * dy)
            if length > 0:
                # 壁芯の法線方向の距離
                nx, ny = -dy / length, dx / length
                d = abs(nx * (lx1 - cx) + ny * (ly1 - cy))
                if 10 < d < 200:  # 妥当な壁厚の半分の範囲
                    return round(d * 2)

    return DEFAULT_WALL_THICKNESS_MM


def parse_dxf_openings(msp, walls):
    """建具レイヤーからドア(ARC)と窓を検出"""
    openings = []

    # ARC → ドア
    for entity in msp.query('ARC[layer=="建具"]'):
        cx, cy = entity.dxf.center.x, entity.dxf.center.y
        radius = entity.dxf.radius

        # 最も近い壁を探す
        best_wall_idx, best_pos = _find_closest_wall(walls, cx, cy)
        if best_wall_idx >= 0:
            openings.append({
                "wall_index": best_wall_idx,
                "type": "door",
                "position_mm": round(best_pos),
                "width_mm": round(radius),
                "height_mm": 2100,
                "elevation_mm": 0,
            })

    # 建具レイヤーのLINE群から窓を検出（ARCがない直線群 = 窓）
    door_centers = set()
    for entity in msp.query('ARC[layer=="建具"]'):
        door_centers.add((round(entity.dxf.center.x, -1), round(entity.dxf.center.y, -1)))

    window_lines = []
    for entity in msp.query('LINE[layer=="建具"]'):
        s = entity.dxf.start
        e = entity.dxf.end
        mid = ((s.x + e.x) / 2, (s.y + e.y) / 2)
        # ドア近辺でなければ窓候補
        is_door_part = False
        for dc in door_centers:
            if math.sqrt((mid[0] - dc[0]) ** 2 + (mid[1] - dc[1]) ** 2) < 1500:
                is_door_part = True
                break
        if not is_door_part:
            window_lines.append(((s.x, s.y), (e.x, e.y)))

    # 窓ラインをクラスタリング
    used = set()
    for i, ((x1, y1), (x2, y2)) in enumerate(window_lines):
        if i in used:
            continue
        mid = ((x1 + x2) / 2, (y1 + y2) / 2)
        width = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

        if width < 100:  # 短すぎる線は枠
            continue

        best_wall_idx, best_pos = _find_closest_wall(walls, mid[0], mid[1])
        if best_wall_idx >= 0:
            # 重複チェック
            dup = False
            for o in openings:
                if (o["wall_index"] == best_wall_idx and
                    o["type"] == "window" and
                    abs(o["position_mm"] - best_pos) < 200):
                    dup = True
                    break
            if not dup:
                openings.append({
                    "wall_index": best_wall_idx,
                    "type": "window",
                    "position_mm": round(best_pos),
                    "width_mm": round(width),
                    "height_mm": 1200,
                    "elevation_mm": 800,
                })
                used.add(i)

    return openings


def parse_dxf_furniture(msp):
    """什器レイヤーから矩形 + テキストラベルを抽出"""
    furniture = []

    # LWPOLYLINE → 什器の矩形
    polys = []
    for entity in msp.query('LWPOLYLINE[layer=="什器"]'):
        points = list(entity.get_points(format="xy"))
        if len(points) >= 4:
            xs = [p[0] for p in points]
            ys = [p[1] for p in points]
            cx = (min(xs) + max(xs)) / 2
            cy = (min(ys) + max(ys)) / 2
            w = max(xs) - min(xs)
            d = max(ys) - min(ys)
            if w > 10 and d > 10:
                polys.append({
                    "center": (cx, cy),
                    "width": round(w),
                    "depth": round(d),
                })

    # TEXT → 什器名（最も近いポリラインに割当て）
    texts = []
    for entity in msp.query('TEXT[layer=="什器"]'):
        pos = entity.dxf.insert
        texts.append({"text": entity.dxf.text, "pos": (pos.x, pos.y)})

    for poly in polys:
        name = ""
        best_dist = float("inf")
        for t in texts:
            dist = math.sqrt(
                (t["pos"][0] - poly["center"][0]) ** 2 +
                (t["pos"][1] - poly["center"][1]) ** 2
            )
            if dist < best_dist and dist < max(poly["width"], poly["depth"]):
                best_dist = dist
                name = t["text"]

        furniture.append({
            "name": name,
            "center_mm": [round(poly["center"][0]), round(poly["center"][1])],
            "width_mm": poly["width"],
            "depth_mm": poly["depth"],
            "height_mm": _guess_height(name),
            "rotation_deg": 0,
        })

    return furniture


def _find_closest_wall(walls, px, py):
    """点(px,py)に最も近い壁を探し、(壁index, 壁始点からの距離mm)を返す"""
    best_idx = -1
    best_dist = float("inf")
    best_pos = 0

    for i, w in enumerate(walls):
        sx, sy = w["start"]
        ex, ey = w["end"]
        dx, dy = ex - sx, ey - sy
        length = math.sqrt(dx * dx + dy * dy)
        if length < 1:
            continue

        # 壁芯への射影
        t = max(0, min(1, ((px - sx) * dx + (py - sy) * dy) / (length * length)))
        proj_x = sx + t * dx
        proj_y = sy + t * dy
        dist = math.sqrt((px - proj_x) ** 2 + (py - proj_y) ** 2)
        pos_along = t * length

        if dist < best_dist:
            best_dist = dist
            best_idx = i
            best_pos = pos_along

    return best_idx, best_pos


def _guess_height(name):
    """什器名から高さ推定(mm)"""
    if not name:
        return 750
    name = name.lower()
    if any(k in name for k in ["カウンター", "counter"]):
        return 1050
    if any(k in name for k in ["テーブル", "table"]):
        return 720
    if any(k in name for k in ["椅子", "chair", "チェア", "スツール", "stool"]):
        return 450
    if any(k in name for k in ["棚", "shelf", "ラック", "rack"]):
        return 1800
    if any(k in name for k in ["ソファ", "sofa"]):
        return 800
    return 750


def determine_wall_direction(walls, wall_index, room_bounds):
    """壁の方角 (north/south/east/west) をバウンディングボックスから推定"""
    if wall_index < 0 or wall_index >= len(walls):
        return "north"

    w = walls[wall_index]
    sx, sy = w["start"]
    ex, ey = w["end"]
    mid_x = (sx + ex) / 2
    mid_y = (sy + ey) / 2
    min_x, min_y, max_x, max_y = room_bounds
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2

    dx = abs(ex - sx)
    dy = abs(ey - sy)

    if dx > dy:  # 水平壁 → north or south
        return "north" if mid_y > center_y else "south"
    else:  # 垂直壁 → east or west
        return "east" if mid_x > center_x else "west"


def dxf_to_scene(dxf_path, meta_path=None):
    """DXF（+ メタJSON）→ Blender シーン JSON"""
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    # メタデータ読み込み（あれば）
    meta = {}
    if meta_path and os.path.exists(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        print(f"Meta loaded: {meta_path}")
    elif os.path.exists(dxf_path + ".meta.json"):
        with open(dxf_path + ".meta.json", "r", encoding="utf-8") as f:
            meta = json.load(f)
        print(f"Meta auto-detected: {dxf_path}.meta.json")

    # === DXF 解析 ===
    dxf_walls = parse_dxf_walls(msp)
    wall_thickness = parse_dxf_wall_thickness(msp, dxf_walls)
    dxf_openings = parse_dxf_openings(msp, dxf_walls)
    dxf_furniture = parse_dxf_furniture(msp)

    # メタデータで上書き（meta.json があればそちらを優先）
    if meta.get("walls"):
        dxf_walls = meta["walls"]
        wall_thickness = meta.get("wall_thickness_mm", wall_thickness)
    if meta.get("openings"):
        dxf_openings = meta["openings"]
    if meta.get("furniture"):
        dxf_furniture = meta["furniture"]

    ceiling_height = meta.get("ceiling_height_mm", DEFAULT_CEILING_HEIGHT_MM)
    project_name = meta.get("project_name", os.path.splitext(os.path.basename(dxf_path))[0])
    materials = meta.get("materials", {
        "floor": "floor_oak",
        "wall": "wall_white",
        "ceiling": "ceiling_white",
    })

    # === バウンディングボックス計算 ===
    all_x = [w["start"][0] for w in dxf_walls] + [w["end"][0] for w in dxf_walls]
    all_y = [w["start"][1] for w in dxf_walls] + [w["end"][1] for w in dxf_walls]
    if not all_x:
        print("ERROR: No walls found in DXF")
        sys.exit(1)

    min_x, max_x = min(all_x), max(all_x)
    min_y, max_y = min(all_y), max(all_y)
    width_mm = max_x - min_x
    depth_mm = max_y - min_y
    room_bounds = (min_x, min_y, max_x, max_y)

    # === Blender シーン JSON 構築 ===
    # room_builder.py が受け取る形式（m単位）
    scene = {
        "project_name": project_name,
        "room": {
            "width": width_mm / 1000,
            "depth": depth_mm / 1000,
            "height": ceiling_height / 1000,
            "wallThickness": wall_thickness / 1000,
        },
        "style": {
            "wallColor": _material_to_color(materials.get("wall", "wall_white"), "wall"),
            "floorColor": _material_to_color(materials.get("floor", "floor_oak"), "floor"),
            "ceilingColor": _material_to_color(materials.get("ceiling", "ceiling_white"), "ceiling"),
            "floorTexture": _material_to_texture(materials.get("floor", "floor_oak")),
        },
        "openings": [],
        "furniture": [],
        # blueprint_converter.py 互換フィールド
        "walls": [],
        "fixtures": [],
        "furniture_suggestions": [],
        "lighting": meta.get("lighting", {}),
        "floor": {"material": materials.get("floor", "floor_oak")},
        "style_hints": meta.get("style", "modern"),
    }

    # 壁データ（blueprint_converter.py 用、mm単位）
    for i, w in enumerate(dxf_walls):
        wall_entry = {
            "id": f"wall_{i}",
            "start": w["start"],
            "end": w["end"],
            "height_mm": w.get("height_mm", ceiling_height),
            "thickness_mm": w.get("thickness_mm", wall_thickness),
            "finish": "白クロス",
        }

        # この壁の開口部
        wall_openings = [o for o in dxf_openings if o.get("wall_index") == i]
        wall_entry["openings"] = []
        for o in wall_openings:
            wall_entry["openings"].append({
                "type": o["type"],
                "width_mm": o["width_mm"],
                "height_mm": o["height_mm"],
            })

        scene["walls"].append(wall_entry)

    # 開口部（room_builder.py 用、m単位 + 方角）
    for o in dxf_openings:
        wall_dir = determine_wall_direction(dxf_walls, o.get("wall_index", -1), room_bounds)
        wall = dxf_walls[o["wall_index"]] if 0 <= o.get("wall_index", -1) < len(dxf_walls) else None
        wall_length = 0
        if wall:
            dx = wall["end"][0] - wall["start"][0]
            dy = wall["end"][1] - wall["start"][1]
            wall_length = math.sqrt(dx * dx + dy * dy)

        scene["openings"].append({
            "type": o["type"],
            "wall": wall_dir,
            "positionAlongWall": o["position_mm"] / 1000,
            "width": o["width_mm"] / 1000,
            "height": o["height_mm"] / 1000,
            "elevation": o.get("elevation_mm", 0) / 1000,
        })

    # 什器（room_builder.py 用 — position は原点基準のm単位に正規化）
    for f in dxf_furniture:
        cx_mm, cy_mm = f["center_mm"]
        # DXF座標 → 原点基準に正規化
        norm_x = (cx_mm - min_x) / 1000
        norm_y = (cy_mm - min_y) / 1000
        h_m = f.get("height_mm", 750) / 1000

        scene["furniture"].append({
            "type": _guess_furniture_type(f["name"]),
            "name": f["name"],
            "position": [norm_x, h_m / 2, norm_y],  # Blender座標 [x, y_up, z_depth]
            "scale": [f["width_mm"] / 1000, h_m, f["depth_mm"] / 1000],
            "rotation": [0, math.radians(f.get("rotation_deg", 0)), 0],
        })

        # furniture_suggestions 互換
        scene["furniture_suggestions"].append({
            "type": _guess_furniture_type(f["name"]),
            "name": f["name"],
            "position": [cx_mm, cy_mm],
            "count": 1,
        })

    # メタから追加情報
    scene["camera"] = meta.get("camera", "eye_level")
    scene["render_quality"] = meta.get("render_quality", "preview")

    return scene


def _material_to_color(material_key, surface_type):
    """マテリアルキーからHEXカラーを返す"""
    colors = {
        "wall_white": "#F5F5F0",
        "wall_concrete": "#B0B0A8",
        "wall_mortar": "#C8C0B0",
        "floor_oak": "#C8A070",
        "floor_walnut": "#6B4230",
        "floor_tile_white": "#E8E8E0",
        "floor_terrazzo": "#D0C8B8",
        "floor_mortar": "#A8A098",
        "ceiling_white": "#FAFAFA",
        "ceiling_wood": "#D0B888",
    }
    default = {"wall": "#F5F5F0", "floor": "#C8A070", "ceiling": "#FAFAFA"}
    return colors.get(material_key, default.get(surface_type, "#FFFFFF"))


def _material_to_texture(material_key):
    """マテリアルキーからテクスチャ名を返す"""
    textures = {
        "floor_oak": "wood",
        "floor_walnut": "wood",
        "floor_tile_white": "tile",
        "floor_terrazzo": "terrazzo",
        "floor_mortar": "concrete",
    }
    return textures.get(material_key, "wood")


def _guess_furniture_type(name):
    """什器名からタイプを推定"""
    if not name:
        return "custom"
    name = name.lower()
    if any(k in name for k in ["カウンター", "counter"]):
        return "counter"
    if any(k in name for k in ["テーブル", "table"]):
        return "table_square"
    if any(k in name for k in ["椅子", "chair", "チェア"]):
        return "chair"
    if any(k in name for k in ["スツール", "stool"]):
        return "stool"
    if any(k in name for k in ["ソファ", "sofa"]):
        return "sofa"
    if any(k in name for k in ["棚", "shelf"]):
        return "shelf"
    return "custom"


def main():
    parser = argparse.ArgumentParser(description="DXF → Blender シーンJSON 変換")
    parser.add_argument("dxf", help="入力DXFファイル")
    parser.add_argument("--meta", help="メタJSONファイル（省略時は .dxf.meta.json を自動検索）")
    parser.add_argument("-o", "--output", help="出力JSON（省略時は入力名.scene.json）")
    parser.add_argument("--pretty", action="store_true", help="JSONを整形出力")

    args = parser.parse_args()

    output = args.output or args.dxf.rsplit(".", 1)[0] + ".scene.json"

    scene = dxf_to_scene(args.dxf, args.meta)

    os.makedirs(os.path.dirname(output) or ".", exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(scene, f, ensure_ascii=False, indent=2 if args.pretty else None)
    print(f"Scene JSON saved: {output}")
    print(f"  Room: {scene['room']['width']}m x {scene['room']['depth']}m x {scene['room']['height']}m")
    print(f"  Walls: {len(scene['walls'])}, Openings: {len(scene['openings'])}, Furniture: {len(scene['furniture'])}")


if __name__ == "__main__":
    main()
