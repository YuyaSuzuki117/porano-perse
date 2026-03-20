"""
Claude Code 視覚的図面補正ツール

PDF + 抽出JSONから「部屋番号・名前・信頼度・近傍テキスト」を
PDFオーバーレイ画像に描画し、Claude Codeが画像を見て修正指示を出せる。

使い方:
  # Step 1: オーバーレイ画像生成
  python scripts/visual-correct.py render <blueprint.json> <pdf> -o overlay.png

  # Step 2: Claude Codeが画像を見て修正指示を生成

  # Step 3: 修正適用
  python scripts/visual-correct.py fix <blueprint.json> --set "5:トイレ" --set "8:厨房" --delete 12 --merge 3,7 -o corrected.json

  # Step 4: 修正後のオーバーレイ確認
  python scripts/visual-correct.py render <corrected.json> <pdf> -o overlay_fixed.png

  # Step 5: DXF出力
  python scripts/gen-dxf.py --json corrected.json -o output.dxf
"""

import argparse
import json
import math
import os
import sys

try:
    import fitz
except ImportError:
    print("エラー: PyMuPDF が必要です。 pip install PyMuPDF", file=sys.stderr)
    sys.exit(1)

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("エラー: Pillow が必要です。 pip install Pillow", file=sys.stderr)
    sys.exit(1)

PT_TO_MM = 25.4 / 72.0


def load_json(path: str) -> dict:
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save_json(data: dict, path: str):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"保存: {path}")


