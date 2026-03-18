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
from collections import defaultdict
from pathlib import Path
from typing import Optional

try:
    import fitz  # PyMuPDF
except ImportError:
    print("エラー: PyMuPDF が必要です。  pip install PyMuPDF", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------

PT_TO_MM = 25.4 / 72.0  # 1pt = 0.3528mm

# 一般的な建具寸法 (mm) — スケール検出のフォールバック基準
DOOR_WIDTH_REF_MM = 900
DOOR_HEIGHT_REF_MM = 2100
WINDOW_WIDTH_REF_MM = 1800

# 壁厚判定 (スケール後mm)
WALL_THICKNESS_MIN_MM = 80
WALL_THICKNESS_MAX_MM = 250
WALL_THICKNESS_DEFAULT_MM = 120

# 壁端点スナップ距離 (mm) — この距離以内の端点は同一点に統合
SNAP_THRESHOLD_MM = 50

# 線幅分類: 3段階 (tier1=外壁, tier2=内壁, tier3=細線/寸法)
# 動的クラスタリングで決定するが、フォールバック閾値
LINE_WIDTH_TIER1_MIN = 0.30   # これ以上 = 外壁候補 (最太線)
LINE_WIDTH_TIER2_MIN = 0.15   # これ以上 = 内壁候補
# tier2_min 未満 = 細線/寸法線

# 引戸検出: 壁線上の平行線ペア間距離 (mm)
SLIDING_DOOR_GAP_MIN_MM = 20
SLIDING_DOOR_GAP_MAX_MM = 100
SLIDING_DOOR_LENGTH_MIN_MM = 500
SLIDING_DOOR_LENGTH_MAX_MM = 2000

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
    # 設備室
    "収納",
]

# 寸法テキストの正規表現 (例: "5,000", "900", "1800", "3.5m")
DIM_TEXT_RE = re.compile(
    r"^[\s]*(\d{1,2}[,，]\d{3}|\d{3,5})[\s]*$"
)

