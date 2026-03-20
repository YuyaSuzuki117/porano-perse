"""
PDF図面 ↔ DXF出力 比較ツール

元PDFの平面図とblueprint JSON (またはDXF) の壁・什器・部屋を
直接PDF画像上に描画して重ね合わせる。

使い方:
  python scripts/compare-pdf-dxf.py <original.pdf> <output.dxf> [-o comparison.png] [--page 0] [--json blueprint.json]

出力:
  1. 左右並べた比較画像 (side-by-side)
  2. 重ね合わせ画像 (overlay: 元PDF=グレー, 壁=赤, 什器=緑, 部屋=青)
  3. 差分レポート (テキスト)
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("エラー: PyMuPDF が必要です。 pip install PyMuPDF", file=sys.stderr)
    sys.exit(1)

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("エラー: Pillow が必要です。 pip install Pillow", file=sys.stderr)
    sys.exit(1)

PT_TO_MM = 25.4 / 72.0


def render_pdf_page(pdf_path: str, page_num: int = 0, dpi: int = 150) -> Image.Image:
    """PDFページを画像としてレンダリング"""
    doc = fitz.open(pdf_path)
    page = doc[page_num]
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    doc.close()
    return img


def get_pdf_page_info(pdf_path: str, page_num: int = 0) -> dict:
    """PDFページの寸法情報を取得"""
    doc = fitz.open(pdf_path)
    page = doc[page_num]
    rect = page.rect
    doc.close()
    return {
        "width_pt": rect.width,
        "height_pt": rect.height,
        "width_mm": rect.width * PT_TO_MM,
        "height_mm": rect.height * PT_TO_MM,
    }


def load_blueprint_json(dxf_path: str, json_override: str | None = None) -> dict | None:
    """DXFパスから対応するblueprint JSONを探して読み込む

    Search order:
    1. Explicit --json override (if provided)
    2. source_json field inside .dxf.meta.json
    3. Same-name .json in blueprint-analysis/
    4. *_corrected.json variant in blueprint-analysis/
    5. .dxf.meta.json itself as fallback
    """
    # 1. Explicit override
    if json_override and os.path.exists(json_override):
        with open(json_override, encoding='utf-8') as f:
            return json.load(f)

    # 2. Check meta.json for source_json path
    meta_path = dxf_path + ".meta.json"
    if os.path.exists(meta_path):
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
        source = meta.get('source_json')
        if source and os.path.exists(source):
            with open(source, encoding='utf-8') as f:
                return json.load(f)

    # 3. Same-name .json in blueprint-analysis/
    json_path = dxf_path.replace('.dxf', '.json').replace('drawings', 'blueprint-analysis')
    if os.path.exists(json_path):
        with open(json_path, encoding='utf-8') as f:
            return json.load(f)

    # 4. *_corrected.json variant
    corrected_path = dxf_path.replace('.dxf', '_corrected.json').replace('drawings', 'blueprint-analysis')
    if os.path.exists(corrected_path):
        with open(corrected_path, encoding='utf-8') as f:
            return json.load(f)

    # 5. .dxf.meta.json as fallback
    if os.path.exists(meta_path):
        with open(meta_path, encoding='utf-8') as f:
            return json.load(f)

    return None


def draw_overlay_direct(pdf_img: Image.Image, bp_data: dict,
                        page_info: dict, dpi: int = 150,
                        pdf_path: str | None = None,
                        page_num: int = 0) -> Image.Image:
    """blueprint JSONのデータをPDF画像に直接描画する。

    座標変換:
    - blueprint JSON: 実寸mm (Y-up, 原点=左下 — flip_y済み)
    - PDF画像: ピクセル (Y-down, 原点=左上)

    変換: real_mm → paper_mm (÷scale) → pt (÷PT_TO_MM) → flip_y → px (×dpi/72)
    """
    import numpy as np

    # スケール取得
    scale = 50  # デフォルト
    sd = bp_data.get('scale_detected', '')
    if sd and ':' in str(sd):
        try:
            scale = int(str(sd).split(':')[1])
        except (ValueError, IndexError):
            pass

    # 原点オフセット取得 (JSONの座標は正規化済み → 元のPDF座標に戻すために加算)
    origin = bp_data.get('origin_offset_mm', {"x": 0, "y": 0})
    origin_x_mm = origin.get("x", 0)
    origin_y_mm = origin.get("y", 0)

    page_h_pt = page_info["height_pt"]
    img_w, img_h = pdf_img.size

    def world_to_pixel(x_mm: float, y_mm: float) -> tuple[int, int]:
        """実寸mm (Y-up, 正規化済み) → PDFピクセル座標 (Y-down)

        JSONの座標は origin_offset_mm 分だけシフト済みなので、
        元のPDF上の位置に戻すために origin_offset を加算する。
        """
        # 原点オフセット復元 → 元の実寸mm座標
        x_real = x_mm + origin_x_mm
        y_real = y_mm + origin_y_mm
        # 実寸mm → 用紙mm
        x_paper = x_real / scale
        y_paper = y_real / scale
        # 用紙mm → pt
        x_pt = x_paper / PT_TO_MM
        y_flipped_pt = y_paper / PT_TO_MM
        # un-flip: Y-up → Y-down (PyMuPDF/raster座標)
        y_pt = page_h_pt - y_flipped_pt
        # pt → pixel
        px_x = int(x_pt * dpi / 72.0)
        px_y = int(y_pt * dpi / 72.0)
        return px_x, px_y

    # PDFを薄くする
    pdf_arr = np.array(pdf_img, dtype=np.float32)
    pdf_faded = (pdf_arr * 0.4 + 255 * 0.6).astype(np.uint8)
    overlay = Image.fromarray(pdf_faded)
    draw = ImageDraw.Draw(overlay)

    # 壁を赤で描画 (中心線を2px幅 + ID表示)
    walls = bp_data.get('walls', [])
    for w in walls:
        p1 = world_to_pixel(w['start_x_mm'], w['start_y_mm'])
        p2 = world_to_pixel(w['end_x_mm'], w['end_y_mm'])
        draw.line([p1, p2], fill=(220, 40, 40), width=2)
        # 壁IDラベル (中点に表示)
        mid = ((p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2)
        wid = w.get('id', '')
        if wid and 0 <= mid[0] < img_w and 0 <= mid[1] < img_h:
            draw.text((mid[0] - 8, mid[1] - 10), wid, fill=(200, 0, 0))

    # 什器を緑で描画
    fixtures = bp_data.get('fixtures', [])
    for f in fixtures:
        cx = f.get('x_mm', 0)
        cy = f.get('y_mm', 0)
        fw = f.get('width_mm', 500)
        fd = f.get('depth_mm', 500)
        # 4隅
        corners = [
            world_to_pixel(cx, cy),
            world_to_pixel(cx + fw, cy),
            world_to_pixel(cx + fw, cy + fd),
            world_to_pixel(cx, cy + fd),
        ]
        draw.polygon(corners, outline=(30, 180, 30), width=2)

    # 部屋ポリゴンを青で描画 (面積付きラベル)
    rooms = bp_data.get('rooms', [])
    for r in rooms:
        poly = r.get('polygon_mm', [])
        if len(poly) >= 3:
            pts = [world_to_pixel(p[0], p[1]) for p in poly]
            draw.polygon(pts, outline=(40, 80, 220), width=2)
        # 室名+面積ラベル
        name = r.get('name', '不明')
        area = r.get('area_m2', 0)
        label = f"{name[:8]} {area}m2"
        center = r.get('center_mm', [0, 0])
        cp = world_to_pixel(center[0], center[1])
        if 0 <= cp[0] < img_w and 0 <= cp[1] < img_h:
            draw.text((cp[0] - 20, cp[1] - 6), label,
                      fill=(30, 30, 200))

    # PDF太線を参照レイヤーとして描画 (薄い灰色)
    if pdf_path:
        try:
            doc = fitz.open(pdf_path)
            page = doc[page_num]
            zoom = dpi / 72.0
            for d_item in page.get_drawings():
                w = d_item.get('width', 0) or 0
                if w < 0.25:
                    continue
                for item in d_item['items']:
                    if item[0] != 'l':
                        continue
                    p1, p2 = item[1], item[2]
                    px1 = (int(p1.x * zoom), int(p1.y * zoom))
                    px2 = (int(p2.x * zoom), int(p2.y * zoom))
                    draw.line([px1, px2], fill=(160, 160, 160), width=1)
            doc.close()
        except Exception:
            pass

    # ラベル
    draw.text((10, 10),
              "OVERLAY: LightGray=PDFLines, Red=Wall, Green=Fixture, Blue=Room",
              fill=(0, 0, 180))

    return overlay


def render_dxf_standalone(dxf_path: str) -> Image.Image:
    """DXFをmatplotlibで単独レンダリング (side-by-side用)"""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import ezdxf
        from ezdxf.addons.drawing import RenderContext, Frontend
        from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
        from ezdxf.addons.drawing.config import Configuration
    except ImportError:
        return Image.new('RGB', (800, 800), 'white')

    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    fig, ax = plt.subplots(figsize=(20, 20), dpi=150)
    ax.set_aspect('equal')
    ax.set_facecolor('white')

    ctx = RenderContext(doc)
    out = MatplotlibBackend(ax)
    config = Configuration(background_policy=2)
    Frontend(ctx, out, config=config).draw_layout(msp)

    ax.autoscale()
    ax.margins(0.02)
    ax.axis('off')

    fig.savefig('_temp_dxf_render.png', bbox_inches='tight',
                facecolor='white', edgecolor='none', dpi=150)
    plt.close(fig)

    img = Image.open('_temp_dxf_render.png').convert('RGB')
    os.remove('_temp_dxf_render.png')
    return img


def create_comparison(pdf_path: str, dxf_path: str, output_path: str,
                      page_num: int = 0, json_override: str | None = None):
    """比較画像を生成"""
    print(f"元PDF: {pdf_path} (page {page_num})")
    print(f"DXF:   {dxf_path}")
    if json_override:
        print(f"JSON:  {json_override}")

    # PDF情報取得
    page_info = get_pdf_page_info(pdf_path, page_num)
    print(f"PDFページ: {page_info['width_mm']:.1f} x {page_info['height_mm']:.1f} mm")

    dpi = 150

    # PDFレンダリング
    print("PDFレンダリング中...")
    pdf_img = render_pdf_page(pdf_path, page_num, dpi=dpi)
    print(f"  PDF画像: {pdf_img.size}")

    # blueprint JSON を読み込み
    bp_data = load_blueprint_json(dxf_path, json_override)

    # 1. 重ね合わせ画像 (blueprint JSONから直接描画)
    if bp_data:
        sd = bp_data.get('scale_detected', '?')
        print(f"Blueprint JSON 読み込み完了 (scale: {sd})")
        print("重ね合わせ画像生成中 (直接描画)...")
        overlay = draw_overlay_direct(pdf_img, bp_data, page_info, dpi,
                                       pdf_path=pdf_path, page_num=page_num)
    else:
        print("Blueprint JSON が見つかりません。DXFレンダリングにフォールバック...")
        dxf_img = render_dxf_standalone(dxf_path)
        dxf_resized = dxf_img.resize(pdf_img.size, Image.LANCZOS)
        # 簡易overlay
        import numpy as np
        pdf_arr = np.array(pdf_img, dtype=np.float32)
        dxf_arr = np.array(dxf_resized, dtype=np.float32)
        pdf_faded = pdf_arr * 0.4 + 255 * 0.6
        dxf_gray = np.mean(dxf_arr, axis=2)
        line_mask = dxf_gray < 200
        result = pdf_faded.copy()
        result[line_mask] = [255, 30, 30]
        overlay = Image.fromarray(result.astype(np.uint8))

    overlay_path = output_path.replace('.png', '_overlay.png')
    overlay.save(overlay_path, quality=95)
    print(f"  重ね合わせ: {overlay_path}")

    # 2. 並べた比較画像
    print("並列比較画像生成中...")
    dxf_img = render_dxf_standalone(dxf_path)
    gap = 20
    dxf_scale = pdf_img.height / dxf_img.height
    dxf_display = dxf_img.resize(
        (int(dxf_img.width * dxf_scale), pdf_img.height), Image.LANCZOS)

    side_w = pdf_img.width + gap + dxf_display.width
    side_h = max(pdf_img.height, dxf_img.height) + 80
    side = Image.new('RGB', (side_w, side_h), 'white')
    side.paste(pdf_img, (0, 80))
    side.paste(dxf_display, (pdf_img.width + gap, 80))

    draw_s = ImageDraw.Draw(side)
    draw_s.text((pdf_img.width // 2 - 80, 20), "ORIGINAL PDF", fill='black')
    draw_s.text((pdf_img.width + gap + dxf_display.width // 2 - 80, 20),
                "DXF OUTPUT", fill='red')

    side_path = output_path.replace('.png', '_sidebyside.png')
    side.save(side_path, quality=95)
    print(f"  並列比較: {side_path}")

    # 3. 差分レポート
    if bp_data:
        print(f"\n=== 差分レポート ===")
        print(f"壁: {len(bp_data.get('walls', []))}本")
        total_openings = sum(len(w.get('openings', []))
                             for w in bp_data.get('walls', []))
        print(f"開口部: {total_openings}個")
        print(f"什器: {len(bp_data.get('fixtures', []))}個")
        print(f"部屋: {len(bp_data.get('rooms', []))}室")

    print(f"\n完了。以下のファイルを確認してください:")
    print(f"  {overlay_path}")
    print(f"  {side_path}")


def main():
    # Windows cp932対策
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

    parser = argparse.ArgumentParser(
        description="PDF図面 vs DXF出力 比較ツール")
    parser.add_argument("pdf", help="元PDFファイル")
    parser.add_argument("dxf", help="DXF出力ファイル")
    parser.add_argument("-o", "--output", default="output/drawings/comparison.png",
                        help="出力画像パス")
    parser.add_argument("--page", type=int, default=0, help="PDFページ番号")
    parser.add_argument("--json", default=None,
                        help="Blueprint JSON path (override auto-detection)")
    args = parser.parse_args()

    create_comparison(args.pdf, args.dxf, args.output, args.page, args.json)


if __name__ == "__main__":
    main()
