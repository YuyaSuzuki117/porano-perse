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
import re
import sys

import ezdxf

# デフォルト値
DEFAULT_CEILING_HEIGHT_MM = 2700
DEFAULT_WALL_THICKNESS_MM = 120
DEFAULT_DOOR_HEIGHT_MM = 2100
DEFAULT_DOOR_ELEVATION_MM = 0
DEFAULT_WINDOW_HEIGHT_MM = 1200
DEFAULT_WINDOW_ELEVATION_MM = 800
EPS = 5  # mm 精度の閾値

# === 什器タイプマッピング（日本語→GLBモデル名） ===
FURNITURE_TYPE_MAP = {
    # バー・飲食
    "カウンター": "counter",
    "バーカウンター": "bar_counter",
    "l字カウンター": "counter_l_shape",
    "ストレートカウンター": "counter_straight",
    "ビールサーバー": "beer_server",
    "エスプレッソマシン": "espresso_machine",
    "コーヒーマシン": "coffee_machine",
    "カクテルステーション": "cocktail_station",
    "ケーキショーケース": "cake_showcase",
    "レジカウンター": "register_counter",
    # 椅子・ソファ
    "椅子": "chair",
    "チェア": "chair",
    "バーチェア": "bar_chair",
    "バースツール": "bar_stool",
    "スツール": "bar_stool",
    "アームチェア": "armchair",
    "ソファ": "sofa",
    "ブースソファ": "booth_sofa",
    "ベンチ": "bench",
    "オフィスチェア": "office_chair",
    # テーブル
    "テーブル": "table_square",
    "丸テーブル": "table_round",
    "ラウンドテーブル": "table_round",
    "バーテーブル": "bar_table",
    "デスク": "desk",
    "オフィスデスク": "office_desk",
    # 収納
    "棚": "display_shelf",
    "本棚": "bookcase",
    "ラック": "display_shelf",
    "ファイルキャビネット": "file_cabinet",
    "食器棚": "dish_cabinet",
    "ドレッサー": "dresser",
    # 什器・ディスプレイ
    "レジ": "cash_register",
    "ショーケース": "glass_showcase",
    "ガラスショーケース": "glass_showcase",
    "ディスプレイケース": "display_case",
    "ディスプレイシェルフ": "display_shelf",
    "フィッティングルーム": "fitting_room",
    "デジタルサイネージ": "digital_signage",
    # 設備
    "エアコン": "air_conditioner",
    "空気清浄機": "air_purifier",
    "冷蔵庫": "fridge",
    "洗面台": "washbasin",
    "シンク": "sink",
    "トイレ": "toilet",
    "自動販売機": "vending_machine",
    "atm": "atm",
    "aed": "aed",
    "消火器": "fire_extinguisher",
    "洗濯機": "washing_machine",
    # 家具
    "ベッド": "bed",
    "シングルベッド": "bed_single",
    "ダブルベッド": "bed_double",
    "鏡": "mirror",
    "ミラー": "mirror",
    # 建具・造作
    "ガラスパーテーション": "glass_partition",
    "パーテーション": "glass_partition",
    "カーテン": "curtain",
    "装飾柱": "decorative_column",
    "巾木": "baseboard",
    "木巾木": "baseboard_wood",
    "廻り縁": "crown_molding",
    "カーテンボックス": "curtain_box",
    "ドア枠": "door_frame",
    "自動ドア": "auto_door",
    "ガラスドア": "glass_door",
    "フラッシュドア": "flush_door",
    "引き戸": "double_sliding_door",
    # 照明
    "ダウンライト": "downlight_recessed",
    "シーリングファン": "ceiling_fan",
    "ペンダントライト": "pendant_light_simple",
    # 装飾・小物
    "植物": "plant_small",
    "観葉植物": "plant_large",
    "フラワーポット": "flower_pot",
    "花瓶": "flower_pot",
    "傘立て": "umbrella_stand",
    "コートハンガー": "coat_hanger",
    "コートラック": "coat_rack",
    "時計": "clock",
    "ゴミ箱": "trash_can",
    "非常口サイン": "exit_sign",
    # フィットネス
    "ダンベルラック": "dumbbell_rack",
}


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