# よくある縮尺
COMMON_SCALES = {
    "1:20": 20, "1:30": 30, "1:50": 50,
    "1:100": 100, "1:200": 200,
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


def perpendicular_distance(point: tuple, line_p1: tuple, line_p2: tuple) -> float:
    """点と直線の距離"""
    dx = line_p2[0] - line_p1[0]
    dy = line_p2[1] - line_p1[1]
    length = math.hypot(dx, dy)
    if length < 1e-9:
        return distance(point, line_p1)
    return abs(dy * point[0] - dx * point[1] + line_p2[0] * line_p1[1] - line_p2[1] * line_p1[0]) / length


def project_point_on_line(point: tuple, line_p1: tuple, line_p2: tuple) -> tuple:
    """点を直線上に投影した座標を返す"""
    dx = line_p2[0] - line_p1[0]
    dy = line_p2[1] - line_p1[1]
    length_sq = dx * dx + dy * dy
    if length_sq < 1e-18:
        return line_p1
    t = ((point[0] - line_p1[0]) * dx + (point[1] - line_p1[1]) * dy) / length_sq
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
                    self.curves.append({
                        "points": [(pt_to_mm(item[i].x),
                                    pt_to_mm(flip_y(item[i].y, page_height_pt)))
                                   for i in range(1, 4)],
                        "width": width_mm,
                        "color": color
                    })

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
            # 最も近い標準スケールにスナップ
            best_scale = None
            best_diff = float("inf")
            for label, val in COMMON_SCALES.items():
                diff = abs(median_ratio - val)
                if diff < best_diff:
                    best_diff = diff
                    best_scale = (label, val)

            if best_scale and best_diff < best_scale[1] * 0.3:
                self.scale_factor = best_scale[1]
                self.scale_label = best_scale[0]
                self.confidence = max(0.5, 1.0 - best_diff / best_scale[1])
            else:
                self.scale_factor = median_ratio
                self.scale_label = f"1:{median_ratio:.0f}"
                self.confidence = 0.4
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
        self._classify_lines()
        self._classify_texts()
        self._detect_wall_pairs()
        self._detect_openings()
        self._detect_windows()
        self._classify_rects_as_furniture()
        return self

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

            # 3段階線幅分類
            if line.width >= tier1_threshold:
                # tier1: 外壁候補 (最太線)
                self.exterior_wall_lines.append(line)
                self.wall_lines.append(line)
            elif line.width >= tier2_threshold:
                # tier2: 内壁候補
                self.wall_lines.append(line)
            else:
                # tier3: 細線/寸法線
                # 色が壁を示す場合は内壁に昇格
                if color_label == "wall" and line.width >= tier2_threshold * 0.5:
                    self.wall_lines.append(line)
                else:
                    self.dim_lines.append(line)

        if self.debug:
            print(f"[DEBUG] 外壁候補線(tier1): {len(self.exterior_wall_lines)}, "
                  f"壁線候補(全): {len(self.wall_lines)}, 寸法線候補: {len(self.dim_lines)}")

    # 什器キーワード (これが含まれるテキストは室名ではなく什器扱い)
    FIXTURE_KEYWORDS = [
        "CT", "ＣＴ", "台", "機", "棚", "ｼﾝｸ", "シンク",
        "ｹｰｽ", "ケース", "ﾃｰﾌﾞﾙ", "テーブル", "冷蔵", "冷凍",
        "ｺﾞﾐ", "ゴミ", "LEDｻｲﾈｰｼﾞ", "サイネージ", "音響",
        "入金", "OPEN",
        # 設備 (室名ではなく什器/設備)
        "消火栓", "分電盤", "ﾛｯｶｰ", "ロッカー",
        "キャッシャー", "ｷｬｯｼｬｰ", "レジ",
    ]

    def _classify_texts(self) -> None:
        """テキストを室名/寸法値に分類"""
        for t in self.texts:
            text = t.text.strip()

            # 単文字英字はスキップ (展開方向記号 A, B, C...)
            if re.match(r'^[A-Za-z]$', text):
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

            # 什器キーワードチェック (室名より優先)
            is_fixture_text = False
            for kw in self.FIXTURE_KEYWORDS:
                if kw in text:
                    is_fixture_text = True
                    break

            if is_fixture_text:
                # 什器テキストとして保持 (後で矩形と紐付け)
                continue

            # 室名判定
            is_room = False
            for pattern in ROOM_NAME_PATTERNS:
                if pattern in text:
                    is_room = True
                    break

            if is_room:
                self.room_names.append({
                    "name": text,
                    "origin": t.origin,
                    "size": t.size,
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
                        self.wall_pairs.append({
                            "line1": l1,
                            "line2": l2,
                            "thickness_mm": round(thickness_mm),
                            "centerline": self._centerline(l1, l2),
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
        """二重線の中心線を算出 — l2端点をl1に投影し最近接ペアで対応付け"""
        # l1の向きを正規化
        p1a, p1b = normalize_line_direction(l1.p1, l1.p2)

        # l2の各端点をl1直線上に投影し、l1端点との対応を決定
        proj_l2p1 = project_point_on_line(l2.p1, p1a, p1b)
        proj_l2p2 = project_point_on_line(l2.p2, p1a, p1b)

        # l2.p1がl1の始点側、l2.p2がl1の終点側に近いか判定
        d_p1_start = distance(proj_l2p1, p1a)
        d_p1_end = distance(proj_l2p1, p1b)
        d_p2_start = distance(proj_l2p2, p1a)
        d_p2_end = distance(proj_l2p2, p1b)

        # 総距離が小さい方の対応を採用
        cost_direct = d_p1_start + d_p2_end    # l2.p1↔l1.start, l2.p2↔l1.end
        cost_cross = d_p1_end + d_p2_start     # l2.p1↔l1.end, l2.p2↔l1.start

        if cost_direct <= cost_cross:
            cp1 = midpoint(p1a, l2.p1)
            cp2 = midpoint(p1b, l2.p2)
        else:
            cp1 = midpoint(p1a, l2.p2)
            cp2 = midpoint(p1b, l2.p1)

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
                    "width_mm": round(radius_mm),  # ドア幅≈弧の半径
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

        for rect in self.rects:
            w_mm = rect.w * sf
            h_mm = rect.h * sf
            # 什器サイズの範囲 (200mm-5000mm)
            if 200 < w_mm < 5000 and 200 < h_mm < 5000:
                # 壁と重ならないか確認 (壁は除外)
                center = (rect.x + rect.w / 2, rect.y + rect.h / 2)

                # 近くにテキストラベルがあればそれを什器名とする
                label = self._find_nearby_text(center, search_radius_mm=max(w_mm, h_mm) / sf)

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
                    "start_x_mm": round(cl["p1"][0] * sf),
                    "start_y_mm": round(cl["p1"][1] * sf),
                    "end_x_mm": round(cl["p2"][0] * sf),
                    "end_y_mm": round(cl["p2"][1] * sf),
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
                if line.length * sf < 300:  # 300mm未満は壁として短すぎる
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

        # 壁端点スナップ + 接続グラフ構築
        self._snap_wall_endpoints()

        # 什器の構築
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

        # 寸法データ — 端点ペアリング付き
        self._pair_dimension_endpoints()

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

        凸包の各辺について、その辺から大きく内側に入る壁群があれば、
        凸包を凹ませて実際の建物形状に近づける。
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

        # 壁端点のうち、凸包から内側に大きく離れているものを検出
        # (L字の切り欠き部分の角を見つける)
        exterior_wall_pts: set[tuple] = set()
        for line in self.wall_lines:
            if line.width >= LINE_WIDTH_TIER1_MIN * 0.8:  # tier1に近い太さの線
                exterior_wall_pts.add((round(line.p1[0], 1), round(line.p1[1], 1)))
                exterior_wall_pts.add((round(line.p2[0], 1), round(line.p2[1], 1)))

        # 現状は凸包をそのまま返す（凹み検出は将来の改善で追加）
        # TODO: L字/凸字の凹み検出を実装
        return hull

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
        """寸法テキスト近傍の線端点から寸法線の両端を特定する。

        寸法線の構造:
          引出線1 ─┤── 寸法線 ──├─ 引出線2
                      テキスト

        テキストの左右（または上下）方向に最も近い線端点2つを探す。
        """
        search_r = DIM_ENDPOINT_SEARCH_RADIUS_MM

        # テキスト近傍の細い線を収集
        nearby_lines: list[RawLine] = []
        for line in self.dim_lines:
            mp = midpoint(line.p1, line.p2)
            if distance(text_origin, mp) < search_r * 3:
                nearby_lines.append(line)

        if not nearby_lines:
            return None, None

        # テキストが水平寸法か垂直寸法か判定
        # 近傍線の主方向で判断
        h_count = sum(1 for l in nearby_lines if is_horizontal(l.p1, l.p2))
        v_count = sum(1 for l in nearby_lines if is_vertical(l.p1, l.p2))
        is_h_dim = h_count >= v_count

        # テキストの左右(水平)または上下(垂直)方向に端点を探す
        all_endpoints: list[tuple] = []
        for line in nearby_lines:
            # 寸法線方向と同じ向きの線のみ
            if is_h_dim and not is_horizontal(line.p1, line.p2):
                continue
            if not is_h_dim and not is_vertical(line.p1, line.p2):
                continue
            all_endpoints.append(line.p1)
            all_endpoints.append(line.p2)

        if len(all_endpoints) < 2:
            return None, None

        if is_h_dim:
            # 水平寸法: テキストの左側と右側で最も遠い端点
            left_pts = [p for p in all_endpoints if p[0] < text_origin[0]]
            right_pts = [p for p in all_endpoints if p[0] > text_origin[0]]

            if not left_pts or not right_pts:
                # テキストが端にある場合: 全端点からx座標が最小・最大のものを取る
                sorted_by_x = sorted(all_endpoints, key=lambda p: p[0])
                return sorted_by_x[0], sorted_by_x[-1]

            p1 = min(left_pts, key=lambda p: p[0])  # 最も左
            p2 = max(right_pts, key=lambda p: p[0])  # 最も右
        else:
            # 垂直寸法: テキストの上側と下側で最も遠い端点
            below_pts = [p for p in all_endpoints if p[1] < text_origin[1]]
            above_pts = [p for p in all_endpoints if p[1] > text_origin[1]]

            if not below_pts or not above_pts:
                sorted_by_y = sorted(all_endpoints, key=lambda p: p[1])
                return sorted_by_y[0], sorted_by_y[-1]

            p1 = min(below_pts, key=lambda p: p[1])
            p2 = max(above_pts, key=lambda p: p[1])

        return p1, p2

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

    def _build_room_polygons(self) -> None:
        """壁接続グラフから閉ループを抽出し、室名テキストを割り当てて部屋ポリゴンを構築"""

        # まず壁の端点から隣接リストを構築
        adj: dict[tuple, list[tuple[tuple, str]]] = defaultdict(list)  # 端点 → [(隣接端点, 壁ID)]
        for w in self.walls:
            sp = (w["start_x_mm"], w["start_y_mm"])
            ep = (w["end_x_mm"], w["end_y_mm"])
            adj[sp].append((ep, w["id"]))
            adj[ep].append((sp, w["id"]))

        # 小さな閉ループ（部屋候補）を探索
        found_cycles: list[list[tuple]] = []
        visited_edge_sets: set[frozenset] = set()

        # 各ノードからDFSで閉ループを探す (最大8頂点まで)
        max_cycle_len = 8
        for start_node in adj:
            self._find_cycles_from(start_node, adj, found_cycles,
                                   visited_edge_sets, max_cycle_len)

        # 見つかった閉ループに室名を割り当て
        sf = self.scale_factor
        used_room_names: set[int] = set()

        for cycle in found_cycles:
            if len(cycle) < 3:
                continue

            # ポリゴンの面積
            area_mm2 = shoelace_area(cycle)
            area_m2 = area_mm2 / 1_000_000.0

            # 極端に小さい/大きいポリゴンは除外
            if area_m2 < 1.0 or area_m2 > 500.0:
                continue

            # ポリゴン内に室名テキストがあるか
            room_name = None
            for idx, rn in enumerate(self.room_names):
                if idx in used_room_names:
                    continue
                rn_mm = (round(rn["origin"][0] * sf), round(rn["origin"][1] * sf))
                if point_in_polygon(rn_mm, cycle):
                    room_name = rn["name"]
                    used_room_names.add(idx)
                    break

            # 室名がなくても部屋として登録 (名前は「不明」)
            self.rooms.append({
                "name": room_name or "不明",
                "wall_ids": self._walls_for_polygon(cycle),
                "area_m2": round(area_m2, 2),
                "center_mm": list(self._polygon_centroid(cycle)),
                "polygon_mm": [[p[0], p[1]] for p in cycle],
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
            })

    def _find_cycles_from(self, start: tuple,
                          adj: dict[tuple, list[tuple[tuple, str]]],
                          found_cycles: list[list[tuple]],
                          visited_edge_sets: set[frozenset],
                          max_len: int) -> None:
        """始点からの閉ループをDFSで探索"""
        # 簡易DFS: スタックベース
        stack: list[tuple[list[tuple], set[tuple]]] = [([start], {start})]

        while stack:
            path, visited = stack.pop()
            current = path[-1]

            if len(path) > max_len:
                continue

            for neighbor, wall_id in adj[current]:
                if neighbor == start and len(path) >= 3:
                    # 閉ループ発見
                    cycle = path[:]
                    edge_set = frozenset(
                        frozenset([cycle[i], cycle[(i + 1) % len(cycle)]])
                        for i in range(len(cycle))
                    )
                    if edge_set not in visited_edge_sets:
                        visited_edge_sets.add(edge_set)
                        found_cycles.append(cycle)
                elif neighbor not in visited and len(path) < max_len:
                    new_visited = visited | {neighbor}
                    stack.append((path + [neighbor], new_visited))

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
                        print(f"[DEBUG] 幅寸法一致: {val}mm ≈ {width_mm}mm")
                elif abs(val - depth_mm) < 100:
                    if self.debug:
                        print(f"[DEBUG] 奥行寸法一致: {val}mm ≈ {depth_mm}mm")

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
            width_mm = max_x - min_x
            depth_mm = max_y - min_y

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

            "room": {
                "width_mm": round(width_mm),
                "depth_mm": round(depth_mm),
                "ceiling_height_mm": 2700,
                "shape": shape,
            },

            "walls": self.walls,
            "rooms": self.rooms,
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

    # 結果表示
    indent = 2 if args.pretty else None
    json_str = json.dumps(result, ensure_ascii=False, indent=indent)

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
