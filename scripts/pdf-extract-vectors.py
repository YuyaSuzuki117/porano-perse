"""
PDF ベクターグラフィック抽出スクリプト — 建築図面用

CAD生成PDF (JW_CAD, AutoCAD) からベクター要素を直接抽出し、
gen-dxf.py の from_blueprint_json() 互換JSONを出力する。

2パス読み取りプロトコル準拠:
  Pass 1: 全体構造（外形寸法・室名・建具数・什器数）
  Pass 2: 詳細抽出（壁座標・建具詳細・什器配置）

使い方:
  # 基本抽出
  python scripts/pdf-extract-vectors.py input.pdf -o output/blueprint-analysis/project.json

  # 縮尺指定・デバッグ出力
  python scripts/pdf-extract-vectors.py input.pdf --scale 1:50 --page 0 -o output.json --debug

  # gen-dxf.py へパイプ
  python scripts/pdf-extract-vectors.py input.pdf -o project.json && \\
  python scripts/gen-dxf.py --json project.json -o project.dxf

依存: PyMuPDF (fitz)
  pip install PyMuPDF
"""

import argparse
import json
import math
import os
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Optional

try:
    import fitz  # PyMuPDF
except ImportError:
    print("エラー: PyMuPDF が必要です。  pip install PyMuPDF", file=sys.stderr)
    sys.exit(1)

# OpenCV + NumPy (ラスター壁検証用、オプショナル)
try:
    import cv2
    import numpy as np
    _HAS_CV2 = True
except ImportError:
    _HAS_CV2 = False

# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------

PT_TO_MM = 25.4 / 72.0  # 1pt = 0.3528mm

# 一般的な建具寸法 (mm) — スケール検出のフォールバック基準
DOOR_WIDTH_REF_MM = 900
DOOR_HEIGHT_REF_MM = 2100
WINDOW_WIDTH_REF_MM = 1800

# 壁厚判定 (スケール後mm) — 日本の一般的な壁: 100-150mm
# 70→95に引き上げ: 83-84mmの什器輪郭線ペアが壁として誤検出されるのを防止
WALL_THICKNESS_MIN_MM = 95
WALL_THICKNESS_MAX_MM = 180
WALL_THICKNESS_DEFAULT_MM = 120

# 壁端点スナップ距離 (mm) — この距離以内の端点は同一点に統合
SNAP_THRESHOLD_MM = 40

# 線幅分類: 3段階 (tier1=外壁, tier2=内壁, tier3=細線/寸法)
# 動的クラスタリングで決定するが、フォールバック閾値
LINE_WIDTH_TIER1_MIN = 0.30   # これ以上 = 外壁候補 (最太線)
LINE_WIDTH_TIER2_MIN = 0.15   # これ以上 = 内壁候補
# tier2_min 未満 = 細線/寸法線

# 引戸検出: 壁線上の平行線ペア間距離 (mm)
SLIDING_DOOR_GAP_MIN_MM = 60
SLIDING_DOOR_GAP_MAX_MM = 150
SLIDING_DOOR_LENGTH_MIN_MM = 650
SLIDING_DOOR_LENGTH_MAX_MM = 1300

# 折戸検出: ジグザグパターンの角度範囲 (度)
FOLDING_DOOR_ANGLE_MIN = 30
FOLDING_DOOR_ANGLE_MAX = 150

# 開口検出: 壁線ギャップの最小/最大 (mm)
OPENING_GAP_MIN_MM = 400
OPENING_GAP_MAX_MM = 3000

# 寸法線端点探索半径 (mm, PDF座標系)
DIM_ENDPOINT_SEARCH_RADIUS_MM = 15.0

# 引出線（extension line）の最大長 (mm, PDF座標系)
DIM_EXTENSION_LINE_MAX_MM = 30.0

# 日本語室名パターン
ROOM_NAME_PATTERNS = [
    # 商業施設
    "店舗", "客席", "厨房", "トイレ", "便所", "洗面", "脱衣",
    "事務所", "倉庫", "バックヤード", "ホール", "廊下", "階段",
    "玄関", "エントランス", "受付", "待合", "控室", "休憩室",
    "個室", "VIPルーム", "カウンター", "バー", "ラウンジ",
    # 住宅
    "和室", "洋室", "寝室", "リビング", "ダイニング", "キッチン",
    "浴室", "PS", "EPS", "DS", "MB", "EV", "機械室", "電気室",
    "更衣室", "シャワー", "パントリー", "給湯室", "会議室",
    # ナイト業態/飲食
    "通路", "前室", "クローク", "ＢＲ", "BR",
    "ＷＣ", "WC", "Ｇ-ＷＣ", "Ｓ-ＷＣ",
    "ＤＪ", "DJ", "ブース", "ステージ",
    "ボトル", "ドリンク", "レセプション", "ﾚｾﾌﾟｼｮﾝ",
    "キャッシャー", "レジ",
    # エリア表記
    "ENT", "AD",
    # 設備室
    "収納",
]

# 寸法テキストの正規表現 (例: "5,000", "900", "1800", "3.5m")
DIM_TEXT_RE = re.compile(
    r"^[\s]*(\d{1,2}[,，]\d{3}|\d{3,5})[\s]*$"
)

# よくある縮尺
COMMON_SCALES = {
    "1:20": 20, "1:30": 30, "1:40": 40, "1:50": 50,
    "1:60": 60, "1:75": 75, "1:100": 100, "1:200": 200,
}

# JW_CAD 標準色マッピング — (r, g, b) 0-1 → レイヤー種別
# 色の一致判定にはカラー距離を使う (完全一致でなくてよい)
JWCAD_COLOR_MAP: list[tuple[tuple[float, float, float], str]] = [
    # (色, 分類ラベル)
    ((0.0, 0.0, 0.0), "wall"),        # 黒 → 壁線
    ((1.0, 1.0, 1.0), "wall"),        # 白 → 壁線
    ((1.0, 0.0, 0.0), "wall_center"), # 赤 → 壁芯
    ((0.0, 1.0, 0.0), "fixture"),     # 緑 → 建具
    ((0.0, 0.5, 0.0), "fixture"),     # 暗緑 → 建具
    ((0.0, 0.0, 1.0), "furniture"),   # 青 → 什器
    ((1.0, 1.0, 0.0), "dimension"),   # 黄 → 寸法線
    ((0.0, 1.0, 1.0), "finish"),      # シアン → 仕上げ
    ((1.0, 0.0, 1.0), "room_name"),   # マゼンタ → 室名
]

# 色距離の許容値 (0-1スケールのユークリッド距離)
COLOR_MATCH_THRESHOLD = 0.25


# ---------------------------------------------------------------------------
# ユーティリティ
# ---------------------------------------------------------------------------

def pt_to_mm(val: float) -> float:
    """PDF ポイント → mm"""
    return val * PT_TO_MM


def distance(p1: tuple, p2: tuple) -> float:
    """2点間距離"""
    return math.hypot(p2[0] - p1[0], p2[1] - p1[1])


def midpoint(p1: tuple, p2: tuple) -> tuple:
    return ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)


def angle_deg(p1: tuple, p2: tuple) -> float:
    """p1→p2 の角度 (度)"""
    return math.degrees(math.atan2(p2[1] - p1[1], p2[0] - p1[0]))


def is_horizontal(p1: tuple, p2: tuple, tol_deg: float = 5.0) -> bool:
    a = abs(angle_deg(p1, p2)) % 180
    return a < tol_deg or a > (180 - tol_deg)


def is_vertical(p1: tuple, p2: tuple, tol_deg: float = 5.0) -> bool:
    a = abs(angle_deg(p1, p2)) % 180
    return abs(a - 90) < tol_deg


def lines_are_parallel(l1_p1, l1_p2, l2_p1, l2_p2, tol_deg: float = 5.0) -> bool:
    a1 = angle_deg(l1_p1, l1_p2) % 180
    a2 = angle_deg(l2_p1, l2_p2) % 180
    diff = abs(a1 - a2)
    return diff < tol_deg or abs(diff - 180) < tol_deg


def _is_axis_aligned(line: "RawLine", tolerance_deg: float = 5.0) -> bool:
    """Check if a line is roughly horizontal or vertical."""
    return (is_horizontal(line.p1, line.p2, tolerance_deg)
            or is_vertical(line.p1, line.p2, tolerance_deg))


def perpendicular_distance(point: tuple, line_p1: tuple, line_p2: tuple) -> float:
    """点と直線の距離"""
    dx = line_p2[0] - line_p1[0]
    dy = line_p2[1] - line_p1[1]
    length = math.hypot(dx, dy)
    if length < 1e-9:
        return distance(point, line_p1)
    return abs(dy * point[0] - dx * point[1] + line_p2[0] * line_p1[1] - line_p2[1] * line_p1[0]) / length


def project_point_on_line(point: tuple, line_p1: tuple, line_p2: tuple, *, clamp: bool = True) -> tuple:
    """点を直線上に投影した座標を返す。clamp=Falseで無限直線への投影"""
    dx = line_p2[0] - line_p1[0]
    dy = line_p2[1] - line_p1[1]
    length_sq = dx * dx + dy * dy
    if length_sq < 1e-18:
        return line_p1
    t = ((point[0] - line_p1[0]) * dx + (point[1] - line_p1[1]) * dy) / length_sq
    if clamp:
        t = max(0.0, min(1.0, t))
    return (line_p1[0] + t * dx, line_p1[1] + t * dy)


def parse_dim_text(text: str) -> Optional[float]:
    """寸法テキストをmm値に変換。
    "5,000" → 5000.0, "900" → 900.0, "1800" → 1800.0
    """
    text = text.strip()
    # カンマ区切り (例: "5,000")
    m = re.match(r"^(\d{1,2})[,，](\d{3})$", text)
    if m:
        return float(m.group(1) + m.group(2))
    # 3-5桁の数値
    m = re.match(r"^(\d{3,5})$", text)
    if m:
        return float(m.group(1))
    return None


def flip_y(y: float, page_height: float) -> float:
    """PDF座標系 (原点=左下) → 一般座標系 (原点=左上) のY反転"""
    return page_height - y


def color_distance(c1: tuple, c2: tuple) -> float:
    """RGB色空間でのユークリッド距離 (0-1スケール)"""
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(c1, c2)))


def classify_color(color: tuple) -> Optional[str]:
    """JW_CAD標準色マッピングで色を分類。一致しなければNone"""
    if color is None:
        return None
    best_label = None
    best_dist = COLOR_MATCH_THRESHOLD
    for ref_color, label in JWCAD_COLOR_MAP:
        d = color_distance(color, ref_color)
        if d < best_dist:
            best_dist = d
            best_label = label
    return best_label


def normalize_line_direction(p1: tuple, p2: tuple) -> tuple:
    """線の向きを正規化: 左→右 (同じxなら上→下)"""
    if p1[0] > p2[0] or (abs(p1[0] - p2[0]) < 1e-6 and p1[1] > p2[1]):
        return p2, p1
    return p1, p2


def shoelace_area(polygon: list[tuple]) -> float:
    """Shoelace公式で多角形の面積を計算 (mm^2)"""
    n = len(polygon)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += polygon[i][0] * polygon[j][1]
        area -= polygon[j][0] * polygon[i][1]
    return abs(area) / 2.0


def line_intersection(p1: tuple, p2: tuple, p3: tuple, p4: tuple) -> Optional[tuple]:
    """2直線 (p1-p2) と (p3-p4) の交点を返す。平行なら None。
    直線の延長上も含む（線分ではなく直線として計算）。
    """
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-9:
        return None  # 平行
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    ix = x1 + t * (x2 - x1)
    iy = y1 + t * (y2 - y1)
    return (ix, iy)


def point_in_polygon(point: tuple, polygon: list[tuple]) -> bool:
    """Ray casting法で点が多角形内にあるか判定"""
    x, y = point
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


# ---------------------------------------------------------------------------
# RawElement: PDFから抽出した生データ
# ---------------------------------------------------------------------------

class RawLine:
    __slots__ = ("p1", "p2", "width", "color")

    def __init__(self, p1: tuple, p2: tuple, width: float, color: tuple):
        self.p1 = p1  # (x, y) in mm
        self.p2 = p2
        self.width = width  # line width in mm
        self.color = color  # (r, g, b) 0-1

    @property
    def length(self) -> float:
        return distance(self.p1, self.p2)

    def __repr__(self) -> str:
        return f"Line({self.p1}->{self.p2}, w={self.width:.2f})"


class RawArc:
    __slots__ = ("center", "radius", "start_angle", "end_angle", "width", "color")

    def __init__(self, center: tuple, radius: float, start_angle: float,
                 end_angle: float, width: float, color: tuple):
        self.center = center
        self.radius = radius
        self.start_angle = start_angle
        self.end_angle = end_angle
        self.width = width
        self.color = color


class RawRect:
    __slots__ = ("x", "y", "w", "h", "fill", "stroke_width", "color")

    def __init__(self, x: float, y: float, w: float, h: float,
                 fill, stroke_width: float, color: tuple):
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.fill = fill
        self.stroke_width = stroke_width
        self.color = color


class RawText:
    __slots__ = ("text", "origin", "size", "font", "color")

    def __init__(self, text: str, origin: tuple, size: float, font: str, color: tuple):
        self.text = text
        self.origin = origin  # (x, y) in mm
        self.size = size  # font size in mm
        self.font = font
        self.color = color


# ---------------------------------------------------------------------------
# PDFVectorExtractor: メインクラス
# ---------------------------------------------------------------------------

