"""
ChloeBY 展開図 PDF → DXF 変換
PDF寸法を読み取り、gen-dxf.py の DXFGenerator で正確なDXFを再構築する。

出典: ChloeBY展開図‗見積用20251202 2.pdf
設計: desArt 株式会社 一級建築士事務所
縮尺: 1/40 (A3)
PLAN1008
"""

import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_dxf_lib import DXFGenerator

# ============================================================
# 平面図（P1）から読み取った寸法 (mm単位)
# ============================================================
# 全体寸法
# 上辺: 1,675 + 650 + 5,910 + 650 + 6,380 + 750 + 1,185 = 17,200
# 左辺(上部): 7,135
# 左辺(全体): 約 14,155 + 2,100 + 5,120 ≈ 21,375
# 右辺: 2,680 + 4,250 + 1,040 + 530 + 1,600 + 1,150 + 5,080 + 2,330

# 下辺: 640 + 650 + 5,885 + 650 + 1,040 + 5,445 + 650 + 1,160

# ============================================================
# 座標系: 左下を原点 (0,0)、右がX+、上がY+
# ============================================================

# --- 全体のバウンディングボックス ---
TOTAL_W = 17200  # mm
TOTAL_H_LEFT = 21375  # 左辺概算高さ
TOTAL_H_RIGHT = 18660  # 右辺概算高さ

# 天井高 (展開図から)
CH_BR = 2100       # BR
CH_BOTTLE = 2400   # 高級ボトル棚
CH_DJ = 2000       # DJブース (低め天井)
CH_STORAGE = 2100  # ボトル倉庫
CH_WC = 2100       # S-WC
CH_DEFAULT = 2700  # デフォルト

# 仕上げ情報 (展開図から)
FINISHES = {
    "BR": {"天井": "クロス(LGS+2.5 PB+9.5)", "壁": "クロス(LGS PB+12.5)", "巾木": "ソフト巾木", "床": "フロアタイル"},
    "高級ボトル棚": {"天井": "クロス", "壁": "クロス", "巾木": "ソフト巾木", "床": "長尺シート"},
    "DJブース": {"天井": "クロス", "壁": "クロス", "巾木": "ソフト巾木", "床": "長尺シート"},
    "ボトル倉庫": {"天井": "クロス", "壁": "クロス", "巾木": "ソフト巾木", "床": "長尺シート"},
    "S-WC大": {"天井": "クロス", "壁": "クロス", "巾木": "ソフト巾木", "床": "フロアタイル"},
    "S-WC小": {"天井": "クロス", "壁": "クロス", "巾木": "ソフト巾木", "床": "フロアタイル"},
}


