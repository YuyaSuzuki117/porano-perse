"""
PDF図面 ↔ DXF出力 比較ツール

元PDFの平面図とDXF出力を重ね合わせて差異を可視化する。

使い方:
  python scripts/compare-pdf-dxf.py <original.pdf> <output.dxf> [-o comparison.png] [--page 0]

出力:
  1. 左右並べた比較画像 (side-by-side)
  2. 重ね合わせ画像 (overlay: 元PDF=グレー, DXF=赤)
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
    import ezdxf
    from ezdxf.addons.drawing import RenderContext, Frontend
    from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
except ImportError:
    print("エラー: ezdxf が必要です。 pip install ezdxf", file=sys.stderr)
    sys.exit(1)

try:
    from PIL import Image, ImageDraw, ImageFont, ImageChops
except ImportError:
    print("エラー: Pillow が必要です。 pip install Pillow", file=sys.stderr)
    sys.exit(1)

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
except ImportError:
    print("エラー: matplotlib が必要です。 pip install matplotlib", file=sys.stderr)
    sys.exit(1)


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


def render_dxf(dxf_path: str, width: int = 2000, height: int = 2000) -> Image.Image:
    """DXFを画像としてレンダリング (白背景・黒線)"""
    from ezdxf.addons.drawing.config import Configuration

    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    fig, ax = plt.subplots(figsize=(20, 20), dpi=150)
    ax.set_aspect('equal')
    ax.set_facecolor('white')

    ctx = RenderContext(doc)
    out = MatplotlibBackend(ax)
    # 白背景設定
    config = Configuration(
        background_policy=2,  # WHITE
    )
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


def create_overlay(pdf_img: Image.Image, dxf_img: Image.Image) -> Image.Image:
    """元PDF(グレー) と DXF出力(赤) を重ね合わせ"""
    # DXF画像をPDF画像と同じサイズにリサイズ
    dxf_resized = dxf_img.resize(pdf_img.size, Image.LANCZOS)

    # 元PDFをグレースケール → 薄くする
    pdf_gray = pdf_img.convert('L').convert('RGB')
    pdf_light = Image.blend(Image.new('RGB', pdf_gray.size, 'white'), pdf_gray, 0.4)

    # DXFの線を赤にする
    dxf_gray = dxf_resized.convert('L')
    # 暗い部分(線) = 赤、明るい部分(背景) = 透過
    dxf_red = Image.new('RGB', dxf_resized.size, 'white')
    pixels_dxf = dxf_gray.load()
    pixels_red = dxf_red.load()
    for y in range(dxf_gray.height):
        for x in range(dxf_gray.width):
            v = pixels_dxf[x, y]
            if v < 200:  # 線部分
                pixels_red[x, y] = (255, 0, 0)
            else:
                pixels_red[x, y] = (255, 255, 255)

    # 重ね合わせ: 元PDF(グレー) + DXF(赤)
    overlay = pdf_light.copy()
    for y in range(min(overlay.height, dxf_red.height)):
        for x in range(min(overlay.width, dxf_red.width)):
            r, g, b = pixels_red[x, y]
            if r == 255 and g == 0 and b == 0:
                overlay.putpixel((x, y), (255, 50, 50))

    return overlay


def create_overlay_fast(pdf_img: Image.Image, dxf_img: Image.Image) -> Image.Image:
    """高速版: numpy使用の重ね合わせ"""
    try:
        import numpy as np
    except ImportError:
        return create_overlay(pdf_img, dxf_img)

    # DXFをPDFサイズに合わせる
    dxf_resized = dxf_img.resize(pdf_img.size, Image.LANCZOS)

    # numpy配列に変換
    pdf_arr = np.array(pdf_img, dtype=np.float32)
    dxf_arr = np.array(dxf_resized, dtype=np.float32)

    # 元PDFを薄くする
    pdf_faded = pdf_arr * 0.4 + 255 * 0.6

    # DXFの線部分を検出 (暗い部分)
    dxf_gray = np.mean(dxf_arr, axis=2)
    line_mask = dxf_gray < 200

    # 元PDFの上にDXFの線を赤で重ねる
    result = pdf_faded.copy()
    result[line_mask] = [255, 30, 30]  # 赤

    return Image.fromarray(result.astype(np.uint8))


def create_comparison(pdf_path: str, dxf_path: str, output_path: str,
                      page_num: int = 0):
    """比較画像を生成"""
    print(f"元PDF: {pdf_path} (page {page_num})")
    print(f"DXF:   {dxf_path}")

    # レンダリング
    print("PDFレンダリング中...")
    pdf_img = render_pdf_page(pdf_path, page_num, dpi=150)
    print(f"  PDF画像: {pdf_img.size}")

    print("DXFレンダリング中...")
    dxf_img = render_dxf(dxf_path)
    print(f"  DXF画像: {dxf_img.size}")

    # 1. 並べた比較画像
    print("比較画像生成中...")
    gap = 20
    max_h = max(pdf_img.height, dxf_img.height)

    # DXFをPDFと同じ高さにリサイズ
    dxf_scale = pdf_img.height / dxf_img.height
    dxf_display = dxf_img.resize(
        (int(dxf_img.width * dxf_scale), pdf_img.height), Image.LANCZOS)

    side_w = pdf_img.width + gap + dxf_display.width
    side_h = max_h + 80
    side = Image.new('RGB', (side_w, side_h), 'white')
    side.paste(pdf_img, (0, 80))
    side.paste(dxf_display, (pdf_img.width + gap, 80))

    draw = ImageDraw.Draw(side)
    draw.text((pdf_img.width // 2 - 80, 20), "ORIGINAL PDF",
              fill='black')
    draw.text((pdf_img.width + gap + dxf_display.width // 2 - 80, 20),
              "DXF OUTPUT", fill='red')

    side_path = output_path.replace('.png', '_sidebyside.png')
    side.save(side_path, quality=95)
    print(f"  並列比較: {side_path}")

    # 2. 重ね合わせ画像
    print("重ね合わせ画像生成中...")
    overlay = create_overlay_fast(pdf_img, dxf_img)

    draw2 = ImageDraw.Draw(overlay)
    draw2.text((10, 10), "OVERLAY: Gray=Original, Red=DXF output",
               fill='blue')

    overlay_path = output_path.replace('.png', '_overlay.png')
    overlay.save(overlay_path, quality=95)
    print(f"  重ね合わせ: {overlay_path}")

    # 3. 差分レポート
    meta_path = dxf_path + ".meta.json"
    if os.path.exists(meta_path):
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
        print(f"\n=== 差分レポート ===")
        print(f"壁: {len(meta.get('walls', []))}本")
        print(f"開口部: {sum(len(w.get('openings',[])) for w in meta.get('walls',[]))}個")
        print(f"什器: {len(meta.get('furniture', []))}個")
        print(f"部屋: {len(meta.get('rooms', []))}室")

    print(f"\n完了。以下のファイルを確認してください:")
    print(f"  {side_path}")
    print(f"  {overlay_path}")


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
    args = parser.parse_args()

    create_comparison(args.pdf, args.dxf, args.output, args.page)


if __name__ == "__main__":
    main()
