"""
A3図枠DXFテンプレート生成スクリプト — JW_CAD用

出力:
  C:/JWW/図枠/A3横_図枠_ポラーノ.dxf  (420×297mm landscape)
  C:/JWW/図枠/A3縦_図枠_ポラーノ.dxf  (297×420mm portrait)

DXF形式: R2010 (JW_CAD互換)
単位: mm
"""

import os
import sys
from pathlib import Path

import ezdxf
from ezdxf import units
from ezdxf.enums import TextEntityAlignment


# --- 定数 ---
OUTPUT_DIR = Path("C:/JWW/図枠")
MARGIN = 10  # 内枠マージン (mm)

# 表題欄サイズ
TB_W = 170  # 幅
TB_H = 60   # 高さ

# 表題欄 行高さ (上から下)
ROW_HEIGHTS = [15, 12, 12, 12, 9]  # 合計 60mm

# レイヤー定義
LAYERS = {
    "図枠-外枠":  {"color": 7, "linetype": "Continuous"},
    "図枠-内枠":  {"color": 7, "linetype": "Continuous"},
    "図枠-表題欄": {"color": 7, "linetype": "Continuous"},
    "図枠-文字":  {"color": 2, "linetype": "Continuous"},
}

# フォント (MS ゴシック — JW_CAD標準)
FONT_STYLE_NAME = "MS_Gothic"
FONT_NAME = "MS Gothic"

# テキストサイズ
TEXT_H_LABEL = 3.0   # ラベル文字高さ
TEXT_H_COMPANY = 5.0  # 会社名文字高さ
TEXT_PAD = 2.0        # テキストのセル内パディング


def create_doc():
    """R2010 DXFドキュメントを作成し、レイヤーとスタイルを設定"""
    doc = ezdxf.new("R2010")
    doc.units = units.MM

    # レイヤー作成
    for name, props in LAYERS.items():
        doc.layers.add(name, color=props["color"], linetype=props["linetype"])

    # テキストスタイル作成
    doc.styles.add(FONT_STYLE_NAME, font=FONT_NAME)

    return doc


def draw_outer_frame(msp, width, height):
    """外枠を描画"""
    msp.add_lwpolyline(
        [(0, 0), (width, 0), (width, height), (0, height)],
        close=True,
        dxfattribs={"layer": "図枠-外枠"},
    )


def draw_inner_frame(msp, width, height):
    """内枠を描画 (マージン10mm)"""
    m = MARGIN
    msp.add_lwpolyline(
        [(m, m), (width - m, m), (width - m, height - m), (m, height - m)],
        close=True,
        dxfattribs={"layer": "図枠-内枠"},
    )