def build_chloe_by():
    gen = DXFGenerator()
    gen.meta["project_name"] = "ChloeBY"
    gen.meta["ceiling_height_mm"] = CH_DEFAULT
    gen.meta["style"] = "bar"
    gen.meta["materials"] = {
        "floor": "floor_tile_white",
        "wall": "wall_white",
        "ceiling": "ceiling_white",
    }

    # ============================================================
    # P1 平面図: 外周壁
    # ============================================================
    # 上辺の寸法区分 (左から右)
    # E---H---F---D---B
    # 1,675 | 650 | 5,910 | (650) | 6,380 | 750 | 1,185

    # 下辺の寸法区分
    # K---|----|I---0---|----|----|----N
    # 640 | 650 | 5,885 | 650 | 1,040 | 5,445 | 650 | 1,160

    # 外周を頂点で定義（左下から反時計回り）
    # 平面図から、L字型（不整形）の外形を読み取る

    # 基準: 下辺左端を原点(0,0)とする
    # 下辺全幅: 640+650+5885+650+1040+5445+650+1160 = 16,120
    # 上辺全幅: 17,200
    # → 上辺は下辺より広い（左に張り出し）

    # 左下辺のオフセット推定: 上辺左端E は下辺左端Kより左にある
    # 上辺始点Eのx座標 = 0 (上辺基準)
    # 下辺始点Kのx座標 = 下辺は上辺と揃えると 17200-16120=1080 右にオフセット
    # → K は x=1080 付近

    # 簡略化: 上辺左端をx=0基準にする
    LEFT_OFFSET = 1080  # 下辺が上辺より右に1080mmオフセット

    # 外形頂点（上辺基準x=0, 下辺y=0）
    # 右辺の高さ区分（下から上）
    # 2,330 + 5,080 + 1,150 + 1,600 + 530 + 1,040 + 4,250 + 2,680 = 18,660

    H_TOTAL = 18660  # 右辺全高

    # --- 外壁 (主要セグメント) ---
    # 上辺 (左→右)
    gen.draw_wall((0, H_TOTAL), (17200, H_TOTAL), height_mm=CH_DEFAULT)

    # 右辺 (上→下)
    gen.draw_wall((17200, H_TOTAL), (17200, 0), height_mm=CH_DEFAULT)

    # 下辺 (右→左) — 下辺は段付き
    # 右下から左下: まず右側部分
    gen.draw_wall((17200, 0), (LEFT_OFFSET, 0), height_mm=CH_DEFAULT)

    # 左辺 (下→上)
    # 左辺は途中で段がある (7,135mm地点で張り出し)
    gen.draw_wall((LEFT_OFFSET, 0), (LEFT_OFFSET, 5120), height_mm=CH_DEFAULT)
    gen.draw_wall((LEFT_OFFSET, 5120), (0, 5120), height_mm=CH_DEFAULT)
    gen.draw_wall((0, 5120), (0, H_TOTAL), height_mm=CH_DEFAULT)

    # ============================================================
    # 内壁: 主要な部屋の区画
    # ============================================================

    # --- 5店 (26.8㎡) ---
    # 左上エリア、概算: x=0~8235, y=11525~18660
    # 上辺: 1675+650+5910 = 8235
    room_5_right = 8235
    room_5_bottom = H_TOTAL - 7135  # 18660-7135 = 11525

    # 5店の右壁
    gen.draw_wall((room_5_right, H_TOTAL), (room_5_right, room_5_bottom), height_mm=CH_DEFAULT)
    # 5店の下壁
    gen.draw_wall((0, room_5_bottom), (room_5_right, room_5_bottom), height_mm=CH_DEFAULT)

    # --- 10店 (26㎡) ---
    # 右上エリア、x=8885~15265, y=room_5_bottom~18660
    # 8235+650=8885, 8885+6380=15265
    room_10_left = 8885
    room_10_right = 15265

    # 10店の左壁（=通路右壁）
    gen.draw_wall((room_10_left, H_TOTAL), (room_10_left, room_5_bottom), height_mm=CH_DEFAULT)
    # 10店の右壁
    gen.draw_wall((room_10_right, H_TOTAL), (room_10_right, room_5_bottom), height_mm=CH_DEFAULT)
    # 10店の下壁
    gen.draw_wall((room_10_left, room_5_bottom), (room_10_right, room_5_bottom), height_mm=CH_DEFAULT)

    # --- ボトル倉庫 ---
    # 左中エリア (5店の下)
    bottle_top = room_5_bottom
    bottle_bottom = room_5_bottom - 7020  # 14155-7135=7020 概算
    bottle_right = 5910 + 650  # 6560

    gen.draw_wall((0, bottle_bottom), (bottle_right, bottle_bottom), height_mm=CH_STORAGE)
    gen.draw_wall((bottle_right, bottle_top), (bottle_right, bottle_bottom), height_mm=CH_STORAGE)

    # --- キャッシャー ---
    # 10店の下、中央右寄り
    cashier_left = room_10_left
    cashier_right = room_10_right
    cashier_top = room_5_bottom
    cashier_bottom = room_5_bottom - 4250  # 概算

    gen.draw_wall((cashier_left, cashier_bottom), (cashier_right, cashier_bottom), height_mm=CH_DEFAULT)

    # --- ENT (エントランス) ---
    # 右端下部
    ent_left = 15265
    ent_bottom = cashier_bottom - 1600
    gen.draw_wall((ent_left, cashier_bottom), (ent_left, ent_bottom), height_mm=CH_DEFAULT)
    gen.draw_wall((ent_left, ent_bottom), (17200, ent_bottom), height_mm=CH_DEFAULT)

    # --- EV x2 ---
    # 右端中段
    ev_left = 15265 + 650
    ev_width = 1160
    ev_top = cashier_bottom
    ev_bottom = cashier_bottom - 1600

    gen.draw_wall((ev_left, ev_top), (ev_left, ev_bottom), height_mm=CH_DEFAULT)
    gen.draw_wall((ev_left + ev_width, ev_top), (ev_left + ev_width, ev_bottom), height_mm=CH_DEFAULT)

    # --- PS ---
    ps_x = cashier_right - 750
    gen.draw_wall((ps_x, cashier_top), (ps_x, cashier_bottom), height_mm=CH_DEFAULT)

    # ============================================================
    # 建具 (ドア・開口部)
    # ============================================================

    # ENT メインドア
    gen.draw_door(
        (ent_left, ent_bottom), (17200, ent_bottom),
        position_mm=400, width_mm=900, swing="left"
    )

    # ボトル倉庫ドア
    gen.draw_door(
        (bottle_right, bottle_top), (bottle_right, bottle_bottom),
        position_mm=1000, width_mm=900, swing="left"
    )

    # 5店〜通路ドア
    gen.draw_door(
        (room_5_right, H_TOTAL), (room_5_right, room_5_bottom),
        position_mm=3000, width_mm=900, swing="right"
    )

    # ============================================================
    # 什器 (平面図から読み取り)
    # ============================================================

    # --- 5店 ---
    # OPENボトル棚 (左壁沿い)
    gen.draw_furniture(
        (1500, room_5_bottom + 4000), 2400, 600, 0, "OPENボトル棚", height_mm=2400
    )

    # 棚付 (左上)
    gen.draw_furniture(
        (500, room_5_bottom + 5500), 800, 400, 0, "棚付", height_mm=1800
    )

    # ボトル棚 (下部)
    gen.draw_furniture(
        (3500, room_5_bottom + 800), 3000, 600, 0, "ボトル棚", height_mm=2000
    )

    # --- 10店 ---
    # 上棚棚
    gen.draw_furniture(
        (room_10_left + 3000, room_5_bottom + 5500), 3000, 400, 0, "上棚棚", height_mm=1800
    )
    # 下部棚
    gen.draw_furniture(
        (room_10_left + 3000, room_5_bottom + 4800), 3000, 400, 0, "下部棚", height_mm=1200
    )

    # --- キャッシャー ---
    gen.draw_furniture(
        (cashier_left + 2000, cashier_bottom + 1500), 1200, 600, 0, "キャッシャー", height_mm=1050
    )

    # テイクアウト台
    gen.draw_furniture(
        (cashier_left + 1000, cashier_bottom + 500), 1500, 600, 0, "テイクアウト台", height_mm=900
    )

    # --- ボトル倉庫 ---
    gen.draw_furniture(
        (3000, bottle_bottom + 3000), 4000, 800, 0, "ボトル棚", height_mm=2100
    )

    # 高級ボトル棚
    gen.draw_furniture(
        (1500, bottle_bottom + 1000), 2500, 600, 0, "高級ボトル棚", height_mm=2400
    )

    # --- 消火栓 ---
    gen.draw_furniture(
        (cashier_left + 4000, cashier_bottom + 800), 600, 400, 0, "消火栓", height_mm=1200
    )

    # ============================================================
    # 寸法線
    # ============================================================

    # 上辺寸法
    x = 0
    for seg in [1675, 650, 5910, 650, 6380, 750, 1185]:
        gen.add_dimension((x, H_TOTAL), (x + seg, H_TOTAL), 500)
        x += seg

    # 全体上辺
    gen.add_dimension((0, H_TOTAL), (17200, H_TOTAL), 900)

    # 下辺寸法
    x = LEFT_OFFSET
    for seg in [650, 5885, 650, 1040, 5445, 650, 1160]:
        gen.add_dimension((x, 0), (x + seg, 0), -500)
        x += seg

    # 右辺寸法
    y = 0
    for seg in [2330, 5080, 1150, 1600, 530, 1040, 4250, 2680]:
        gen.add_dimension((17200, y), (17200, y + seg), 500)
        y += seg

    # 左辺寸法
    gen.add_dimension((0, 5120), (0, H_TOTAL), -500)

    # ============================================================
    # 室名
    # ============================================================
    gen.add_room_label(
        (room_5_right / 2, room_5_bottom + (H_TOTAL - room_5_bottom) / 2),
        "5店", 26.8
    )
    gen.add_room_label(
        ((room_10_left + room_10_right) / 2, room_5_bottom + (H_TOTAL - room_5_bottom) / 2),
        "10店", 26.0
    )
    gen.add_room_label(
        (bottle_right / 2, (bottle_top + bottle_bottom) / 2),
        "ボトル倉庫"
    )
    gen.add_room_label(
        ((cashier_left + cashier_right) / 2, (cashier_top + cashier_bottom) / 2),
        "キャッシャー"
    )
    gen.add_room_label(
        (16200, ent_bottom + 800),
        "ENT"
    )
    gen.add_room_label(
        (ev_left + ev_width / 2, (ev_top + ev_bottom) / 2),
        "EV"
    )

    # ============================================================
    # 仕上げ表
    # ============================================================
    finish_data = []
    for room_name, finishes in FINISHES.items():
        for part, material in finishes.items():
            finish_data.append({"部位": f"{room_name} {part}", "仕上げ": material, "品番": ""})

    gen.add_finish_table((18000, H_TOTAL), finish_data)

    # ============================================================
    # 図枠
    # ============================================================
    gen.add_title_block(
        (18000, -1000),
        "ChloeBY 展開方向図",
        scale="1:40",
        drawn_by="desArt（DXF: Claude Code）",
        date="2025-12-02",
        sheet="A3",
    )

    return gen


def main():
    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output", "drawings")
    os.makedirs(output_dir, exist_ok=True)

    output_path = os.path.join(output_dir, "ChloeBY_plan.dxf")

    gen = build_chloe_by()
    gen.save(output_path)

    print(f"\n=== ChloeBY DXF 生成完了 ===")
    print(f"  出力: {output_path}")
    print(f"  メタ: {output_path}.meta.json")
    print(f"  壁: {len(gen.meta['walls'])}本")
    print(f"  建具: {len(gen.meta['openings'])}個")
    print(f"  什器: {len(gen.meta['furniture'])}個")
    print(f"\n  → JW_CADで開いて確認・微調整してください")
    print(f"  → パース生成: blender --background --python scripts/render-from-dxf.py -- {output_path}")


if __name__ == "__main__":
    main()