def parse_dxf_openings(msp, walls, meta_openings=None):
    """建具レイヤーからドア(ARC)と窓を検出

    meta_openings: meta.jsonのopenings配列（高さ/elevation情報の参照用）
    """
    openings = []

    # メタデータから開口部の高さ情報をインデックス化
    # wall_index + type でルックアップ
    meta_opening_lookup = {}
    if meta_openings:
        for mo in meta_openings:
            key = (mo.get("wall_index", -1), mo.get("type", ""))
            if key not in meta_opening_lookup:
                meta_opening_lookup[key] = []
            meta_opening_lookup[key].append(mo)

    # ARC → ドア
    for entity in msp.query('ARC[layer=="建具"]'):
        cx, cy = entity.dxf.center.x, entity.dxf.center.y
        radius = entity.dxf.radius

        # 最も近い壁を探す
        best_wall_idx, best_pos = _find_closest_wall(walls, cx, cy)
        if best_wall_idx >= 0:
            # メタデータから高さ情報を取得（あれば）
            door_height = DEFAULT_DOOR_HEIGHT_MM
            door_elevation = DEFAULT_DOOR_ELEVATION_MM
            meta_doors = meta_opening_lookup.get((best_wall_idx, "door"), [])
            if meta_doors:
                # 位置が最も近いメタデータを使用
                best_meta = _find_closest_meta_opening(meta_doors, best_pos)
                if best_meta:
                    door_height = best_meta.get("height_mm", DEFAULT_DOOR_HEIGHT_MM)
                    door_elevation = best_meta.get("elevation_mm", DEFAULT_DOOR_ELEVATION_MM)

            openings.append({
                "wall_index": best_wall_idx,
                "type": "door",
                "position_mm": round(best_pos),
                "width_mm": round(radius),
                "height_mm": door_height,
                "elevation_mm": door_elevation,
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
                # メタデータから高さ情報を取得（あれば）
                win_height = DEFAULT_WINDOW_HEIGHT_MM
                win_elevation = DEFAULT_WINDOW_ELEVATION_MM
                meta_windows = meta_opening_lookup.get((best_wall_idx, "window"), [])
                if meta_windows:
                    best_meta = _find_closest_meta_opening(meta_windows, best_pos)
                    if best_meta:
                        win_height = best_meta.get("height_mm", DEFAULT_WINDOW_HEIGHT_MM)
                        win_elevation = best_meta.get("elevation_mm", DEFAULT_WINDOW_ELEVATION_MM)

                openings.append({
                    "wall_index": best_wall_idx,
                    "type": "window",
                    "position_mm": round(best_pos),
                    "width_mm": round(width),
                    "height_mm": win_height,
                    "elevation_mm": win_elevation,
                })
                used.add(i)

    return openings


def _find_closest_meta_opening(meta_list, position_mm):
    """メタデータ開口部リストから位置が最も近いものを返す"""
    if not meta_list:
        return None
    best = None
    best_dist = float("inf")
    for mo in meta_list:
        dist = abs(mo.get("position_mm", 0) - position_mm)
        if dist < best_dist:
            best_dist = dist
            best = mo
    return best


def _calculate_rotation_from_vertices(points):
    """LWPOLYLINE の頂点列から矩形の回転角を計算（度）

    4頂点の閉じた矩形を想定。長辺の方向から回転角度を算出する。
    """
    if len(points) < 4:
        return 0.0

    # 最初の4頂点を使用
    vertices = points[:4]

    # 辺ベクトルを計算
    edge0 = (vertices[1][0] - vertices[0][0], vertices[1][1] - vertices[0][1])
    edge1 = (vertices[2][0] - vertices[1][0], vertices[2][1] - vertices[1][1])

    len0 = math.sqrt(edge0[0] ** 2 + edge0[1] ** 2)
    len1 = math.sqrt(edge1[0] ** 2 + edge1[1] ** 2)

    # ゼロ長の辺がある場合は回転なし
    if len0 < EPS and len1 < EPS:
        return 0.0

    # 長辺の方向を回転角とする（正方形の場合はedge0を使用）
    if len0 >= len1:
        rotation_rad = math.atan2(edge0[1], edge0[0])
    else:
        rotation_rad = math.atan2(edge1[1], edge1[0])

    rotation_deg = math.degrees(rotation_rad)
    return round(rotation_deg, 2)


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

            # 頂点から回転角を計算
            rotation = _calculate_rotation_from_vertices(points)

            # 回転がある場合、幅と奥行は辺の長さから取得
            if abs(rotation) > EPS:
                edge0_len = math.sqrt(
                    (points[1][0] - points[0][0]) ** 2 +
                    (points[1][1] - points[0][1]) ** 2
                )
                edge1_len = math.sqrt(
                    (points[2][0] - points[1][0]) ** 2 +
                    (points[2][1] - points[1][1]) ** 2
                )
                # 長辺=幅、短辺=奥行（慣例）
                w = round(max(edge0_len, edge1_len))
                d = round(min(edge0_len, edge1_len))
            else:
                w = round(w)
                d = round(d)

            if w > 10 and d > 10:
                polys.append({
                    "center": (cx, cy),
                    "width": w,
                    "depth": d,
                    "rotation_deg": rotation,
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
            "rotation_deg": poly["rotation_deg"],
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
    if any(k in name for k in ["ベッド", "bed"]):
        return 500
    if any(k in name for k in ["冷蔵庫", "fridge"]):
        return 1800
    if any(k in name for k in ["洗面台", "washbasin", "シンク", "sink"]):
        return 850
    if any(k in name for k in ["エアコン", "air_conditioner"]):
        return 300
    if any(k in name for k in ["ダウンライト", "downlight"]):
        return 100
    if any(k in name for k in ["植物", "plant", "観葉"]):
        return 1200
    return 750


def _name_to_snake_case(name):
    """名前をsnake_caseに変換（英語フォールバック用）"""
    if not name:
        return ""
    # 既にASCIIのみの場合はsnake_case変換
    ascii_name = name.strip().lower()
    # スペース・ハイフンをアンダースコアに
    ascii_name = re.sub(r'[\s\-]+', '_', ascii_name)
    # 英数字とアンダースコア以外を除去
    ascii_name = re.sub(r'[^a-z0-9_]', '', ascii_name)
    # 連続アンダースコアを1つに
    ascii_name = re.sub(r'_+', '_', ascii_name).strip('_')
    return ascii_name


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


def _guess_furniture_type(name):
    """什器名からGLBモデルタイプを推定

    1. FURNITURE_TYPE_MAP で日本語名を完全一致検索
    2. 部分一致検索（長いキーから優先）
    3. 英語名の場合はsnake_caseに変換して返す
    4. いずれも該当しなければ "custom"
    """
    if not name:
        return "custom"

    name_lower = name.lower()

    # 完全一致チェック
    if name_lower in FURNITURE_TYPE_MAP:
        return FURNITURE_TYPE_MAP[name_lower]

    # 部分一致チェック（長いキーを先に試す → 「バーカウンター」が「カウンター」より優先）
    sorted_keys = sorted(FURNITURE_TYPE_MAP.keys(), key=len, reverse=True)
    for key in sorted_keys:
        if key in name_lower:
            return FURNITURE_TYPE_MAP[key]

    # 英語名フォールバック: snake_caseに変換して返す
    snake = _name_to_snake_case(name)
    if snake:
        return snake

    return "custom"


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

    # 開口部解析（メタデータの高さ情報を参照）
    meta_openings_data = meta.get("openings")
    dxf_openings = parse_dxf_openings(msp, dxf_walls, meta_openings_data)
    dxf_furniture = parse_dxf_furniture(msp)

    # メタデータで上書き（meta.json があればそちらを優先）
    if meta.get("walls"):
        dxf_walls = meta["walls"]
        wall_thickness = meta.get("wall_thickness_mm", wall_thickness)
    if meta.get("openings"):
        # メタデータのopeningsが完全データならそちらを使用
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

    # メタデータのスタイル/マテリアル情報をパススルー
    if meta.get("style"):
        scene["style_hints"] = meta["style"]
    if meta.get("materials"):
        scene["materials"] = meta["materials"]
    if meta.get("color_palette"):
        scene["color_palette"] = meta["color_palette"]
    if meta.get("accent_materials"):
        scene["accent_materials"] = meta["accent_materials"]

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
                "elevation_mm": o.get("elevation_mm", 0),
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
