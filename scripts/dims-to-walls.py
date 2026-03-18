"""
寸法テキスト位置から壁座標を自動計算
PDFの寸法線テキストのXY位置と値から、水平/垂直の寸法チェーンを検出し壁を構築

Usage: python scripts/dims-to-walls.py <pdf> --page N -o <output.json>
"""
import argparse
import json
import sys
from collections import defaultdict

import fitz

PT_TO_MM = 25.4 / 72.0  # 1pt = 0.3528mm


def extract_dims(pdf_path: str, page_num: int):
    """PDFから寸法テキスト(数値)を位置付きで抽出"""
    doc = fitz.open(pdf_path)
    page = doc[page_num]
    page_h = page.rect.height

    dims = []
    blocks = page.get_text("dict")["blocks"]
    for b in blocks:
        if "lines" not in b:
            continue
        for line in b["lines"]:
            for span in line["spans"]:
                text = span["text"].strip()
                x_pt, y_pt = span["origin"]
                # 複数数値が空白区切りの場合も処理
                for token in text.split():
                    try:
                        val = float(token.replace(",", ""))
                        if 50 <= val <= 20000:
                            dims.append({
                                "x_pt": x_pt,
                                "y_pt": y_pt,
                                "value_mm": val,
                                "size": span["size"],
                            })
                    except ValueError:
                        pass

    # テキストラベル(室名等)も抽出
    labels = []
    for b in blocks:
        if "lines" not in b:
            continue
        for line in b["lines"]:
            for span in line["spans"]:
                text = span["text"].strip()
                if not text:
                    continue
                try:
                    float(text.replace(",", ""))
                    continue  # 数値はスキップ
                except ValueError:
                    pass
                x_pt, y_pt = span["origin"]
                labels.append({
                    "x_pt": x_pt,
                    "y_pt": y_pt,
                    "text": text,
                    "size": span["size"],
                })

    doc.close()
    return dims, labels, page_h


def find_dim_chains(dims, page_h, scale_factor):
    """寸法テキストを水平チェーン/垂直チェーンに分類"""

    # Y座標でグループ化 → 水平チェーン（同じ高さの寸法線 = X方向の寸法）
    h_groups = defaultdict(list)
    for d in dims:
        y_key = round(d["y_pt"] / 5) * 5  # 5pt単位で丸め
        h_groups[y_key].append(d)

    # X座標でグループ化 → 垂直チェーン（同じX位置の寸法線 = Y方向の寸法）
    v_groups = defaultdict(list)
    for d in dims:
        x_key = round(d["x_pt"] / 5) * 5
        v_groups[x_key].append(d)

    chains = []

    # 水平チェーン: 3つ以上の寸法が同じY位置にある
    for y_key, group in sorted(h_groups.items()):
        if len(group) >= 3:
            group.sort(key=lambda d: d["x_pt"])
            values = [d["value_mm"] for d in group]
            total = sum(values)
            chains.append({
                "type": "horizontal",
                "y_pt": y_key,
                "y_mm": (page_h - y_key) * PT_TO_MM * scale_factor,
                "values": values,
                "total": total,
                "count": len(group),
            })

    # 垂直チェーン: 3つ以上の寸法が同じX位置にある
    for x_key, group in sorted(v_groups.items()):
        if len(group) >= 3:
            group.sort(key=lambda d: d["y_pt"])
            values = [d["value_mm"] for d in group]
            total = sum(values)
            chains.append({
                "type": "vertical",
                "x_pt": x_key,
                "x_mm": x_key * PT_TO_MM * scale_factor,
                "values": values,
                "total": total,
                "count": len(group),
            })

    return chains