class PDFVectorExtractor:
    """PyMuPDF を使ってCAD生成PDFからベクター要素を抽出する"""

    def __init__(self, pdf_path: str, page_num: int = 0,
                 manual_scale: Optional[str] = None, debug: bool = False):
        self.pdf_path = pdf_path
        self.page_num = page_num
        self.manual_scale = manual_scale
        self.debug = debug

        # 生データ
        self.lines: list[RawLine] = []
        self.arcs: list[RawArc] = []
        self.rects: list[RawRect] = []
        self.texts: list[RawText] = []
        self.curves: list = []  # ベジェ曲線 (分類未使用、保持のみ)

        # 解析結果
        self.scale_factor: float = 1.0  # PDF距離 → 実寸mm の変換係数
        self.scale_label: str = "unknown"
        self.confidence: float = 0.0
        self.page_width_mm: float = 0.0
        self.page_height_mm: float = 0.0

        # 分類済み要素
        self.wall_lines: list[RawLine] = []
        self.wall_pairs: list[dict] = []  # {"line1": .., "line2": .., "thickness_mm": ..}
        self.dim_lines: list[RawLine] = []
        self.dim_texts: list[dict] = []  # {"text": .., "value_mm": .., "origin": ..}
        self.door_arcs: list[dict] = []
        self.sliding_doors: list[dict] = []  # 引戸
        self.folding_doors: list[dict] = []  # 折戸
        self.openings: list[dict] = []  # 開口
        self.window_groups: list[dict] = []
        self.furniture_rects: list[dict] = []
        self._fixture_texts: list[dict] = []  # テキストベース什器
        self.room_names: list[dict] = []

        # 壁接続グラフ
        self.wall_graph: dict[int, list[str]] = {}  # 端点ハッシュ → [壁ID]
        self.wall_endpoint_map: dict[str, tuple] = {}  # 壁ID → (snapped_start, snapped_end)
        self.exterior_wall_lines: list[RawLine] = []  # tier1最太線
        self.exterior_polygon: Optional[list[tuple]] = None  # 外壁輪郭ポリゴン (mm)

        # 出力
        self.walls: list[dict] = []
        self.rooms: list[dict] = []
        self.fixtures: list[dict] = []
        self.dimensions: list[dict] = []
        self.warnings: list[str] = []

    # -----------------------------------------------------------------------
    # Phase 0: PDF読み込み・ベクター抽出
    # -----------------------------------------------------------------------

    def extract(self) -> "PDFVectorExtractor":
        """PDF からベクター要素を抽出する (メインエントリポイント)"""
        doc = fitz.open(self.pdf_path)

        if self.page_num >= len(doc):
            raise ValueError(f"ページ {self.page_num} は存在しません (全{len(doc)}ページ)")

        page = doc[self.page_num]
        self.page_width_mm = pt_to_mm(page.rect.width)
        self.page_height_mm = pt_to_mm(page.rect.height)

        if self.debug:
            print(f"[DEBUG] ページサイズ: {self.page_width_mm:.1f} x {self.page_height_mm:.1f} mm")

        # スキャン画像PDFの検出
        images = page.get_images()
        drawings = page.get_drawings()
        text_page = page.get_text("dict")

        if not drawings and images:
            self.warnings.append(
                "ベクターデータなし（スキャン画像PDF）。Gemini Visionでの分析を推奨。"
            )
            doc.close()
            return self

        # パス（描画操作）の抽出
        self._extract_paths(drawings, page.rect.height)

        # テキストの抽出
        self._extract_text(text_page, page.rect.height)

        # JW_CAD PDF重複テキスト除去 (同一テキストが複数レイヤーで描画される)
        self._dedup_texts()

        doc.close()

        if self.debug:
            print(f"[DEBUG] 抽出: lines={len(self.lines)}, arcs={len(self.arcs)}, "
                  f"rects={len(self.rects)}, texts={len(self.texts)}, curves={len(self.curves)}")

        return self

    def _extract_paths(self, drawings: list, page_height_pt: float) -> None:
        """page.get_drawings() の結果をパース"""
        for path in drawings:
            items = path.get("items", [])
            width_pt = path.get("width", 0) or 0
            color = path.get("color", (0, 0, 0))
            fill = path.get("fill")
            width_mm = pt_to_mm(width_pt)

            if color is None:
                color = (0, 0, 0)

            for item in items:
                kind = item[0]

                if kind == "l":  # 直線
                    p1_pt, p2_pt = item[1], item[2]
                    p1 = (pt_to_mm(p1_pt.x), pt_to_mm(flip_y(p1_pt.y, page_height_pt)))
                    p2 = (pt_to_mm(p2_pt.x), pt_to_mm(flip_y(p2_pt.y, page_height_pt)))
                    if distance(p1, p2) > 0.1:  # 極小線を無視
                        self.lines.append(RawLine(p1, p2, width_mm, color))

                elif kind == "re":  # 矩形
                    rect = item[1]
                    x = pt_to_mm(rect.x0)
                    y = pt_to_mm(flip_y(rect.y1, page_height_pt))  # y1が下辺→反転後上辺
                    w = pt_to_mm(rect.width)
                    h = pt_to_mm(rect.height)
                    if w > 0.5 and h > 0.5:
                        self.rects.append(RawRect(x, y, w, h, fill, width_mm, color))

                elif kind == "c":  # 3次ベジェ曲線
                    # 弧の近似検出: 制御点が4つで円弧的配置ならarc扱い
                    pts = [item[i] for i in range(1, 5)]
                    pts_mm = [(pt_to_mm(p.x), pt_to_mm(flip_y(p.y, page_height_pt))) for p in pts]
                    arc = self._try_bezier_to_arc(pts_mm)
                    if arc:
                        self.arcs.append(RawArc(
                            arc["center"], arc["radius"],
                            arc["start_angle"], arc["end_angle"],
                            width_mm, color
                        ))
                    else:
                        self.curves.append({
                            "points": pts_mm,
                            "width": width_mm,
                            "color": color
                        })

                elif kind == "qu":  # 2次ベジェ曲線
                    try:
                        qu_pts = []
                        for i in range(1, 4):
                            p = item[i]
                            if hasattr(p, 'x') and hasattr(p, 'y'):
                                qu_pts.append((pt_to_mm(p.x), pt_to_mm(flip_y(p.y, page_height_pt))))
                            elif hasattr(p, 'ul'):  # Quad object — use upper-left
                                qu_pts.append((pt_to_mm(p.ul.x), pt_to_mm(flip_y(p.ul.y, page_height_pt))))
                        if len(qu_pts) == 3:
                            self.curves.append({
                                "points": qu_pts,
                                "width": width_mm,
                                "color": color
                            })
                    except (AttributeError, IndexError):
                        pass  # Skip malformed quadratic bezier items

    def _try_bezier_to_arc(self, pts: list) -> Optional[dict]:
        """3次ベジェ4点から円弧パラメータを推定。
        4点が概ね円弧上にある場合のみ返す。
        """
        if len(pts) < 4:
            return None
        p0, p1, p2, p3 = pts

        # 始点・終点間距離
        chord = distance(p0, p3)
        if chord < 1.0:
            return None

        # 中点で近似円の中心を推定
        mid = midpoint(p0, p3)
        ctrl_mid = midpoint(p1, p2)
        sagitta = distance(mid, ctrl_mid)

        if sagitta < 0.5:
            return None  # ほぼ直線

        # 概算半径: R = (chord^2)/(8*sagitta) + sagitta/2
        radius = (chord ** 2) / (8 * sagitta) + sagitta / 2

        # 中心の推定 (中点からsagittaの法線方向)
        dx = p3[0] - p0[0]
        dy = p3[1] - p0[1]
        nx, ny = -dy / chord, dx / chord  # 法線

        # 制御点の偏りで法線方向を決定
        ctrl_side = (ctrl_mid[0] - mid[0]) * nx + (ctrl_mid[1] - mid[1]) * ny
        sign = 1.0 if ctrl_side >= 0 else -1.0

        # 中心座標
        center_offset = radius
        center = (
            mid[0] + nx * sign * center_offset,
            mid[1] + ny * sign * center_offset,
        )

        # 検証: 4点すべてが半径±20%以内か
        for p in pts:
            d = distance(center, p)
            if abs(d - radius) / radius > 0.20:
                return None

        start_angle = math.degrees(math.atan2(p0[1] - center[1], p0[0] - center[0]))
        end_angle = math.degrees(math.atan2(p3[1] - center[1], p3[0] - center[0]))

        return {
            "center": center,
            "radius": radius,
            "start_angle": start_angle,
            "end_angle": end_angle,
        }

    def _extract_text(self, text_dict: dict, page_height_pt: float) -> None:
        """page.get_text("dict") からテキスト要素を抽出"""
        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:  # テキストブロックのみ
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if not text:
                        continue
                    origin_pt = span.get("origin", (0, 0))
                    origin = (
                        pt_to_mm(origin_pt[0]),
                        pt_to_mm(flip_y(origin_pt[1], page_height_pt)),
                    )
                    size = pt_to_mm(span.get("size", 10))
                    font = span.get("font", "")
                    color_int = span.get("color", 0)
                    # int color → (r, g, b)
                    if isinstance(color_int, int):
                        r = ((color_int >> 16) & 0xFF) / 255.0
                        g = ((color_int >> 8) & 0xFF) / 255.0
                        b = (color_int & 0xFF) / 255.0
                        color = (r, g, b)
                    else:
                        color = color_int or (0, 0, 0)

                    self.texts.append(RawText(text, origin, size, font, color))

    def _dedup_texts(self, merge_radius_mm: float = 2.0) -> None:
        """JW_CAD PDFの重複テキスト除去。
        同一テキスト内容が近接位置(2mm以内)に複数回描画されるのを1つに統合。
        """
        if not self.texts:
            return

        before_count = len(self.texts)
        deduped: list[RawText] = []
        used = [False] * len(self.texts)

        for i, t1 in enumerate(self.texts):
            if used[i]:
                continue
            # このテキストと同一内容・近接位置のものを集める
            group = [t1]
            used[i] = True
            for j in range(i + 1, len(self.texts)):
                if used[j]:
                    continue
                t2 = self.texts[j]
                if t1.text == t2.text and distance(t1.origin, t2.origin) < merge_radius_mm:
                    group.append(t2)
                    used[j] = True
            # グループの重心を代表点に、最大サイズを採用
            avg_x = sum(t.origin[0] for t in group) / len(group)
            avg_y = sum(t.origin[1] for t in group) / len(group)
            max_size = max(t.size for t in group)
            deduped.append(RawText(t1.text, (avg_x, avg_y), max_size, t1.font, t1.color))

        self.texts = deduped

        if self.debug and before_count != len(self.texts):
            print(f"[DEBUG] テキスト重複除去: {before_count} -> {len(self.texts)}")

    # -----------------------------------------------------------------------
    # Phase 1: スケール検出
    # -----------------------------------------------------------------------

    def detect_scale(self) -> "PDFVectorExtractor":
        """寸法テキストと寸法線からスケールを自動検出する"""
        if self.manual_scale:
            if self.manual_scale in COMMON_SCALES:
                self.scale_factor = COMMON_SCALES[self.manual_scale]
                self.scale_label = self.manual_scale
                self.confidence = 1.0
                if self.debug:
                    print(f"[DEBUG] 手動スケール: {self.scale_label}")
                return self
            else:
                self.warnings.append(f"不明な縮尺: {self.manual_scale}")

        # 寸法テキストを収集
        dim_candidates: list[dict] = []
        for t in self.texts:
            val = parse_dim_text(t.text)
            if val and 100 <= val <= 50000:
                dim_candidates.append({"text": t.text, "value_mm": val, "origin": t.origin})

        if self.debug:
            print(f"[DEBUG] 寸法テキスト候補: {len(dim_candidates)}個")
            for d in dim_candidates[:5]:
                print(f"  {d['text']} = {d['value_mm']}mm at {d['origin']}")

        # 縮尺テキストの直接検出 (例: "S=1:50", "SCALE 1/100")
        for t in self.texts:
            m = re.search(r"[SＳ]\s*[=＝:：]\s*1\s*[/:：]\s*(\d+)", t.text)
            if m:
                scale_val = int(m.group(1))
                if scale_val in COMMON_SCALES.values():
                    self.scale_factor = scale_val
                    self.scale_label = f"1:{scale_val}"
                    self.confidence = 0.95
                    if self.debug:
                        print(f"[DEBUG] テキストからスケール検出: {self.scale_label}")
                    self.dim_texts = dim_candidates
                    return self

        # 寸法テキストと最寄り線の距離比からスケール推定
        scale_votes: list[float] = []
        for dim in dim_candidates:
            nearby_line = self._find_nearest_dimension_line(dim["origin"], dim["value_mm"])
            if nearby_line:
                pdf_dist_mm = nearby_line["pdf_length_mm"]
                real_mm = dim["value_mm"]
                if pdf_dist_mm > 1.0:
                    ratio = real_mm / pdf_dist_mm
                    scale_votes.append(ratio)

        if scale_votes:
            # 最頻値に近いスケールを選択
            median_ratio = sorted(scale_votes)[len(scale_votes) // 2]

            # 投票の一致度を評価
            if len(scale_votes) >= 3:
                import statistics
                stdev = statistics.stdev(scale_votes)
                vote_consistency = stdev / median_ratio if median_ratio > 0 else 1.0
            else:
                vote_consistency = 1.0  # 投票数が少ない場合は不安定扱い

            # 最も近い標準スケールにスナップ
            best_scale = None
            best_diff = float("inf")
            for label, val in COMMON_SCALES.items():
                diff = abs(median_ratio - val)
                if diff < best_diff:
                    best_diff = diff
                    best_scale = (label, val)

            if best_scale and best_diff < best_scale[1] * 0.15:
                # 標準スケールに十分近い場合はスナップ
                self.scale_factor = best_scale[1]
                self.scale_label = best_scale[0]
                self.confidence = max(0.6, 1.0 - best_diff / best_scale[1])
            elif vote_consistency < 0.02 and len(scale_votes) >= 5:
                # 投票が非常に一致（CV<2%）→ 実測値をそのまま使用
                rounded = round(median_ratio)
                self.scale_factor = rounded
                self.scale_label = f"1:{rounded}"
                self.confidence = 0.9
            elif best_scale and best_diff < best_scale[1] * 0.3:
                self.scale_factor = best_scale[1]
                self.scale_label = best_scale[0]
                self.confidence = max(0.5, 1.0 - best_diff / best_scale[1])
            else:
                self.scale_factor = median_ratio
                self.scale_label = f"1:{median_ratio:.0f}"
                self.confidence = 0.4

            if self.debug:
                print(f"[DEBUG] スケール投票: {len(scale_votes)}票, "
                      f"median={median_ratio:.1f}, CV={vote_consistency:.4f}")
        else:
            # フォールバック: 弧（ドア）を探して900mm基準で推定
            door_arc = self._find_door_arc_for_scale()
            if door_arc:
                pdf_radius_mm = door_arc.radius
                ratio = DOOR_WIDTH_REF_MM / pdf_radius_mm
                best_scale = None
                best_diff = float("inf")
                for label, val in COMMON_SCALES.items():
                    diff = abs(ratio - val)
                    if diff < best_diff:
                        best_diff = diff
                        best_scale = (label, val)
                if best_scale:
                    self.scale_factor = best_scale[1]
                    self.scale_label = best_scale[0]
                    self.confidence = 0.3
                    self.warnings.append("スケールはドア弧 (900mm想定) から推定。精度低。")
            else:
                self.scale_factor = 50  # デフォルト 1:50
                self.scale_label = "1:50 (デフォルト)"
                self.confidence = 0.1
                self.warnings.append("スケール自動検出失敗。デフォルト 1:50 を使用。")

        self.dim_texts = dim_candidates

        if self.debug:
            print(f"[DEBUG] スケール: {self.scale_label} (confidence={self.confidence:.2f})")

        return self

    def _find_nearest_dimension_line(self, text_origin: tuple, real_mm: float,
                                     search_radius_mm: float = 30.0) -> Optional[dict]:
        """寸法テキストの近くにある水平/垂直線を探す"""
        best = None
        best_dist = search_radius_mm

        for line in self.lines:
            # 細い線のみ (寸法線は通常細い)
            if line.width > 1.0:
                continue
            if not (is_horizontal(line.p1, line.p2) or is_vertical(line.p1, line.p2)):
                continue
            # テキスト位置との距離
            mp = midpoint(line.p1, line.p2)
            d = distance(text_origin, mp)
            if d < best_dist:
                best_dist = d
                best = {"line": line, "pdf_length_mm": line.length}

        return best

    def _find_door_arc_for_scale(self) -> Optional[RawArc]:
        """ドアの開き弧 (約90度) を探す"""
        for arc in self.arcs:
            sweep = abs(arc.end_angle - arc.start_angle)
            if 80 < sweep < 100:
                return arc
        return None

    # -----------------------------------------------------------------------
    # Phase 2: 要素分類
    # -----------------------------------------------------------------------

    def classify_elements(self) -> "PDFVectorExtractor":
        """抽出した生データを建築要素に分類する"""
        self._classify_texts()  # 先にテキスト分類（寸法テキスト位置を線分類で使う）
        self._classify_lines()
        self._detect_wall_pairs()
        self._detect_openings()
        self._detect_windows()
        self._classify_rects_as_furniture()
        return self

    # -------------------------------------------------------------------
    # ラスターベース壁検証 (OpenCV)
    # -------------------------------------------------------------------

    def _raster_wall_mask(self) -> bool:
        """PDFページを300DPIでラスタライズし、太線(壁)だけ残すマスクを生成

        Returns:
            True: マスク生成成功 (self._wall_raster_mask にnumpy配列を保持)
            False: 生成失敗 (cv2未インストール等)
        """
        if not _HAS_CV2:
            if self.debug:
                print("[DEBUG] cv2未インストール — ラスター壁検証をスキップ")
            return False

        self._wall_raster_mask = None
        self._raster_dpi = 300
        self._raster_page_height_pt = 0.0

        try:
            doc = fitz.open(self.pdf_path)
            page = doc[self.page_num]
            self._raster_page_height_pt = page.rect.height  # ページ高さ(pt)
            # 300DPIでラスタライズ
            pix = page.get_pixmap(dpi=self._raster_dpi)
            doc.close()

            # PyMuPDF pixmap → numpy array
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                pix.height, pix.width, pix.n
            )
            # グレースケール変換
            if pix.n >= 3:
                gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
            else:
                gray = img.copy()

            # 適応的二値化 (暗い線が白=255になるように反転)
            binary = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV, blockSize=15, C=10
            )

            # erode/dilateなし — 二値画像をそのままマスクとして使う
            # 線の太さの判定は _validate_wall_line_with_raster() で行う
            self._wall_raster_mask = binary
            self._wall_raster_gray = gray  # 太さ測定用にグレースケールも保持

            if self.debug:
                wall_pixels = int(np.count_nonzero(binary))
                total_pixels = binary.shape[0] * binary.shape[1]
                print(f"[DEBUG] ラスター壁マスク生成: {binary.shape[1]}x{binary.shape[0]}px, "
                      f"壁ピクセル: {wall_pixels} ({wall_pixels * 100.0 / total_pixels:.2f}%)")

            return True

        except Exception as e:
            if self.debug:
                print(f"[DEBUG] ラスター壁マスク生成失敗: {e}")
            return False

    def _pdf_to_raster_coords(self, x_mm: float, y_mm: float) -> tuple[int, int]:
        """内部座標(mm, flip_y済み) → ラスター座標(px) に変換

        内部座標: pt_to_mm(x_pt), pt_to_mm(flip_y(y_pt, page_height))
        つまり x_mm = x_pt * PT_TO_MM, y_mm = (page_height - y_pt) * PT_TO_MM
        ラスター座標: 原点=左上, Y下向き = PyMuPDFのget_pixmapと同じ座標系

        内部Y_mmは flip_y 済み = 原点が左上に変換済みなので、
        mm → pt → px の変換でそのまま使える。
        """
        dpi = self._raster_dpi
        # mm → pt
        x_pt = x_mm / PT_TO_MM
        y_flipped_pt = y_mm / PT_TO_MM  # = page_h - original_y (flip_y済み)
        # un-flip: 元のPyMuPDF Y座標に戻す (原点=左上, Y下向き)
        original_y_pt = self._raster_page_height_pt - y_flipped_pt
        # pt → px
        px_x = int(x_pt * dpi / 72.0)
        px_y = int(original_y_pt * dpi / 72.0)
        return px_x, px_y

    def _measure_raster_thickness(self, line: "RawLine", sample_count: int = 5) -> float:
        """ラスターマスクで壁線の太さ(px)を測定。中央値を返す。"""
        if self._wall_raster_mask is None:
            return 99.0  # マスクなし=最大厚

        mask = self._wall_raster_mask
        h, w = mask.shape

        dx = line.p2[0] - line.p1[0]
        dy = line.p2[1] - line.p1[1]
        length = math.hypot(dx, dy)
        if length < 0.5:
            return 99.0

        # 法線方向 (線に垂直、ラスター空間で正規化)
        rscale = self._raster_dpi / 72.0
        nx_dir = (-dy / length) * rscale
        ny_dir = (dx / length) * rscale
        rnorm = math.hypot(nx_dir, ny_dir)
        if rnorm > 0:
            nx_dir, ny_dir = nx_dir / rnorm, ny_dir / rnorm

        thicknesses = []
        for i in range(sample_count):
            t = (i + 0.5) / sample_count
            sx = line.p1[0] + t * dx
            sy = line.p1[1] + t * dy
            cx, cy = self._pdf_to_raster_coords(sx, sy)

            if not (0 <= cx < w and 0 <= cy < h):
                thicknesses.append(5.0)
                continue

            # 法線方向に±10pxスキャンして最大連続ピクセル数を計測
            max_run = 0
            current_run = 0
            for offset in range(-10, 11):
                px = int(cx + nx_dir * offset)
                py = int(cy + ny_dir * offset)
                if 0 <= px < w and 0 <= py < h and mask[py, px] > 0:
                    current_run += 1
                    max_run = max(max_run, current_run)
                else:
                    current_run = 0
            thicknesses.append(max_run)

        if not thicknesses:
            return 99.0
        thicknesses.sort()
        return thicknesses[len(thicknesses) // 2]

    def _validate_wall_line_with_raster(self, line: "RawLine",
                                         min_thickness_px: float = 2.0) -> bool:
        """ラスターマスクで壁として十分太いか検証"""
        return self._measure_raster_thickness(line) >= min_thickness_px

    def _is_near_dim_text(self, line: "RawLine", radius_pt: float = 20.0) -> bool:
        """寸法テキストの近くにある線か判定 — 黒い寸法線を検出するため"""
        mid = ((line.p1[0] + line.p2[0]) / 2, (line.p1[1] + line.p2[1]) / 2)
        for dt in self.dim_texts:
            if distance(mid, dt["origin"]) < radius_pt:
                return True
        return False

    def _classify_lines(self) -> None:
        """線を太さ + 色で壁線/寸法線に3段階分類

        tier1: 外壁候補 (最太線) → self.exterior_wall_lines
        tier2: 内壁候補 (中太線) → self.wall_lines (+ tier1も含む)
        tier3: 細線/寸法線 → self.dim_lines
        """
        if not self.lines:
            return

        # 線幅のヒストグラム (本数付き)
        width_counts: dict[float, int] = defaultdict(int)
        for l in self.lines:
            width_counts[round(l.width, 2)] += 1
        widths = sorted(width_counts.keys())

        if self.debug:
            print(f"[DEBUG] 線幅分布: {[(w, width_counts[w]) for w in widths[:15]]}")
            color_counts: dict[str, int] = defaultdict(int)
            for l in self.lines:
                clabel = classify_color(l.color)
                color_counts[clabel or "unknown"] += 1
            print(f"[DEBUG] 色分類分布: {dict(color_counts)}")

        # 3段階クラスタリング: 厚い方から積み上げ法
        # 建築図面では外壁(最太)→内壁(中太)→細線(寸法等)の順
        # 太い方から線数を積み上げ、有意なギャップで区切る
        tier1_threshold = LINE_WIDTH_TIER1_MIN
        tier2_threshold = LINE_WIDTH_TIER2_MIN

        if len(widths) >= 3:
            # 太い方から積み上げ: 十分な線数が溜まったギャップで区切る
            cumul = 0
            found_tier1 = False
            for i in range(len(widths) - 1, -1, -1):
                cumul += width_counts[widths[i]]
                if i > 0:
                    gap = widths[i] - widths[i - 1]
                    if gap > 0.04 and cumul >= 20 and not found_tier1:
                        # tier1境界: 外壁グループが確定
                        tier1_threshold = (widths[i - 1] + widths[i]) / 2
                        found_tier1 = True
                        # tier2を探す: tier1未満で内壁グループを確定
                        cumul2 = 0
                        for j in range(i - 1, -1, -1):
                            cumul2 += width_counts[widths[j]]
                            if j > 0:
                                gap2 = widths[j] - widths[j - 1]
                                if gap2 > 0.04 and cumul2 >= 50:
                                    tier2_threshold = (widths[j - 1] + widths[j]) / 2
                                    break
                        if not found_tier1:
                            tier2_threshold = tier1_threshold
                        break

            if not found_tier1:
                # ギャップが見つからない場合: 最大ギャップで2分割
                all_gaps = [(widths[i + 1] - widths[i], i) for i in range(len(widths) - 1)]
                if all_gaps:
                    best_gap = max(all_gaps, key=lambda x: x[0])
                    if best_gap[0] > 0.05:
                        tier1_threshold = (widths[best_gap[1]] + widths[best_gap[1] + 1]) / 2
                        tier2_threshold = tier1_threshold
        elif len(widths) == 2 and widths[1] - widths[0] > 0.05:
            tier1_threshold = (widths[0] + widths[1]) / 2
            tier2_threshold = tier1_threshold

        if self.debug:
            print(f"[DEBUG] 線幅閾値: tier1(外壁)>={tier1_threshold:.3f}mm, "
                  f"tier2(内壁)>={tier2_threshold:.3f}mm")

        # 外壁候補線 (tier1) を別途保持
        self.exterior_wall_lines: list[RawLine] = []

        for line in self.lines:
            if line.length < 2.0:  # 極小線を除外
                continue

            # 色による分類を補助的に利用
            color_label = classify_color(line.color)

            # 色が明確に寸法線を示す場合 (黄色)
            if color_label == "dimension":
                self.dim_lines.append(line)
                continue

            # 色が建具/什器/仕上げの場合は寸法線にも壁線にも入れない
            if color_label in ("fixture", "furniture", "finish", "room_name"):
                continue

            # 寸法線の追加フィルタ: 近くに寸法テキストがある線は除外
            if self._is_near_dim_text(line):
                self.dim_lines.append(line)
                continue

            # 3段階線幅分類
            if line.width >= tier1_threshold:
                # tier1: 外壁候補 (最太線)
                self.exterior_wall_lines.append(line)
                self.wall_lines.append(line)
            elif line.width >= tier2_threshold:
                # tier2: 内壁候補
                self.wall_lines.append(line)
            else:
                # tier3: thin lines / dimension lines
                # Rescue to wall if color indicates wall
                if color_label == "wall" and line.width >= tier2_threshold * 0.5:
                    self.wall_lines.append(line)
                # Rescue by geometric features: long, axis-aligned lines
                # are likely walls even if thinner than tier2 threshold
                # (fixes right-half wall loss when global clustering
                #  sets tier2 too high due to left-half thick lines)
                elif (line.width >= tier2_threshold * 0.4
                      and line.length >= 1000.0 / self.scale_factor
                      and _is_axis_aligned(line, tolerance_deg=5.0)):
                    self.wall_lines.append(line)
                else:
                    self.dim_lines.append(line)

        if self.debug:
            print(f"[DEBUG] 外壁候補線(tier1): {len(self.exterior_wall_lines)}, "
                  f"壁線候補(全): {len(self.wall_lines)}, 寸法線候補: {len(self.dim_lines)}")

        # --- Raster-based wall rescue (OpenCV) ---
        # Scan dim_lines for misclassified walls: lines that fell below
        # tier2 threshold but appear thick on the raster image are rescued
        # back to wall_lines.  This is additive — existing wall_lines are
        # never removed, only dim_lines are promoted.
        if _HAS_CV2 and self._raster_wall_mask():
            rescued: list[RawLine] = []
            remaining_dim: list[RawLine] = []
            # Minimum raster thickness (px) to consider a line as wall.
            # At 300 DPI, a 0.15mm line ≈ 1.8px; walls are typically ≥ 5px.
            # Using 5px to avoid rescuing dimension lines that appear thick
            # due to PDF rendering artifacts.
            min_wall_px = 5.0

            wall_line_set = set(id(wl) for wl in self.wall_lines)

            for line in self.dim_lines:
                # Only rescue axis-aligned lines with reasonable length
                # (avoids promoting short dim ticks or angled hatching)
                if (id(line) not in wall_line_set
                        and line.length >= 1500.0 / self.scale_factor
                        and _is_axis_aligned(line, tolerance_deg=5.0)
                        and self._measure_raster_thickness(line) >= min_wall_px):
                    rescued.append(line)
                else:
                    remaining_dim.append(line)

            if rescued:
                # Cap rescue count: if rescued lines exceed 50% of existing
                # wall_lines, it's likely over-rescuing (e.g., dense dim lines).
                # In that case, only keep the longest rescued lines up to the cap.
                max_rescue = max(len(self.wall_lines) // 2, 10)
                if len(rescued) > max_rescue:
                    rescued.sort(key=lambda l: l.length, reverse=True)
                    rescued = rescued[:max_rescue]
                    # Rebuild remaining_dim
                    rescued_ids = set(id(l) for l in rescued)
                    remaining_dim = [l for l in self.dim_lines if id(l) not in rescued_ids]
                self.wall_lines.extend(rescued)
                self.dim_lines = remaining_dim

            if self.debug:
                print(f"[DEBUG] Raster wall rescue: {len(rescued)} lines "
                      f"promoted from dim_lines to wall_lines")

    # 什器キーワード (これが含まれるテキストは室名ではなく什器扱い)
    FIXTURE_KEYWORDS = [
        "CT", "ＣＴ", "台", "機", "棚", "ｼﾝｸ", "シンク",
        "ｹｰｽ", "ケース", "ﾃｰﾌﾞﾙ", "テーブル", "冷蔵", "冷凍",
        "ｺﾞﾐ", "ゴミ", "LEDｻｲﾈｰｼﾞ", "サイネージ", "音響",
        "入金", "OPEN",
        # 設備 (室名ではなく什器/設備)
        "消火栓", "分電盤", "ﾛｯｶｰ", "ロッカー",
        "キャッシャー", "ｷｬｯｼｬｰ", "レジ", "ﾚｼﾞ",
        # 追加什器キーワード
        "ソファ", "ｿﾌｧ", "椅子", "ｲｽ", "カウンター", "ｶｳﾝﾀｰ",
        "ボトル", "ﾎﾞﾄﾙ", "什器", "厨房", "食洗", "製氷",
        "ガス", "ｶﾞｽ", "手洗", "鏡", "ﾐﾗｰ", "ミラー",
        "パントリー", "ﾊﾟﾝﾄﾘｰ", "電話", "ｲﾝﾀｰﾎﾝ",
        # test14 追加キーワード
        "ﾎﾞﾄﾙ棚", "ボトル棚", "LED", "ＬＥＤ",
        "ﾚｾﾌﾟｼｮﾝ", "レセプション",
        "ﾄﾞﾘﾝｸ", "ドリンク",
        "ﾁｪｱ", "チェア", "ﾃﾞｽｸ", "デスク",
        "ｴｱｺﾝ", "エアコン", "室外機", "給湯",
        "ｽﾋﾟｰｶｰ", "スピーカー",
    ]

    # 什器テキストのデフォルトサイズ推定 (テキストラベルだけの場合)
    FIXTURE_DEFAULT_SIZES = {
        "テーブル": (900, 600), "ﾃｰﾌﾞﾙ": (900, 600),
        "椅子": (450, 450), "ｲｽ": (450, 450),
        "ソファ": (1800, 800), "ｿﾌｧ": (1800, 800),
        "カウンター": (2000, 600), "ｶｳﾝﾀｰ": (2000, 600),
        "棚": (900, 400), "ボトル棚": (1200, 400),
        "消火栓": (500, 300), "分電盤": (600, 400),
        "レジ": (600, 500), "キャッシャー": (600, 500),
    }

    def _classify_texts(self) -> None:
        """テキストを室名/寸法値に分類"""
        for t in self.texts:
            text = t.text.strip()

            # 単文字英字はスキップ (展開方向記号 A, B, C...)
            if re.match(r'^[A-Za-z]$', text):
                continue

            # 集計・注記テキストはスキップ
            if re.match(r'^(合計|展開|PLAN|※)', text):
                continue

            # 寸法値判定 (先に判定)
            val = parse_dim_text(text)
            if val and 100 <= val <= 50000:
                self.dim_texts.append({
                    "text": text,
                    "value_mm": val,
                    "origin": t.origin,
                })
                continue

            # 室名判定 (什器キーワードより先にチェック)
            text_normalized = unicodedata.normalize('NFKC', text)
            is_room = False
            for pattern in ROOM_NAME_PATTERNS:
                if pattern in text:
                    is_room = True
                    break

            # 什器キーワードチェック
            # 半角↔全角カタカナ正規化してから比較
            is_fixture_text = False
            for kw in self.FIXTURE_KEYWORDS:
                kw_normalized = unicodedata.normalize('NFKC', kw)
                if kw_normalized in text_normalized:
                    is_fixture_text = True
                    break

            # 室名パターンにも什器キーワードにも一致する場合:
            # 短いテキスト(6文字以下)は室名を優先 (例: "トイレ", "厨房", "倉庫", "通路")
            # 長いテキスト(7文字以上)は什器を優先 (例: "カウンター下冷蔵庫")
            if is_room and is_fixture_text:
                if len(text) <= 6:
                    is_fixture_text = False  # 室名として扱う
                else:
                    is_room = False  # 什器として扱う

            if is_fixture_text:
                # 什器テキストとして保持 → 後で什器エントリ生成
                self._fixture_texts.append({
                    "text": text,
                    "origin": t.origin,
                })
                continue

            if is_room:
                self.room_names.append({
                    "name": text,
                    "origin": t.origin,
                    "size": t.size,
                })
                continue

            # 面積ラベル判定 (例: "20.5㎡", "35㎡") — 室名が見つからないポリゴンのフォールバック名
            area_match = re.match(r'^(\d+(?:\.\d+)?)\s*[㎡m²]', text)
            if area_match:
                # エリア表記の正規化: "エリア(16.80㎡)" → "エリア 16.80㎡"
                area_val = area_match.group(1)
                # 元テキストから㎡部分を取得
                area_unit_match = re.search(r'[㎡m²]', text)
                area_unit = area_unit_match.group(0) if area_unit_match else '㎡'
                self.room_names.append({
                    "name": f"エリア {area_val}{area_unit}",
                    "origin": t.origin,
                    "size": t.size,
                    "is_area_label": True,
                })
                continue

        if self.debug:
            print(f"[DEBUG] 室名: {len(self.room_names)}, 寸法テキスト: {len(self.dim_texts)}")
            for rn in self.room_names:
                print(f"  室名: {rn['name']} at {rn['origin']}")

    def _detect_wall_pairs(self) -> None:
        """平行する壁線ペア (二重線=壁) を検出"""
        sf = self.scale_factor
        used: set[int] = set()

        for i, l1 in enumerate(self.wall_lines):
            if i in used:
                continue
            for j, l2 in enumerate(self.wall_lines):
                if j <= i or j in used:
                    continue

                # 平行判定
                if not lines_are_parallel(l1.p1, l1.p2, l2.p1, l2.p2):
                    continue

                # 距離判定 (スケール変換後)
                d1 = perpendicular_distance(l2.p1, l1.p1, l1.p2)
                d2 = perpendicular_distance(l2.p2, l1.p1, l1.p2)
                avg_dist = (d1 + d2) / 2
                thickness_mm = avg_dist * sf

                if WALL_THICKNESS_MIN_MM <= thickness_mm <= WALL_THICKNESS_MAX_MM:
                    # 重なり長判定 (短い方の50%以上は重なっていること)
                    overlap = self._calc_overlap(l1, l2)
                    min_len = min(l1.length, l2.length)
                    if overlap > min_len * 0.5:
                        # --- 什器線フィルタ ---
                        # 1. 壁ペアの中心線長が350mm未満は什器の可能性が高い
                        cl = self._centerline(l1, l2)
                        cl_length_mm = distance(cl["p1"], cl["p2"]) * sf
                        if cl_length_mm < 350:
                            if self.debug:
                                print(f"[DEBUG] 壁ペア候補除外(短すぎ): "
                                      f"長さ{cl_length_mm:.0f}mm < 350mm")
                            continue

                        # 2. 両線とも細線(tier2下位)の場合、什器輪郭の可能性
                        #    壁線は通常tier1/tier2上位の太さを持つ
                        #    両方ともtier2最小閾値の1.2倍未満なら除外
                        both_thin = (l1.width < LINE_WIDTH_TIER2_MIN * 1.2
                                     and l2.width < LINE_WIDTH_TIER2_MIN * 1.2)
                        if both_thin and cl_length_mm < 800:
                            if self.debug:
                                print(f"[DEBUG] 壁ペア候補除外(細線+短): "
                                      f"幅{l1.width:.3f}/{l2.width:.3f}, "
                                      f"長さ{cl_length_mm:.0f}mm")
                            continue

                        self.wall_pairs.append({
                            "line1": l1,
                            "line2": l2,
                            "thickness_mm": round(thickness_mm),
                            "centerline": cl,
                        })
                        used.add(i)
                        used.add(j)
                        break

        if self.debug:
            print(f"[DEBUG] 壁ペア (二重線): {len(self.wall_pairs)}組")

    def _calc_overlap(self, l1: RawLine, l2: RawLine) -> float:
        """2つの平行線の重なり長を計算 (投影ベース)"""
        # l1方向へ投影
        dx = l1.p2[0] - l1.p1[0]
        dy = l1.p2[1] - l1.p1[1]
        length = l1.length
        if length < 1e-9:
            return 0.0

        ux, uy = dx / length, dy / length

        # l1上の投影区間
        t1_start = 0.0
        t1_end = length

        # l2上の投影区間
        t2_start = (l2.p1[0] - l1.p1[0]) * ux + (l2.p1[1] - l1.p1[1]) * uy
        t2_end = (l2.p2[0] - l1.p1[0]) * ux + (l2.p2[1] - l1.p1[1]) * uy
        if t2_start > t2_end:
            t2_start, t2_end = t2_end, t2_start

        overlap_start = max(t1_start, t2_start)
        overlap_end = min(t1_end, t2_end)

        return max(0.0, overlap_end - overlap_start)

    def _centerline(self, l1: RawLine, l2: RawLine) -> dict:
        """二重線の中心線を算出 — 投影ベースで重なり区間の中心線を返す"""
        p1a, p1b = normalize_line_direction(l1.p1, l1.p2)

        # l2端点をl1直線上に投影 (clamp=Falseで無限直線)
        proj_l2p1 = project_point_on_line(l2.p1, p1a, p1b, clamp=False)
        proj_l2p2 = project_point_on_line(l2.p2, p1a, p1b, clamp=False)

        # l1方向のt値を計算 (投影位置)
        dx = p1b[0] - p1a[0]
        dy = p1b[1] - p1a[1]
        l1_len_sq = dx * dx + dy * dy
        if l1_len_sq < 1e-18:
            return {"p1": midpoint(p1a, l2.p1), "p2": midpoint(p1b, l2.p2)}

        t_l2p1 = ((proj_l2p1[0] - p1a[0]) * dx + (proj_l2p1[1] - p1a[1]) * dy) / l1_len_sq
        t_l2p2 = ((proj_l2p2[0] - p1a[0]) * dx + (proj_l2p2[1] - p1a[1]) * dy) / l1_len_sq
        if t_l2p1 > t_l2p2:
            t_l2p1, t_l2p2 = t_l2p2, t_l2p1
            proj_l2p1, proj_l2p2 = proj_l2p2, proj_l2p1
            l2_p1, l2_p2 = l2.p2, l2.p1
        else:
            l2_p1, l2_p2 = l2.p1, l2.p2

        # 重なり区間: l1の[0,1]とl2の投影[t_l2p1, t_l2p2]の交差
        t_start = max(0.0, t_l2p1)
        t_end = min(1.0, t_l2p2)

        if t_start >= t_end:
            # 重なりなし — 全体平均でフォールバック
            cp1 = midpoint(p1a, l2_p1)
            cp2 = midpoint(p1b, l2_p2)
        else:
            # 重なり区間の始点・終点でl1上の点とl2上の対応点の中点を取る
            l1_start = (p1a[0] + dx * t_start, p1a[1] + dy * t_start)
            l1_end = (p1a[0] + dx * t_end, p1a[1] + dy * t_end)
            # l2上の対応点: t_startとt_endに対応するl2の点を逆投影
            l2_dx = l2_p2[0] - l2_p1[0]
            l2_dy = l2_p2[1] - l2_p1[1]
            l2_range = t_l2p2 - t_l2p1
            if l2_range > 1e-9:
                s_start = (t_start - t_l2p1) / l2_range
                s_end = (t_end - t_l2p1) / l2_range
            else:
                s_start, s_end = 0.0, 1.0
            l2_start = (l2_p1[0] + l2_dx * s_start, l2_p1[1] + l2_dy * s_start)
            l2_end = (l2_p1[0] + l2_dx * s_end, l2_p1[1] + l2_dy * s_end)

            cp1 = midpoint(l1_start, l2_start)
            cp2 = midpoint(l1_end, l2_end)

        return {"p1": cp1, "p2": cp2}

    def _detect_openings(self) -> None:
        """開き戸・引戸・折戸・開口を統合的に検出"""
        sf = self.scale_factor

        # --- 1. 開き戸 (弧ベース) ---
        for arc in self.arcs:
            sweep = abs(arc.end_angle - arc.start_angle)
            radius_mm = arc.radius * sf
            # ドアの弧: 80-100度、幅600-1200mm
            if 70 < sweep < 110 and 500 < radius_mm < 1500:
                mid_angle = (arc.start_angle + arc.end_angle) / 2
                swing = "left" if mid_angle > 0 else "right"
                self.door_arcs.append({
                    "center": arc.center,
                    "radius_mm": round(radius_mm),
                    "width_mm": round(radius_mm),  # ドア幅~=弧の半径
                    "swing": swing,
                    "height_mm": DOOR_HEIGHT_REF_MM,
                    "type": "swing_door",
                })

        # --- 2. 引戸: 壁線上の短い平行線ペア ---
        self._detect_sliding_doors()

        # --- 3. 折戸: ジグザグ/V字パターン ---
        self._detect_folding_doors()

        # --- 4. 開口: 壁線のギャップ (壁ペア構築後に検出) ---
        # → analyze_walls()内で _detect_wall_gaps() として実行

        if self.debug:
            print(f"[DEBUG] 開き戸: {len(self.door_arcs)}個, "
                  f"引戸: {len(self.sliding_doors)}個, "
                  f"折戸: {len(self.folding_doors)}個")

    def _detect_sliding_doors(self) -> None:
        """引戸: 壁線上の短い平行線ペア (2本の薄い線) を検出"""
        sf = self.scale_factor
        used_lines: set[int] = set()

        # 壁ペアの各壁線付近にある短い平行線ペアを探す
        thin_lines = [l for l in self.dim_lines + self.wall_lines if l.width < 0.5]

        for i, l1 in enumerate(thin_lines):
            if i in used_lines:
                continue
            length1_mm = l1.length * sf
            if not (SLIDING_DOOR_LENGTH_MIN_MM <= length1_mm <= SLIDING_DOOR_LENGTH_MAX_MM):
                continue

            for j, l2 in enumerate(thin_lines):
                if j <= i or j in used_lines:
                    continue
                length2_mm = l2.length * sf
                if not (SLIDING_DOOR_LENGTH_MIN_MM <= length2_mm <= SLIDING_DOOR_LENGTH_MAX_MM):
                    continue

                # 平行で近接しているか
                if not lines_are_parallel(l1.p1, l1.p2, l2.p1, l2.p2, tol_deg=3.0):
                    continue

                gap = perpendicular_distance(l2.p1, l1.p1, l1.p2)
                gap_mm = gap * sf
                if not (SLIDING_DOOR_GAP_MIN_MM <= gap_mm <= SLIDING_DOOR_GAP_MAX_MM):
                    continue

                # 長さが似ている (±30%)
                ratio = min(length1_mm, length2_mm) / max(length1_mm, length2_mm)
                if ratio < 0.7:
                    continue

                # 壁ペアの近くにあるか確認 (壁ペアの厚み+50mm以内)
                is_on_wall = False
                center_candidate = midpoint(
                    midpoint(l1.p1, l1.p2),
                    midpoint(l2.p1, l2.p2)
                )
                for pair in self.wall_pairs:
                    cl = pair["centerline"]
                    d = perpendicular_distance(center_candidate, cl["p1"], cl["p2"])
                    if d * sf < pair["thickness_mm"] + 50:
                        is_on_wall = True
                        break

                if is_on_wall:
                    # 壁との関連性チェック: 既知の壁の近傍(300mm以内)にないスライド戸は除外
                    near_wall = False
                    for wall in self.walls:
                        wc = ((wall["start_x_mm"] + wall["end_x_mm"]) / 2,
                              (wall["start_y_mm"] + wall["end_y_mm"]) / 2)
                        cc_mm = (center_candidate[0] * sf, center_candidate[1] * sf)
                        if distance(cc_mm, wc) < 300 + max(
                            abs(wall["end_x_mm"] - wall["start_x_mm"]),
                            abs(wall["end_y_mm"] - wall["start_y_mm"])
                        ) / 2:
                            near_wall = True
                            break
                    if not self.walls:
                        near_wall = True  # 壁未検出なら制約なし

                    if near_wall:
                        center = midpoint(
                            midpoint(l1.p1, l1.p2),
                            midpoint(l2.p1, l2.p2)
                        )
                        self.sliding_doors.append({
                            "center": center,
                            "width_mm": round(max(length1_mm, length2_mm)),
                            "height_mm": DOOR_HEIGHT_REF_MM,
                            "type": "sliding_door",
                        })
                        used_lines.add(i)
                        used_lines.add(j)
                        break

    def _detect_folding_doors(self) -> None:
        """折戸: 壁線上のジグザグ/V字パターンを検出。
        折戸は建具色(緑系)の短い線ペアで構成される。
        条件を厳格にして誤検出を防ぐ。
        """
        sf = self.scale_factor

        # 折戸候補: 建具色 or 中太の短い線のみ (寸法線・壁線ではない)
        # 長さ: 実寸で300-1000mm (PDF上で 300/sf - 1000/sf mm)
        min_len_pdf = 300.0 / sf
        max_len_pdf = 1000.0 / sf
        short_lines = []
        for l in self.lines:
            if not (min_len_pdf * 0.5 < l.length < max_len_pdf):
                continue
            # 建具色(緑系)を優先、それ以外は中太線
            clabel = classify_color(l.color)
            if clabel == "fixture":  # 緑 = 建具
                short_lines.append(l)
            elif 0.15 < l.width < 0.5 and clabel not in ("dimension", "wall_center"):
                short_lines.append(l)

        used: set[int] = set()
        for i, l1 in enumerate(short_lines):
            if i in used:
                continue
            for j, l2 in enumerate(short_lines):
                if j <= i or j in used:
                    continue

                # 長さが近い (折戸の2枚は同程度の長さ)
                len_ratio = min(l1.length, l2.length) / max(l1.length, l2.length)
                if len_ratio < 0.7:
                    continue

                # 端点が接続しているか (V字の頂点)
                connections = [
                    (l1.p2, l2.p1, l1.p1, l2.p2),
                    (l1.p2, l2.p2, l1.p1, l2.p1),
                    (l1.p1, l2.p1, l1.p2, l2.p2),
                    (l1.p1, l2.p2, l1.p2, l2.p1),
                ]

                for end_a, end_b, start_a, start_b in connections:
                    if distance(end_a, end_b) < 1.5:  # 1.5mm以内で接続
                        # 角度チェック (折戸は狭いV字: 20-80度)
                        a1 = angle_deg(end_a, start_a)
                        a2 = angle_deg(end_b, start_b)
                        angle_diff = abs(a1 - a2) % 360
                        if angle_diff > 180:
                            angle_diff = 360 - angle_diff

                        if 20 <= angle_diff <= 80:
                            width_mm = (l1.length + l2.length) * sf
                            if 400 < width_mm < 2000:
                                center = midpoint(start_a, start_b)
                                # 壁ペアの近くにあるか確認 (厚み以内)
                                is_on_wall = False
                                for pair in self.wall_pairs:
                                    cl = pair["centerline"]
                                    d = perpendicular_distance(center, cl["p1"], cl["p2"])
                                    if d * sf < pair["thickness_mm"] + 50:
                                        is_on_wall = True
                                        break

                                if is_on_wall:
                                    self.folding_doors.append({
                                        "center": center,
                                        "width_mm": round(width_mm),
                                        "height_mm": DOOR_HEIGHT_REF_MM,
                                        "type": "folding_door",
                                    })
                                    used.add(i)
                                    used.add(j)
                        break  # 最初の接続のみ

    def _detect_windows(self) -> None:
        """三重線パターン (窓) を検出"""
        sf = self.scale_factor

        # 壁ペアの中で、中間に追加の線が走っているものを窓として検出
        for pair in self.wall_pairs:
            cl = pair["centerline"]
            cl_length = distance(cl["p1"], cl["p2"])

            # 壁ペアの間にある短い平行線グループを探す
            inner_lines: list[RawLine] = []
            for line in self.dim_lines + self.wall_lines:
                if line.length < cl_length * 0.1:
                    continue
                if line.length > cl_length * 0.8:
                    continue
                if not lines_are_parallel(cl["p1"], cl["p2"], line.p1, line.p2):
                    continue
                d = perpendicular_distance(line.p1, pair["line1"].p1, pair["line1"].p2)
                thickness_pdf = pair["thickness_mm"] / sf
                if 0.1 * thickness_pdf < d < 0.9 * thickness_pdf:
                    inner_lines.append(line)

            # 3本以上の平行線 = 窓候補
            if len(inner_lines) >= 1:
                # 窓の位置・幅を推定
                for il in inner_lines:
                    w_mm = il.length * sf
                    if 400 < w_mm < 5000:
                        center = midpoint(il.p1, il.p2)
                        self.window_groups.append({
                            "center": center,
                            "width_mm": round(w_mm),
                            "height_mm": WINDOW_WIDTH_REF_MM,
                            "wall_pair": pair,
                        })

        if self.debug:
            print(f"[DEBUG] 窓候補: {len(self.window_groups)}個")

    def _classify_rects_as_furniture(self) -> None:
        """矩形を什器候補として分類"""
        sf = self.scale_factor

        # 非什器キーワード (設備シャフト等)
        NON_FIXTURE_KW = {"PS", "EPS", "DS", "MB", "EV", "ＰＳ", "ＥＰＳ", "ＤＳ", "ＭＢ", "ＥＶ"}

        for rect in self.rects:
            w_mm = rect.w * sf
            h_mm = rect.h * sf
            # 什器サイズの範囲 (80mm-3000mm — 巨大なものは壁/構造体)
            if not (80 < w_mm < 3000 and 80 < h_mm < 3000):
                continue
            # アスペクト比チェック — 細長すぎるのは壁線
            aspect = max(w_mm, h_mm) / max(min(w_mm, h_mm), 1)
            if aspect > 12:
                continue
            if 80 < w_mm < 3000 and 80 < h_mm < 3000:
                # 壁と重ならないか確認 (壁は除外)
                center = (rect.x + rect.w / 2, rect.y + rect.h / 2)

                # 近くにテキストラベルがあればそれを什器名とする
                # 検索半径を1.5倍に拡大し、最低500mm(用紙mm)を保証
                raw_radius = max(w_mm, h_mm) / sf
                label = self._find_nearby_text(center, search_radius_mm=max(raw_radius * 1.5, 500 / sf))

                # 非什器キーワードに該当するラベルはスキップ
                if label and label.strip() in NON_FIXTURE_KW:
                    continue

                self.furniture_rects.append({
                    "center_pdf": center,
                    "center_mm": (center[0] * sf, center[1] * sf),
                    "width_mm": round(w_mm),
                    "depth_mm": round(h_mm),
                    "label": label or "",
                    "filled": rect.fill is not None,
                })

        if self.debug:
            print(f"[DEBUG] 什器候補: {len(self.furniture_rects)}個")

    def _find_nearby_text(self, point_pdf: tuple, search_radius_mm: float = 20.0) -> Optional[str]:
        """指定点の近くにあるテキストを返す"""
        best = None
        best_dist = search_radius_mm
        for t in self.texts:
            d = distance(point_pdf, t.origin)
            if d < best_dist:
                # 寸法テキストは除外
                if parse_dim_text(t.text) is not None:
                    continue
                # 単文字/記号は什器名としては不適切
                text = t.text.strip()
                if len(text) <= 1:
                    continue
                # 英大文字1文字 + 方向記号等は除外
                if re.match(r'^[A-Z]$', text):
                    continue
                best_dist = d
                best = text
        return best

    # -----------------------------------------------------------------------
    # Phase 3: 壁解析・部屋検出
    # -----------------------------------------------------------------------

    def analyze_walls(self) -> "PDFVectorExtractor":
        """壁ペアから壁セグメント、開口部を構築"""
        sf = self.scale_factor
        wall_id = 0

        # 壁ペアがある場合はそれを使う
        if self.wall_pairs:
            for pair in self.wall_pairs:
                cl = pair["centerline"]
                wall_id += 1
                wall = {
                    "id": f"W{wall_id}",
                    "start_x_mm": cl["p1"][0] * sf,
                    "start_y_mm": cl["p1"][1] * sf,
                    "end_x_mm": cl["p2"][0] * sf,
                    "end_y_mm": cl["p2"][1] * sf,
                    "thickness_mm": pair["thickness_mm"],
                    "type": "interior",  # 後で外壁判定
                    "openings": [],
                }

                # 開口部 (開き戸) を壁に割り当て
                for door in self.door_arcs:
                    pos_on_wall = self._point_along_wall(
                        (cl["p1"][0], cl["p1"][1]),
                        (cl["p2"][0], cl["p2"][1]),
                        door["center"],
                    )
                    if pos_on_wall is not None:
                        wall["openings"].append({
                            "type": "swing_door",
                            "position_mm": round(pos_on_wall * sf),
                            "width_mm": door["width_mm"],
                            "height_mm": door["height_mm"],
                            "swing": door.get("swing", "left"),
                        })

                # 開口部 (引戸)
                for sd in self.sliding_doors:
                    pos_on_wall = self._point_along_wall(
                        (cl["p1"][0], cl["p1"][1]),
                        (cl["p2"][0], cl["p2"][1]),
                        sd["center"],
                    )
                    if pos_on_wall is not None:
                        wall["openings"].append({
                            "type": "sliding_door",
                            "position_mm": round(pos_on_wall * sf),
                            "width_mm": sd["width_mm"],
                            "height_mm": sd["height_mm"],
                        })

                # 開口部 (折戸)
                for fd in self.folding_doors:
                    pos_on_wall = self._point_along_wall(
                        (cl["p1"][0], cl["p1"][1]),
                        (cl["p2"][0], cl["p2"][1]),
                        fd["center"],
                    )
                    if pos_on_wall is not None:
                        wall["openings"].append({
                            "type": "folding_door",
                            "position_mm": round(pos_on_wall * sf),
                            "width_mm": fd["width_mm"],
                            "height_mm": fd["height_mm"],
                        })

                # 開口部 (窓)
                for win in self.window_groups:
                    if win.get("wall_pair") is pair:
                        pos_on_wall = self._point_along_wall(
                            (cl["p1"][0], cl["p1"][1]),
                            (cl["p2"][0], cl["p2"][1]),
                            win["center"],
                        )
                        if pos_on_wall is not None:
                            wall["openings"].append({
                                "type": "window",
                                "position_mm": round(pos_on_wall * sf),
                                "width_mm": win["width_mm"],
                                "height_mm": win.get("height_mm", 1200),
                                "sill_mm": 800,
                            })

                self.walls.append(wall)
        else:
            # 壁ペアがない場合: 太い単線を壁として使う
            for line in self.wall_lines:
                if line.length * sf < 350:  # 350mm未満は壁として短すぎる
                    continue
                wall_id += 1
                self.walls.append({
                    "id": f"W{wall_id}",
                    "start_x_mm": round(line.p1[0] * sf),
                    "start_y_mm": round(line.p1[1] * sf),
                    "end_x_mm": round(line.p2[0] * sf),
                    "end_y_mm": round(line.p2[1] * sf),
                    "thickness_mm": WALL_THICKNESS_DEFAULT_MM,
                    "type": "interior",
                    "openings": [],
                })

        # 壁線ギャップから開口を検出
        self._detect_wall_gaps()

        # 外壁判定
        self._classify_exterior_walls()

        # 壁延長→交差点計算 + 同一線上壁統合 + T字分割 + 端点スナップ + 接続グラフ構築
        self._extend_walls_to_intersections()
        self._merge_collinear_walls()
        self._split_walls_at_t_junctions()

        # --- 近接重複壁の統合 (105mm以内に並行する壁ペアを検出し長い方を残す) ---
        self._merge_near_duplicate_walls()

        # --- 短壁の接続性チェック付きフィルタ (500mm未満かつ孤立した壁を除去) ---
        self._filter_short_isolated_walls()

        self._snap_wall_endpoints()
        self._straighten_walls()

        # 什器の構築 (矩形ベース)
        for fr in self.furniture_rects:
            self.fixtures.append({
                "name": fr["label"],
                "x_mm": round(fr["center_mm"][0]),
                "y_mm": round(fr["center_mm"][1]),
                "width_mm": fr["width_mm"],
                "depth_mm": fr["depth_mm"],
                "rotation_deg": 0,
                "estimated": False,
            })

        # 什器の構築 (テキストベース — 矩形が見つからなかった什器テキスト)
        rect_fixture_positions = set()
        for f in self.fixtures:
            rect_fixture_positions.add((f["x_mm"] // 500, f["y_mm"] // 500))
        sf = self.scale_factor
        for ft in self._fixture_texts:
            fx_mm = round(ft["origin"][0] * sf)
            fy_mm = round(ft["origin"][1] * sf)
            grid_key = (fx_mm // 500, fy_mm // 500)
            # 既存の矩形什器と重複しない場合のみ追加
            if grid_key not in rect_fixture_positions:
                # デフォルトサイズを推定
                text = ft["text"]
                default_w, default_d = 600, 400
                for kw, (dw, dd) in self.FIXTURE_DEFAULT_SIZES.items():
                    if kw in text:
                        default_w, default_d = dw, dd
                        break
                self.fixtures.append({
                    "name": text,
                    "x_mm": fx_mm,
                    "y_mm": fy_mm,
                    "width_mm": default_w,
                    "depth_mm": default_d,
                    "rotation_deg": 0,
                    "estimated": True,
                })
                rect_fixture_positions.add(grid_key)

        # 寸法データ — 端点ペアリング付き
        self._pair_dimension_endpoints()

        # ページ範囲外の壁をフィルタ (寸法線エリアの偽壁除去)
        self._filter_out_of_page_walls()

        # 部屋ポリゴン構築
        self._build_room_polygons()

        if self.debug:
            print(f"[DEBUG] 壁: {len(self.walls)}, 什器: {len(self.fixtures)}, "
                  f"部屋: {len(self.rooms)}")
            # 壁接続グラフのデバッグ
            connected_nodes = sum(1 for node_walls in self.wall_graph.values() if len(node_walls) >= 2)
            print(f"[DEBUG] 壁接続ノード: {len(self.wall_graph)} (2本以上接続: {connected_nodes})")

        return self

    def _point_along_wall(self, wall_p1: tuple, wall_p2: tuple, point: tuple,
                          max_dist_mm: float = 5.0) -> Optional[float]:
        """点が壁線に近い場合、壁始点からの距離を返す (PDF単位)"""
        d = perpendicular_distance(point, wall_p1, wall_p2)
        if d > max_dist_mm:
            return None
        dx = wall_p2[0] - wall_p1[0]
        dy = wall_p2[1] - wall_p1[1]
        length = math.hypot(dx, dy)
        if length < 1e-9:
            return None
        t = ((point[0] - wall_p1[0]) * dx + (point[1] - wall_p1[1]) * dy) / (length * length)
        if -0.1 <= t <= 1.1:
            return t * length
        return None

    def _detect_wall_gaps(self) -> None:
        """壁線の切れ目（ギャップ）を開口として検出"""
        sf = self.scale_factor

        # 同一直線上にある壁の端点間ギャップを探す
        for i, w1 in enumerate(self.walls):
            for j, w2 in enumerate(self.walls):
                if j <= i:
                    continue

                # 同じ向き（水平/垂直）の壁か
                p1 = (w1["start_x_mm"], w1["start_y_mm"])
                p2 = (w1["end_x_mm"], w1["end_y_mm"])
                p3 = (w2["start_x_mm"], w2["start_y_mm"])
                p4 = (w2["end_x_mm"], w2["end_y_mm"])

                if not lines_are_parallel(p1, p2, p3, p4, tol_deg=3.0):
                    continue

                # 同一直線上か（垂直距離が壁厚以内）
                perp_dist = perpendicular_distance(p3, p1, p2)
                if perp_dist > max(w1["thickness_mm"], w2["thickness_mm"]):
                    continue

                # 端点間のギャップを計算
                endpoints = [
                    (distance(p2, p3), p2, p3, w1["id"], "end"),
                    (distance(p2, p4), p2, p4, w1["id"], "end"),
                    (distance(p1, p3), p1, p3, w1["id"], "start"),
                    (distance(p1, p4), p1, p4, w1["id"], "start"),
                ]

                # 最小ギャップのみ採用 (同じ壁ペアで複数ヒットを防ぐ)
                best_gap = None
                for gap_dist, ep1, ep2, wall_id, side in endpoints:
                    if OPENING_GAP_MIN_MM <= gap_dist <= OPENING_GAP_MAX_MM:
                        if best_gap is None or gap_dist < best_gap[0]:
                            best_gap = (gap_dist, ep1, ep2, wall_id, side)

                if best_gap:
                    gap_dist, ep1, ep2, wall_id, side = best_gap
                    center = midpoint(ep1, ep2)
                    self.openings.append({
                        "center_mm": center,
                        "width_mm": round(gap_dist),
                        "height_mm": DOOR_HEIGHT_REF_MM,
                        "type": "opening",
                        "wall_ids": [w1["id"], w2["id"]],
                    })

        if self.debug:
            print(f"[DEBUG] 壁ギャップ開口: {len(self.openings)}個")

    def _classify_exterior_walls(self) -> None:
        """外壁輪郭トレーシング: tier1最太線から閉じた外壁ポリゴンを構築し、
        そのポリゴンに近い壁を外壁とマーク。

        フォールバック: tier1線が不足する場合は従来のバウンディングボックス法。
        """
        if not self.walls:
            return

        sf = self.scale_factor
        exterior_contour = self._trace_exterior_contour()

        if exterior_contour and len(exterior_contour) >= 3:
            # ハイブリッド判定: 凸包辺からの距離 OR バウンディングボックス境界付近
            all_x = [w["start_x_mm"] for w in self.walls] + [w["end_x_mm"] for w in self.walls]
            all_y = [w["start_y_mm"] for w in self.walls] + [w["end_y_mm"] for w in self.walls]
            min_x, max_x = min(all_x), max(all_x)
            min_y, max_y = min(all_y), max(all_y)
            bbox_margin = 300  # バウンディングボックス境界からのマージン
            hull_margin = 600  # 凸包辺からのマージン（凸包は壁より外に出る）

            for w in self.walls:
                mid_x = (w["start_x_mm"] + w["end_x_mm"]) / 2
                mid_y = (w["start_y_mm"] + w["end_y_mm"]) / 2

                # 判定1: バウンディングボックス境界付近
                near_bbox = (
                    min(w["start_x_mm"], w["end_x_mm"]) <= min_x + bbox_margin or
                    max(w["start_x_mm"], w["end_x_mm"]) >= max_x - bbox_margin or
                    min(w["start_y_mm"], w["end_y_mm"]) <= min_y + bbox_margin or
                    max(w["start_y_mm"], w["end_y_mm"]) >= max_y - bbox_margin
                )

                # 判定2: 凸包辺からの距離
                hull_dist = self._point_to_polygon_edge_dist(
                    (mid_x, mid_y), exterior_contour
                )
                near_hull = hull_dist < hull_margin

                if near_bbox or near_hull:
                    w["type"] = "exterior"

            # 外壁ポリゴンを保存
            self.exterior_polygon = exterior_contour
        else:
            # フォールバック: バウンディングボックス法
            self.exterior_polygon = None
            all_x: list[float] = []
            all_y: list[float] = []
            for w in self.walls:
                all_x.extend([w["start_x_mm"], w["end_x_mm"]])
                all_y.extend([w["start_y_mm"], w["end_y_mm"]])

            min_x, max_x = min(all_x), max(all_x)
            min_y, max_y = min(all_y), max(all_y)
            margin = 200

            for w in self.walls:
                sx, sy = w["start_x_mm"], w["start_y_mm"]
                ex, ey = w["end_x_mm"], w["end_y_mm"]
                on_boundary = (
                    min(sx, ex) <= min_x + margin or
                    max(sx, ex) >= max_x - margin or
                    min(sy, ey) <= min_y + margin or
                    max(sy, ey) >= max_y - margin
                )
                if on_boundary:
                    w["type"] = "exterior"

            if self.debug:
                print("[DEBUG] 外壁ポリゴン: tier1線不足 → バウンディングボックス法にフォールバック")

    def _trace_exterior_contour(self) -> list[tuple]:
        """外壁輪郭ポリゴンを構築。

        2段階アプローチ:
        1. tier1(最太)線 + tier2外周壁からの全壁端点を収集
        2. 凸包を構築して外壁ポリゴンとする
        3. 壁セグメントに沿った凹み(L字等)を検出して凹ポリゴンに改善

        Returns:
            閉じたポリゴンの頂点リスト (mm座標)。構築失敗時は空リスト。
        """
        sf = self.scale_factor
        if sf <= 0:
            return []

        # 外壁候補の端点を収集 (tier1線 + 全壁のバウンディングボックス付近)
        ext_lines = getattr(self, "exterior_wall_lines", [])

        # 全壁端点からバウンディングボックスを計算
        all_wall_pts: list[tuple] = []
        for line in self.wall_lines:
            all_wall_pts.append(line.p1)
            all_wall_pts.append(line.p2)

        if len(all_wall_pts) < 6:
            return []

        # バウンディングボックス
        all_x = [p[0] for p in all_wall_pts]
        all_y = [p[1] for p in all_wall_pts]
        bbox_min_x, bbox_max_x = min(all_x), max(all_x)
        bbox_min_y, bbox_max_y = min(all_y), max(all_y)
        bbox_w = bbox_max_x - bbox_min_x
        bbox_h = bbox_max_y - bbox_min_y

        # 外周候補点: tier1線端点 + バウンディングボックス付近の壁端点
        margin = max(bbox_w, bbox_h) * 0.05  # 5%マージン
        perimeter_pts: list[tuple] = []

        # tier1線の端点を全追加
        for line in ext_lines:
            perimeter_pts.append(line.p1)
            perimeter_pts.append(line.p2)

        # バウンディングボックス付近の壁端点も追加
        for pt in all_wall_pts:
            near_edge = (
                pt[0] <= bbox_min_x + margin or
                pt[0] >= bbox_max_x - margin or
                pt[1] <= bbox_min_y + margin or
                pt[1] >= bbox_max_y - margin
            )
            if near_edge:
                perimeter_pts.append(pt)

        if len(perimeter_pts) < 3:
            return []

        # 凸包を構築
        hull = self._convex_hull(perimeter_pts)
        if len(hull) < 3:
            return []

        # 凹み検出: 壁セグメントの端点が凸包の内側にある場合、
        # 凸包を壁に沿って凹ませる
        refined = self._refine_hull_with_walls(hull, sf)

        # mm座標に変換
        contour_mm = [(round(pt[0] * sf), round(pt[1] * sf)) for pt in refined]

        if self.debug:
            area = shoelace_area(contour_mm) / 1e6
            print(f"[DEBUG] 外壁ポリゴン: {len(contour_mm)}頂点, "
                  f"面積={area:.1f}m2")

        return contour_mm

    def _convex_hull(self, points: list[tuple]) -> list[tuple]:
        """Andrew's monotone chain で凸包を構築"""
        pts = sorted(set(points))
        if len(pts) <= 2:
            return pts

        # 下半分
        lower: list[tuple] = []
        for p in pts:
            while len(lower) >= 2 and self._cross(lower[-2], lower[-1], p) <= 0:
                lower.pop()
            lower.append(p)

        # 上半分
        upper: list[tuple] = []
        for p in reversed(pts):
            while len(upper) >= 2 and self._cross(upper[-2], upper[-1], p) <= 0:
                upper.pop()
            upper.append(p)

        return lower[:-1] + upper[:-1]

    @staticmethod
    def _cross(o: tuple, a: tuple, b: tuple) -> float:
        """外積 (OA × OB)"""
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def _refine_hull_with_walls(self, hull: list[tuple],
                                 sf: float) -> list[tuple]:
        """凸包を壁セグメントに沿って凹ませてL字/不整形に対応。

        凸包の各辺に対して外壁線の端点群を走査し、凸包から内側に
        大きく引っ込んでいる箇所を検出。検出したら凸包頂点を追加して
        凹ポリゴン（L字/凸字等）を形成する。
        """
        if not self.wall_lines or len(hull) < 3:
            return hull

        # 凸包のバウンディングボックス
        hx = [p[0] for p in hull]
        hy = [p[1] for p in hull]
        hull_w = max(hx) - min(hx)
        hull_h = max(hy) - min(hy)

        # 凹み検出の閾値: 建物幅/高さの10%以上の凹みがあれば適用
        indent_threshold = min(hull_w, hull_h) * 0.10

        # 外壁候補線（tier1）の端点を収集（mm座標に変換）
        ext_pts_mm: list[tuple] = []
        for line in self.wall_lines:
            if line.width >= LINE_WIDTH_TIER1_MIN * 0.8:
                ext_pts_mm.append((round(line.p1[0] * sf), round(line.p1[1] * sf)))
                ext_pts_mm.append((round(line.p2[0] * sf), round(line.p2[1] * sf)))

        if not ext_pts_mm:
            return hull

        # hull座標もmm単位に変換
        hull_mm = [(round(p[0] * sf), round(p[1] * sf)) for p in hull]

        # 凸包の各辺について、外壁端点が大きく内側に離れているか調べる
        # 辺ごとに「内側に引っ込んでいるクラスタ」を検出
        indent_candidates: list[dict] = []

        for ei in range(len(hull_mm)):
            ej = (ei + 1) % len(hull_mm)
            edge_p1 = hull_mm[ei]
            edge_p2 = hull_mm[ej]
            edge_len = distance(edge_p1, edge_p2)
            if edge_len < 500:
                continue

            # 辺の方向ベクトルと法線
            edx = edge_p2[0] - edge_p1[0]
            edy = edge_p2[1] - edge_p1[1]
            # 内向き法線（凸包は反時計回りを仮定、内向き = 右手方向）
            nx = edy / edge_len
            ny = -edx / edge_len

            # この辺から内側に大きく離れた外壁端点を探す
            for pt in ext_pts_mm:
                # 辺からの符号付き距離（正 = 内側）
                dx_pt = pt[0] - edge_p1[0]
                dy_pt = pt[1] - edge_p1[1]
                signed_dist = dx_pt * nx + dy_pt * ny

                if signed_dist > indent_threshold:
                    # 辺上の投影位置を確認（辺の範囲内か）
                    t = (dx_pt * edx + dy_pt * edy) / (edge_len ** 2)
                    if 0.05 < t < 0.95:
                        indent_candidates.append({
                            "point_mm": pt,
                            "edge_idx": ei,
                            "depth": signed_dist,
                            "t": t,
                        })

        if not indent_candidates:
            return hull

        # エッジごとにインデント候補をグルーピング
        from itertools import groupby
        indent_candidates.sort(key=lambda c: (c["edge_idx"], c["t"]))

        # 各エッジについて凹みを形成
        # 凹みの角となる点を凸包に挿入する
        concave_pts_by_edge: dict[int, list[tuple]] = defaultdict(list)

        for edge_idx, group in groupby(indent_candidates, key=lambda c: c["edge_idx"]):
            pts = list(group)
            if len(pts) < 2:
                continue

            # 最も深い凹み方向の点群をクラスタリング
            # 凹みの角 = 辺に対して直角方向に最も深い点の両端
            pts.sort(key=lambda c: c["t"])

            # 凹み領域の開始と終了の投影位置
            t_min = pts[0]["t"]
            t_max = pts[-1]["t"]

            ei = edge_idx
            ej = (ei + 1) % len(hull_mm)
            ep1 = hull_mm[ei]
            ep2 = hull_mm[ej]

            # 凹みの角点を計算（辺から直角方向に落とした点）
            # 角1: 辺上のt_min位置
            corner1_on_edge = (
                round(ep1[0] + t_min * (ep2[0] - ep1[0])),
                round(ep1[1] + t_min * (ep2[1] - ep1[1])),
            )
            # 角2: 辺上のt_max位置
            corner2_on_edge = (
                round(ep1[0] + t_max * (ep2[0] - ep1[0])),
                round(ep1[1] + t_max * (ep2[1] - ep1[1])),
            )

            # 凹み深さ方向の点 (最も深い凹みの位置)
            max_depth_pt = max(pts, key=lambda c: c["depth"])

            # 凹みの内側角点
            # 辺の法線方向にmax_depth分だけ内側に入った位置
            edx = ep2[0] - ep1[0]
            edy = ep2[1] - ep1[1]
            edge_len = distance(ep1, ep2)
            nx = edy / edge_len
            ny = -edx / edge_len
            depth = max_depth_pt["depth"]

            inner_corner1 = (
                round(corner1_on_edge[0] + depth * nx),
                round(corner1_on_edge[1] + depth * ny),
            )
            inner_corner2 = (
                round(corner2_on_edge[0] + depth * nx),
                round(corner2_on_edge[1] + depth * ny),
            )

            concave_pts_by_edge[edge_idx] = [
                corner1_on_edge, inner_corner1, inner_corner2, corner2_on_edge
            ]

        if not concave_pts_by_edge:
            return hull

        # 凸包に凹み頂点を挿入して凹ポリゴンを構築
        result_mm: list[tuple] = []
        for i in range(len(hull_mm)):
            result_mm.append(hull_mm[i])
            if i in concave_pts_by_edge:
                # この辺に凹みがある → 角点を挿入
                for cp in concave_pts_by_edge[i]:
                    result_mm.append(cp)

        # mm座標をPDF座標に戻す
        result = [(p[0] / sf, p[1] / sf) for p in result_mm]

        if self.debug:
            print(f"[DEBUG] 凹ポリゴン: {len(hull)}頂点 → {len(result)}頂点 "
                  f"(凹み{len(concave_pts_by_edge)}箇所)")

        return result

    def _point_to_polygon_edge_dist(self, point: tuple,
                                     polygon: list[tuple]) -> float:
        """点からポリゴンの最近辺までの距離 (mm)"""
        min_d = float("inf")
        n = len(polygon)
        for i in range(n):
            j = (i + 1) % n
            d = perpendicular_distance(point, polygon[i], polygon[j])
            # 投影が辺の範囲内かチェック
            proj = project_point_on_line(point, polygon[i], polygon[j])
            d_actual = distance(point, proj)
            if d_actual < min_d:
                min_d = d_actual
        return min_d

    def _extend_walls_to_intersections(self) -> None:
        """近接する非平行壁の端点を交差点まで延長し、接続性を改善。

        壁のペアが角を形成しているが端点が離れている場合、
        両壁の延長線の交差点を計算し、端点をその交差点に移動する。
        """
        if len(self.walls) < 2:
            return

        max_gap_mm = 200  # 端点間がこの距離以内なら延長対象
        extended = 0

        for i, w1 in enumerate(self.walls):
            p1s = (w1["start_x_mm"], w1["start_y_mm"])
            p1e = (w1["end_x_mm"], w1["end_y_mm"])
            w1_len = distance(p1s, p1e)
            if w1_len < 100:
                continue

            for j, w2 in enumerate(self.walls):
                if j <= i:
                    continue
                p2s = (w2["start_x_mm"], w2["start_y_mm"])
                p2e = (w2["end_x_mm"], w2["end_y_mm"])
                w2_len = distance(p2s, p2e)
                if w2_len < 100:
                    continue

                # 平行な壁はスキップ（壁ペアのため）
                dx1 = p1e[0] - p1s[0]
                dy1 = p1e[1] - p1s[1]
                dx2 = p2e[0] - p2s[0]
                dy2 = p2e[1] - p2s[1]
                cross = abs(dx1 * dy2 - dy1 * dx2)
                dot = abs(dx1 * dx2 + dy1 * dy2)
                if cross < 0.1 * (w1_len * w2_len):
                    continue  # ほぼ平行

                # 最も近い端点ペアを探す
                pairs = [
                    ("end", "start", distance(p1e, p2s)),
                    ("end", "end", distance(p1e, p2e)),
                    ("start", "start", distance(p1s, p2s)),
                    ("start", "end", distance(p1s, p2e)),
                ]
                best_side1, best_side2, best_dist = min(pairs, key=lambda x: x[2])

                if best_dist > max_gap_mm or best_dist < 1:
                    continue

                # 交差点を計算
                ix = line_intersection(p1s, p1e, p2s, p2e)
                if ix is None:
                    continue

                # 交差点が両壁の近傍にあるか確認（極端に遠い交差点は除外）
                ep1 = p1e if best_side1 == "end" else p1s
                ep2 = p2s if best_side2 == "start" else p2e
                if distance(ix, ep1) > max_gap_mm or distance(ix, ep2) > max_gap_mm:
                    continue

                # 壁端点を交差点に移動
                ix_rounded = (round(ix[0]), round(ix[1]))
                if best_side1 == "end":
                    w1["end_x_mm"] = ix_rounded[0]
                    w1["end_y_mm"] = ix_rounded[1]
                else:
                    w1["start_x_mm"] = ix_rounded[0]
                    w1["start_y_mm"] = ix_rounded[1]

                if best_side2 == "start":
                    w2["start_x_mm"] = ix_rounded[0]
                    w2["start_y_mm"] = ix_rounded[1]
                else:
                    w2["end_x_mm"] = ix_rounded[0]
                    w2["end_y_mm"] = ix_rounded[1]

                extended += 1

        if self.debug:
            print(f"[DEBUG] 壁延長→交差点: {extended}組")

    def _snap_wall_endpoints(self) -> None:
        """壁の端点をスナップ距離以内で統合し、接続グラフを構築"""
        if not self.walls:
            return

        threshold = SNAP_THRESHOLD_MM

        # 全端点を収集
        endpoints: list[tuple[str, str, tuple]] = []  # (壁ID, "start"/"end", 座標)
        for w in self.walls:
            endpoints.append((w["id"], "start", (w["start_x_mm"], w["start_y_mm"])))
            endpoints.append((w["id"], "end", (w["end_x_mm"], w["end_y_mm"])))

        # スナップグループの構築 (Union-Find的)
        n = len(endpoints)
        group: list[int] = list(range(n))

        def find(x: int) -> int:
            while group[x] != x:
                group[x] = group[group[x]]
                x = group[x]
            return x

        def union(a: int, b: int) -> None:
            ra, rb = find(a), find(b)
            if ra != rb:
                group[ra] = rb

        # 近接端点をグルーピング
        for i in range(n):
            for j in range(i + 1, n):
                if distance(endpoints[i][2], endpoints[j][2]) < threshold:
                    union(i, j)

        # グループごとの重心を計算して端点を統合
        groups: dict[int, list[int]] = defaultdict(list)
        for i in range(n):
            groups[find(i)].append(i)

        # 壁接続グラフの構築
        node_id = 0
        self.wall_graph = {}

        for group_indices in groups.values():
            # グループ内の端点座標の重心
            cx = sum(endpoints[i][2][0] for i in group_indices) / len(group_indices)
            cy = sum(endpoints[i][2][1] for i in group_indices) / len(group_indices)
            snapped = (round(cx), round(cy))

            # 壁座標を更新
            wall_ids_at_node: list[str] = []
            for idx in group_indices:
                wall_id_str, side, _ = endpoints[idx]
                # 壁の座標をスナップ値に更新
                for w in self.walls:
                    if w["id"] == wall_id_str:
                        if side == "start":
                            w["start_x_mm"] = snapped[0]
                            w["start_y_mm"] = snapped[1]
                        else:
                            w["end_x_mm"] = snapped[0]
                            w["end_y_mm"] = snapped[1]
                        break
                wall_ids_at_node.append(wall_id_str)

            # ノードに2本以上の壁が接続 → グラフに登録
            node_key = node_id
            self.wall_graph[node_key] = wall_ids_at_node
            node_id += 1

        # 壁端点マッピングを更新
        for w in self.walls:
            self.wall_endpoint_map[w["id"]] = (
                (w["start_x_mm"], w["start_y_mm"]),
                (w["end_x_mm"], w["end_y_mm"]),
            )

        # T字・十字交差の検出
        self._detect_wall_intersections()

        if self.debug:
            t_count = sum(1 for wids in self.wall_graph.values() if len(wids) == 3)
            cross_count = sum(1 for wids in self.wall_graph.values() if len(wids) >= 4)
            print(f"[DEBUG] T字交差: {t_count}, 十字交差: {cross_count}")

    def _straighten_walls(self) -> None:
        """ほぼ水平/垂直な壁を完全な水平/垂直に矯正する。

        建築図面の壁は基本的に水平か垂直。壁ペア検出やスナップで
        わずかに傾いた壁を、傾き比率が15%未満なら矯正する。
        """
        straightened = 0
        for w in self.walls:
            sx, sy = w["start_x_mm"], w["start_y_mm"]
            ex, ey = w["end_x_mm"], w["end_y_mm"]
            dx = abs(ex - sx)
            dy = abs(ey - sy)
            length = (dx ** 2 + dy ** 2) ** 0.5
            if length < 100:
                continue

            if dx > dy:
                # ほぼ水平 — dy が 100mm未満 かつ dy/dx < 0.05 なら水平に矯正
                # (長い壁の微小傾きのみ。0.15は長壁で過剰矯正する)
                if dy > 0 and dx > 0 and dy < 100 and dy / dx < 0.05:
                    avg_y = round((sy + ey) / 2)
                    w["start_y_mm"] = avg_y
                    w["end_y_mm"] = avg_y
                    straightened += 1
            else:
                # ほぼ垂直 — dx が 100mm未満 かつ dx/dy < 0.05 なら垂直に矯正
                if dx > 0 and dy > 0 and dx < 100 and dx / dy < 0.05:
                    avg_x = round((sx + ex) / 2)
                    w["start_x_mm"] = avg_x
                    w["end_x_mm"] = avg_x
                    straightened += 1

        if self.debug and straightened:
            print(f"[DEBUG] 壁矯正(水平/垂直): {straightened}本")

    def _merge_collinear_walls(self) -> None:
        """同一直線上にある壁セグメントを統合し、断片化を解消する。

        同じ方向（平行）で、同じ直線上（垂直距離が小さい）で、
        端点が近接（重なりまたは小さなギャップ）している壁を1本に統合する。
        """
        if len(self.walls) < 2:
            return

        merge_gap_mm = 200  # この距離以内のギャップは統合
        perp_tol_mm = 100   # 垂直方向の許容差

        merged = True
        merge_count = 0

        while merged:
            merged = False
            i = 0
            while i < len(self.walls):
                w1 = self.walls[i]
                p1s = (w1["start_x_mm"], w1["start_y_mm"])
                p1e = (w1["end_x_mm"], w1["end_y_mm"])
                w1_len = distance(p1s, p1e)
                if w1_len < 10:
                    i += 1
                    continue

                j = i + 1
                merged_this = False
                while j < len(self.walls):
                    w2 = self.walls[j]
                    p2s = (w2["start_x_mm"], w2["start_y_mm"])
                    p2e = (w2["end_x_mm"], w2["end_y_mm"])
                    w2_len = distance(p2s, p2e)
                    if w2_len < 10:
                        j += 1
                        continue

                    # 厚みが異なる壁は統合しない（外壁+内壁混合防止）
                    if abs(w1.get("thickness_mm", 120) - w2.get("thickness_mm", 120)) > 50:
                        j += 1
                        continue

                    # 平行判定
                    if not lines_are_parallel(p1s, p1e, p2s, p2e):
                        j += 1
                        continue

                    # 垂直距離チェック
                    d1 = perpendicular_distance(p2s, p1s, p1e)
                    d2 = perpendicular_distance(p2e, p1s, p1e)
                    if max(d1, d2) > perp_tol_mm:
                        j += 1
                        continue

                    # 投影ベースで重なり/ギャップチェック
                    dx = p1e[0] - p1s[0]
                    dy = p1e[1] - p1s[1]
                    ux, uy = dx / w1_len, dy / w1_len

                    # w1上の投影区間
                    t1s, t1e = 0.0, w1_len

                    # w2上の投影区間
                    t2s = (p2s[0] - p1s[0]) * ux + (p2s[1] - p1s[1]) * uy
                    t2e = (p2e[0] - p1s[0]) * ux + (p2e[1] - p1s[1]) * uy
                    if t2s > t2e:
                        t2s, t2e = t2e, t2s

                    # ギャップチェック: 重なりまたは小さなギャップ
                    gap = max(t2s - t1e, t1s - t2e)
                    if gap > merge_gap_mm:
                        j += 1
                        continue

                    # 統合: 両端の最小・最大投影で新しい壁を作成
                    t_min = min(t1s, t2s)
                    t_max = max(t1e, t2e)
                    new_start = (
                        round(p1s[0] + t_min * ux),
                        round(p1s[1] + t_min * uy),
                    )
                    new_end = (
                        round(p1s[0] + t_max * ux),
                        round(p1s[1] + t_max * uy),
                    )

                    w1["start_x_mm"] = new_start[0]
                    w1["start_y_mm"] = new_start[1]
                    w1["end_x_mm"] = new_end[0]
                    w1["end_y_mm"] = new_end[1]
                    p1s = new_start
                    p1e = new_end
                    w1_len = distance(p1s, p1e)

                    # w2を削除
                    self.walls.pop(j)
                    merged = True
                    merged_this = True
                    merge_count += 1
                    # jは進めない（次の壁がjの位置に来る）

                if not merged_this:
                    i += 1
                else:
                    # w1が更新されたので再度同じiから
                    pass
                    i += 1

        if self.debug:
            print(f"[DEBUG] 壁統合: {merge_count}回統合 → 残{len(self.walls)}壁")

    def _merge_near_duplicate_walls(self) -> None:
        """近接重複壁の統合: 並行かつ近接(120mm以内)な壁ペアを検出し長い方を残す。

        什器線や壁ペアの片側が壁として誤検出された場合に、
        ほぼ同じ位置に並行する2本の壁が生成されることがある。
        これらを検出して長い方だけを残す。
        """
        if len(self.walls) < 2:
            return

        dup_dist_mm = 120  # この距離以内の並行壁を重複とみなす
        removed_indices: set[int] = set()

        for i in range(len(self.walls)):
            if i in removed_indices:
                continue
            w1 = self.walls[i]
            p1s = (w1["start_x_mm"], w1["start_y_mm"])
            p1e = (w1["end_x_mm"], w1["end_y_mm"])
            w1_len = distance(p1s, p1e)
            if w1_len < 10:
                continue

            for j in range(i + 1, len(self.walls)):
                if j in removed_indices:
                    continue
                w2 = self.walls[j]
                p2s = (w2["start_x_mm"], w2["start_y_mm"])
                p2e = (w2["end_x_mm"], w2["end_y_mm"])
                w2_len = distance(p2s, p2e)
                if w2_len < 10:
                    continue

                # 平行判定
                if not lines_are_parallel(p1s, p1e, p2s, p2e):
                    continue

                # 垂直距離チェック (120mm以内)
                d1 = perpendicular_distance(p2s, p1s, p1e)
                d2 = perpendicular_distance(p2e, p1s, p1e)
                if max(d1, d2) > dup_dist_mm:
                    continue

                # 投影重なりチェック: 2壁の投影区間が50%以上重なっていること
                dx = p1e[0] - p1s[0]
                dy = p1e[1] - p1s[1]
                ux, uy = dx / w1_len, dy / w1_len
                t2s = (p2s[0] - p1s[0]) * ux + (p2s[1] - p1s[1]) * uy
                t2e = (p2e[0] - p1s[0]) * ux + (p2e[1] - p1s[1]) * uy
                if t2s > t2e:
                    t2s, t2e = t2e, t2s
                overlap_start = max(0.0, t2s)
                overlap_end = min(w1_len, t2e)
                overlap = max(0.0, overlap_end - overlap_start)
                min_len = min(w1_len, w2_len)
                if min_len < 10 or overlap / min_len < 0.4:
                    continue

                # 重複確定: 短い方を除去
                if w1_len >= w2_len:
                    remove_idx = j
                    keep_wall = w1
                else:
                    remove_idx = i
                    keep_wall = w2
                removed_indices.add(remove_idx)
                if self.debug:
                    removed_wall = self.walls[remove_idx]
                    print(f"[DEBUG] 近接重複壁除去: {removed_wall['id']} "
                          f"L={distance((removed_wall['start_x_mm'], removed_wall['start_y_mm']), (removed_wall['end_x_mm'], removed_wall['end_y_mm'])):.0f}mm "
                          f"(並行距離{max(d1, d2):.0f}mm, 残={keep_wall['id']})")
                if remove_idx == i:
                    break  # w1が除去されたのでiのループを抜ける

        if removed_indices:
            before = len(self.walls)
            self.walls = [w for idx, w in enumerate(self.walls) if idx not in removed_indices]
            if self.debug:
                print(f"[DEBUG] 近接重複壁統合: {before} → {len(self.walls)} "
                      f"({len(removed_indices)}本除去)")

    def _filter_short_isolated_walls(self) -> None:
        """短壁(500mm未満)のうち、他の壁と端点接続していない孤立壁を除去する。

        500mm未満でも他の壁と端点が近い(100mm以内)場合は間仕切りの端として残す。
        350mm未満は無条件除去(従来通り)。
        1000mm以上の壁(外壁)は絶対に消さない。
        """
        short_threshold_mm = 500
        connect_radius_mm = 100  # この距離以内に他壁の端点があれば「接続」とみなす
        min_wall_mm = 350  # これ未満は無条件除去

        pre_count = len(self.walls)
        keep_walls: list[dict] = []

        for i, w in enumerate(self.walls):
            ws = (w["start_x_mm"], w["start_y_mm"])
            we = (w["end_x_mm"], w["end_y_mm"])
            w_len = distance(ws, we)

            # 1000mm以上は絶対に残す(外壁保護)
            if w_len >= 1000:
                keep_walls.append(w)
                continue

            # 350mm未満は無条件除去
            if w_len < min_wall_mm:
                if self.debug:
                    print(f"[DEBUG] 短壁除去(無条件): {w['id']} L={w_len:.0f}mm < {min_wall_mm}mm")
                continue

            # 350-500mm: 接続チェック
            if w_len < short_threshold_mm:
                # 他の壁(自分以外)の端点との最小距離を計算
                start_connected = False
                end_connected = False
                for j, other in enumerate(self.walls):
                    if i == j:
                        continue
                    os = (other["start_x_mm"], other["start_y_mm"])
                    oe = (other["end_x_mm"], other["end_y_mm"])
                    # start端点の接続チェック
                    if distance(ws, os) <= connect_radius_mm or distance(ws, oe) <= connect_radius_mm:
                        start_connected = True
                    # end端点の接続チェック
                    if distance(we, os) <= connect_radius_mm or distance(we, oe) <= connect_radius_mm:
                        end_connected = True
                    if start_connected and end_connected:
                        break

                if start_connected or end_connected:
                    # 少なくとも片端が接続 → 残す
                    keep_walls.append(w)
                    if self.debug:
                        conn_info = "両端" if (start_connected and end_connected) else ("始端" if start_connected else "終端")
                        print(f"[DEBUG] 短壁残留(接続あり): {w['id']} L={w_len:.0f}mm {conn_info}接続")
                else:
                    # 孤立 → 除去
                    if self.debug:
                        print(f"[DEBUG] 短壁除去(孤立): {w['id']} L={w_len:.0f}mm 端点接続なし")
                    continue
            else:
                # 500mm以上は残す
                keep_walls.append(w)

        self.walls = keep_walls
        if self.debug and len(self.walls) < pre_count:
            print(f"[DEBUG] 短壁フィルタ: {pre_count} → {len(self.walls)} "
                  f"({pre_count - len(self.walls)}本除去, 閾値{short_threshold_mm}mm, 接続半径{connect_radius_mm}mm)")

    def _split_walls_at_t_junctions(self) -> None:
        """T字交差点で壁を分割し、端点接続を確保する。

        壁Aの中間点に壁Bの端点が接している場合、壁Aをその点で2分割する。
        これにより隣接グラフで壁Aの中間点にも接続が生まれ、
        部屋ポリゴンのDFS探索が閉ループを見つけられるようになる。
        """
        snap = SNAP_THRESHOLD_MM
        new_walls: list[dict] = []
        walls_to_remove: set[str] = set()
        wall_nums = [int(w["id"].replace("wall_", ""))
                     for w in self.walls if w["id"].startswith("wall_")]
        next_id = (max(wall_nums) + 1) if wall_nums else 0

        # 各壁について、他の壁端点がT字接合しているか調べる
        for w1 in self.walls:
            p1 = (w1["start_x_mm"], w1["start_y_mm"])
            p2 = (w1["end_x_mm"], w1["end_y_mm"])
            w1_len = distance(p1, p2)
            if w1_len < 200:
                continue

            # w1上にT字接合する点を収集
            split_points: list[tuple[float, tuple]] = []  # (t値, 接合点座標)

            for w2 in self.walls:
                if w2["id"] == w1["id"]:
                    continue
                for ep in [(w2["start_x_mm"], w2["start_y_mm"]),
                           (w2["end_x_mm"], w2["end_y_mm"])]:
                    perp = perpendicular_distance(ep, p1, p2)
                    if perp > snap:
                        continue
                    dx = p2[0] - p1[0]
                    dy = p2[1] - p1[1]
                    t = ((ep[0] - p1[0]) * dx + (ep[1] - p1[1]) * dy) / (w1_len ** 2)
                    if 0.05 < t < 0.95:
                        # 投影点を接合座標にする（w2端点ではなくw1上の投影点）
                        proj = (round(p1[0] + t * dx), round(p1[1] + t * dy))
                        # 既存の分割点と重複しないか
                        duplicate = False
                        for _, existing in split_points:
                            if distance(proj, existing) < snap:
                                duplicate = True
                                break
                        if not duplicate:
                            split_points.append((t, proj))

            if not split_points:
                continue

            # t値でソートして壁を分割
            split_points.sort(key=lambda x: x[0])
            walls_to_remove.add(w1["id"])

            # 分割セグメントを生成
            segments = [(p1, split_points[0][1])]
            for k in range(len(split_points) - 1):
                segments.append((split_points[k][1], split_points[k + 1][1]))
            segments.append((split_points[-1][1], p2))

            for seg_start, seg_end in segments:
                seg_len = distance(seg_start, seg_end)
                if seg_len < 50:
                    continue
                new_wall = dict(w1)
                new_wall["id"] = f"wall_{next_id}"
                new_wall["start_x_mm"] = seg_start[0]
                new_wall["start_y_mm"] = seg_start[1]
                new_wall["end_x_mm"] = seg_end[0]
                new_wall["end_y_mm"] = seg_end[1]
                new_walls.append(new_wall)
                next_id += 1

        if walls_to_remove:
            self.walls = [w for w in self.walls if w["id"] not in walls_to_remove]
            self.walls.extend(new_walls)

            if self.debug:
                print(f"[DEBUG] T字分割: {len(walls_to_remove)}壁分割 → "
                      f"+{len(new_walls)}壁 = 合計{len(self.walls)}壁")

    def _detect_wall_intersections(self) -> None:
        """T字・十字交差を検出してグラフに追加"""
        sf = self.scale_factor

        # 壁の中間点に別の壁の端点が来ているケースを検出
        for w1 in self.walls:
            p1 = (w1["start_x_mm"], w1["start_y_mm"])
            p2 = (w1["end_x_mm"], w1["end_y_mm"])
            w1_len = distance(p1, p2)
            if w1_len < 100:
                continue

            for w2 in self.walls:
                if w2["id"] == w1["id"]:
                    continue
                # w2の各端点がw1の中間付近にあるか
                for ep in [(w2["start_x_mm"], w2["start_y_mm"]),
                           (w2["end_x_mm"], w2["end_y_mm"])]:
                    perp = perpendicular_distance(ep, p1, p2)
                    if perp > SNAP_THRESHOLD_MM:
                        continue
                    # w1上の投影位置が端点でないことを確認 (T字判定)
                    dx = p2[0] - p1[0]
                    dy = p2[1] - p1[1]
                    t = ((ep[0] - p1[0]) * dx + (ep[1] - p1[1]) * dy) / (w1_len ** 2)
                    if 0.1 < t < 0.9:
                        # T字交差 — グラフに交差ノードを追加
                        cross_pt = (round(p1[0] + t * dx), round(p1[1] + t * dy))
                        node_key = len(self.wall_graph)
                        if not any(
                            w1["id"] in wids and w2["id"] in wids
                            for wids in self.wall_graph.values()
                        ):
                            self.wall_graph[node_key] = [w1["id"], w2["id"]]

    def _filter_out_of_page_walls(self) -> None:
        """ページ範囲外の壁を除去 (寸法線エリアの偽壁など)"""
        page_w_real = self.page_width_mm * self.scale_factor
        page_h_real = self.page_height_mm * self.scale_factor
        margin = 500  # 500mm (実寸) の余裕

        before = len(self.walls)
        filtered = []
        for w in self.walls:
            sx, sy = w["start_x_mm"], w["start_y_mm"]
            ex, ey = w["end_x_mm"], w["end_y_mm"]
            # いずれかの端点がページ範囲外なら除去
            any_out = (min(sx, ex) < -margin or min(sy, ey) < -margin or
                       max(sx, ex) > page_w_real + margin or
                       max(sy, ey) > page_h_real + margin)
            if any_out:
                continue
            filtered.append(w)
        self.walls = filtered

        if self.debug and before != len(self.walls):
            print(f"[DEBUG] ページ範囲外壁フィルタ: {before} → {len(self.walls)} "
                  f"({before - len(self.walls)}本除去)")

    def _snap_polygon_to_walls(self, polygon_mm: list[list[int]]) -> list[list[int]]:
        """部屋ポリゴンの頂点を最寄りの壁線にスナップし、共線頂点を除去"""
        if not self.walls or len(polygon_mm) < 3:
            return polygon_mm

        snap_threshold = 300  # mm — この距離以内の壁にスナップ
        snapped = []

        for vx, vy in polygon_mm:
            best_dist = snap_threshold
            snapped_x, snapped_y = vx, vy

            for w in self.walls:
                sx, sy = w["start_x_mm"], w["start_y_mm"]
                ex, ey = w["end_x_mm"], w["end_y_mm"]

                # 水平壁 → Y座標をスナップ
                if abs(sy - ey) < 50 and abs(vy - sy) < best_dist:
                    # 頂点が壁のX範囲内か確認
                    wx_min, wx_max = min(sx, ex) - 200, max(sx, ex) + 200
                    if wx_min <= vx <= wx_max:
                        best_dist = abs(vy - sy)
                        snapped_y = round((sy + ey) / 2)

                # 垂直壁 → X座標をスナップ
                if abs(sx - ex) < 50 and abs(vx - sx) < best_dist:
                    wy_min, wy_max = min(sy, ey) - 200, max(sy, ey) + 200
                    if wy_min <= vy <= wy_max:
                        best_dist = abs(vx - sx)
                        snapped_x = round((sx + ex) / 2)

            snapped.append([snapped_x, snapped_y])

        # 共線頂点を除去 (3連続点がほぼ直線なら中間を削除)
        if len(snapped) <= 3:
            return snapped

        simplified = [snapped[0]]
        for i in range(1, len(snapped) - 1):
            prev = simplified[-1]
            curr = snapped[i]
            nxt = snapped[i + 1]
            # 3点が直線上か (外積で判定)
            cross = abs((curr[0] - prev[0]) * (nxt[1] - prev[1]) -
                        (curr[1] - prev[1]) * (nxt[0] - prev[0]))
            # 面積が小さければ共線
            if cross > 50000:  # 十分な面積があれば頂点を維持
                simplified.append(curr)
        simplified.append(snapped[-1])

        # 最初と最後の共線チェック
        if len(simplified) > 3:
            prev = simplified[-2]
            curr = simplified[-1]
            nxt = simplified[0]
            cross = abs((curr[0] - prev[0]) * (nxt[1] - prev[1]) -
                        (curr[1] - prev[1]) * (nxt[0] - prev[0]))
            if cross < 50000:
                simplified.pop()

        # 最終チェック: まだ頂点が多い場合、近接頂点をマージ
        if len(simplified) > 12:
            merged = [simplified[0]]
            for i in range(1, len(simplified)):
                dx = abs(simplified[i][0] - merged[-1][0])
                dy = abs(simplified[i][1] - merged[-1][1])
                if dx + dy > 200:  # 200mm以上離れていれば別の頂点
                    merged.append(simplified[i])
            simplified = merged if len(merged) >= 3 else simplified

        return simplified if len(simplified) >= 3 else snapped

    @staticmethod
    def _pt_dist(p1, p2) -> float:
        """2点間の距離"""
        return ((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5

    @staticmethod
    def _project_point_to_segment(pt, seg_start, seg_end):
        """点を線分上に投影し、(投影点, 距離) を返す"""
        dx = seg_end[0] - seg_start[0]
        dy = seg_end[1] - seg_start[1]
        len_sq = dx * dx + dy * dy
        if len_sq < 1e-10:
            d = ((pt[0] - seg_start[0]) ** 2 + (pt[1] - seg_start[1]) ** 2) ** 0.5
            return list(seg_start), d
        t = ((pt[0] - seg_start[0]) * dx + (pt[1] - seg_start[1]) * dy) / len_sq
        t = max(0.0, min(1.0, t))
        proj = [seg_start[0] + t * dx, seg_start[1] + t * dy]
        d = ((pt[0] - proj[0]) ** 2 + (pt[1] - proj[1]) ** 2) ** 0.5
        return proj, d

    def _simplify_room_polygon(self, polygon_mm: list[list[int]], snap_thresh: int = 50) -> list[list[int]]:
        """部屋ポリゴンを直交化・壁スナップする後処理。

        Steps:
        1. 近接頂点の統合 (20mm以内)
        2. 軸揃え — 各辺を水平 or 垂直にスナップ
        3. 壁スナップ — 頂点を最寄り壁線上に投影 (snap_thresh mm以内)
        """
        if len(polygon_mm) < 3:
            return polygon_mm

        # --- Step 1: 近接頂点の統合 (20mm以内) ---
        simplified: list[list[int]] = []
        for pt in polygon_mm:
            if not simplified or self._pt_dist(pt, simplified[-1]) > 20:
                simplified.append(list(pt))
        if len(simplified) > 1 and self._pt_dist(simplified[0], simplified[-1]) < 20:
            simplified.pop()
        if len(simplified) < 3:
            return polygon_mm

        # --- Step 2: 軸揃え — 各辺を水平 or 垂直にスナップ ---
        result: list[list[int]] = [list(simplified[0])]
        for i in range(1, len(simplified)):
            prev = result[-1]
            curr = list(simplified[i])
            dx = abs(curr[0] - prev[0])
            dy = abs(curr[1] - prev[1])
            # ほぼ水平 (dy < dx * tan(5deg) ≈ dx * 0.087 → 0.1)
            if dy < dx * 0.1 and dx > 50:
                curr[1] = prev[1]
            # ほぼ垂直
            elif dx < dy * 0.1 and dy > 50:
                curr[0] = prev[0]
            result.append(curr)

        # 最初の辺も軸揃え (最後→最初)
        if len(result) >= 2:
            last = result[-1]
            first = result[0]
            dx = abs(first[0] - last[0])
            dy = abs(first[1] - last[1])
            if dy < dx * 0.1 and dx > 50:
                result[0] = [first[0], last[1]]
            elif dx < dy * 0.1 and dy > 50:
                result[0] = [last[0], first[1]]

        # --- Step 3: 壁スナップ — 頂点を最寄り壁線上に投影 ---
        if self.walls:
            for i, pt in enumerate(result):
                best_dist = snap_thresh
                best_pt = None
                for w in self.walls:
                    proj, dist = self._project_point_to_segment(
                        pt,
                        [w['start_x_mm'], w['start_y_mm']],
                        [w['end_x_mm'], w['end_y_mm']])
                    if dist < best_dist:
                        best_dist = dist
                        best_pt = proj
                if best_pt:
                    result[i] = [round(best_pt[0]), round(best_pt[1])]

        return result if len(result) >= 3 else polygon_mm

    @staticmethod
    def _clean_polygon_self_intersections(polygon_pts: list[list[int]]) -> list[list[int]]:
        """Remove self-intersections from a polygon.

        Steps:
        1. Remove consecutive duplicate points
        2. Remove fold-back patterns (A->B->A)
        3. Detect edge-edge intersections, split at intersection points,
           and keep the largest-area sub-polygon
        """
        if len(polygon_pts) < 3:
            return polygon_pts

        # --- Step 1: Remove consecutive duplicate points (within 5mm) ---
        cleaned: list[list[int]] = [list(polygon_pts[0])]
        for i in range(1, len(polygon_pts)):
            dx = polygon_pts[i][0] - cleaned[-1][0]
            dy = polygon_pts[i][1] - cleaned[-1][1]
            if abs(dx) > 5 or abs(dy) > 5:
                cleaned.append(list(polygon_pts[i]))
        # Check last vs first
        if len(cleaned) > 1:
            dx = cleaned[-1][0] - cleaned[0][0]
            dy = cleaned[-1][1] - cleaned[0][1]
            if abs(dx) <= 5 and abs(dy) <= 5:
                cleaned.pop()
        if len(cleaned) < 3:
            return polygon_pts

        # --- Step 2: Remove fold-back patterns (A->B->A within 20mm) ---
        changed = True
        while changed:
            changed = False
            if len(cleaned) < 3:
                break
            new_pts: list[list[int]] = []
            i = 0
            while i < len(cleaned):
                if i + 2 < len(cleaned):
                    a = cleaned[i]
                    c = cleaned[i + 2]
                    if abs(a[0] - c[0]) <= 20 and abs(a[1] - c[1]) <= 20:
                        # A->B->A pattern: skip B and the duplicate A
                        new_pts.append(a)
                        i += 3
                        changed = True
                        continue
                new_pts.append(cleaned[i])
                i += 1
            # Also check wrap-around fold-backs
            if len(new_pts) >= 3:
                # Check last-first-second
                a = new_pts[-1]
                c = new_pts[1] if len(new_pts) > 1 else new_pts[0]
                if abs(a[0] - c[0]) <= 20 and abs(a[1] - c[1]) <= 20:
                    new_pts.pop(0)
                    changed = True
                # Check second-to-last, last, first
                if len(new_pts) >= 3:
                    a = new_pts[-2]
                    c = new_pts[0]
                    if abs(a[0] - c[0]) <= 20 and abs(a[1] - c[1]) <= 20:
                        new_pts.pop(-1)
                        changed = True
            cleaned = new_pts

        if len(cleaned) < 3:
            return polygon_pts

        # --- Step 3: Detect and resolve edge-edge self-intersections ---
        def _seg_intersect(p1, p2, p3, p4):
            """Return intersection point of segments p1-p2 and p3-p4, or None."""
            d1x = p2[0] - p1[0]; d1y = p2[1] - p1[1]
            d2x = p4[0] - p3[0]; d2y = p4[1] - p3[1]
            denom = d1x * d2y - d1y * d2x
            if abs(denom) < 1e-10:
                return None
            t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denom
            u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / denom
            # Strict interior intersection (not at endpoints)
            if 0.01 < t < 0.99 and 0.01 < u < 0.99:
                ix = p1[0] + t * d1x
                iy = p1[1] + t * d1y
                return [round(ix), round(iy)]
            return None

        # Iteratively resolve intersections (max 50 passes to avoid infinite loop)
        for _pass in range(50):
            n = len(cleaned)
            found_intersection = False
            for i in range(n):
                if found_intersection:
                    break
                for j in range(i + 2, n):
                    if i == 0 and j == n - 1:
                        continue  # Adjacent edges (wrap-around)
                    p1 = cleaned[i]
                    p2 = cleaned[(i + 1) % n]
                    p3 = cleaned[j]
                    p4 = cleaned[(j + 1) % n]
                    ix = _seg_intersect(p1, p2, p3, p4)
                    if ix is not None:
                        # Split into two sub-polygons at intersection point
                        sub1 = [ix] + cleaned[i + 1:j + 1]
                        sub2_pts = cleaned[j + 1:] + cleaned[:i + 1]
                        sub2 = [ix] + sub2_pts

                        area1 = abs(shoelace_area(sub1)) if len(sub1) >= 3 else 0
                        area2 = abs(shoelace_area(sub2)) if len(sub2) >= 3 else 0

                        if area1 >= area2 and len(sub1) >= 3:
                            cleaned = [[p[0], p[1]] for p in sub1]
                        elif len(sub2) >= 3:
                            cleaned = [[p[0], p[1]] for p in sub2]
                        else:
                            continue

                        found_intersection = True
                        break
            if not found_intersection:
                break  # No more intersections
            if len(cleaned) < 3:
                return polygon_pts

        return cleaned if len(cleaned) >= 3 else polygon_pts

    def _pair_dimension_endpoints(self) -> None:
        """寸法テキストから寸法線の端点ペアを構築"""
        sf = self.scale_factor

        for dt in self.dim_texts:
            text_origin = dt["origin"]
            value_mm = dt["value_mm"]

            # 寸法テキストの近くにある短い線の端点を探す
            # 寸法線の構造: テキスト ←→ 寸法線 ←→ 2つの引出線端点
            p1_found, p2_found = self._find_dimension_endpoints(text_origin, value_mm)

            if p1_found and p2_found:
                self.dimensions.append({
                    "p1_mm": [round(p1_found[0] * sf), round(p1_found[1] * sf)],
                    "p2_mm": [round(p2_found[0] * sf), round(p2_found[1] * sf)],
                    "value_mm": value_mm,
                    "label": dt["text"],
                    "paired": True,
                })
            else:
                # フォールバック: テキスト位置のみ
                self.dimensions.append({
                    "p1_mm": [round(text_origin[0] * sf), round(text_origin[1] * sf)],
                    "p2_mm": [0, 0],
                    "value_mm": value_mm,
                    "label": dt["text"],
                    "paired": False,
                })

        # 連続寸法（チェーン寸法）の検出と整合性チェック
        self._validate_chain_dimensions()

    def _find_dimension_endpoints(self, text_origin: tuple, value_mm: float
                                  ) -> tuple[Optional[tuple], Optional[tuple]]:
        """寸法テキスト近傍で、寸法値に最も近い長さの寸法線を1本選んでその端点を返す。

        旧方式の問題: 近傍の全端点から最遠を取ると、別の寸法線の端点を拾い
        p1/p2のスパンが実際の寸法値と一致しなくなる。
        新方式: 寸法値/scale_factor に最も近い長さの単一線を選択。
        """
        sf = self.scale_factor
        search_r = DIM_ENDPOINT_SEARCH_RADIUS_MM
        expected_paper_mm = value_mm / sf  # 用紙上での期待長さ

        # テキスト近傍の細い H/V 線を収集
        candidates: list[tuple[float, RawLine]] = []  # (score, line)
        for line in self.dim_lines:
            mp = midpoint(line.p1, line.p2)
            text_dist = distance(text_origin, mp)
            if text_dist > search_r * 3:
                continue
            if not (is_horizontal(line.p1, line.p2) or is_vertical(line.p1, line.p2)):
                continue
            # 長さとの一致度スコア (低いほど良い)
            length_diff = abs(line.length - expected_paper_mm)
            length_ratio = length_diff / max(expected_paper_mm, 1.0)
            if length_ratio > 0.5:  # 50%以上ズレたら候補外
                continue
            # テキストとの距離 + 長さ一致度の複合スコア
            score = text_dist * 0.3 + length_diff * 0.7
            candidates.append((score, line))

        if not candidates:
            # フォールバック: 最も近い線 (長さ無視)
            best_line = None
            best_dist = search_r * 3
            for line in self.dim_lines:
                mp = midpoint(line.p1, line.p2)
                d = distance(text_origin, mp)
                if d < best_dist and (is_horizontal(line.p1, line.p2) or
                                       is_vertical(line.p1, line.p2)):
                    best_dist = d
                    best_line = line
            if best_line:
                return best_line.p1, best_line.p2
            return None, None

        # 最良スコアの線を選択
        candidates.sort(key=lambda x: x[0])
        best_line = candidates[0][1]

        # 検証: 選ばれた線の長さと期待長さの一致度
        actual_mm = best_line.length * sf
        if actual_mm > 0 and abs(actual_mm - value_mm) / value_mm > 0.3:
            # 30%以上ズレ → unpaired扱い
            return None, None

        return best_line.p1, best_line.p2

    def _validate_chain_dimensions(self) -> None:
        """連続寸法（チェーン寸法）の整合性チェック。
        区間合計と全体寸法の一致を検証する。
        """
        if len(self.dimensions) < 3:
            return

        sf = self.scale_factor
        # 水平/垂直別にグルーピング
        h_dims: list[dict] = []
        v_dims: list[dict] = []

        for d in self.dimensions:
            if not d.get("paired"):
                continue
            p1 = d["p1_mm"]
            p2 = d["p2_mm"]
            dx = abs(p2[0] - p1[0])
            dy = abs(p2[1] - p1[1])
            if dx > dy:
                h_dims.append(d)
            else:
                v_dims.append(d)

        for dims, direction in [(h_dims, "水平"), (v_dims, "垂直")]:
            if len(dims) < 3:
                continue

            # Y座標(水平の場合)またはX座標(垂直の場合)でグルーピング
            # 同一高さの寸法線をチェーン候補としてまとめる
            coord_idx = 1 if direction == "水平" else 0
            groups: dict[int, list[dict]] = defaultdict(list)
            for d in dims:
                coord = (d["p1_mm"][coord_idx] + d["p2_mm"][coord_idx]) // 2
                bucket = round(coord / 100) * 100  # 100mm単位でバケット化
                groups[bucket].append(d)

            for bucket, group_dims in groups.items():
                if len(group_dims) < 2:
                    continue

                # 最大の寸法値を全体寸法と仮定
                sorted_dims = sorted(group_dims, key=lambda d: d["value_mm"])
                total_dim = sorted_dims[-1]
                sub_dims = sorted_dims[:-1]

                sub_sum = sum(d["value_mm"] for d in sub_dims)
                total_val = total_dim["value_mm"]

                if sub_sum > 0 and abs(sub_sum - total_val) < total_val * 0.05:
                    # 整合性OK
                    if self.debug:
                        print(f"[DEBUG] チェーン寸法OK ({direction}): "
                              f"{'+'.join(str(int(d['value_mm'])) for d in sub_dims)} "
                              f"= {int(sub_sum)} ~ {int(total_val)}")
                elif sub_sum > 0 and abs(sub_sum - total_val) >= total_val * 0.05:
                    diff = sub_sum - total_val
                    self.warnings.append(
                        f"チェーン寸法不整合 ({direction}): "
                        f"区間合計{int(sub_sum)}mm vs 全体{int(total_val)}mm "
                        f"(差: {int(diff)}mm)"
                    )

    def _build_room_polygons_cv2(self) -> bool:
        """OpenCVでPDFラスター画像から直接部屋を検出。

        PDFのレンダリング画像を使うので、壁の位置が正確で
        ベクター抽出の誤差に影響されない。
        """
        if not _HAS_CV2:
            return False

        if not self._raster_wall_mask():
            return False

        mask = self._wall_raster_mask
        h, w = mask.shape
        sf = self.scale_factor
        cell_mm = 100
        dpi = self._raster_dpi
        page_h_pt = self._raster_page_height_pt

        # === 壁のみマスクを構築 (BFS用) ===
        # ラスター二値化マスクは什器・寸法線も拾ってしまうため、
        # BFS用には検出済み壁のみで構築したクリーンマスクを使う。
        # これにより什器の線でBFSが止まらず、正確な部屋面積が得られる。
        wall_only_mask = np.zeros_like(mask)
        if self.walls:
            for wall in self.walls:
                # 実寸mm → ラスターpx 変換
                sx_mm, sy_mm = wall["start_x_mm"] / sf, wall["start_y_mm"] / sf
                ex_mm, ey_mm = wall["end_x_mm"] / sf, wall["end_y_mm"] / sf
                # paper_mm → pt → px
                sx_pt = sx_mm / PT_TO_MM
                sy_pt = page_h_pt - sy_mm / PT_TO_MM  # flip_y逆変換
                ex_pt = ex_mm / PT_TO_MM
                ey_pt = page_h_pt - ey_mm / PT_TO_MM
                sx_px = int(sx_pt * dpi / 72.0)
                sy_px = int(sy_pt * dpi / 72.0)
                ex_px = int(ex_pt * dpi / 72.0)
                ey_px = int(ey_pt * dpi / 72.0)
                # Wall thickness in px (min 8px so BFS cannot leak through)
                thick_mm = wall.get("thickness_mm", 120)
                thick_px = max(8, int(thick_mm / sf / PT_TO_MM * dpi / 72.0))
                cv2.line(wall_only_mask, (sx_px, sy_px), (ex_px, ey_px), 255, thick_px)
                # Draw circular patches at wall endpoints to seal junction gaps
                endpoint_r = max(thick_px, 8)
                cv2.circle(wall_only_mask, (sx_px, sy_px), endpoint_r, 255, -1)
                cv2.circle(wall_only_mask, (ex_px, ey_px), endpoint_r, 255, -1)
            if self.debug:
                wall_px = int(np.count_nonzero(wall_only_mask))
                print(f"[DEBUG] 壁のみマスク構築: {len(self.walls)}本, {wall_px}px")

        # ラスター二値化マスクにも壁を追加 (コンター抽出の精度向上用)
        mask = cv2.bitwise_or(mask, wall_only_mask)

        # ドア/開口部の位置にマスク上で閉鎖線を描画 → BFS漏れ防止
        # (検出済みのドア弧・引戸・折戸・壁ギャップ開口の位置に壁線を追加)
        opening_close_count = 0
        all_openings_for_mask = []
        # 開き戸: 弧の中心(=ヒンジ側)から弧の半径分の範囲に壁線を描画
        for da in self.door_arcs:
            cx_mm = da["center"][0] * sf
            cy_mm = da["center"][1] * sf
            r_mm = da["radius_mm"]
            # ドアの開口幅に対応する壁線を描画
            all_openings_for_mask.append((cx_mm, cy_mm, r_mm))
        # 引戸
        for sd in self.sliding_doors:
            c = sd.get("center_mm") or sd.get("center")
            if c:
                cx_mm = c[0] if len(c) >= 2 else 0
                cy_mm = c[1] if len(c) >= 2 else 0
                w_mm = sd.get("width_mm", 900)
                all_openings_for_mask.append((cx_mm, cy_mm, w_mm))
        # 折戸
        for fd in self.folding_doors:
            c = fd.get("center_mm") or fd.get("center")
            if c:
                cx_mm = c[0] if len(c) >= 2 else 0
                cy_mm = c[1] if len(c) >= 2 else 0
                w_mm = fd.get("width_mm", 900)
                all_openings_for_mask.append((cx_mm, cy_mm, w_mm))
        # 壁ギャップ開口
        for op in self.openings:
            c = op.get("center_mm")
            if c:
                cx_mm = c[0]
                cy_mm = c[1]
                w_mm = op.get("width_mm", 900)
                all_openings_for_mask.append((cx_mm, cy_mm, w_mm))

        for cx_mm, cy_mm, open_width_mm in all_openings_for_mask:
            # 実寸mm → ラスターpx
            cx_paper = cx_mm / sf
            cy_paper = cy_mm / sf
            cx_pt = cx_paper / PT_TO_MM
            cy_pt = page_h_pt - cy_paper / PT_TO_MM
            cx_px = int(cx_pt * dpi / 72.0)
            cy_px = int(cy_pt * dpi / 72.0)
            # 開口幅 → ピクセル半径 (少しマージン追加)
            r_paper = (open_width_mm * 0.6) / sf
            r_px = max(8, int(r_paper / PT_TO_MM * dpi / 72.0))
            # 中心を通る十字線を描画 — 壁のみマスクとラスターマスク両方に
            for target_mask in [wall_only_mask, mask]:
                if 0 <= cy_px < h:
                    x1 = max(0, cx_px - r_px)
                    x2 = min(w - 1, cx_px + r_px)
                    cv2.line(target_mask, (x1, cy_px), (x2, cy_px), 255, 6)
                if 0 <= cx_px < w:
                    y1 = max(0, cy_px - r_px)
                    y2 = min(h - 1, cy_px + r_px)
                    cv2.line(target_mask, (cx_px, y1), (cx_px, y2), 255, 6)
            opening_close_count += 1

        if self.debug and opening_close_count > 0:
            print(f"[DEBUG] 開口部マスク閉鎖: {opening_close_count}箇所")

        # 壁のみマスクにモルフォロジー閉鎖 (BFS用: 壁間の小さな隙間を閉じる)
        close_wall = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        wall_closed = cv2.morphologyEx(wall_only_mask, cv2.MORPH_CLOSE, close_wall, iterations=2)

        # ラスターマスクにもモルフォロジー (コンター抽出精度向上用)
        close_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_small, iterations=2)
        close_medium = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))
        closed = cv2.morphologyEx(closed, cv2.MORPH_CLOSE, close_medium, iterations=1)
        close_large = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (55, 55))
        closed = cv2.morphologyEx(closed, cv2.MORPH_CLOSE, close_large, iterations=1)

        # === 室名テキストシード方式 ===
        # 各室名テキストの位置からフラッドフィルし、壁で囲まれた領域を部屋として検出。
        # 従来の外部フラッドフィル方式と違い、ドア開口を通じた部屋マージが起きない。

        # mm座標 → ラスターピクセル座標
        def mm_to_raster_local(x_mm: float, y_mm: float) -> tuple[int, int]:
            x_pt = x_mm / PT_TO_MM
            y_pt_orig = page_h_pt - (y_mm / PT_TO_MM)
            return int(x_pt * dpi / 72.0), int(y_pt_orig * dpi / 72.0)

        # ラスター座標→mm座標
        def raster_to_mm(px_x: int, px_y: int) -> tuple[float, float]:
            x_pt = px_x * 72.0 / dpi
            y_pt_orig = px_y * 72.0 / dpi
            y_flipped_pt = page_h_pt - y_pt_orig
            x_mm = x_pt * PT_TO_MM
            y_mm = y_flipped_pt * PT_TO_MM
            return x_mm * sf, y_mm * sf

        # ラベル画像: 0=未割当, 壁=特殊値, N=部屋N
        # closedマスク (ラスター二値化 + 壁描画 + モルフォロジー閉鎖) を使用。
        # 什器線も壁として扱われるが、BFS全シード方式 + グラフ閉路補完 + 不明室マージ
        # の組み合わせで精度を確保する。
        label_img = np.zeros((h, w), dtype=np.int32)
        label_img[closed > 0] = -1  # 壁 = -1

        # 室名テキストのシード位置を収集 (壁上なら近傍の空きpxに移動)
        seeds: list[tuple[int, int, int, dict]] = []  # (px_x, px_y, label_id, room_name_dict)
        label_counter = 0
        for rn in self.room_names:
            px_x, px_y = mm_to_raster_local(rn["origin"][0], rn["origin"][1])
            if not (0 <= px_x < w and 0 <= px_y < h):
                continue
            # 壁上の場合は近傍の空きピクセルを探索
            if label_img[px_y, px_x] != 0:
                found = False
                for radius in range(1, 60):
                    for dy in range(-radius, radius + 1):
                        for dx in range(-radius, radius + 1):
                            if abs(dx) + abs(dy) != radius:
                                continue
                            nx, ny = px_x + dx, px_y + dy
                            if 0 <= nx < w and 0 <= ny < h and label_img[ny, nx] == 0:
                                px_x, px_y = nx, ny
                                found = True
                                break
                        if found:
                            break
                    if found:
                        break
                if not found:
                    continue
            label_counter += 1
            seeds.append((px_x, px_y, label_counter, rn))

        if self.debug:
            print(f"[DEBUG] 室名シード: {len(seeds)}個 (室名テキスト: {len(self.room_names)}個)")

        # === BFSフラッドフィル方式 (全シード統一) ===
        # レイキャスト矩形の代わりに、全シードからBFSフラッドフィルで
        # 実際の部屋形状を塗り分ける。壁マスク(closed)が開口を閉じているので
        # BFSが隣室に漏れることなく正確な部屋形状を取得できる。
        from collections import deque as _deque

        px_per_mm_paper = (dpi / 72.0) / PT_TO_MM
        area_max_paper = 30_000_000 / (sf * sf)
        max_room_px = int(area_max_paper * (px_per_mm_paper ** 2))
        max_room_px = min(max_room_px, 1_500_000)

        bfs_filled_count = 0
        for px_x, px_y, lid, rn in seeds:
            if label_img[px_y, px_x] != 0:
                continue
            queue = _deque([(px_x, px_y)])
            label_img[px_y, px_x] = lid
            count = 0
            while queue:
                cx, cy = queue.popleft()
                count += 1
                if count > max_room_px:
                    break
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and label_img[ny, nx] == 0:
                        label_img[ny, nx] = lid
                        queue.append((nx, ny))
            bfs_filled_count += 1

        if self.debug:
            print(f"[DEBUG] BFSフラッドフィル部屋: {bfs_filled_count}室")

        # 未割当の室内領域用に外部フラッドフィルも実行 → 残りを連結成分で拾う
        exterior_val = -2
        for seed_pt in [(0,0), (w-1,0), (0,h-1), (w-1,h-1)]:
            sx, sy = seed_pt
            if label_img[sy, sx] == 0:
                queue = _deque([(sx, sy)])
                label_img[sy, sx] = exterior_val
                while queue:
                    cx, cy = queue.popleft()
                    for ddx, ddy in ((1,0),(-1,0),(0,1),(0,-1)):
                        nx, ny = cx + ddx, cy + ddy
                        if 0 <= nx < w and 0 <= ny < h and label_img[ny, nx] == 0:
                            label_img[ny, nx] = exterior_val
                            queue.append((nx, ny))

        # 残りの未割当領域 (室名テキストがない部屋) を連結成分で拾う
        # 不明室は什器線で分断された小領域が多いため、閾値を高めに設定
        remaining = np.uint8(label_img == 0) * 255
        if np.any(remaining):
            num_rem, rem_labels, rem_stats, rem_centroids = cv2.connectedComponentsWithStats(
                remaining, connectivity=4
            )
            px_to_mm_local = 72.0 / dpi * PT_TO_MM * sf
            for rem_id in range(1, num_rem):
                area_px = rem_stats[rem_id, cv2.CC_STAT_AREA]
                area_m2 = area_px * (px_to_mm_local ** 2) / 1_000_000.0
                if area_m2 >= 1.5:
                    label_counter += 1
                    label_img[rem_labels == rem_id] = label_counter

        # ラベル画像からstats/centroids相当を計算
        unique_labels = set(int(v) for v in np.unique(label_img) if v > 0)
        num_labels = max(unique_labels) + 1 if unique_labels else 1

        # statsとcentroidsを構築
        stats = np.zeros((num_labels, 5), dtype=np.int32)
        centroids = np.zeros((num_labels, 2), dtype=np.float64)
        labels = label_img

        for lid in unique_labels:
            mask_lid = (label_img == lid)
            area = int(np.count_nonzero(mask_lid))
            ys, xs = np.where(mask_lid)
            if len(xs) == 0:
                continue
            stats[lid, cv2.CC_STAT_AREA] = area
            stats[lid, cv2.CC_STAT_LEFT] = int(xs.min())
            stats[lid, cv2.CC_STAT_TOP] = int(ys.min())
            stats[lid, cv2.CC_STAT_WIDTH] = int(xs.max() - xs.min())
            stats[lid, cv2.CC_STAT_HEIGHT] = int(ys.max() - ys.min())
            centroids[lid] = [xs.mean(), ys.mean()]

        # シード→ラベルIDのマッピング (室名マッチング用)
        seed_label_names: dict[int, str] = {}
        seed_label_is_area: dict[int, bool] = {}
        for _, _, lid, rn in seeds:
            seed_label_names[lid] = rn["name"]
            seed_label_is_area[lid] = rn.get("is_area_label", False)

        if self.debug:
            print(f"[DEBUG] 室名シード部屋検出: {len(unique_labels)}領域 "
                  f"(シード: {len(seeds)}, 残り: {len(unique_labels) - len(seeds)})")

        # ラスター座標→mm座標の変換関数
        def raster_to_mm(px_x: int, px_y: int) -> tuple[float, float]:
            x_pt = px_x * 72.0 / dpi
            y_pt_orig = px_y * 72.0 / dpi
            # un-flip → 内部mm座標
            y_flipped_pt = page_h_pt - y_pt_orig
            x_mm = x_pt * PT_TO_MM
            y_mm = y_flipped_pt * PT_TO_MM
            return x_mm * sf, y_mm * sf

        # 壁の外接矩形を計算 (範囲外ノイズフィルタ用)
        if self.walls:
            wall_xs = []
            wall_ys = []
            for wall in self.walls:
                wall_xs.extend([wall["start_x_mm"], wall["end_x_mm"]])
                wall_ys.extend([wall["start_y_mm"], wall["end_y_mm"]])
            wall_bound_x_min = min(wall_xs) - 500  # 500mmマージン
            wall_bound_x_max = max(wall_xs) + 500
            wall_bound_y_min = min(wall_ys) - 500
            wall_bound_y_max = max(wall_ys) + 500
        else:
            wall_bound_x_min = wall_bound_y_min = -float("inf")
            wall_bound_x_max = wall_bound_y_max = float("inf")

        used_room_names: set[int] = set()
        room_count = 0
        noise_count = 0
        px_to_mm = 72.0 / dpi * PT_TO_MM * sf

        for label_id in range(1, num_labels):  # 0=背景
            area_px = stats[label_id, cv2.CC_STAT_AREA]
            # 面積フィルタ (mm²)
            area_m2 = area_px * (px_to_mm ** 2) / 1_000_000.0

            # 面積フィルタ: 名前付き部屋は0.3㎡以上、不明室は1.0㎡以上
            is_named = label_id in seed_label_names
            min_area = 0.3 if is_named else 1.0
            if area_m2 < min_area or area_m2 > 300.0:
                if self.debug and area_m2 >= 0.15 and area_m2 < min_area:
                    cx_px, cy_px = centroids[label_id]
                    c_mm = raster_to_mm(int(cx_px), int(cy_px))
                    print(f"[DEBUG] 連結成分スキップ(小): label={label_id} area={area_m2:.2f}㎡ named={is_named} center=({round(c_mm[0])},{round(c_mm[1])})")
                continue

            # 中心点
            cx_px, cy_px = centroids[label_id]
            center = raster_to_mm(int(cx_px), int(cy_px))
            center_mm = (round(center[0]), round(center[1]))

            # 壁の外接矩形範囲外はノイズとしてスキップ
            if (center_mm[0] < wall_bound_x_min or center_mm[0] > wall_bound_x_max or
                    center_mm[1] < wall_bound_y_min or center_mm[1] > wall_bound_y_max):
                noise_count += 1
                if self.debug:
                    print(f"[DEBUG] 連結成分スキップ(範囲外): label={label_id} area={area_m2:.2f}㎡ center={center_mm}")
                continue

            # 全部屋をBFSラベル画像からコンター抽出で形状を取得
            polygon: list[tuple[int, int]] = []
            contours = []
            if not polygon:
                # OpenCVコンターからポリゴン形状を取得
                component_mask = np.uint8(labels == label_id) * 255
                contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            if not polygon and contours:
                # 最大コンターを使用
                largest = max(contours, key=cv2.contourArea)
                # ポリゴン簡略化 (epsilon を compactness に応じて動的調整)
                perimeter = cv2.arcLength(largest, True)
                cont_area = cv2.contourArea(largest)
                compactness = perimeter * perimeter / (4 * 3.14159 * cont_area) if cont_area > 0 else 1
                if compactness < 1.5:  # ほぼ矩形
                    eps = 0.03 * perimeter
                elif compactness < 3.0:  # L字など
                    eps = 0.025 * perimeter
                else:  # 非常に複雑
                    eps = 0.02 * perimeter
                approx = cv2.approxPolyDP(largest, eps, True)

                # 矩形スナップ: 4頂点で全角度が75°～105°なら最小外接矩形にスナップ
                if len(approx) == 4:
                    pts_2d = approx.reshape(4, 2)
                    def _angle_at_vertex(pts, idx):
                        n = len(pts)
                        p0 = pts[(idx - 1) % n]
                        p1 = pts[idx]
                        p2 = pts[(idx + 1) % n]
                        v1 = (float(p0[0] - p1[0]), float(p0[1] - p1[1]))
                        v2 = (float(p2[0] - p1[0]), float(p2[1] - p1[1]))
                        dot = v1[0]*v2[0] + v1[1]*v2[1]
                        mag1 = (v1[0]**2 + v1[1]**2)**0.5
                        mag2 = (v2[0]**2 + v2[1]**2)**0.5
                        if mag1 == 0 or mag2 == 0:
                            return 0
                        cos_a = max(-1, min(1, dot / (mag1 * mag2)))
                        return math.degrees(math.acos(cos_a))
                    angles = [_angle_at_vertex(pts_2d, i) for i in range(4)]
                    if all(75 <= a <= 105 for a in angles):
                        rect = cv2.minAreaRect(largest)
                        box = cv2.boxPoints(rect)
                        approx = np.int32(box).reshape(-1, 1, 2)

                for pt in approx:
                    px_x_pt, px_y_pt = pt[0]
                    mm = raster_to_mm(round(px_x_pt), round(px_y_pt))
                    polygon.append((round(mm[0]), round(mm[1])))

            # ポリゴンが取れなかった場合はバウンディングボックスにフォールバック
            if len(polygon) < 3:
                rx = stats[label_id, cv2.CC_STAT_LEFT]
                ry = stats[label_id, cv2.CC_STAT_TOP]
                rw = stats[label_id, cv2.CC_STAT_WIDTH]
                rh = stats[label_id, cv2.CC_STAT_HEIGHT]
                tl = raster_to_mm(rx, ry)
                tr = raster_to_mm(rx + rw, ry)
                br = raster_to_mm(rx + rw, ry + rh)
                bl = raster_to_mm(rx, ry + rh)
                polygon = [
                    (round(tl[0]), round(tl[1])),
                    (round(tr[0]), round(tr[1])),
                    (round(br[0]), round(br[1])),
                    (round(bl[0]), round(bl[1])),
                ]

            # --- フィルタ1: 負座標の頂点を持つポリゴンをスキップ ---
            has_negative = any(p[0] < -200 or p[1] < -200 for p in polygon)
            if has_negative:
                noise_count += 1
                if self.debug:
                    print(f"[DEBUG] 部屋スキップ(負座標): label={label_id} area={area_m2:.1f}㎡ center={center_mm}")
                continue

            # --- フィルタ2: ポリゴンを壁BBにクリップ ---
            clipped: list[tuple[int, int]] = []
            for px, py in polygon:
                cx = max(wall_bound_x_min, min(wall_bound_x_max, px))
                cy = max(wall_bound_y_min, min(wall_bound_y_max, py))
                clipped.append((round(cx), round(cy)))
            polygon = clipped

            # --- フィルタ3: ポリゴン面積とピクセル面積の乖離チェック ---
            if len(polygon) >= 3:
                poly_area = abs(shoelace_area(polygon)) / 1_000_000.0
                if area_m2 > 0 and poly_area > 0:
                    ratio = poly_area / area_m2
                    if ratio > 3.0 or ratio < 0.2:
                        # ポリゴンが不正確→BBにフォールバック
                        rx2 = stats[label_id, cv2.CC_STAT_LEFT]
                        ry2 = stats[label_id, cv2.CC_STAT_TOP]
                        rw2 = stats[label_id, cv2.CC_STAT_WIDTH]
                        rh2 = stats[label_id, cv2.CC_STAT_HEIGHT]
                        tl2 = raster_to_mm(rx2, ry2)
                        br2 = raster_to_mm(rx2 + rw2, ry2 + rh2)
                        polygon = [
                            (round(tl2[0]), round(tl2[1])),
                            (round(tl2[0] + rw2 * px_to_mm), round(tl2[1])),
                            (round(br2[0]), round(br2[1])),
                            (round(tl2[0]), round(br2[1])),
                        ]
                        if self.debug:
                            print(f"[DEBUG] ポリゴンBBフォールバック: label={label_id} poly_area={poly_area:.1f}㎡ vs pixel_area={area_m2:.1f}㎡ ratio={ratio:.1f}")

            # --- 最終フィルタ: フォールバック後のポリゴンも壁BBにクリップ+負座標除外 ---
            polygon = [
                (max(round(wall_bound_x_min), p[0]), max(round(wall_bound_y_min), p[1]))
                for p in polygon
            ]
            if any(p[0] < -200 or p[1] < -200 for p in polygon):
                noise_count += 1
                if self.debug:
                    print(f"[DEBUG] 部屋スキップ(最終負座標): label={label_id} area={area_m2:.1f}㎡")
                continue

            # 近くの壁を検出
            nearby_walls: list[str] = []
            for wall in self.walls:
                wc = ((wall["start_x_mm"] + wall["end_x_mm"]) / 2,
                      (wall["start_y_mm"] + wall["end_y_mm"]) / 2)
                # バウンディングボックスの最大寸法
                rx = stats[label_id, cv2.CC_STAT_LEFT]
                ry = stats[label_id, cv2.CC_STAT_TOP]
                rw = stats[label_id, cv2.CC_STAT_WIDTH]
                rh = stats[label_id, cv2.CC_STAT_HEIGHT]
                max_dim = max(rw, rh) * px_to_mm + 500
                if distance(center_mm, wc) < max_dim:
                    nearby_walls.append(wall["id"])

            # シードから室名を取得 (シードなし部屋は "不明")
            room_name = seed_label_names.get(label_id, "不明")

            # 壁スナップでポリゴン形状を改善
            snapped_poly = self._snap_polygon_to_walls(
                [[p[0], p[1]] for p in polygon])

            # 直交化・壁スナップ後処理
            snapped_poly = self._simplify_room_polygon(snapped_poly, snap_thresh=50)

            # Remove self-intersections (fold-back, crossing edges)
            snapped_poly = self._clean_polygon_self_intersections(snapped_poly)

            self.rooms.append({
                "name": room_name,
                "wall_ids": nearby_walls,
                "area_m2": round(area_m2, 1),
                "center_mm": list(center_mm),
                "polygon_mm": snapped_poly,
                "_label_id": label_id,
                "confidence": 0.3 if room_name == "不明" else 0.8,
                "nearby_texts": [],
            })
            room_count += 1

        if self.debug:
            print(f"[DEBUG] 部屋検出: {room_count}室 (ノイズ除外: {noise_count}個)")

        # 室名マッチング: ラスターラベル直接参照 + 最近傍フォールバック
        # label_id → room のマッピングを構築
        label_to_room: dict[int, dict] = {}
        for room in self.rooms:
            lid = room.get("_label_id")
            if lid is not None:
                label_to_room[lid] = room

        # mm座標 → ラスターピクセル座標の変換関数
        def mm_to_raster(x_mm: float, y_mm: float) -> tuple[int, int]:
            """内部mm座標 (Y-flipped) → ラスターピクセル座標"""
            x_pt = x_mm / PT_TO_MM
            y_flipped_pt = y_mm / PT_TO_MM
            y_pt_orig = page_h_pt - y_flipped_pt
            px_x = int(x_pt * dpi / 72.0)
            px_y = int(y_pt_orig * dpi / 72.0)
            return px_x, px_y

        def _find_raster_label(origin_mm: tuple) -> int | None:
            """テキスト原点の周囲を探索し、最も多くヒットしたラベルIDを返す"""
            px_x, px_y = mm_to_raster(origin_mm[0], origin_mm[1])
            # 探索半径を拡大: テキストが部屋中心から離れている場合に対応
            search_max_r = 250
            label_counts: dict[int, int] = {}
            for dy in range(-search_max_r, search_max_r + 1, 4):
                for dx in range(-search_max_r, search_max_r + 1, 4):
                    r = abs(dx) + abs(dy)
                    if r > search_max_r:
                        continue
                    sx, sy = px_x + dx, px_y + dy
                    if 0 <= sx < w and 0 <= sy < h:
                        lid = int(labels[sy, sx])
                        if lid > 0 and lid in label_to_room:
                            label_counts[lid] = label_counts.get(lid, 0) + 1
            if label_counts:
                return max(label_counts, key=label_counts.get)
            return None

        # 通常の室名を先に処理、面積ラベルは後で処理
        normal_names = [(i, rn) for i, rn in enumerate(self.room_names)
                        if not rn.get("is_area_label")]
        area_labels = [(i, rn) for i, rn in enumerate(self.room_names)
                       if rn.get("is_area_label")]

        # Phase 1: ラスターラベルで直接マッチング (各ラベルに最も近いテキストを割り当て)
        # ラベルID → [(idx, rn, distance_to_center)] のマッピングを構築
        label_candidates: dict[int, list[tuple[int, dict, float]]] = {}

        for name_list in [normal_names, area_labels]:
            for idx, rn in name_list:
                rn_origin_mm = rn["origin"]
                rn_mm_scaled = (round(rn_origin_mm[0] * sf), round(rn_origin_mm[1] * sf))

                lid = _find_raster_label(rn_origin_mm)
                if lid is not None:
                    room = label_to_room[lid]
                    d = distance(rn_mm_scaled, tuple(room["center_mm"]))
                    if lid not in label_candidates:
                        label_candidates[lid] = []
                    label_candidates[lid].append((idx, rn, d))

        # 各ラベルについて、最も近いテキストを採用
        # (面積ラベルより通常室名を優先)
        for lid, candidates in label_candidates.items():
            room = label_to_room[lid]
            # 通常室名を優先、同種なら距離が近いものを優先
            candidates.sort(key=lambda x: (x[1].get("is_area_label", False), x[2]))
            winner = candidates[0]
            idx, rn, d = winner
            room["name"] = rn["name"]
            room["confidence"] = 1.0  # ラスターラベル直接ヒット
            used_room_names.add(idx)
            if self.debug:
                print(f"[DEBUG] 室名マッチ(ラスター): {rn['name']} -> center={room['center_mm']} "
                      f"(候補{len(candidates)}個)")

        # Phase 1.5: ポリゴン内テキストマッチング
        # ラスターラベルで見つからなかった室名テキストが部屋ポリゴン内にあるか判定
        for name_list in [normal_names, area_labels]:
            for idx, rn in name_list:
                if idx in used_room_names:
                    continue
                rn_origin_mm = rn["origin"]
                rn_mm_scaled = (round(rn_origin_mm[0] * sf), round(rn_origin_mm[1] * sf))
                for room in self.rooms:
                    if room["name"] != "不明":
                        continue
                    poly = room.get("polygon_mm")
                    if not poly or len(poly) < 3:
                        continue
                    poly_tuples = [(p[0], p[1]) for p in poly]
                    if point_in_polygon(rn_mm_scaled, poly_tuples):
                        room["name"] = rn["name"]
                        room["confidence"] = 0.95  # ポリゴン内ヒット
                        used_room_names.add(idx)
                        if self.debug:
                            print(f"[DEBUG] 室名マッチ(ポリゴン内): {rn['name']} -> center={room['center_mm']}")
                        break

        # Phase 2: ラスターで見つからなかった室名を最近傍で探す
        for name_list in [normal_names, area_labels]:
            for idx, rn in name_list:
                if idx in used_room_names:
                    continue
                rn_origin_mm = rn["origin"]
                rn_mm_scaled = (round(rn_origin_mm[0] * sf), round(rn_origin_mm[1] * sf))

                best_room = None
                best_dist = float("inf")
                for room in self.rooms:
                    if room["name"] != "不明":
                        continue
                    if not room.get("polygon_mm") or len(room["polygon_mm"]) < 3:
                        continue
                    d = distance(rn_mm_scaled, tuple(room["center_mm"]))
                    if d < best_dist:
                        best_dist = d
                        best_room = room
                # 最近傍が8000mm以内なら割り当て (5000→8000に拡大)
                if best_room and best_dist < 8000:
                    best_room["name"] = rn["name"]
                    best_room["confidence"] = 0.8  # 最近傍マッチ
                    used_room_names.add(idx)
                    if self.debug:
                        print(f"[DEBUG] 室名マッチ(最近傍): {rn['name']} -> center={best_room['center_mm']} "
                              f"dist={best_dist:.0f}mm")

        # Phase 3: 不明室に対して、中心点の近傍テキストから室名を推定
        # (1) ポリゴン内に含まれるテキストを優先
        # (2) 検索半径を5000mmに拡大
        # (3) 同名の部屋を許容（同じroom_nameエントリの二重使用のみ防止）
        for room in self.rooms:
            if room["name"] != "不明":
                continue
            cx_mm = room["center_mm"][0] / sf  # paper mm
            cy_mm = room["center_mm"][1] / sf

            # まずポリゴン内のテキストを探す
            poly = room.get("polygon_mm")
            poly_match = None
            if poly and len(poly) >= 3:
                poly_tuples = [(p[0], p[1]) for p in poly]
                best_poly_d = float("inf")
                for rn_idx, rn in enumerate(self.room_names):
                    if rn_idx in used_room_names:
                        continue
                    rn_mm_scaled = (round(rn["origin"][0] * sf), round(rn["origin"][1] * sf))
                    if point_in_polygon(rn_mm_scaled, poly_tuples):
                        d = distance((cx_mm, cy_mm), rn["origin"])
                        if d < best_poly_d:
                            best_poly_d = d
                            poly_match = (rn_idx, rn["name"])
            if poly_match:
                room["name"] = poly_match[1]
                room["confidence"] = 0.9
                used_room_names.add(poly_match[0])
                if self.debug:
                    print(f"[DEBUG] 不明室名補完(ポリゴン内): {poly_match[1]} -> center={room['center_mm']}")
                continue

            # ポリゴン内に見つからなければ、最近傍テキストで探す (半径5000mm)
            best_name = None
            best_d = 5000 / sf  # 5000mm real → paper mm
            best_rn_idx = None
            for rn_idx, rn in enumerate(self.room_names):
                if rn_idx in used_room_names:
                    continue
                d = distance((cx_mm, cy_mm), rn["origin"])
                if d < best_d:
                    best_d = d
                    best_name = rn["name"]
                    best_rn_idx = rn_idx
            if best_name:
                room["name"] = best_name
                room["confidence"] = 0.7  # 近傍テキスト補完
                if best_rn_idx is not None:
                    used_room_names.add(best_rn_idx)
                if self.debug:
                    print(f"[DEBUG] 不明室名補完: {best_name} -> center={room['center_mm']}")

        # nearby_texts: 各部屋（特に不明室）の中心から4000mm以内のテキストを収集
        for room in self.rooms:
            cx_real = room["center_mm"][0]
            cy_real = room["center_mm"][1]
            nearby: list[str] = []
            for rn in self.room_names:
                # room_names の origin は paper mm → scale_factor で実寸に変換
                rn_x = rn["origin"][0] * sf
                rn_y = rn["origin"][1] * sf
                d = distance((cx_real, cy_real), (rn_x, rn_y))
                if d < 4000 and rn["name"] != room["name"]:
                    nearby.append(rn["name"])
            room["nearby_texts"] = nearby

        # Phase 3.5: 包含関係にある不明室のマージ
        # 小さい不明室の中心が大きい部屋のポリゴン内にある場合、小さい方を削除
        rooms_to_remove_contained: list[dict] = []
        for i, room_a in enumerate(self.rooms):
            if room_a in rooms_to_remove_contained:
                continue
            poly_a = room_a.get("polygon_mm", [])
            if len(poly_a) < 3:
                continue
            for j, room_b in enumerate(self.rooms):
                if i == j or room_b in rooms_to_remove_contained:
                    continue
                if room_b["area_m2"] >= room_a["area_m2"]:
                    continue
                if room_b["name"] != "不明":
                    continue
                # room_b (小・不明) の中心が room_a (大) のポリゴン内にあるか
                bc = room_b["center_mm"]
                inside = False
                n = len(poly_a)
                px_c, py_c = bc[0], bc[1]
                for k in range(n):
                    p1 = poly_a[k]
                    p2 = poly_a[(k + 1) % n]
                    x1 = p1[0] if isinstance(p1, (list, tuple)) else 0
                    y1 = p1[1] if isinstance(p1, (list, tuple)) else 0
                    x2 = p2[0] if isinstance(p2, (list, tuple)) else 0
                    y2 = p2[1] if isinstance(p2, (list, tuple)) else 0
                    if ((y1 > py_c) != (y2 > py_c)) and (px_c < (x2 - x1) * (py_c - y1) / (y2 - y1 + 1e-12) + x1):
                        inside = not inside
                if inside:
                    rooms_to_remove_contained.append(room_b)
                    if self.debug:
                        print(f"[DEBUG] 包含マージ: 不明室 {room_b['area_m2']:.1f}㎡ ⊂ {room_a['name']} {room_a['area_m2']:.1f}㎡")
        for room in rooms_to_remove_contained:
            self.rooms.remove(room)
        if self.debug and rooms_to_remove_contained:
            print(f"[DEBUG] 包含マージ合計: {len(rooms_to_remove_contained)}室削除")

        # Phase 4: 小さな不明室を最近傍の名前付き部屋にマージ
        # BFSがドア閉鎖により正しく分離した結果、室名テキストがない小領域が独立する。
        # 面積3㎡以下の不明室で、名前付き部屋から2000mm以内のものをマージ
        _PHASE4_MERGE_ENABLED = True
        merge_threshold_m2 = 3.0  # この面積以下の不明室をマージ対象に
        merge_dist_mm = 2000     # この距離以内の名前付き部屋にマージ
        merged_count = 0
        rooms_to_remove = []
        if _PHASE4_MERGE_ENABLED:
          for room in self.rooms:
            if room["name"] != "不明":
                continue
            if room["area_m2"] > merge_threshold_m2:
                continue
            # 最近傍の名前付き部屋を探す
            rc = tuple(room["center_mm"])
            best_target = None
            best_dist = merge_dist_mm
            for target in self.rooms:
                if target is room or target["name"] == "不明":
                    continue
                d = distance(rc, tuple(target["center_mm"]))
                if d < best_dist:
                    best_dist = d
                    best_target = target
            if best_target:
                # ターゲット部屋の面積に加算し、不明室を削除リストに追加
                best_target["area_m2"] = round(best_target["area_m2"] + room["area_m2"], 1)
                rooms_to_remove.append(room)
                merged_count += 1
                if self.debug:
                    print(f"[DEBUG] 不明室マージ: {room['area_m2']:.1f}m2 → {best_target['name']} "
                          f"(dist={best_dist:.0f}mm)")
        if _PHASE4_MERGE_ENABLED:
            for room in rooms_to_remove:
                self.rooms.remove(room)
            if self.debug and merged_count > 0:
                print(f"[DEBUG] 不明室マージ合計: {merged_count}室削除")

        # フォールバック: ポリゴンに含まれなかった室名 → 周辺壁から矩形ポリゴンを推定
        for idx, rn in enumerate(self.room_names):
            if idx in used_room_names:
                continue
            center_mm = (round(rn["origin"][0] * sf), round(rn["origin"][1] * sf))

            # 周辺壁を収集 (近い順)
            wall_dists: list[tuple[float, dict]] = []
            for wall in self.walls:
                wc = ((wall["start_x_mm"] + wall["end_x_mm"]) / 2,
                      (wall["start_y_mm"] + wall["end_y_mm"]) / 2)
                d = distance(center_mm, wc)
                if d < 5000:
                    wall_dists.append((d, wall))
            wall_dists.sort(key=lambda x: x[0])

            nearby_walls = [w["id"] for _, w in wall_dists]

            # 壁端点からバウンディングボックスを推定
            polygon_mm: list[list[int]] = []
            est_area_m2 = 0.0

            if len(wall_dists) >= 2:
                # 近くの壁の端点を集めてcenter周辺のバウンディングボックスを作る
                wall_pts_x: list[float] = []
                wall_pts_y: list[float] = []
                for _, w in wall_dists[:12]:  # 最大12本の壁を考慮
                    wall_pts_x.extend([w["start_x_mm"], w["end_x_mm"]])
                    wall_pts_y.extend([w["start_y_mm"], w["end_y_mm"]])

                # center の上下左右で最も近い壁端点を見つけて部屋の範囲を推定
                cx, cy = center_mm
                # 各方向で最も近い壁座標を探す
                left_xs = [x for x in wall_pts_x if x < cx - 50]
                right_xs = [x for x in wall_pts_x if x > cx + 50]
                bottom_ys = [y for y in wall_pts_y if y < cy - 50]
                top_ys = [y for y in wall_pts_y if y > cy + 50]

                x_min = max(left_xs) if left_xs else cx - 500
                x_max = min(right_xs) if right_xs else cx + 500
                y_min = max(bottom_ys) if bottom_ys else cy - 500
                y_max = min(top_ys) if top_ys else cy + 500

                # 最低サイズ制限 (300mm x 300mm)
                if x_max - x_min < 300:
                    x_min, x_max = cx - 300, cx + 300
                if y_max - y_min < 300:
                    y_min, y_max = cy - 300, cy + 300

                # 最大サイズ制限 (5000mm x 5000mm) - 不合理に大きくしない
                if x_max - x_min > 5000:
                    x_min, x_max = cx - 2500, cx + 2500
                if y_max - y_min > 5000:
                    y_min, y_max = cy - 2500, cy + 2500

                polygon_mm = [
                    [round(x_min), round(y_max)],
                    [round(x_max), round(y_max)],
                    [round(x_max), round(y_min)],
                    [round(x_min), round(y_min)],
                ]
                est_area_m2 = round((x_max - x_min) * (y_max - y_min) / 1_000_000.0, 1)

                if self.debug:
                    print(f"[DEBUG] フォールバックポリゴン推定: {rn['name']} "
                          f"bbox=({round(x_min)},{round(y_min)})-({round(x_max)},{round(y_max)}) "
                          f"area={est_area_m2}㎡")

            # 直交化・壁スナップ後処理
            polygon_mm = self._simplify_room_polygon(polygon_mm, snap_thresh=50)

            # Remove self-intersections (fold-back, crossing edges)
            polygon_mm = self._clean_polygon_self_intersections(polygon_mm)

            self.rooms.append({
                "name": rn["name"],
                "wall_ids": nearby_walls,
                "area_m2": est_area_m2,
                "center_mm": list(center_mm),
                "polygon_mm": polygon_mm,
                "confidence": 0.8,  # フォールバック壁推定
                "nearby_texts": [],
            })

        if self.debug:
            print(f"[DEBUG] CV2部屋検出結果: {room_count}室 (ポリゴン付き)")

        return room_count > 0

    def _build_room_polygons_graph(self) -> None:
        """PDFの太線グラフから最小閉路を検出し、面積テキストと照合して大部屋ポリゴンを補完。"""
        if not self.pdf_path or not self.room_names:
            return

        sf = self.scale_factor
        from collections import defaultdict as _dd

        try:
            doc = fitz.open(self.pdf_path)
            page = doc[self.page_num]
        except Exception:
            return

        page_h_pt = page.rect.height
        eps = 8  # snap threshold in paper mm

        nodes: dict[int, tuple[float, float]] = {}
        nc = [0]

        def snap_n(x, y):
            for nid, (nx, ny) in nodes.items():
                if abs(x - nx) < eps and abs(y - ny) < eps:
                    return nid
            nid = nc[0]; nodes[nid] = (x, y); nc[0] += 1; return nid

        adj: dict[int, set[int]] = _dd(set)
        for d_item in page.get_drawings():
            w = d_item.get('width', 0) or 0
            if w < 0.25:
                continue
            for item in d_item['items']:
                if item[0] != 'l':
                    continue
                p1, p2 = item[1], item[2]
                x1 = p1.x * PT_TO_MM
                y1 = (page_h_pt - p1.y) * PT_TO_MM
                x2 = p2.x * PT_TO_MM
                y2 = (page_h_pt - p2.y) * PT_TO_MM
                if abs(y2 - y1) < 1 or abs(x2 - x1) < 1:
                    if math.hypot(x2 - x1, y2 - y1) < 3:
                        continue
                    n1 = snap_n(x1, y1)
                    n2 = snap_n(x2, y2)
                    if n1 != n2:
                        adj[n1].add(n2)
                        adj[n2].add(n1)
        doc.close()

        # 最小閉路検出 (left-turn algorithm)
        def af(x1, y1, x2, y2):
            return math.atan2(y2 - y1, x2 - x1)

        cycles = []
        used_dir: set[tuple[int, int]] = set()
        for s in adj:
            for nx in adj[s]:
                if (s, nx) in used_dir:
                    continue
                cy = [s]
                prev, curr = s, nx
                for _ in range(150):
                    cy.append(curr)
                    used_dir.add((prev, curr))
                    if curr == s:
                        break
                    px, py = nodes[prev]
                    cx2, cy2 = nodes[curr]
                    inc = af(cx2, cy2, px, py)
                    bn = None
                    ba = float('inf')
                    for nb in adj[curr]:
                        if nb == prev and len(adj[curr]) > 1:
                            continue
                        nnx, nny = nodes[nb]
                        out = af(cx2, cy2, nnx, nny)
                        dd = (out - inc) % (2 * math.pi)
                        if dd < ba:
                            ba = dd
                            bn = nb
                    if bn is None:
                        break
                    prev, curr = curr, bn
                else:
                    continue
                if len(cy) >= 4 and cy[-1] == s:
                    coords = [nodes[n] for n in cy[:-1]]
                    area = abs(sum(
                        coords[i][0] * coords[(i + 1) % len(coords)][1] -
                        coords[(i + 1) % len(coords)][0] * coords[i][1]
                        for i in range(len(coords))
                    )) / 2
                    area_m2 = area * (sf ** 2) / 1_000_000
                    if 1.0 < area_m2 < 200:
                        poly_real = [(round(c[0] * sf), round(c[1] * sf)) for c in coords]
                        center = (sum(p[0] for p in poly_real) // len(poly_real),
                                  sum(p[1] for p in poly_real) // len(poly_real))
                        cycles.append((area_m2, poly_real, center))

        if self.debug:
            print(f"[DEBUG] グラフ閉路: {len(cycles)}個検出")

        # 全部屋に対してグラフ閉路で面積補完
        # (1) 面積テキストがある部屋で面積不足のもの → 期待面積との照合で置換
        # (2) 面積テキストがない部屋でも面積が極端に小さいもの → 最近傍閉路で補完
        import re as _re
        graph_replaced = 0
        for room in self.rooms:
            # 面積テキストから期待面積を取得
            m = _re.search(r'([\d.]+)', room["name"]) if room.get("name") else None
            expected = float(m.group(1)) if m and float(m.group(1)) > 1.0 else 0

            # 期待面積あり: 現在面積が40%未満なら閉路置換
            # 期待面積なし: 現在面積が0.8m²未満で「不明」でない部屋なら閉路補完
            needs_replacement = False
            if expected > 1.0 and room["area_m2"] < expected * 0.4:
                needs_replacement = True
            elif expected == 0 and room["area_m2"] < 0.8 and room["name"] != "不明":
                needs_replacement = True

            if not needs_replacement:
                continue

            # この部屋の中心に最も近い閉路を探す
            rc = room["center_mm"]
            best_cycle = None
            best_dist = 5000
            for area_m2, poly, center in cycles:
                d = math.hypot(center[0] - rc[0], center[1] - rc[1])
                if expected > 1.0:
                    # 期待面積あり: 面積範囲でフィルタ
                    if d < best_dist and expected * 0.3 <= area_m2 <= expected * 1.5:
                        best_dist = d
                        best_cycle = (area_m2, poly, center)
                else:
                    # 期待面積なし: 距離が近い閉路を採用 (面積1〜100m²)
                    if d < best_dist and 1.0 <= area_m2 <= 100:
                        best_dist = d
                        best_cycle = (area_m2, poly, center)

            if best_cycle:
                raw_poly = [[p[0], p[1]] for p in best_cycle[1]]
                room["polygon_mm"] = self._clean_polygon_self_intersections(raw_poly)
                room["area_m2"] = round(best_cycle[0], 1)
                room["center_mm"] = list(best_cycle[2])
                room["confidence"] = 0.6  # グラフ閉路置換
                graph_replaced += 1
                if self.debug:
                    print(f"[DEBUG] グラフ閉路置換: {room['name']} "
                          f"→ {best_cycle[0]:.1f}m2 ({len(best_cycle[1])}pts)")

        if self.debug:
            print(f"[DEBUG] グラフ閉路置換合計: {graph_replaced}室")

    def _build_room_polygons(self) -> None:
        """部屋ポリゴンを検出。OpenCV版を優先、失敗時はベクター版にフォールバック。"""
        # OpenCV版を試行
        if _HAS_CV2 and self._build_room_polygons_cv2():
            # グラフ閉路で大部屋を補完
            self._build_room_polygons_graph()
            return

        # フォールバック: ベクターベースの部屋検出
        if not self.wall_lines and not self.walls:
            return

        sf = self.scale_factor
        cell_mm = 100  # グリッドセルサイズ (mm)

        # 生壁線 + 処理済み壁のバウンディングボックス (mm単位)
        all_x = []
        all_y = []
        for line in self.wall_lines:
            all_x.extend([line.p1[0] * sf, line.p2[0] * sf])
            all_y.extend([line.p1[1] * sf, line.p2[1] * sf])
        for w in self.walls:
            all_x.extend([w["start_x_mm"], w["end_x_mm"]])
            all_y.extend([w["start_y_mm"], w["end_y_mm"]])

        min_x, max_x = min(all_x) - 500, max(all_x) + 500
        min_y, max_y = min(all_y) - 500, max(all_y) + 500

        grid_w = int((max_x - min_x) / cell_mm) + 2
        grid_h = int((max_y - min_y) / cell_mm) + 2

        if grid_w > 500 or grid_h > 500:
            # グリッドが大きすぎる場合はセルサイズを拡大
            cell_mm = max((max_x - min_x), (max_y - min_y)) / 400
            grid_w = int((max_x - min_x) / cell_mm) + 2
            grid_h = int((max_y - min_y) / cell_mm) + 2

        # グリッド初期化 (0=空, 1=壁, 2=外部塗りつぶし済み)
        grid = [[0] * grid_w for _ in range(grid_h)]

        def mm_to_grid(x_mm: float, y_mm: float) -> tuple[int, int]:
            gx = int((x_mm - min_x) / cell_mm)
            gy = int((y_mm - min_y) / cell_mm)
            return max(0, min(gx, grid_w - 1)), max(0, min(gy, grid_h - 1))

        def grid_to_mm(gx: int, gy: int) -> tuple[float, float]:
            return (min_x + gx * cell_mm + cell_mm / 2,
                    min_y + gy * cell_mm + cell_mm / 2)

        def _bresenham_draw(gx1, gy1, gx2, gy2, dilate: int = 2):
            """Bresenhamで線をグリッドに描画 (dilate=膨張半径, 5x5=±2)"""
            ddx = abs(gx2 - gx1)
            ddy = abs(gy2 - gy1)
            sx = 1 if gx1 < gx2 else -1
            sy = 1 if gy1 < gy2 else -1
            err = ddx - ddy
            x, y = gx1, gy1
            while True:
                if 0 <= x < grid_w and 0 <= y < grid_h:
                    grid[y][x] = 1
                    for dddx in range(-dilate, dilate + 1):
                        for dddy in range(-dilate, dilate + 1):
                            nnx, nny = x + dddx, y + dddy
                            if 0 <= nnx < grid_w and 0 <= nny < grid_h:
                                grid[nny][nnx] = 1
                if x == gx2 and y == gy2:
                    break
                e2 = 2 * err
                if e2 > -ddy:
                    err -= ddy
                    x += sx
                if e2 < ddx:
                    err += ddx
                    y += sy

        # 生壁線をラスタライズ (3x3膨張 = ±1)
        for line in self.wall_lines:
            gx1, gy1 = mm_to_grid(line.p1[0] * sf, line.p1[1] * sf)
            gx2, gy2 = mm_to_grid(line.p2[0] * sf, line.p2[1] * sf)
            _bresenham_draw(gx1, gy1, gx2, gy2, dilate=1)

        # 処理済み壁も追加ラスタライズ (5x5膨張 = ±2, 中心線なので太めに描画)
        for w in self.walls:
            gx1, gy1 = mm_to_grid(w["start_x_mm"], w["start_y_mm"])
            gx2, gy2 = mm_to_grid(w["end_x_mm"], w["end_y_mm"])
            _bresenham_draw(gx1, gy1, gx2, gy2, dilate=2)

        # ドア開口を仮壁で埋める — 生の検出データから直接描画
        door_count = 0
        all_doors = []
        for d in self.door_arcs:
            cx, cy = d["center"][0] * sf, d["center"][1] * sf
            w_mm = d.get("width_mm", 900)
            all_doors.append((cx, cy, w_mm))
        for d in self.sliding_doors:
            cx, cy = d["center"][0] * sf, d["center"][1] * sf
            w_mm = d.get("width_mm", 900)
            all_doors.append((cx, cy, w_mm))
        for d in self.folding_doors:
            cx, cy = d["center"][0] * sf, d["center"][1] * sf
            w_mm = d.get("width_mm", 900)
            all_doors.append((cx, cy, w_mm))
        # 壁のギャップ開口も追加
        for w in self.walls:
            for op in w.get("openings", []):
                ws = (w["start_x_mm"], w["start_y_mm"])
                we = (w["end_x_mm"], w["end_y_mm"])
                wl = distance(ws, we)
                if wl < 1:
                    continue
                pos = op.get("position_mm", 0)
                cx = ws[0] + (we[0] - ws[0]) * pos / wl
                cy = ws[1] + (we[1] - ws[1]) * pos / wl
                all_doors.append((cx, cy, op.get("width_mm", 900)))

        for cx, cy, w_mm in all_doors:
            gcx, gcy = mm_to_grid(cx, cy)
            # ドア中心を中心に十字に仮壁を描画 (方向不明なので両方向)
            half_cells = max(1, int(w_mm / cell_mm / 2)) + 1
            for offset in range(-half_cells, half_cells + 1):
                # 水平方向
                nx = gcx + offset
                if 0 <= nx < grid_w and 0 <= gcy < grid_h:
                    grid[gcy][nx] = 1
                    for ddy in range(-1, 2):
                        ny = gcy + ddy
                        if 0 <= ny < grid_h:
                            grid[ny][nx] = 1
                # 垂直方向
                ny = gcy + offset
                if 0 <= gcx < grid_w and 0 <= ny < grid_h:
                    grid[ny][gcx] = 1
                    for ddx in range(-1, 2):
                        nnx = gcx + ddx
                        if 0 <= nnx < grid_w:
                            grid[ny][nnx] = 1
            door_count += 1

        if self.debug:
            print(f"[DEBUG] ドアギャップ閉鎖: {door_count}個のドア/開口を仮壁で埋めた")

        # 外部からフラッドフィル (端からのBFS)
        from collections import deque
        queue = deque()

        # 4辺の全セルからフラッドフィル開始
        for gx in range(grid_w):
            if grid[0][gx] == 0:
                grid[0][gx] = 2
                queue.append((gx, 0))
            if grid[grid_h - 1][gx] == 0:
                grid[grid_h - 1][gx] = 2
                queue.append((gx, grid_h - 1))
        for gy in range(grid_h):
            if grid[gy][0] == 0:
                grid[gy][0] = 2
                queue.append((0, gy))
            if grid[gy][grid_w - 1] == 0:
                grid[gy][grid_w - 1] = 2
                queue.append((grid_w - 1, gy))

        while queue:
            cx, cy = queue.popleft()
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < grid_w and 0 <= ny < grid_h and grid[ny][nx] == 0:
                    grid[ny][nx] = 2
                    queue.append((nx, ny))

        # 残った空セル (value=0) = 室内領域
        # 連結成分ラベリング
        room_label = [[0] * grid_w for _ in range(grid_h)]
        label_id = 0
        label_cells: dict[int, list[tuple[int, int]]] = {}

        for gy in range(grid_h):
            for gx in range(grid_w):
                if grid[gy][gx] == 0 and room_label[gy][gx] == 0:
                    # 新しい部屋発見 → フラッドフィルでラベル付け
                    label_id += 1
                    cells: list[tuple[int, int]] = []
                    fill_queue = deque([(gx, gy)])
                    room_label[gy][gx] = label_id

                    while fill_queue:
                        fx, fy = fill_queue.popleft()
                        cells.append((fx, fy))
                        for ddx, ddy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nx2, ny2 = fx + ddx, fy + ddy
                            if (0 <= nx2 < grid_w and 0 <= ny2 < grid_h and
                                    grid[ny2][nx2] == 0 and room_label[ny2][nx2] == 0):
                                room_label[ny2][nx2] = label_id
                                fill_queue.append((nx2, ny2))

                    label_cells[label_id] = cells

        # 各ラベルから部屋ポリゴンを生成
        used_room_names: set[int] = set()

        for lid, cells in label_cells.items():
            area_m2 = len(cells) * (cell_mm ** 2) / 1_000_000.0

            # 極端に小さい領域は除外 (< 0.8m², WC/PS等の小部屋はフォールバックで推定)
            if area_m2 < 0.8:
                continue
            # 極端に大きい領域は除外 (> 300m²)
            if area_m2 > 300.0:
                continue

            # バウンディングボックスからポリゴンを生成
            gx_list = [c[0] for c in cells]
            gy_list = [c[1] for c in cells]
            gx_min, gx_max = min(gx_list), max(gx_list)
            gy_min, gy_max = min(gy_list), max(gy_list)

            # ポリゴン (バウンディングボックス矩形)
            p_tl = grid_to_mm(gx_min, gy_min)
            p_tr = grid_to_mm(gx_max, gy_min)
            p_br = grid_to_mm(gx_max, gy_max)
            p_bl = grid_to_mm(gx_min, gy_max)
            polygon = [
                (round(p_tl[0]), round(p_tl[1])),
                (round(p_tr[0]), round(p_tr[1])),
                (round(p_br[0]), round(p_br[1])),
                (round(p_bl[0]), round(p_bl[1])),
            ]

            # 中心点
            center = grid_to_mm(
                (gx_min + gx_max) // 2,
                (gy_min + gy_max) // 2,
            )
            center_mm = (round(center[0]), round(center[1]))

            # 室名テキストがこの領域内にあるか
            room_name = None
            for idx, rn in enumerate(self.room_names):
                if idx in used_room_names:
                    continue
                rn_mm = (round(rn["origin"][0] * sf), round(rn["origin"][1] * sf))
                rgx, rgy = mm_to_grid(rn_mm[0], rn_mm[1])
                if room_label[rgy][rgx] == lid:
                    room_name = rn["name"]
                    used_room_names.add(idx)
                    break

            # 近くの壁を検出
            nearby_walls: list[str] = []
            for w in self.walls:
                wall_center = (
                    (w["start_x_mm"] + w["end_x_mm"]) / 2,
                    (w["start_y_mm"] + w["end_y_mm"]) / 2,
                )
                if distance(center_mm, wall_center) < max(
                    (gx_max - gx_min + 2) * cell_mm,
                    (gy_max - gy_min + 2) * cell_mm
                ):
                    nearby_walls.append(w["id"])

            self.rooms.append({
                "name": room_name or "不明",
                "wall_ids": nearby_walls,
                "area_m2": round(area_m2, 1),
                "center_mm": list(center_mm),
                "polygon_mm": [[p[0], p[1]] for p in polygon],
                "confidence": 0.3 if (room_name or "不明") == "不明" else 0.8,
                "nearby_texts": [],
            })

        # ポリゴンに含まれなかった室名は従来方式でフォールバック
        for idx, rn in enumerate(self.room_names):
            if idx in used_room_names:
                continue
            center_mm = (round(rn["origin"][0] * sf), round(rn["origin"][1] * sf))
            nearby_walls: list[str] = []
            for w in self.walls:
                wall_center = (
                    (w["start_x_mm"] + w["end_x_mm"]) / 2,
                    (w["start_y_mm"] + w["end_y_mm"]) / 2,
                )
                d = distance(center_mm, wall_center)
                if d < 10000:
                    nearby_walls.append(w["id"])

            self.rooms.append({
                "name": rn["name"],
                "wall_ids": nearby_walls,
                "area_m2": 0,
                "center_mm": list(center_mm),
                "polygon_mm": [],
                "confidence": 0.8,  # フォールバック（ポリゴンなし）
                "nearby_texts": [],
            })

        if self.debug:
            polygon_rooms = [r for r in self.rooms if r.get("polygon_mm") and len(r["polygon_mm"]) >= 3]
            print(f"[DEBUG] 部屋ポリゴン: {len(polygon_rooms)}室 "
                  f"(ラスタライズ {grid_w}x{grid_h}, セル{cell_mm}mm)")

    def _walls_for_polygon(self, polygon: list[tuple]) -> list[str]:
        """ポリゴンの辺に対応する壁IDを返す"""
        wall_ids: list[str] = []
        for i in range(len(polygon)):
            p1 = polygon[i]
            p2 = polygon[(i + 1) % len(polygon)]
            for w in self.walls:
                ws = (w["start_x_mm"], w["start_y_mm"])
                we = (w["end_x_mm"], w["end_y_mm"])
                if (distance(p1, ws) < SNAP_THRESHOLD_MM and distance(p2, we) < SNAP_THRESHOLD_MM) or \
                   (distance(p1, we) < SNAP_THRESHOLD_MM and distance(p2, ws) < SNAP_THRESHOLD_MM):
                    wall_ids.append(w["id"])
                    break
        return wall_ids

    def _polygon_centroid(self, polygon: list[tuple]) -> tuple:
        """多角形の重心を計算"""
        n = len(polygon)
        if n == 0:
            return (0, 0)
        cx = sum(p[0] for p in polygon) / n
        cy = sum(p[1] for p in polygon) / n
        return (round(cx), round(cy))

    # -----------------------------------------------------------------------
    # Phase 4: 寸法検証
    # -----------------------------------------------------------------------

    def validate_dimensions(self) -> "PDFVectorExtractor":
        """寸法の整合性チェック"""
        # 壁の外形寸法
        if self.walls:
            all_x: list[float] = []
            all_y: list[float] = []
            for w in self.walls:
                all_x.extend([w["start_x_mm"], w["end_x_mm"]])
                all_y.extend([w["start_y_mm"], w["end_y_mm"]])
            width_mm = max(all_x) - min(all_x)
            depth_mm = max(all_y) - min(all_y)

            # 寸法テキストと照合
            for dt in self.dim_texts:
                val = dt["value_mm"]
                if abs(val - width_mm) < 100:
                    if self.debug:
                        print(f"[DEBUG] 幅寸法一致: {val}mm ~= {width_mm}mm")
                elif abs(val - depth_mm) < 100:
                    if self.debug:
                        print(f"[DEBUG] 奥行寸法一致: {val}mm ~= {depth_mm}mm")

        # 開口部数チェック
        total_swing = sum(
            len([o for o in w.get("openings", []) if o["type"] == "swing_door"])
            for w in self.walls
        )
        total_sliding = sum(
            len([o for o in w.get("openings", []) if o["type"] == "sliding_door"])
            for w in self.walls
        )
        total_folding = sum(
            len([o for o in w.get("openings", []) if o["type"] == "folding_door"])
            for w in self.walls
        )
        total_windows = sum(
            len([o for o in w.get("openings", []) if o["type"] == "window"])
            for w in self.walls
        )

        if self.debug:
            print(f"[DEBUG] 検証: 壁{len(self.walls)}, "
                  f"開き戸{total_swing}, 引戸{total_sliding}, 折戸{total_folding}, "
                  f"窓{total_windows}, 開口{len(self.openings)}")

        return self

    # -----------------------------------------------------------------------
    # Phase 5: JSON出力
    # -----------------------------------------------------------------------

    def to_json(self) -> dict:
        """gen-dxf.py の from_blueprint_json() 互換JSONを生成"""
        # 外形寸法
        width_mm = 0
        depth_mm = 0
        shape = "rectangular"

        if self.walls:
            all_x: list[float] = []
            all_y: list[float] = []
            for w in self.walls:
                all_x.extend([w["start_x_mm"], w["end_x_mm"]])
                all_y.extend([w["start_y_mm"], w["end_y_mm"]])
            min_x, max_x = min(all_x), max(all_x)
            min_y, max_y = min(all_y), max(all_y)

            # ページ範囲を実寸mmで計算 — 範囲外の座標をクランプ
            page_w_real = self.page_width_mm * self.scale_factor
            page_h_real = self.page_height_mm * self.scale_factor
            min_x = max(0.0, min_x)
            min_y = max(0.0, min_y)
            max_x = min(page_w_real, max_x)
            max_y = min(page_h_real, max_y)

            width_mm = max_x - min_x
            depth_mm = max_y - min_y

            # 原点オフセットを保存 (overlay描画で逆変換に必要)
            self._origin_offset_mm = {"x": round(min_x), "y": round(min_y)}

            # 原点を (0,0) にシフト
            for w in self.walls:
                w["start_x_mm"] -= min_x
                w["start_y_mm"] -= min_y
                w["end_x_mm"] -= min_x
                w["end_y_mm"] -= min_y
            for f in self.fixtures:
                f["x_mm"] -= min_x
                f["y_mm"] -= min_y
            for r in self.rooms:
                r["center_mm"][0] -= min_x
                r["center_mm"][1] -= min_y
                # ポリゴン頂点もシフト
                if r.get("polygon_mm"):
                    for pt in r["polygon_mm"]:
                        pt[0] -= min_x
                        pt[1] -= min_y
            for d in self.dimensions:
                d["p1_mm"][0] -= min_x
                d["p1_mm"][1] -= min_y
                if d["p2_mm"] != [0, 0]:
                    d["p2_mm"][0] -= min_x
                    d["p2_mm"][1] -= min_y

            # 外壁ポリゴンもシフト
            if self.exterior_polygon:
                self.exterior_polygon = [
                    (pt[0] - min_x, pt[1] - min_y) for pt in self.exterior_polygon
                ]

            # L字/凸字判定 (壁が6本以上で直交する場合)
            exterior_count = sum(1 for w in self.walls if w["type"] == "exterior")
            if exterior_count > 4:
                shape = "L-shaped"

        # 開口部カウント (後方互換のため door/window 含む)
        total_doors = sum(
            len([o for o in w.get("openings", [])
                 if o["type"] in ("swing_door", "door", "sliding_door", "folding_door")])
            for w in self.walls
        )
        total_windows = sum(
            len([o for o in w.get("openings", []) if o["type"] == "window"])
            for w in self.walls
        )

        # プロジェクト名: タイトルブロックまたはファイル名
        project_name = self._detect_project_name()

        result = {
            "source": "pdf-extract",
            "pdf_file": os.path.basename(self.pdf_path),
            "scale_detected": self.scale_label,
            "confidence": round(self.confidence, 2),
            "pages_analyzed": 1,

            "project_name": project_name,

            # 座標原点オフセット (実寸mm) — overlay描画で逆変換に必要
            # JSONの座標は (0,0) 基準に正規化済み。元のPDF座標に戻すにはこの値を加算する
            "origin_offset_mm": getattr(self, '_origin_offset_mm', {"x": 0, "y": 0}),

            "room": {
                "width_mm": round(width_mm),
                "depth_mm": round(depth_mm),
                "ceiling_height_mm": 2700,
                "shape": shape,
            },

            "walls": self.walls,
            "rooms": [{k: v for k, v in r.items() if not k.startswith("_")} for r in self.rooms],
            "fixtures": self.fixtures,
            "dimensions_extracted": self.dimensions,
            "openings_detected": [
                {
                    "center_mm": list(o["center_mm"]),
                    "width_mm": o["width_mm"],
                    "height_mm": o["height_mm"],
                    "type": o["type"],
                    "wall_ids": o.get("wall_ids", []),
                }
                for o in self.openings
            ],

            "exterior_polygon": [list(pt) for pt in self.exterior_polygon]
                if self.exterior_polygon else None,

            "warnings": self.warnings,

            "pass1_summary": {
                "total_walls": len(self.walls),
                "total_doors": total_doors,
                "total_windows": total_windows,
                "total_openings": len(self.openings),
                "total_sliding_doors": len(self.sliding_doors),
                "total_folding_doors": len(self.folding_doors),
                "total_fixtures": len(self.fixtures),
                "total_rooms": len(self.rooms),
                "total_rooms_with_polygon": sum(1 for r in self.rooms if r.get("polygon_mm")),
                "total_dimensions_paired": sum(1 for d in self.dimensions if d.get("paired")),
                "total_dimensions_total": len(self.dimensions),
                "total_wall_graph_nodes": len(self.wall_graph),
                "total_lines_raw": len(self.lines),
                "total_texts_raw": len(self.texts),
                "total_arcs_raw": len(self.arcs),
                "total_rects_raw": len(self.rects),
            },
        }

        return result

    def _detect_project_name(self) -> str:
        """図面のタイトルブロックまたはファイル名からプロジェクト名を検出"""
        # 大きなテキスト (タイトル候補)
        if self.texts:
            large_texts = sorted(self.texts, key=lambda t: -t.size)
            for t in large_texts[:5]:
                text = t.text.strip()
                # 数値のみ・短すぎるものは除外
                if len(text) >= 2 and not text.isdigit():
                    if not parse_dim_text(text):
                        return text

        # ファイル名から
        return Path(self.pdf_path).stem

    # -----------------------------------------------------------------------
    # 全パイプライン実行
    # -----------------------------------------------------------------------

    def run(self) -> dict:
        """全フェーズを実行してJSONを返す"""
        self.extract()

        # ベクターデータなしの場合は早期リターン
        if not self.lines and not self.rects:
            return self.to_json()

        self.detect_scale()
        self.classify_elements()
        self.analyze_walls()
        self.validate_dimensions()

        return self.to_json()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="建築PDF からベクターグラフィックを抽出し、blueprint JSON を生成",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  python scripts/pdf-extract-vectors.py input.pdf -o output.json
  python scripts/pdf-extract-vectors.py input.pdf --scale 1:50 --page 0 --debug
  python scripts/pdf-extract-vectors.py input.pdf -o project.json && \\
    python scripts/gen-dxf.py --json project.json -o project.dxf
        """,
    )

    parser.add_argument("pdf", help="入力PDFファイル")
    parser.add_argument("-o", "--output", help="出力JSONファイルパス")
    parser.add_argument("--scale", help="縮尺を手動指定 (例: 1:50, 1:100)")
    parser.add_argument("--page", type=int, default=0, help="解析するページ番号 (0始まり, デフォルト: 0)")
    parser.add_argument("--debug", action="store_true", help="デバッグ情報を出力")
    parser.add_argument("--pretty", action="store_true", help="JSON を整形出力")

    args = parser.parse_args()

    if not os.path.isfile(args.pdf):
        print(f"エラー: ファイルが見つかりません: {args.pdf}", file=sys.stderr)
        sys.exit(1)

    # 実行
    extractor = PDFVectorExtractor(
        pdf_path=args.pdf,
        page_num=args.page,
        manual_scale=args.scale,
        debug=args.debug,
    )

    result = extractor.run()

    # Round floats to 1 decimal place during JSON serialization
    class _RoundingEncoder(json.JSONEncoder):
        def default(self, o):
            return super().default(o)

        def encode(self, o):
            return super().encode(self._round(o))

        def _round(self, o):
            if isinstance(o, float):
                return round(o, 1)
            if isinstance(o, dict):
                return {k: self._round(v) for k, v in o.items()}
            if isinstance(o, (list, tuple)):
                return [self._round(v) for v in o]
            return o

    # 結果表示
    indent = 2 if args.pretty else None
    json_str = json.dumps(result, ensure_ascii=False, indent=indent, cls=_RoundingEncoder)

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(json_str)
        print(f"出力: {out_path}")
    else:
        print(json_str)

    # サマリー表示
    summary = result.get("pass1_summary", {})
    print(f"\n=== 抽出サマリー ===", file=sys.stderr)
    print(f"スケール: {result.get('scale_detected', '?')} "
          f"(信頼度: {result.get('confidence', 0):.0%})", file=sys.stderr)
    print(f"壁: {summary.get('total_walls', 0)}, "
          f"開き戸: {summary.get('total_doors', 0)}, "
          f"引戸: {summary.get('total_sliding_doors', 0)}, "
          f"折戸: {summary.get('total_folding_doors', 0)}, "
          f"窓: {summary.get('total_windows', 0)}, "
          f"開口: {summary.get('total_openings', 0)}", file=sys.stderr)
    print(f"什器: {summary.get('total_fixtures', 0)}, "
          f"部屋: {summary.get('total_rooms', 0)} "
          f"(ポリゴン付: {summary.get('total_rooms_with_polygon', 0)})", file=sys.stderr)
    print(f"寸法: {summary.get('total_dimensions_paired', 0)}/{summary.get('total_dimensions_total', 0)} "
          f"ペアリング済", file=sys.stderr)
    print(f"壁接続グラフ: {summary.get('total_wall_graph_nodes', 0)}ノード", file=sys.stderr)
    print(f"生データ: 線{summary.get('total_lines_raw', 0)}, "
          f"テキスト{summary.get('total_texts_raw', 0)}, "
          f"弧{summary.get('total_arcs_raw', 0)}, "
          f"矩形{summary.get('total_rects_raw', 0)}", file=sys.stderr)

    if result.get("warnings"):
        print(f"\n警告:", file=sys.stderr)
        for w in result["warnings"]:
            print(f"  - {w}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
