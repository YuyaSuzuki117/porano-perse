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
            "rooms": [],       # {"name": str, "polygon_mm": [[x,y],...], "area_m2": float}
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

    # =================== ジオメトリユーティリティ ===================

    @staticmethod
    def offset_polygon(polygon, offset_mm):
        """ポリゴンを内側/外側にオフセット

        正のoffset_mm = 外側へ拡張、負のoffset_mm = 内側へ縮小
        polygon: [(x, y), ...] の閉じたポリゴン（時計回り前提）

        各辺を平行移動し、隣接辺の交点を求める。
        鋭角のコーナーではmiter制限を適用。

        Returns: list of (x, y) points
        """
        n = len(polygon)
        if n < 3:
            return list(polygon)

        # 各辺の法線方向にオフセットした直線を計算
        offset_edges = []
        for i in range(n):
            p0 = polygon[i]
            p1 = polygon[(i + 1) % n]
            dx = p1[0] - p0[0]
            dy = p1[1] - p0[1]
            length = math.sqrt(dx * dx + dy * dy)
            if length < 0.001:
                # 長さゼロの辺はスキップ（前の辺を再利用）
                if offset_edges:
                    offset_edges.append(offset_edges[-1])
                else:
                    offset_edges.append(((0, 0), (1, 0)))
                continue
            # 法線ベクトル（左手系: 時計回りポリゴンの外側方向）
            nx = -dy / length
            ny = dx / length
            # オフセット辺の2点
            op0 = (p0[0] + nx * offset_mm, p0[1] + ny * offset_mm)
            op1 = (p1[0] + nx * offset_mm, p1[1] + ny * offset_mm)
            offset_edges.append((op0, op1))

        # 隣接するオフセット辺の交点を求める
        result = []
        for i in range(n):
            edge_a = offset_edges[i]
            edge_b = offset_edges[(i + 1) % n]
            pt = DXFGenerator._line_intersection(
                edge_a[0], edge_a[1], edge_b[0], edge_b[1]
            )
            if pt is None:
                # 平行な辺の場合は端点を使用
                pt = edge_a[1]
            # miter制限: 元の頂点からの距離がoffsetの4倍を超えたら制限
            orig = polygon[(i + 1) % n]
            dist = math.sqrt((pt[0] - orig[0]) ** 2 + (pt[1] - orig[1]) ** 2)
            max_dist = abs(offset_mm) * 4
            if dist > max_dist and abs(offset_mm) > 0.001:
                # miter制限 — 元頂点方向に制限距離でクリップ
                scale = max_dist / dist
                pt = (
                    orig[0] + (pt[0] - orig[0]) * scale,
                    orig[1] + (pt[1] - orig[1]) * scale,
                )
            result.append(pt)

        return result

    @staticmethod
    def _line_intersection(p1, p2, p3, p4):
        """2つの直線（p1-p2, p3-p4）の交点を求める

        Returns: (x, y) または None（平行の場合）
        """
        x1, y1 = p1
        x2, y2 = p2
        x3, y3 = p3
        x4, y4 = p4

        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(denom) < 1e-10:
            return None  # 平行

        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
        ix = x1 + t * (x2 - x1)
        iy = y1 + t * (y2 - y1)
        return (ix, iy)

    @staticmethod
    def _polygon_centroid(polygon):
        """ポリゴンの重心を計算"""
        n = len(polygon)
        if n == 0:
            return (0, 0)
        cx = sum(p[0] for p in polygon) / n
        cy = sum(p[1] for p in polygon) / n
        return (cx, cy)

    @staticmethod
    def _polygon_area(polygon):
        """ポリゴンの面積を計算（Shoelace公式）"""
        n = len(polygon)
        if n < 3:
            return 0.0
        area = 0.0
        for i in range(n):
            j = (i + 1) % n
            area += polygon[i][0] * polygon[j][1]
            area -= polygon[j][0] * polygon[i][1]
        return abs(area) / 2.0

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

    def draw_polygon_walls(self, wall_segments):
        """任意形状の壁を描画（L字型・凸字型・不整形対応）

        wall_segments: list of dicts with:
          - start_x_mm, start_y_mm, end_x_mm, end_y_mm
          - thickness_mm (optional, default 120)
          - type: "exterior" | "interior" | "partition"
        """
        for seg in wall_segments:
            start = (seg["start_x_mm"], seg["start_y_mm"])
            end = (seg["end_x_mm"], seg["end_y_mm"])
            thickness = seg.get("thickness_mm", WALL_THICKNESS_MM)
            wall_type = seg.get("type", "exterior")

            # 壁タイプに応じた高さ
            if wall_type == "partition":
                height = self.meta["ceiling_height_mm"] - 300  # 間仕切りは天井まで届かない
            else:
                height = self.meta["ceiling_height_mm"]

            self.draw_wall(start, end, thickness, height)

    def draw_room_outline(self, polygon_mm, thickness_mm=WALL_THICKNESS_MM, room_name=""):
        """部屋の外形をオフセットポリラインで描画

        polygon_mm: list of (x, y) tuples forming closed polygon (時計回り)

        1. 壁芯をLWPOLYLINEで描画（壁芯レイヤー）
        2. 内側オフセットポリゴン → 壁レイヤー
        3. 外側オフセットポリゴン → 壁レイヤー
        4. 重心に室名ラベルを配置
        """
        if len(polygon_mm) < 3:
            return

        half_t = thickness_mm / 2.0

        # 壁芯を個別LINEとして描画（バリデーター/dxf-to-scene.py互換）
        n = len(polygon_mm)
        for i in range(n):
            p0 = polygon_mm[i]
            p1 = polygon_mm[(i + 1) % n]
            self.msp.add_line(
                p0, p1,
                dxfattribs={"layer": "壁芯"}
            )

        # 内側オフセットポリゴン（負のオフセット = 内側）
        inner = self.offset_polygon(polygon_mm, -half_t)
        inner_pts = inner + [inner[0]]
        self.msp.add_lwpolyline(
            inner_pts,
            dxfattribs={"layer": "壁"}
        )

        # 外側オフセットポリゴン（正のオフセット = 外側）
        outer = self.offset_polygon(polygon_mm, half_t)
        outer_pts = outer + [outer[0]]
        self.msp.add_lwpolyline(
            outer_pts,
            dxfattribs={"layer": "壁"}
        )

        # メタデータに壁セグメントを記録
        n = len(polygon_mm)
        for i in range(n):
            p0 = polygon_mm[i]
            p1 = polygon_mm[(i + 1) % n]
            self.meta["walls"].append({
                "start": list(p0),
                "end": list(p1),
                "thickness_mm": thickness_mm,
                "height_mm": self.meta["ceiling_height_mm"],
            })

        # 部屋のメタデータを記録
        centroid = self._polygon_centroid(polygon_mm)
        area_mm2 = self._polygon_area(polygon_mm)
        area_m2 = area_mm2 / 1_000_000.0
        self.meta["rooms"].append({
            "name": room_name,
            "polygon_mm": [list(p) for p in polygon_mm],
            "area_m2": round(area_m2, 2),
        })

        # 室名ラベル
        if room_name:
            self.add_room_label(centroid, room_name, area_m2)

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

    def draw_sliding_door(self, wall_start_mm, wall_end_mm, position_mm,
                          width_mm=900, panels=1, wall_thickness_mm=WALL_THICKNESS_MM):
        """引戸を描画（片引き/両引き）

        panels=1: 片引き戸（1枚パネルがスライド）
        panels=2: 両引き戸（2枚パネルが中央から左右に開く）
        """
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
            "type": "sliding_door",
            "position_mm": position_mm,
            "width_mm": width_mm,
            "height_mm": DOOR_HEIGHT_MM,
            "elevation_mm": 0,
            "panels": panels,
        })

        # 壁に沿った単位ベクトル・法線ベクトル
        ux, uy = dx / length, dy / length
        nx, ny = -uy, ux
        half_t = wall_thickness_mm / 2

        # 開口開始位置
        ox = sx + ux * position_mm
        oy = sy + uy * position_mm

        # 枠線（開口の両端）
        p1 = (ox - nx * half_t, oy - ny * half_t)
        p2 = (ox + nx * half_t, oy + ny * half_t)
        p3 = (ox + ux * width_mm - nx * half_t, oy + uy * width_mm - ny * half_t)
        p4 = (ox + ux * width_mm + nx * half_t, oy + uy * width_mm + ny * half_t)
        self.msp.add_line(p1, p2, dxfattribs={"layer": "建具"})
        self.msp.add_line(p3, p4, dxfattribs={"layer": "建具"})

        if panels == 1:
            # 片引き戸: 1枚のパネル矩形 + スライド方向矢印
            panel_thickness = wall_thickness_mm * 0.3  # パネル厚み表現
            # パネル（壁の中心線上に少しオフセット）
            panel_offset = panel_thickness / 2
            ps1 = (ox + nx * panel_offset, oy + ny * panel_offset)
            ps2 = (ox + ux * width_mm + nx * panel_offset, oy + uy * width_mm + ny * panel_offset)
            ps3 = (ox + ux * width_mm + nx * (panel_offset + panel_thickness),
                   oy + uy * width_mm + ny * (panel_offset + panel_thickness))
            ps4 = (ox + nx * (panel_offset + panel_thickness),
                   oy + ny * (panel_offset + panel_thickness))
            self.msp.add_lwpolyline(
                [ps1, ps2, ps3, ps4, ps1],
                dxfattribs={"layer": "建具"}
            )

            # スライド方向矢印（壁に沿った方向）
            arrow_y_offset = -panel_thickness * 2
            arrow_start = (ox + ux * (width_mm * 0.3) + nx * arrow_y_offset,
                           oy + uy * (width_mm * 0.3) + ny * arrow_y_offset)
            arrow_end = (ox + ux * (width_mm * 0.8) + nx * arrow_y_offset,
                         oy + uy * (width_mm * 0.8) + ny * arrow_y_offset)
            self.msp.add_line(arrow_start, arrow_end, dxfattribs={"layer": "建具"})
            # 矢先
            arrow_size = width_mm * 0.08
            ah1 = (arrow_end[0] - ux * arrow_size + nx * arrow_size * 0.5,
                   arrow_end[1] - uy * arrow_size + ny * arrow_size * 0.5)
            ah2 = (arrow_end[0] - ux * arrow_size - nx * arrow_size * 0.5,
                   arrow_end[1] - uy * arrow_size - ny * arrow_size * 0.5)
            self.msp.add_line(arrow_end, ah1, dxfattribs={"layer": "建具"})
            self.msp.add_line(arrow_end, ah2, dxfattribs={"layer": "建具"})

        elif panels == 2:
            # 両引き戸: 2枚のパネルが中央から左右に開く
            panel_thickness = wall_thickness_mm * 0.3
            half_w = width_mm / 2
            # 左パネル（中心線の上側）
            po1 = panel_thickness * 0.3
            for side, sign in [(1, 1), (-1, -1)]:
                # 各パネル
                panel_start_offset = 0 if sign == -1 else half_w
                panel_end_offset = half_w if sign == -1 else width_mm
                po = po1 * sign
                pp1 = (ox + ux * panel_start_offset + nx * po,
                       oy + uy * panel_start_offset + ny * po)
                pp2 = (ox + ux * panel_end_offset + nx * po,
                       oy + uy * panel_end_offset + ny * po)
                pp3 = (ox + ux * panel_end_offset + nx * (po + panel_thickness * sign),
                       oy + uy * panel_end_offset + ny * (po + panel_thickness * sign))
                pp4 = (ox + ux * panel_start_offset + nx * (po + panel_thickness * sign),
                       oy + uy * panel_start_offset + ny * (po + panel_thickness * sign))
                self.msp.add_lwpolyline(
                    [pp1, pp2, pp3, pp4, pp1],
                    dxfattribs={"layer": "建具"}
                )

            # 中央の合わせ線
            center_pt1 = (ox + ux * half_w - nx * half_t,
                          oy + uy * half_w - ny * half_t)
            center_pt2 = (ox + ux * half_w + nx * half_t,
                          oy + uy * half_w + ny * half_t)
            self.msp.add_line(center_pt1, center_pt2,
                              dxfattribs={"layer": "建具", "linetype": "DASHED"})

    def draw_opening(self, wall_start_mm, wall_end_mm, position_mm,
                     width_mm=900, wall_thickness_mm=WALL_THICKNESS_MM):
        """壁開口（ドアなし）を描画

        壁にドアや窓のない単なる開口部を描く。
        枠線のみで、扉パネルや円弧は描かない。
        """
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
            "type": "opening",
            "position_mm": position_mm,
            "width_mm": width_mm,
            "height_mm": self.meta["ceiling_height_mm"],
            "elevation_mm": 0,
        })

        # 壁に沿った単位ベクトル・法線ベクトル
        ux, uy = dx / length, dy / length
        nx, ny = -uy, ux
        half_t = wall_thickness_mm / 2

        # 開口開始位置
        ox = sx + ux * position_mm
        oy = sy + uy * position_mm

        # 枠線（開口の両端に壁厚方向の線を描画）
        p1 = (ox - nx * half_t, oy - ny * half_t)
        p2 = (ox + nx * half_t, oy + ny * half_t)
        p3 = (ox + ux * width_mm - nx * half_t, oy + uy * width_mm - ny * half_t)
        p4 = (ox + ux * width_mm + nx * half_t, oy + uy * width_mm + ny * half_t)

        self.msp.add_line(p1, p2, dxfattribs={"layer": "建具"})
        self.msp.add_line(p3, p4, dxfattribs={"layer": "建具"})

        # 開口部の破線表現（壁がないことを示す）
        # 壁の内側・外側ラインに沿って破線を描画
        inner1 = (ox + nx * half_t, oy + ny * half_t)
        inner2 = (ox + ux * width_mm + nx * half_t, oy + uy * width_mm + ny * half_t)
        outer1 = (ox - nx * half_t, oy - ny * half_t)
        outer2 = (ox + ux * width_mm - nx * half_t, oy + uy * width_mm - ny * half_t)
        self.msp.add_line(inner1, inner2,
                          dxfattribs={"layer": "建具", "linetype": "DASHED"})
        self.msp.add_line(outer1, outer2,
                          dxfattribs={"layer": "建具", "linetype": "DASHED"})

    def draw_folding_door(self, wall_start_mm, wall_end_mm, position_mm,
                          width_mm=1800, panels=4, wall_thickness_mm=WALL_THICKNESS_MM):
        """折戸を描画

        折戸はジグザグに折りたたまれるパネルで表現。
        panels: パネル枚数（偶数推奨、2/4/6が一般的）
        """
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
            "type": "folding_door",
            "position_mm": position_mm,
            "width_mm": width_mm,
            "height_mm": DOOR_HEIGHT_MM,
            "elevation_mm": 0,
            "panels": panels,
        })

        # 壁に沿った単位ベクトル・法線ベクトル
        ux, uy = dx / length, dy / length
        nx, ny = -uy, ux
        half_t = wall_thickness_mm / 2

        # 開口開始位置
        ox = sx + ux * position_mm
        oy = sy + uy * position_mm

        # 枠線（開口の両端）
        p1 = (ox - nx * half_t, oy - ny * half_t)
        p2 = (ox + nx * half_t, oy + ny * half_t)
        p3 = (ox + ux * width_mm - nx * half_t, oy + uy * width_mm - ny * half_t)
        p4 = (ox + ux * width_mm + nx * half_t, oy + uy * width_mm + ny * half_t)
        self.msp.add_line(p1, p2, dxfattribs={"layer": "建具"})
        self.msp.add_line(p3, p4, dxfattribs={"layer": "建具"})

        # 折戸パネルをジグザグで描画
        panel_width = width_mm / panels
        fold_depth = wall_thickness_mm * 0.8  # 折り畳み時の奥行き表現

        points = []
        for i in range(panels + 1):
            along = panel_width * i
            # 偶数頂点は壁面上、奇数頂点は壁面から突出
            if i % 2 == 0:
                pt = (ox + ux * along, oy + uy * along)
            else:
                pt = (ox + ux * along + nx * fold_depth,
                      oy + uy * along + ny * fold_depth)
            points.append(pt)

        # ジグザグ線を描画
        for i in range(len(points) - 1):
            self.msp.add_line(points[i], points[i + 1],
                              dxfattribs={"layer": "建具"})

        # パネル境界の丸印（ヒンジ位置）
        hinge_radius = 15  # ヒンジ記号の半径
        for i in range(1, panels):
            along = panel_width * i
            if i % 2 == 0:
                hinge_center = (ox + ux * along, oy + uy * along)
            else:
                hinge_center = (ox + ux * along + nx * fold_depth,
                                oy + uy * along + ny * fold_depth)
            self.msp.add_circle(hinge_center, hinge_radius,
                                dxfattribs={"layer": "建具"})

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

    def add_chain_dimensions(self, points_mm, offset_mm=300, direction="horizontal"):
        """連続寸法線（区間寸法 + 全体寸法）

        points_mm: list of (x, y) breakpoints along a dimension chain
        offset_mm: 寸法線の壁からのオフセット距離
        direction: "horizontal" | "vertical"

        区間寸法を第1列に、全体寸法を第2列（さらにオフセット）に描画。
        """
        if len(points_mm) < 2:
            return

        # 区間寸法（隣接する点のペア）
        for i in range(len(points_mm) - 1):
            self.add_dimension(points_mm[i], points_mm[i + 1], offset_mm)

        # 全体寸法（始点〜終点、さらに外側にオフセット）
        if len(points_mm) > 2:
            overall_offset = offset_mm + (400 if offset_mm > 0 else -400)
            self.add_dimension(points_mm[0], points_mm[-1], overall_offset)

    # =================== 室名 ===================

    def add_room_label(self, position_mm, name, area_m2=None):
        """室名ラベルを追加"""
        text = name
        if area_m2 is not None:
            text += f"\n{area_m2:.1f}m\u00B2"

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
        """blueprint-analysis JSON から図面を生成

        新旧両方のJSON形式に対応:
        - 旧形式: room.width_mm/depth_mm ベースの矩形部屋
        - 新形式: walls配列 + rooms配列による任意形状対応
        """
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        project_name = data.get("project_name", "無題")
        self.meta["project_name"] = project_name

        # 新形式の判定: walls配列にidがあるか、roomsにwall_idsがあるか
        walls_data = data.get("walls", [])
        rooms_data = data.get("rooms", [])
        has_new_format = (
            len(walls_data) > 0 and
            isinstance(walls_data[0], dict) and
            "id" in walls_data[0]
        )

        if has_new_format:
            # --- 新形式: walls + rooms による複雑レイアウト ---
            self._from_blueprint_new_format(data, walls_data, rooms_data, project_name)
        else:
            # --- 旧形式: 矩形部屋ベース（後方互換） ---
            self._from_blueprint_legacy_format(data, project_name)

        return self

    def _from_blueprint_new_format(self, data, walls_data, rooms_data, project_name):
        """新形式のblueprint JSONを処理

        walls配列の各壁を描画し、openingsから建具を配置。
        rooms配列から室名ラベルを配置。
        """
        # 壁IDから壁データへのマップ
        wall_map = {}
        for wall_data in walls_data:
            wid = wall_data.get("id", "")
            wall_map[wid] = wall_data

            wall_start = (wall_data.get("start_x_mm", 0), wall_data.get("start_y_mm", 0))
            wall_end = (wall_data.get("end_x_mm", 0), wall_data.get("end_y_mm", 0))
            thickness = wall_data.get("thickness_mm", WALL_THICKNESS_MM)
            wall_type = wall_data.get("type", "exterior")

            # 壁タイプに応じた高さ
            if wall_type == "partition":
                height = self.meta["ceiling_height_mm"] - 300
            else:
                height = self.meta["ceiling_height_mm"]

            # 壁を描画
            self.draw_wall(wall_start, wall_end, thickness, height)

            # 壁上の開口部（建具）を描画
            for opening in wall_data.get("openings", []):
                self._draw_opening_from_data(
                    wall_start, wall_end, opening, thickness
                )

        # 部屋の室名ラベル
        for room in rooms_data:
            room_name = room.get("name", "")
            center = room.get("center_mm")
            area = room.get("area_m2")

            # centerが指定されていない場合、wall_idsからポリゴンを構築して重心を計算
            if center is None and "wall_ids" in room:
                polygon = self._build_room_polygon(room["wall_ids"], wall_map)
                if polygon:
                    center = list(self._polygon_centroid(polygon))
                    if area is None:
                        area = self._polygon_area(polygon) / 1_000_000.0

                    # 部屋メタデータを記録
                    self.meta["rooms"].append({
                        "name": room_name,
                        "polygon_mm": [list(p) for p in polygon],
                        "area_m2": round(area, 2) if area else None,
                    })

            if center and room_name:
                self.add_room_label(tuple(center), room_name, area)

        # 什器
        for furn in data.get("fixtures", []) + data.get("furniture_suggestions", []):
            cx = furn.get("x_mm", furn.get("position_x_mm", furn.get("center_x_mm", 0)))
            cy = furn.get("y_mm", furn.get("position_y_mm", furn.get("center_y_mm", 0)))
            # center_mmフィールドにも対応
            if "center_mm" in furn:
                cx, cy = furn["center_mm"][0], furn["center_mm"][1]
            fw = furn.get("width_mm", 600)
            fd = furn.get("depth_mm", 600)
            rot = furn.get("rotation_deg", 0)
            name = furn.get("name", furn.get("type", ""))
            self.draw_furniture((cx, cy), fw, fd, rot, name)

        # 寸法線（全壁のバウンディングボックス）
        all_x = []
        all_y = []
        for w in walls_data:
            all_x.extend([w.get("start_x_mm", 0), w.get("end_x_mm", 0)])
            all_y.extend([w.get("start_y_mm", 0), w.get("end_y_mm", 0)])

        if all_x and all_y:
            min_x, max_x = min(all_x), max(all_x)
            min_y, max_y = min(all_y), max(all_y)
            self.add_dimension((min_x, min_y), (max_x, min_y), -400)
            self.add_dimension((max_x, min_y), (max_x, max_y), 400)
            self.add_dimension((min_x, max_y), (min_x, min_y), -400)
            self.add_dimension((min_x, max_y), (max_x, max_y), 400)

        # dimensions_extracted があれば追加の寸法線を描画
        for dim_data in data.get("dimensions_extracted", []):
            p1 = dim_data.get("p1_mm")
            p2 = dim_data.get("p2_mm")
            if p1 and p2:
                self.add_dimension(tuple(p1), tuple(p2), 300)

        # 仕上げ表
        finishes = data.get("finishes", [])
        if finishes and all_x:
            self.add_finish_table((max(all_x) + 500, max(all_y)), finishes)

        # 図枠
        if all_x:
            self.add_title_block(
                (max(all_x) + 500, min(all_y) - 200),
                project_name,
                scale="1:50",
                date=data.get("date", ""),
            )

    def _from_blueprint_legacy_format(self, data, project_name):
        """旧形式のblueprint JSONを処理（後方互換）"""
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

        # 部屋メタデータ
        self.meta["rooms"].append({
            "name": project_name,
            "polygon_mm": [[0, 0], [width, 0], [width, depth], [0, depth]],
            "area_m2": round(area_m2, 2),
        })

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

    def _draw_opening_from_data(self, wall_start, wall_end, opening, wall_thickness):
        """開口部データから適切な建具描画メソッドを呼び出す"""
        o_type = opening.get("type", "door")
        pos = opening.get("position_mm", 0)
        width = opening.get("width_mm", DOOR_WIDTH_MM)

        if o_type == "door":
            swing = opening.get("swing", "left")
            height = opening.get("height_mm", DOOR_HEIGHT_MM)
            self.draw_door(wall_start, wall_end, pos, width, height, swing, wall_thickness)

        elif o_type == "sliding_door":
            panels = opening.get("panels", 1)
            self.draw_sliding_door(wall_start, wall_end, pos, width, panels, wall_thickness)

        elif o_type == "folding_door":
            panels = opening.get("panels", 4)
            self.draw_folding_door(wall_start, wall_end, pos, width, panels, wall_thickness)

        elif o_type == "opening":
            self.draw_opening(wall_start, wall_end, pos, width, wall_thickness)

        elif o_type == "window":
            w_width = opening.get("width_mm", WINDOW_WIDTH_MM)
            w_height = opening.get("height_mm", WINDOW_HEIGHT_MM)
            sill = opening.get("sill_mm", WINDOW_SILL_MM)
            self.draw_window(wall_start, wall_end, pos, w_width, w_height, sill, wall_thickness)

    def _build_room_polygon(self, wall_ids, wall_map):
        """wall_idsのリストから部屋のポリゴン（頂点リスト）を構築

        壁の始点→終点を順番に辿ってポリゴンを作る。
        wall_idsの順番が正しい前提で、各壁の始点を頂点として収集。
        """
        if not wall_ids:
            return []

        polygon = []
        for wid in wall_ids:
            wall = wall_map.get(wid)
            if wall is None:
                continue
            start = (wall.get("start_x_mm", 0), wall.get("start_y_mm", 0))
            polygon.append(start)

        return polygon if len(polygon) >= 3 else []

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
            elif op["type"] == "sliding_door":
                panels = op.get("panels", 1)
                self.draw_sliding_door(ws, we, pos, w, panels)
            elif op["type"] == "folding_door":
                panels = op.get("panels", 4)
                self.draw_folding_door(ws, we, pos, w, panels)
            elif op["type"] == "opening":
                self.draw_opening(ws, we, pos, w)
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

    # =================== ビュー設定 ===================

    def _set_view_extents(self):
        """DXFのヘッダーにLIMITSとビュー範囲を設定。
        JW_CADで開いた時に全体表示されるようにする。
        """
        # 壁メタデータから範囲を計算
        if not self.meta["walls"]:
            return

        xs, ys = [], []
        for w in self.meta["walls"]:
            s, e = w["start"], w["end"]
            xs.extend([s[0], e[0]])
            ys.extend([s[1], e[1]])

        if not xs:
            return

        margin = 500  # 500mm余白
        min_x = min(xs) - margin
        min_y = min(ys) - margin
        max_x = max(xs) + margin
        max_y = max(ys) + margin

        # HEADER変数でLIMITSを設定
        self.doc.header["$LIMMIN"] = (min_x, min_y)
        self.doc.header["$LIMMAX"] = (max_x, max_y)
        self.doc.header["$EXTMIN"] = (min_x, min_y, 0)
        self.doc.header["$EXTMAX"] = (max_x, max_y, 0)

        # アクティブビューポートの中心とサイズ
        center_x = (min_x + max_x) / 2
        center_y = (min_y + max_y) / 2
        width = max_x - min_x
        height = max_y - min_y
        view_size = max(width, height)

        # *Active ビューポート設定
        try:
            vp_table = self.doc.viewports
            for vp in vp_table:
                if vp.dxf.name == "*Active":
                    vp.dxf.center = (center_x, center_y)
                    vp.dxf.height = view_size
                    vp.dxf.width = view_size
                    break
        except Exception:
            pass  # ビューポートテーブルがない場合はスキップ

    # =================== 保存 ===================

    def save(self, filepath, save_meta=True):
        """DXF ファイルを保存（+ メタJSON）"""
        os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)

        # 全エンティティのバウンディングボックスを計算してビュー設定
        self._set_view_extents()

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
        gen.meta["source_json"] = os.path.abspath(args.json)
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