def build_walls_from_chains(chains, total_w, total_h, scale_factor):
    """寸法チェーンから壁座標を構築"""
    walls = []
    wid = 1

    # 外壁4本
    walls.append({"id": f"W{wid}", "start_x_mm": 0, "start_y_mm": 0,
                  "end_x_mm": total_w, "end_y_mm": 0,
                  "thickness_mm": 150, "type": "exterior", "openings": []})
    wid += 1
    walls.append({"id": f"W{wid}", "start_x_mm": total_w, "start_y_mm": 0,
                  "end_x_mm": total_w, "end_y_mm": total_h,
                  "thickness_mm": 150, "type": "exterior", "openings": []})
    wid += 1
    walls.append({"id": f"W{wid}", "start_x_mm": total_w, "start_y_mm": total_h,
                  "end_x_mm": 0, "end_y_mm": total_h,
                  "thickness_mm": 150, "type": "exterior", "openings": []})
    wid += 1
    walls.append({"id": f"W{wid}", "start_x_mm": 0, "start_y_mm": total_h,
                  "end_x_mm": 0, "end_y_mm": 0,
                  "thickness_mm": 150, "type": "exterior", "openings": []})
    wid += 1

    # 水平チェーンからX方向の壁位置を計算
    h_chains = [c for c in chains if c["type"] == "horizontal"]
    x_positions = set()

    for chain in h_chains:
        # 累積和でX座標を計算
        x = 0
        for val in chain["values"]:
            x += val
            if 100 < x < total_w - 100:  # 外壁は除外
                x_positions.add(round(x))

    # 垂直チェーンからY方向の壁位置を計算
    v_chains = [c for c in chains if c["type"] == "vertical"]
    y_positions = set()

    for chain in v_chains:
        y = 0
        for val in chain["values"]:
            y += val
            if 100 < y < total_h - 100:
                y_positions.add(round(y))

    return walls, sorted(x_positions), sorted(y_positions), wid


def main():
    parser = argparse.ArgumentParser(description="寸法テキストから壁座標を計算")
    parser.add_argument("pdf_path", help="入力PDF")
    parser.add_argument("-o", "--output", required=True, help="出力JSON")
    parser.add_argument("--page", type=int, default=0, help="ページ番号")
    parser.add_argument("--scale", type=int, default=70, help="縮尺の分母(例: 70)")
    args = parser.parse_args()

    sf = args.scale
    print(f"=== 寸法テキスト → 壁座標 ===")
    print(f"  PDF: {args.pdf_path}")
    print(f"  ページ: {args.page}, 縮尺: 1:{sf}")

    dims, labels, page_h = extract_dims(args.pdf_path, args.page)
    print(f"  寸法値: {len(dims)}個, テキスト: {len(labels)}個")

    chains = find_dim_chains(dims, page_h, sf)
    print(f"\n=== 寸法チェーン ===")
    for c in chains:
        direction = "→" if c["type"] == "horizontal" else "↑"
        pos_key = f"y={c.get('y_mm',0):.0f}" if c["type"] == "horizontal" else f"x={c.get('x_mm',0):.0f}"
        print(f"  {direction} {pos_key}: {c['values']} = {c['total']}mm ({c['count']}個)")

    # 下辺の最大チェーンから全体幅を特定
    h_totals = [c["total"] for c in chains if c["type"] == "horizontal"]
    v_totals = [c["total"] for c in chains if c["type"] == "vertical"]
    total_w = max(h_totals) if h_totals else 16683
    total_h = max(v_totals) if v_totals else 15415
    print(f"\n  推定外形: {total_w}mm × {total_h}mm")

    walls, x_positions, y_positions, next_wid = build_walls_from_chains(
        chains, total_w, total_h, sf
    )

    print(f"\n=== 検出された壁位置 ===")
    print(f"  X方向の壁候補: {x_positions}")
    print(f"  Y方向の壁候補: {y_positions}")

    # 出力JSON
    data = {
        "source": "dims-to-walls",
        "pdf_file": args.pdf_path,
        "scale_detected": f"1:{sf}",
        "total_width_mm": total_w,
        "total_height_mm": total_h,
        "walls": walls,
        "x_wall_candidates": x_positions,
        "y_wall_candidates": y_positions,
        "dimension_chains": chains,
        "rooms": [],
        "fixtures": [],
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n出力: {args.output}")


if __name__ == "__main__":
    main()