def draw_title_block(msp, width, height):
    """
    表題欄を右下に描画

    構成 (170mm × 60mm):
      Row 1 (15mm): 会社名
      Row 2 (12mm): 案件名
      Row 3 (12mm): 図面名 | 縮尺
      Row 4 (12mm): 日付 | 担当 | 図面番号
      Row 5 ( 9mm): 承認 | 検図 | 設計 | 製図
    """
    layer_line = "図枠-表題欄"
    layer_text = "図枠-文字"

    # 表題欄の左下基点
    x0 = width - MARGIN - TB_W
    y0 = MARGIN

    # --- 外枠 ---
    msp.add_lwpolyline(
        [(x0, y0), (x0 + TB_W, y0), (x0 + TB_W, y0 + TB_H), (x0, y0 + TB_H)],
        close=True,
        dxfattribs={"layer": layer_line},
    )

    # --- 水平分割線 (行の区切り) ---
    # 行は上から下に積む。y座標は下から計算。
    # Row5底=y0, Row5top=y0+9, Row4top=y0+9+12=y0+21, ...
    y_rows = [y0]  # 各行の底辺y座標 (Row5が最下)
    cumulative = y0
    for h in reversed(ROW_HEIGHTS):
        cumulative += h
        y_rows.append(cumulative)
    # y_rows = [y0, y0+9, y0+21, y0+33, y0+45, y0+60]
    # Row5: y_rows[0]..y_rows[1]
    # Row4: y_rows[1]..y_rows[2]
    # Row3: y_rows[2]..y_rows[3]
    # Row2: y_rows[3]..y_rows[4]
    # Row1: y_rows[4]..y_rows[5]

    # 水平線 (最上・最下は外枠で描画済みなので、内部の4本)
    for i in range(1, 5):
        y = y_rows[i]
        msp.add_line(
            (x0, y), (x0 + TB_W, y),
            dxfattribs={"layer": layer_line},
        )

    # --- 縦分割線 ---

    # Row 3: 図面名 | 縮尺  → 分割位置 120mm
    r3_split = 120
    msp.add_line(
        (x0 + r3_split, y_rows[2]), (x0 + r3_split, y_rows[3]),
        dxfattribs={"layer": layer_line},
    )

    # Row 4: 日付 | 担当 | 図面番号 → 3分割 (60 | 50 | 60)
    r4_splits = [60, 110]  # x0からのオフセット
    for sx in r4_splits:
        msp.add_line(
            (x0 + sx, y_rows[1]), (x0 + sx, y_rows[2]),
            dxfattribs={"layer": layer_line},
        )

    # Row 5: 承認 | 検図 | 設計 | 製図 → 4等分 (42.5mm each)
    cell_w5 = TB_W / 4
    for i in range(1, 4):
        sx = cell_w5 * i
        msp.add_line(
            (x0 + sx, y_rows[0]), (x0 + sx, y_rows[1]),
            dxfattribs={"layer": layer_line},
        )

    # --- テキスト配置 ---
    text_attribs = {"layer": layer_text, "style": FONT_STYLE_NAME}

    def add_text_middle(text, cx, cy, h=TEXT_H_LABEL):
        """セル中央にテキスト配置"""
        msp.add_text(
            text,
            height=h,
            dxfattribs=text_attribs,
        ).set_placement((cx, cy), align=TextEntityAlignment.MIDDLE)

    def add_text_left(text, x, cy, h=TEXT_H_LABEL):
        """セル左寄せテキスト配置"""
        msp.add_text(
            text,
            height=h,
            dxfattribs=text_attribs,
        ).set_placement((x + TEXT_PAD, cy), align=TextEntityAlignment.MIDDLE_LEFT)

    # Row 1: 会社名 (中央揃え)
    r1_cy = (y_rows[4] + y_rows[5]) / 2
    add_text_middle("株式会社ポラーノプラザ", x0 + TB_W / 2, r1_cy, TEXT_H_COMPANY)

    # Row 2: 案件名 (左寄せ)
    r2_cy = (y_rows[3] + y_rows[4]) / 2
    add_text_left("（案件名）", x0, r2_cy)

    # Row 3: 図面名 | 縮尺
    r3_cy = (y_rows[2] + y_rows[3]) / 2
    add_text_left("（図面名）", x0, r3_cy)
    add_text_middle("S=1/50", x0 + r3_split + (TB_W - r3_split) / 2, r3_cy)

    # Row 4: 日付 | 担当 | 図面番号
    r4_cy = (y_rows[1] + y_rows[2]) / 2
    add_text_left("yyyy.mm.dd", x0, r4_cy)
    add_text_left("（担当）", x0 + r4_splits[0], r4_cy)
    add_text_left("No.", x0 + r4_splits[1], r4_cy)

    # Row 5: 承認 | 検図 | 設計 | 製図
    r5_cy = (y_rows[0] + y_rows[1]) / 2
    labels_r5 = ["承認", "検図", "設計", "製図"]
    for i, label in enumerate(labels_r5):
        cx = x0 + cell_w5 * i + cell_w5 / 2
        add_text_middle(label, cx, r5_cy)


def generate_zuwaku(name, width, height, filepath):
    """図枠DXFファイルを1つ生成"""
    doc = create_doc()
    msp = doc.modelspace()

    draw_outer_frame(msp, width, height)
    draw_inner_frame(msp, width, height)
    draw_title_block(msp, width, height)

    # JW_CAD互換性のためにエンコーディングをcp932に設定
    doc.header["$DWGCODEPAGE"] = "ANSI_932"

    filepath.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(str(filepath), encoding="cp932")

    size = filepath.stat().st_size
    print(f"  {filepath}  ({size:,} bytes)")


def main():
    print("A3図枠DXFテンプレート生成")
    print("=" * 50)

    # A3横 (landscape): 420 x 297
    print("\n[1/2] A3横 (420×297mm)...")
    generate_zuwaku(
        "A3横", 420, 297,
        OUTPUT_DIR / "A3横_図枠_ポラーノ.dxf",
    )

    # A3縦 (portrait): 297 x 420
    print("\n[2/2] A3縦 (297×420mm)...")
    generate_zuwaku(
        "A3縦", 297, 420,
        OUTPUT_DIR / "A3縦_図枠_ポラーノ.dxf",
    )

    print("\n" + "=" * 50)
    print("完了: 2ファイル生成")


if __name__ == "__main__":
    main()