def get_font(size: int):
    """日本語対応フォントを取得"""
    candidates = [
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/msgothic.ttc",
        "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for fp in candidates:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size)
            except Exception:
                continue
    return ImageFont.load_default()


def render_overlay(bp_data: dict, pdf_path: str, output_path: str,
                   page_num: int = 0, dpi: int = 200):
    """PDFにblueprint JSONの部屋情報をオーバーレイして画像出力"""

    # PDF画像レンダリング
    doc = fitz.open(pdf_path)
    page = doc[page_num]
    page_h_pt = page.rect.height
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    pdf_img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    doc.close()

    # PDFを少し薄くする
    import numpy as np
    pdf_arr = np.array(pdf_img, dtype=np.float32)
    pdf_faded = (pdf_arr * 0.5 + 255 * 0.5).astype(np.uint8)
    overlay = Image.fromarray(pdf_faded)
    draw = ImageDraw.Draw(overlay)

    # スケール
    sd = bp_data.get('scale_detected', '1:50')
    scale = 50
    if ':' in str(sd):
        try:
            scale = int(str(sd).split(':')[1])
        except (ValueError, IndexError):
            pass

    origin = bp_data.get('origin_offset_mm', {"x": 0, "y": 0})
    ox, oy = origin.get("x", 0), origin.get("y", 0)

    def w2p(x_mm, y_mm):
        """実寸mm → ピクセル"""
        xr, yr = x_mm + ox, y_mm + oy
        xpt = (xr / scale) / PT_TO_MM
        ypt = page_h_pt - (yr / scale) / PT_TO_MM
        return int(xpt * dpi / 72), int(ypt * dpi / 72)

    # フォント
    font_large = get_font(16)
    font_medium = get_font(13)
    font_small = get_font(10)

    rooms = bp_data.get('rooms', [])
    walls = bp_data.get('walls', [])

    # 壁を描画（グレー太線）
    for wall in walls:
        p1 = w2p(wall['start_x_mm'], wall['start_y_mm'])
        p2 = w2p(wall['end_x_mm'], wall['end_y_mm'])
        draw.line([p1, p2], fill=(120, 120, 120), width=3)

    # 部屋ポリゴン + 番号 + 情報を描画
    for idx, room in enumerate(rooms):
        polygon = room.get('polygon_mm', [])
        if len(polygon) < 3:
            continue

        name = room.get('name', '不明')
        area = room.get('area_m2', 0)
        conf = room.get('confidence', 0)
        nearby = room.get('nearby_texts', [])
        center = room.get('center_mm', [0, 0])

        is_unknown = name in ('不明', '')

        # ポリゴン描画
        pts = [w2p(p[0], p[1]) for p in polygon]
        if is_unknown:
            fill_color = (255, 80, 80, 40)
            outline_color = (255, 0, 0)
        elif conf >= 0.8:
            fill_color = (60, 130, 255, 30)
            outline_color = (0, 100, 255)
        else:
            fill_color = (255, 180, 0, 35)
            outline_color = (200, 150, 0)

        # 半透明ポリゴン
        poly_img = Image.new('RGBA', overlay.size, (0, 0, 0, 0))
        poly_draw = ImageDraw.Draw(poly_img)
        poly_draw.polygon(pts, fill=fill_color, outline=outline_color)
        overlay.paste(Image.alpha_composite(
            overlay.convert('RGBA'), poly_img
        ).convert('RGB'))
        draw = ImageDraw.Draw(overlay)

        # 中心座標
        cx, cy = w2p(center[0], center[1])

        # 部屋番号（大きく白抜き丸）
        num_str = str(idx)
        r = 14
        if is_unknown:
            draw.ellipse([cx - r, cy - r - 20, cx + r, cy + r - 20],
                         fill=(255, 50, 50), outline=(255, 255, 255), width=2)
        else:
            draw.ellipse([cx - r, cy - r - 20, cx + r, cy + r - 20],
                         fill=(50, 120, 255), outline=(255, 255, 255), width=2)
        draw.text((cx, cy - 20), num_str, fill=(255, 255, 255),
                  font=font_medium, anchor="mm")

        # 部屋名 + 面積
        label = f"{name}" if name != '不明' else "【不明】"
        draw.text((cx, cy + 2), label, fill=(0, 0, 0), font=font_medium, anchor="mm")
        draw.text((cx, cy + 18), f"{area}m2  信頼度{int(conf * 100)}%",
                  fill=(100, 100, 100), font=font_small, anchor="mm")

        # 近傍テキスト（不明室のみ）
        if is_unknown and nearby:
            hint = "候補: " + ", ".join(nearby[:3])
            draw.text((cx, cy + 32), hint,
                      fill=(200, 100, 0), font=font_small, anchor="mm")

    # 凡例
    legend_y = 20
    draw.rectangle([10, legend_y, 300, legend_y + 100], fill=(255, 255, 255, 200))
    draw.text((15, legend_y + 5), "■ 青: 高信頼度(≥80%)", fill=(50, 120, 255), font=font_small)
    draw.text((15, legend_y + 22), "■ 黄: 中信頼度(50-79%)", fill=(200, 150, 0), font=font_small)
    draw.text((15, legend_y + 39), "■ 赤: 低信頼度/不明(<50%)", fill=(255, 50, 50), font=font_small)
    draw.text((15, legend_y + 56), f"部屋: {len(rooms)}室  壁: {len(walls)}本", fill=(0, 0, 0), font=font_small)

    unknown_count = sum(1 for r in rooms if r.get('name', '不明') in ('不明', ''))
    if unknown_count > 0:
        draw.text((15, legend_y + 73), f"⚠ 不明室: {unknown_count}室", fill=(255, 0, 0), font=font_medium)

    # 部屋一覧テーブル（右側）
    table_x = overlay.width - 350
    table_y = 20
    draw.rectangle([table_x - 5, table_y, overlay.width - 5, table_y + len(rooms) * 18 + 30],
                   fill=(255, 255, 255))
    draw.text((table_x, table_y + 2), "# 室名            面積   信頼度  候補",
              fill=(0, 0, 0), font=font_small)
    draw.line([(table_x, table_y + 16), (overlay.width - 10, table_y + 16)], fill=(0, 0, 0))

    for idx, room in enumerate(rooms):
        y = table_y + 20 + idx * 18
        if y > overlay.height - 20:
            draw.text((table_x, y), "... 以下省略", fill=(100, 100, 100), font=font_small)
            break
        name = room.get('name', '不明')
        area = room.get('area_m2', 0)
        conf = room.get('confidence', 0)
        nearby = room.get('nearby_texts', [])
        is_unk = name in ('不明', '')

        color = (255, 0, 0) if is_unk else (0, 0, 0)
        nearby_str = ",".join(nearby[:2]) if nearby else ""
        line = f"{idx:2d} {name:12s} {area:5.1f}m2 {int(conf*100):3d}%  {nearby_str}"
        draw.text((table_x, y), line, fill=color, font=font_small)

    overlay.save(output_path)
    print(f"オーバーレイ画像: {output_path}")
    print(f"部屋: {len(rooms)}室 (不明: {unknown_count}室)")


def apply_fixes(bp_data: dict, set_names: list, delete_ids: list,
                merge_pairs: list, wall_deletes=None, wall_adds=None,
                wall_moves=None, wall_snap=0) -> dict:
    """修正を適用"""
    rooms = bp_data.get('rooms', [])
    walls = bp_data.get('walls', [])

    # 室名設定
    for spec in set_names:
        idx_str, name = spec.split(':', 1)
        idx = int(idx_str)
        if 0 <= idx < len(rooms):
            rooms[idx]['name'] = name
            rooms[idx]['confidence'] = 1.0
            print(f"  設定: Room#{idx} → '{name}'")

    # マージ（先に処理、インデックスが変わるため逆順で削除）
    for pair in merge_pairs:
        idx1, idx2 = [int(x) for x in pair.split(',')]
        if 0 <= idx1 < len(rooms) and 0 <= idx2 < len(rooms) and idx1 != idx2:
            r1, r2 = rooms[idx1], rooms[idx2]
            # 面積合算、大きいポリゴンを採用
            from scripts_lib import polygon_area_m2
            r1['area_m2'] = round(r1.get('area_m2', 0) + r2.get('area_m2', 0), 1)
            if len(r2.get('polygon_mm', [])) > len(r1.get('polygon_mm', [])):
                r1['polygon_mm'] = r2['polygon_mm']
            r1['wall_ids'] = list(set(r1.get('wall_ids', []) + r2.get('wall_ids', [])))
            delete_ids.append(idx2)
            print(f"  マージ: Room#{idx1} + Room#{idx2}")

    # 削除（逆順で安全に）
    for idx in sorted(set(int(x) for x in delete_ids), reverse=True):
        if 0 <= idx < len(rooms):
            name = rooms[idx].get('name', '不明')
            rooms.pop(idx)
            print(f"  削除: Room#{idx} ('{name}')")

    # --- 壁修正 ---
    if wall_deletes is None:
        wall_deletes = []
    if wall_adds is None:
        wall_adds = []
    if wall_moves is None:
        wall_moves = []

    # 壁削除
    for wid in wall_deletes:
        before = len(walls)
        walls = [w for w in walls if w.get('id') != wid]
        if len(walls) < before:
            print(f"  壁削除: {wid}")
        else:
            print(f"  壁削除: {wid} (見つかりません)")

    # 壁追加
    for i, spec in enumerate(wall_adds, 1):
        parts = [float(v) for v in spec.split(',')]
        if len(parts) != 4:
            print(f"  壁追加エラー: 座標4つ必要 '{spec}'")
            continue
        new_id = f"wall_add_{i}"
        new_wall = {
            "id": new_id,
            "start_x_mm": parts[0],
            "start_y_mm": parts[1],
            "end_x_mm": parts[2],
            "end_y_mm": parts[3],
            "thickness_mm": 120,
            "type": "interior",
            "openings": []
        }
        walls.append(new_wall)
        print(f"  壁追加: {new_id} ({parts[0]},{parts[1]})→({parts[2]},{parts[3]})")

    # 壁移動
    for spec in wall_moves:
        if ':' not in spec:
            print(f"  壁移動エラー: 'ID:sx,sy,ex,ey' 形式が必要 '{spec}'")
            continue
        wid, coords_str = spec.split(':', 1)
        parts = [float(v) for v in coords_str.split(',')]
        if len(parts) != 4:
            print(f"  壁移動エラー: 座標4つ必要 '{spec}'")
            continue
        found = False
        for w in walls:
            if w.get('id') == wid:
                w['start_x_mm'] = parts[0]
                w['start_y_mm'] = parts[1]
                w['end_x_mm'] = parts[2]
                w['end_y_mm'] = parts[3]
                print(f"  壁移動: {wid} → ({parts[0]},{parts[1]})→({parts[2]},{parts[3]})")
                found = True
                break
        if not found:
            print(f"  壁移動: {wid} (見つかりません)")

    # 壁端点スナップ
    if wall_snap > 0 and walls:
        # 全端点を収集: (wall_index, 'start'|'end', x, y)
        endpoints = []
        for idx, w in enumerate(walls):
            endpoints.append((idx, 'start', w['start_x_mm'], w['start_y_mm']))
            endpoints.append((idx, 'end', w['end_x_mm'], w['end_y_mm']))

        # グループ化: 閾値以内の端点をクラスタリング
        used = [False] * len(endpoints)
        snap_count = 0
        for i in range(len(endpoints)):
            if used[i]:
                continue
            cluster = [i]
            used[i] = True
            for j in range(i + 1, len(endpoints)):
                if used[j]:
                    continue
                dx = endpoints[i][2] - endpoints[j][2]
                dy = endpoints[i][3] - endpoints[j][3]
                dist = math.sqrt(dx * dx + dy * dy)
                if dist <= wall_snap:
                    cluster.append(j)
                    used[j] = True
            if len(cluster) > 1:
                # 重心を計算
                cx = sum(endpoints[k][2] for k in cluster) / len(cluster)
                cy = sum(endpoints[k][3] for k in cluster) / len(cluster)
                # 各端点を重心に更新
                for k in cluster:
                    widx, end_type = endpoints[k][0], endpoints[k][1]
                    if end_type == 'start':
                        walls[widx]['start_x_mm'] = round(cx, 1)
                        walls[widx]['start_y_mm'] = round(cy, 1)
                    else:
                        walls[widx]['end_x_mm'] = round(cx, 1)
                        walls[widx]['end_y_mm'] = round(cy, 1)
                snap_count += 1
        if snap_count > 0:
            print(f"  壁スナップ: {snap_count}グループ統合 (閾値{wall_snap}mm)")

    bp_data['walls'] = walls
    bp_data['rooms'] = rooms
    return bp_data


def main():
    parser = argparse.ArgumentParser(description='Claude Code 視覚的図面補正')
    sub = parser.add_subparsers(dest='command')

    # render コマンド
    p_render = sub.add_parser('render', help='オーバーレイ画像生成')
    p_render.add_argument('json', help='Blueprint JSON')
    p_render.add_argument('pdf', help='元PDF')
    p_render.add_argument('-o', '--output', default='output/drawings/visual_correct.png')
    p_render.add_argument('--page', type=int, default=0)
    p_render.add_argument('--dpi', type=int, default=200)

    # fix コマンド
    p_fix = sub.add_parser('fix', help='修正適用')
    p_fix.add_argument('json', help='Blueprint JSON')
    p_fix.add_argument('--set', action='append', default=[], dest='set_names',
                       help='室名設定 "番号:名前" (例: --set "5:トイレ")')
    p_fix.add_argument('--delete', action='append', default=[], dest='delete_ids',
                       help='部屋削除 (例: --delete 12)')
    p_fix.add_argument('--merge', action='append', default=[], dest='merge_pairs',
                       help='部屋マージ "番号,番号" (例: --merge "3,7")')
    p_fix.add_argument('--wall-delete', action='append', default=[], dest='wall_deletes',
                       help='壁削除 (例: --wall-delete W3)')
    p_fix.add_argument('--wall-add', action='append', default=[], dest='wall_adds',
                       help='壁追加 "sx,sy,ex,ey" (mm) (例: --wall-add "1000,2000,5000,2000")')
    p_fix.add_argument('--wall-move', action='append', default=[], dest='wall_moves',
                       help='壁移動 "ID:sx,sy,ex,ey" (mm) (例: --wall-move "W5:1000,2000,5000,2000")')
    p_fix.add_argument('--wall-snap', type=float, default=0, dest='wall_snap',
                       help='壁端点スナップ閾値mm (例: --wall-snap 50)')
    p_fix.add_argument('-o', '--output', help='出力JSON (デフォルト: 上書き)')

    # list コマンド
    p_list = sub.add_parser('list', help='部屋一覧表示')
    p_list.add_argument('json', help='Blueprint JSON')
    p_list.add_argument('--unknown-only', action='store_true', help='不明室のみ')

    args = parser.parse_args()

    if args.command == 'render':
        bp = load_json(args.json)
        render_overlay(bp, args.pdf, args.output, args.page, args.dpi)

    elif args.command == 'fix':
        bp = load_json(args.json)
        bp = apply_fixes(bp, args.set_names, args.delete_ids, args.merge_pairs,
                         wall_deletes=args.wall_deletes, wall_adds=args.wall_adds,
                         wall_moves=args.wall_moves, wall_snap=args.wall_snap)
        out = args.output or args.json
        save_json(bp, out)

    elif args.command == 'list':
        bp = load_json(args.json)
        rooms = bp.get('rooms', [])
        unknown_count = 0
        print(f"{'#':>3} {'名前':12s} {'面積':>6s} {'信頼度':>5s} {'候補テキスト'}")
        print("-" * 60)
        for idx, room in enumerate(rooms):
            name = room.get('name', '不明')
            is_unk = name in ('不明', '')
            if args.unknown_only and not is_unk:
                continue
            if is_unk:
                unknown_count += 1
            area = room.get('area_m2', 0)
            conf = room.get('confidence', 0)
            nearby = room.get('nearby_texts', [])
            mark = '!' if is_unk else 'o'
            print(f"{idx:3d} {mark} {name:10s} {area:5.1f}m2 {int(conf*100):3d}%  {','.join(nearby[:3])}")
        total = len(rooms) if not args.unknown_only else unknown_count
        print(f"\n合計: {total}室" + (f" (不明: {unknown_count}室)" if not args.unknown_only else ""))

    else:
        parser.print_help()


if __name__ == '__main__':
    main()
