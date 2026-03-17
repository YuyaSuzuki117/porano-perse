"""
DXF図面生成スクリプト — 内装仕上げ工事用

入力:
  1. シーンJSON (blueprint-analysis/*.json)
  2. コマンドライン引数で直接指定

出力: DXF ファイル (JW_CAD / AutoCAD 互換)

使い方:
  python scripts/gen-dxf.py --json output/blueprint-analysis/project.json
  python scripts/gen-dxf.py --width 5000 --depth 4000 --height 2700 --name "店舗A"
  python scripts/gen-dxf.py --from-store  (Webアプリのエクスポート JSON)
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path

import ezdxf
from ezdxf import units
from ezdxf.math import Vec2

# --- 定数 ---
WALL_THICKNESS_MM = 120  # デフォルト壁厚
CEILING_HEIGHT_MM = 2700
DOOR_WIDTH_MM = 900
DOOR_HEIGHT_MM = 2100
WINDOW_WIDTH_MM = 1800
WINDOW_HEIGHT_MM = 1200
WINDOW_SILL_MM = 800

# レイヤー定義（日本の内装図面標準に準拠）
LAYERS = {
    "壁": {"color": 7, "linetype": "Continuous"},       # 白
    "壁芯": {"color": 1, "linetype": "CENTER"},         # 赤
    "建具": {"color": 3, "linetype": "Continuous"},      # 緑
    "什器": {"color": 5, "linetype": "Continuous"},      # 青
    "寸法": {"color": 2, "linetype": "Continuous"},      # 黄
    "仕上げ": {"color": 4, "linetype": "Continuous"},    # シアン
    "室名": {"color": 6, "linetype": "Continuous"},      # マゼンタ
    "設備": {"color": 8, "linetype": "Continuous"},      # グレー
    "補助": {"color": 9, "linetype": "DASHED"},          # ライトグレー
}

# 仕上げ記号
FINISH_HATCHES = {
    "wood": "ANSI31",
    "tile": "ANSI37",
    "concrete": "ANSI32",
    "marble": "ANSI38",
    "tatami": "ANSI33",
}


class DXFGenerator:
    """内装仕上げ工事用 DXF 図面生成器"""

    def __init__(self):
        self.doc = ezdxf.new("R2010", setup=True)
        self.doc.units = units.MM
        self.msp = self.doc.modelspace()
        self._setup_layers()
        self._setup_dimstyle()
        # 3Dメタデータ（DXFと同時出力、Blender連携用）
        self.meta = {
            "project_name": "",
            "ceiling_height_mm": CEILING_HEIGHT_MM,
            "wall_thickness_mm": WALL_THICKNESS_MM,
            "style": "modern",
            "walls": [],       # {"start": [x,y], "end": [x,y], "thickness_mm": N, "height_mm": N}
            "openings": [],    # {"wall_index": N, "type": "door/window", "position_mm": N, "width_mm": N, "height_mm": N, "elevation_mm": N}
            "furniture": [],   # {"name": "", "center_mm": [x,y], "width_mm": N, "depth_mm": N, "height_mm": N, "rotation_deg": N}
            "materials": {"floor": "floor_oak", "wall": "wall_white", "ceiling": "ceiling_white"},
            "camera": "eye_level",
            "render_quality": "preview",
        }

    def _setup_layers(self):
        """レイヤーを作成"""
        for name, props in LAYERS.items():
            try:
                self.doc.layers.add(
                    name,
                    color=props["color"],
                    linetype=props["linetype"],
                )
            except ezdxf.DXFTableEntryError:
                pass  # 既存レイヤー

    def _setup_dimstyle(self):
        """寸法スタイル設定（日本建築標準）"""
        ds = self.doc.dimstyles.new("内装寸法")
        ds.dxf.dimtxt = 60        # 文字高さ 60mm (1:50で1.2mm)
        ds.dxf.dimasz = 40        # 矢印サイズ
        ds.dxf.dimexe = 30        # 補助線延長
        ds.dxf.dimexo = 50        # 補助線オフセット
        ds.dxf.dimdec = 0         # 小数桁数 0（mm整数）
        ds.dxf.dimgap = 20        # 文字ギャップ
        ds.dxf.dimtad = 1         # 文字位置: 上
        ds.dxf.dimscale = 1       # スケール

    # =================== 壁 ===================

    def draw_wall(self, start_mm, end_mm, thickness_mm=WALL_THICKNESS_MM, height_mm=None):
        """壁を描画（厚み付きダブルライン + 壁芯）"""
        sx, sy = start_mm
        ex, ey = end_mm

        # メタデータに記録
        self.meta["walls"].append({
            "start": [sx, sy],
            "end": [ex, ey],
            "thickness_mm": thickness_mm,
            "height_mm": height_mm or self.meta["ceiling_height_mm"],
        })

        # 壁芯
        self.msp.add_line(
            (sx, sy), (ex, ey),
            dxfattribs={"layer": "壁芯"}
        )

        # 壁方向の法線ベクトル
        dx, dy = ex - sx, ey - sy
        length = math.sqrt(dx * dx + dy * dy)
        if length < 1:
            return
        nx, ny = -dy / length, dx / length
        half_t = thickness_mm / 2

        # 壁ダブルライン
        self.msp.add_line(
            (sx + nx * half_t, sy + ny * half_t),
            (ex + nx * half_t, ey + ny * half_t),
            dxfattribs={"layer": "壁"}
        )
        self.msp.add_line(
            (sx - nx * half_t, sy - ny * half_t),
            (ex - nx * half_t, ey - ny * half_t),
            dxfattribs={"layer": "壁"}
        )

        # 端部キャップ
        self.msp.add_line(
            (sx + nx * half_t, sy + ny * half_t),
            (sx - nx * half_t, sy - ny * half_t),
            dxfattribs={"layer": "壁"}
        )
        self.msp.add_line(
            (ex + nx * half_t, ey + ny * half_t),
            (ex - nx * half_t, ey - ny * half_t),
            dxfattribs={"layer": "壁"}
        )

    def draw_room_walls(self, width_mm, depth_mm, thickness_mm=WALL_THICKNESS_MM):
        """矩形部屋の壁を描画"""
        corners = [
            (0, 0),
            (width_mm, 0),
            (width_mm, depth_mm),
            (0, depth_mm),
        ]
        for i in range(4):
            self.draw_wall(corners[i], corners[(i + 1) % 4], thickness_mm)

    # =================== 建具 ===================

    def draw_door(self, wall_start_mm, wall_end_mm, position_mm,
                  width_mm=DOOR_WIDTH_MM, height_mm=DOOR_HEIGHT_MM,
                  swing="left", wall_thickness_mm=WALL_THICKNESS_MM):
        """ドアを描画（開き戸 — 円弧 + 枠線）"""
        sx, sy = wall_start_mm
        ex, ey = wall_end_mm
        dx, dy = ex - sx, ey - sy
        length = math.sqrt(dx * dx + dy * dy)
        if length < 1:
            return

        # メタデータに記録
        wall_idx = self._find_wall_index(wall_start_mm, wall_end_mm)
        self.meta["openings"].append({
            "wall_index": wall_idx,
            "type": "door",
            "position_mm": position_mm,
            "width_mm": width_mm,
            "height_mm": height_mm,
            "elevation_mm": 0,
        })

        # 壁に沿った単位ベクトル
        ux, uy = dx / length, dy / length
        # 法線ベクトル
        nx, ny = -uy, ux
        half_t = wall_thickness_mm / 2

        # ドア中心位置
        cx = sx + ux * position_mm
        cy = sy + uy * position_mm

        # 壁の開口（壁レイヤーではなく建具レイヤーに枠を描く）
        # ドア枠
        p1 = (cx - nx * half_t, cy - ny * half_t)
        p2 = (cx + nx * half_t, cy + ny * half_t)
        p3 = (cx + ux * width_mm - nx * half_t, cy + uy * width_mm - ny * half_t)
        p4 = (cx + ux * width_mm + nx * half_t, cy + uy * width_mm + ny * half_t)

        self.msp.add_line(p1, p2, dxfattribs={"layer": "建具"})
        self.msp.add_line(p3, p4, dxfattribs={"layer": "建具"})

        # ドア板（閉じた位置）
        door_start = (cx + nx * half_t, cy + ny * half_t)
        door_end = (cx + ux * width_mm + nx * half_t, cy + uy * width_mm + ny * half_t)
        self.msp.add_line(door_start, door_end, dxfattribs={"layer": "建具"})

        # 開き円弧（90度）
        arc_center = door_start if swing == "left" else door_end
        arc_radius = width_mm
        # 壁に沿った角度
        wall_angle = math.degrees(math.atan2(uy, ux))
        normal_angle = wall_angle + 90

        if swing == "left":
            self.msp.add_arc(
                center=arc_center,
                radius=arc_radius,
                start_angle=normal_angle,
                end_angle=normal_angle + 90,
                dxfattribs={"layer": "建具"}
            )
        else:
            self.msp.add_arc(
                center=arc_center,
                radius=arc_radius,
                start_angle=normal_angle - 90,
                end_angle=normal_angle,
                dxfattribs={"layer": "建具"}
            )

    def draw_window(self, wall_start_mm, wall_end_mm, position_mm,
                    width_mm=WINDOW_WIDTH_MM, height_mm=WINDOW_HEIGHT_MM,
                    sill_mm=WINDOW_SILL_MM, wall_thickness_mm=WALL_THICKNESS_MM):
        """窓を描画（ダブルライン + ガラス線）"""
        sx, sy = wall_start_mm
        ex, ey = wall_end_mm
        dx, dy = ex - sx, ey - sy
        length = math.sqrt(dx * dx + dy * dy)
        if length < 1:
            return

        # メタデータに記録
        wall_idx = self._find_wall_index(wall_start_mm, wall_end_mm)
        self.meta["openings"].append({
            "wall_index": wall_idx,
            "type": "window",
            "position_mm": position_mm,
            "width_mm": width_mm,
            "height_mm": height_mm,
            "elevation_mm": sill_mm,
        })

        ux, uy = dx / length, dy / length
        nx, ny = -uy, ux
        half_t = wall_thickness_mm / 2

        # 窓位置
        wx = sx + ux * position_mm
        wy = sy + uy * position_mm

        # 窓枠4点
        p1 = (wx + nx * half_t, wy + ny * half_t)
        p2 = (wx - nx * half_t, wy - ny * half_t)
        p3 = (wx + ux * width_mm - nx * half_t, wy + uy * width_mm - ny * half_t)
        p4 = (wx + ux * width_mm + nx * half_t, wy + uy * width_mm + ny * half_t)

        # 枠線
        self.msp.add_line(p1, p4, dxfattribs={"layer": "建具"})
        self.msp.add_line(p2, p3, dxfattribs={"layer": "建具"})

        # ガラス線（中央）
        gc1 = (wx + nx * 0, wy + ny * 0)
        gc2 = (wx + ux * width_mm, wy + uy * width_mm)
        self.msp.add_line(gc1, gc2, dxfattribs={"layer": "建具"})

    # =================== 什器 ===================

    def draw_furniture(self, center_mm, width_mm, depth_mm, rotation_deg=0, name="", height_mm=0):
        """什器を矩形で描画"""
        # メタデータに記録
        self.meta["furniture"].append({
            "name": name,
            "center_mm": list(center_mm),
            "width_mm": width_mm,
            "depth_mm": depth_mm,
            "height_mm": height_mm or self._guess_furniture_height(name),
            "rotation_deg": rotation_deg,
        })

        hw, hd = width_mm / 2, depth_mm / 2
        corners = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]

        # 回転
        rad = math.radians(rotation_deg)
        cos_r, sin_r = math.cos(rad), math.sin(rad)
        rotated = []
        for x, y in corners:
            rx = x * cos_r - y * sin_r + center_mm[0]
            ry = x * sin_r + y * cos_r + center_mm[1]
            rotated.append((rx, ry))

        # ポリライン
        self.msp.add_lwpolyline(
            rotated + [rotated[0]],
            dxfattribs={"layer": "什器"}
        )

        # 名前ラベル
        if name:
            self.msp.add_text(
                name,
                height=40,
                dxfattribs={
                    "layer": "什器",
                    "insert": center_mm,
                    "halign": ezdxf.const.CENTER,
                    "valign": ezdxf.const.MIDDLE,
                },
            ).set_placement(center_mm, align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

    # =================== 寸法 ===================

    def add_dimension(self, p1_mm, p2_mm, offset_mm=300):
        """寸法線を追加"""
        dx, dy = p2_mm[0] - p1_mm[0], p2_mm[1] - p1_mm[1]
        length = math.sqrt(dx * dx + dy * dy)
        if length < 1:
            return

        nx, ny = -dy / length, dx / length
        base = (
            (p1_mm[0] + p2_mm[0]) / 2 + nx * offset_mm,
            (p1_mm[1] + p2_mm[1]) / 2 + ny * offset_mm,
        )

        dim = self.msp.add_linear_dim(
            base=base,
            p1=p1_mm,
            p2=p2_mm,
            dimstyle="内装寸法",
            override={"dimtad": 1},
            dxfattribs={"layer": "寸法"},
        )
        dim.render()

    # =================== 室名 ===================

    def add_room_label(self, position_mm, name, area_m2=None):
        """室名ラベルを追加"""
        text = name
        if area_m2 is not None:
            text += f"\n{area_m2:.1f}m²"

        self.msp.add_text(
            name,
            height=80,
            dxfattribs={
                "layer": "室名",
                "insert": position_mm,
            },
        ).set_placement(position_mm, align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        if area_m2 is not None:
            self.msp.add_text(
                f"{area_m2:.1f}m\u00B2",
                height=50,
                dxfattribs={
                    "layer": "室名",
                    "insert": (position_mm[0], position_mm[1] - 100),
                },
            ).set_placement(
                (position_mm[0], position_mm[1] - 100),
                align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
            )

    # =================== 仕上げ表 ===================

    def add_finish_table(self, position_mm, finishes):
        """仕上げ表を描画

        finishes: [
            {"部位": "床", "仕上げ": "フローリング", "品番": "XX-001"},
            {"部位": "壁", "仕上げ": "ビニルクロス", "品番": "YY-002"},
            ...
        ]
        """
        x, y = position_mm
        row_h = 200
        col_widths = [600, 1200, 1000]  # 部位 / 仕上げ / 品番
        total_w = sum(col_widths)
        header = ["部位", "仕上げ", "品番"]

        rows = [header] + [[f.get(k, "") for k in ["部位", "仕上げ", "品番"]] for f in finishes]

        for i, row in enumerate(rows):
            ry = y - i * row_h
            # 行の水平線
            self.msp.add_line(
                (x, ry), (x + total_w, ry),
                dxfattribs={"layer": "仕上げ"}
            )
            # セル
            cx = x
            for j, (cell, cw) in enumerate(zip(row, col_widths)):
                self.msp.add_text(
                    cell,
                    height=50 if i == 0 else 40,
                    dxfattribs={
                        "layer": "仕上げ",
                        "insert": (cx + cw / 2, ry - row_h / 2),
                    },
                ).set_placement(
                    (cx + cw / 2, ry - row_h / 2),
                    align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
                )
                # 縦線
                self.msp.add_line(
                    (cx, ry), (cx, ry - row_h),
                    dxfattribs={"layer": "仕上げ"}
                )
                cx += cw

            # 右端縦線
            self.msp.add_line(
                (x + total_w, ry), (x + total_w, ry - row_h),
                dxfattribs={"layer": "仕上げ"}
            )

        # 最下行の水平線
        self.msp.add_line(
            (x, y - len(rows) * row_h),
            (x + total_w, y - len(rows) * row_h),
            dxfattribs={"layer": "仕上げ"}
        )

    # =================== 図枠 ===================

    def add_title_block(self, position_mm, project_name, scale="1:50",
                        drawn_by="", date="", sheet="A3"):
        """図枠（タイトルブロック）"""
        x, y = position_mm
        w, h = 2800, 600

        # 枠
        self.msp.add_lwpolyline(
            [(x, y), (x + w, y), (x + w, y - h), (x, y - h), (x, y)],
            dxfattribs={"layer": "補助"}
        )

        # プロジェクト名
        self.msp.add_text(
            project_name,
            height=80,
            dxfattribs={"layer": "補助"},
        ).set_placement(
            (x + w / 2, y - 120),
            align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
        )

        # 縮尺
        self.msp.add_text(
            f"S={scale}",
            height=50,
            dxfattribs={"layer": "補助"},
        ).set_placement(
            (x + w / 2, y - 250),
            align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
        )

        # 作成者・日付
        info_text = f"{drawn_by}  {date}  {sheet}" if drawn_by else f"{date}  {sheet}"
        self.msp.add_text(
            info_text,
            height=35,
            dxfattribs={"layer": "補助"},
        ).set_placement(
            (x + w / 2, y - 380),
            align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
        )

    # =================== JSON読み込み ===================

    def from_blueprint_json(self, json_path):
        """blueprint-analysis JSON から図面を生成"""
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        project_name = data.get("project_name", "無題")
        room = data.get("room", {})
        width = room.get("width_mm", 5000)
        depth = room.get("depth_mm", 4000)
        height = room.get("ceiling_height_mm", CEILING_HEIGHT_MM)

        # 壁
        self.draw_room_walls(width, depth)

        # 建具
        for wall_data in data.get("walls", []):
            for opening in wall_data.get("openings", []):
                o_type = opening.get("type", "door")
                pos = opening.get("position_mm", 0)
                w = opening.get("width_mm", DOOR_WIDTH_MM if o_type == "door" else WINDOW_WIDTH_MM)

                # 壁の始点・終点を特定
                wall_start = (wall_data.get("start_x_mm", 0), wall_data.get("start_y_mm", 0))
                wall_end = (wall_data.get("end_x_mm", 0), wall_data.get("end_y_mm", 0))

                if o_type == "door":
                    self.draw_door(wall_start, wall_end, pos, w)
                elif o_type == "window":
                    self.draw_window(wall_start, wall_end, pos, w)

        # 什器
        for furn in data.get("fixtures", []) + data.get("furniture_suggestions", []):
            cx = furn.get("x_mm", furn.get("position_x_mm", 0))
            cy = furn.get("y_mm", furn.get("position_y_mm", 0))
            fw = furn.get("width_mm", 600)
            fd = furn.get("depth_mm", 600)
            rot = furn.get("rotation_deg", 0)
            name = furn.get("name", furn.get("type", ""))
            self.draw_furniture((cx, cy), fw, fd, rot, name)

        # 寸法線
        self.add_dimension((0, 0), (width, 0), -400)      # 下辺
        self.add_dimension((width, 0), (width, depth), 400) # 右辺
        self.add_dimension((0, depth), (0, 0), -400)       # 左辺
        self.add_dimension((0, depth), (width, depth), 400) # 上辺

        # 室名
        area_m2 = (width / 1000) * (depth / 1000)
        self.add_room_label((width / 2, depth / 2), project_name, area_m2)

        # 仕上げ表
        finishes = data.get("finishes", [])
        if finishes:
            self.add_finish_table((width + 500, depth), finishes)

        # 図枠
        self.add_title_block(
            (width + 500, -800),
            project_name,
            scale="1:50",
            date=data.get("date", ""),
        )

        return self

    def from_store_json(self, json_path):
        """Webアプリのエクスポート JSON (useEditorStore形式) から図面を生成"""
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        walls = data.get("walls", [])
        openings = data.get("openings", [])
        furniture = data.get("furniture", [])

        # 壁（メートル→mm変換）
        for wall in walls:
            s = wall["start"]
            e = wall["end"]
            thickness = wall.get("thickness", 0.12) * 1000
            self.draw_wall(
                (s["x"] * 1000, s["y"] * 1000),
                (e["x"] * 1000, e["y"] * 1000),
                thickness,
            )

        # 建具
        for op in openings:
            wall = next((w for w in walls if w["id"] == op.get("wallId")), None)
            if not wall:
                continue
            ws = (wall["start"]["x"] * 1000, wall["start"]["y"] * 1000)
            we = (wall["end"]["x"] * 1000, wall["end"]["y"] * 1000)
            pos = op.get("positionAlongWall", 0) * 1000
            w = op.get("width", 0.9) * 1000

            if op["type"] == "door":
                self.draw_door(ws, we, pos, w)
            else:
                self.draw_window(ws, we, pos, w)

        # 什器 (3D座標→2D: position[0]=x, position[2]=z=平面のy)
        for furn in furniture:
            pos = furn.get("position", [0, 0, 0])
            scale = furn.get("scale", [0.6, 0.6, 0.6])
            rot = furn.get("rotation", [0, 0, 0])
            rot_deg = math.degrees(rot[1]) if len(rot) > 1 else 0
            name = furn.get("name", furn.get("type", ""))

            self.draw_furniture(
                (pos[0] * 1000, pos[2] * 1000),  # x, z → 平面座標
                scale[0] * 1000,
                scale[2] * 1000,
                rot_deg,
                name,
            )

        # 寸法線（壁の全体バウンディングボックス）
        if walls:
            all_x = [w["start"]["x"] * 1000 for w in walls] + [w["end"]["x"] * 1000 for w in walls]
            all_y = [w["start"]["y"] * 1000 for w in walls] + [w["end"]["y"] * 1000 for w in walls]
            min_x, max_x = min(all_x), max(all_x)
            min_y, max_y = min(all_y), max(all_y)

            self.add_dimension((min_x, min_y), (max_x, min_y), -400)
            self.add_dimension((max_x, min_y), (max_x, max_y), 400)

            area = ((max_x - min_x) / 1000) * ((max_y - min_y) / 1000)
            self.add_room_label(
                ((min_x + max_x) / 2, (min_y + max_y) / 2),
                data.get("projectName", ""),
                area,
            )

        return self

    # =================== ヘルパー ===================

    def _find_wall_index(self, start_mm, end_mm):
        """壁の始点・終点からメタデータ配列のインデックスを検索"""
        for i, w in enumerate(self.meta["walls"]):
            ws, we = w["start"], w["end"]
            if (abs(ws[0] - start_mm[0]) < 1 and abs(ws[1] - start_mm[1]) < 1 and
                abs(we[0] - end_mm[0]) < 1 and abs(we[1] - end_mm[1]) < 1):
                return i
        return -1

    @staticmethod
    def _guess_furniture_height(name):
        """什器名から概算高さ(mm)を推定"""
        name_lower = name.lower() if name else ""
        if any(k in name_lower for k in ["カウンター", "counter"]):
            return 1050
        if any(k in name_lower for k in ["テーブル", "table", "デスク", "desk"]):
            return 720
        if any(k in name_lower for k in ["椅子", "chair", "チェア", "スツール", "stool"]):
            return 450
        if any(k in name_lower for k in ["棚", "shelf", "ラック", "rack"]):
            return 1800
        if any(k in name_lower for k in ["ソファ", "sofa"]):
            return 800
        return 750  # デフォルト

    # =================== 保存 ===================

    def save(self, filepath, save_meta=True):
        """DXF ファイルを保存（+ メタJSON）"""
        os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
        self.doc.saveas(filepath)
        print(f"DXF saved: {filepath}")

        if save_meta:
            meta_path = filepath + ".meta.json"
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(self.meta, f, ensure_ascii=False, indent=2)
            print(f"Meta saved: {meta_path}")

        return filepath


# =================== サンプル生成 ===================

def generate_sample(output_path):
    """サンプル内装図面を生成（動作確認用）"""
    gen = DXFGenerator()
    gen.meta["project_name"] = "サンプル店舗"
    gen.meta["ceiling_height_mm"] = 2700
    gen.meta["materials"] = {
        "floor": "floor_oak",
        "wall": "wall_white",
        "ceiling": "ceiling_white",
    }

    # 部屋: 5m × 4m
    w, d = 5000, 4000
    gen.draw_room_walls(w, d)

    # ドア: 下壁 左から1500mm位置
    gen.draw_door((0, 0), (w, 0), 1500, 900, swing="left")

    # 窓: 右壁 下から1000mm位置
    gen.draw_window((w, 0), (w, d), 1000, 1800)

    # カウンター
    gen.draw_furniture((1200, 3200), 2400, 600, 0, "カウンター")

    # テーブル×2
    gen.draw_furniture((1500, 1500), 800, 800, 0, "テーブル")
    gen.draw_furniture((3500, 1500), 800, 800, 0, "テーブル")

    # 椅子×4
    gen.draw_furniture((1100, 1500), 450, 450, 0, "椅子")
    gen.draw_furniture((1900, 1500), 450, 450, 0, "椅子")
    gen.draw_furniture((3100, 1500), 450, 450, 0, "椅子")
    gen.draw_furniture((3900, 1500), 450, 450, 0, "椅子")

    # 寸法線
    gen.add_dimension((0, 0), (w, 0), -400)
    gen.add_dimension((w, 0), (w, d), 400)

    # 室名
    gen.add_room_label((w / 2, d / 2), "店舗", (w / 1000) * (d / 1000))

    # 仕上げ表
    gen.add_finish_table((w + 500, d), [
        {"部位": "床", "仕上げ": "フローリング", "品番": "WD-001"},
        {"部位": "壁", "仕上げ": "ビニルクロス", "品番": "SP-102"},
        {"部位": "天井", "仕上げ": "岩綿吸音板", "品番": "RC-003"},
        {"部位": "巾木", "仕上げ": "ソフト巾木", "品番": "SB-050"},
    ])

    # 図枠
    gen.add_title_block(
        (w + 500, -800),
        "サンプル店舗 内装仕上げ図",
        scale="1:50",
        drawn_by="Claude Code",
        date="2026-03-17",
    )

    gen.save(output_path)
    print(f"サンプル図面生成完了: {output_path}")


# =================== CLI ===================

def main():
    parser = argparse.ArgumentParser(description="内装仕上げ工事用 DXF 図面生成")
    parser.add_argument("--json", help="blueprint-analysis JSON ファイルパス")
    parser.add_argument("--store-json", help="Webアプリ エクスポート JSON ファイルパス")
    parser.add_argument("--sample", action="store_true", help="サンプル図面を生成")
    parser.add_argument("--width", type=int, help="部屋幅 (mm)")
    parser.add_argument("--depth", type=int, help="部屋奥行 (mm)")
    parser.add_argument("--height", type=int, default=CEILING_HEIGHT_MM, help="天井高 (mm)")
    parser.add_argument("--name", default="内装図", help="プロジェクト名")
    parser.add_argument("-o", "--output", default="output/drawings/floor_plan.dxf", help="出力先")

    args = parser.parse_args()

    if args.sample:
        generate_sample(args.output)
    elif args.json:
        gen = DXFGenerator()
        gen.from_blueprint_json(args.json)
        gen.save(args.output)
    elif args.store_json:
        gen = DXFGenerator()
        gen.from_store_json(args.store_json)
        gen.save(args.output)
    elif args.width and args.depth:
        gen = DXFGenerator()
        gen.draw_room_walls(args.width, args.depth)
        gen.add_dimension((0, 0), (args.width, 0), -400)
        gen.add_dimension((args.width, 0), (args.width, args.depth), 400)
        area = (args.width / 1000) * (args.depth / 1000)
        gen.add_room_label((args.width / 2, args.depth / 2), args.name, area)
        gen.save(args.output)
    else:
        parser.print_help()
        print("\n例:")
        print("  python scripts/gen-dxf.py --sample")
        print("  python scripts/gen-dxf.py --json output/blueprint-analysis/project.json")
        print("  python scripts/gen-dxf.py --width 5000 --depth 4000 --name '店舗A'")


if __name__ == "__main__":
    main()
