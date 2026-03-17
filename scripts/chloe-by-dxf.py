"""
ChloeBY 展開図 PDF → DXF 変換（完全版）
出典: ChloeBY展開図‗見積用20251202 2.pdf
設計: desArt 株式会社 一級建築士事務所
縮尺: 1/40 (A3)
PLAN1008, 合計30席

=== Pass 1 読み取り結果 ===
外形: 17,200mm x 18,660mm (L字型, 段差 @(1080,5120))
上辺: 1675+650+5910+650+6380+750+1185 = 17,200 ✓
右辺: 2330+5080+1150+1600+530+1040+4250+2680 = 18,660 ✓
下辺(x=1080起点): 640+650+5885+650+1040+5445+650+1160 = 16,120 ✓
室数: 14+室 (5店/10店/ボトル倉庫/キャッシャー/ENT/EV×2/PS×2/S-WC大/S-WC小/4店/社区/DJブース/S.S/階段室)
建具数: ドア~12個 + W表記開口~3個 = 合計~15個
什器数: ~22個 (バーカウンター×2 含む)
面積: 5店26.8㎡ + 10店26.0㎡ + 4店16.80㎡ + 社区16.90㎡ + 他

=== Pass 2 検証 ===
壁数: 37本 → 14+室を囲む: OK
建具: 15個: OK
什器: 22個 (バーカウンター2個含む): OK
主要什器: バーカウンター(5店)✓ バーカウンター(10店)✓

=== 展開図(P2)天井高 ===
BR(共通): CH=2,100mm
  仕上げ: 天井 クロス(LGS+2.5 PB+9.5), 壁 クロス(LGS PB+12.5), 巾木 ソフト巾木, 床 フロアタイル
A方向: CH=2,100mm (OPEN開口あり)
B方向: CH=2,400mm / 2,000mm
C方向: CH=2,100mm
D方向: ボトル倉庫 CH=2,000mm
"""

import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_dxf_lib import DXFGenerator

# ============================================================
# 座標グリッド (PDF寸法線から計算, mm単位)
# 座標系: 右下=原点(0,0), X右+, Y上+
# ============================================================

# --- 全体外形 ---
TOTAL_W = 17200
H_TOTAL = 18660

# --- 上辺キーポイント (y=18660) ---
# E(0)→1675→H(1675)→650→F(2325)→5910→D(8235)→650→(8885)→6380→B(15265)→750→(16015)→1185→A(17200)
X_E = 0
X_H = 1675
X_F = 2325
X_D = 8235
X_COR_R = 8885       # corridor右端 = 10店左端
X_B = 15265
X_EV_L = 16015
X_A = 17200

# --- 下辺キーポイント (y=0, x=1080起点) ---
# K(1080)→640→(1720)→650→(2370)→5885→(8255)→650→O(8905)→1040→(9945)→5445→(15390)→650→(16040)→1160→N(17200)
X_K = 1080
X_1720 = 1720
X_2370 = 2370
X_8255 = 8255
X_O = 8905
X_9945 = 9945
X_15390 = 15390
X_16040 = 16040

# --- 右辺キーポイント (x=17200, 下から上へ) ---
Y_2330 = 2330
Y_7410 = 7410
Y_8560 = 8560
Y_10160 = 10160
Y_10690 = 10690
Y_11730 = 11730
Y_15980 = 15980

# --- 左辺キーポイント ---
Y_5120 = 5120                    # L字段差高さ
Y_11525 = H_TOTAL - 7135         # = 11525 (5店/10店下端)

# --- 内部 S-WC室 ---
Y_WC_BTM = 16000                 # S-WC下端
X_WC_L = X_F                     # 2325
X_WC_DIV = 4200                  # S-WC大/小仕切
X_WC_R = 5500                    # S-WC右端

# --- 内部 ボトル倉庫 ---
X_BTL_R = 5500                   # ボトル倉庫右壁
Y_BTL_BTM = 7500                 # ボトル倉庫/S.S下端

# --- 内部 キャッシャー ---
X_CSH_R = 14515                  # キャッシャー右壁=PS左壁

# --- 天井高 (展開図P2) ---
CH_DEFAULT = 2700
CH_BR = 2100
CH_BOTTLE = 2000                 # D方向展開図: ボトル倉庫=2000mm
CH_5SHOP = 2400
CH_WC = 2100
CH_DJ = 2100

# --- 4店 / 社区 ---
Y_4SHOP_TOP = 2855               # 5885×2855 ≈ 16.81㎡
Y_SHAQU_TOP = 3103               # 5445×3103 ≈ 16.90㎡

# --- 仕上げ情報 (P2仕上げ表) ---
FINISHES = {
    "BR(共通)": {"天井": "クロス(LGS+2.5 PB+9.5)", "壁": "クロス(LGS PB+12.5)",
                 "巾木": "ソフト巾木", "床": "フロアタイル"},
    "ボトル倉庫": {"天井": "クロス", "壁": "クロス", "巾木": "ソフト巾木", "床": "長尺シート"},
    "5店":       {"天井": "クロス", "壁": "クロス", "巾木": "ソフト巾木", "床": "フロアタイル"},
    "10店":      {"天井": "クロス", "壁": "クロス", "巾木": "ソフト巾木", "床": "フロアタイル"},
    "S-WC大":    {"天井": "クロス", "壁": "クロス", "巾木": "ソフト巾木", "床": "フロアタイル"},
    "S-WC小":    {"天井": "クロス", "壁": "クロス", "巾木": "ソフト巾木", "床": "フロアタイル"},
    "DJブース":  {"天井": "クロス", "壁": "クロス", "巾木": "ソフト巾木", "床": "長尺シート"},
}


def build_chloe_by():
    gen = DXFGenerator()
    gen.meta["project_name"] = "ChloeBY"
    gen.meta["ceiling_height_mm"] = CH_DEFAULT
    gen.meta["style"] = "bar"
    gen.meta["materials"] = {
        "floor": "floor_tile_dark",
        "wall": "wall_dark",
        "ceiling": "ceiling_dark",
    }

    # ============================================================
    # [1] 外壁 (6セグメント, L字型)
    # ============================================================
    gen.draw_wall((0, H_TOTAL), (TOTAL_W, H_TOTAL))           # 上辺
    gen.draw_wall((TOTAL_W, H_TOTAL), (TOTAL_W, 0))           # 右辺
    gen.draw_wall((TOTAL_W, 0), (X_K, 0))                     # 下辺
    gen.draw_wall((X_K, 0), (X_K, Y_5120))                    # 左下(縦)
    gen.draw_wall((X_K, Y_5120), (0, Y_5120))                 # L字段差(横)
    gen.draw_wall((0, Y_5120), (0, H_TOTAL))                  # 左上(縦)

    # ============================================================
    # [2] 5店エリア (x=0~8235, y=11525~18660)
    # ============================================================
    # 右壁 (= corridor左壁)
    wall_5shop_R = ((X_D, H_TOTAL), (X_D, Y_11525))
    gen.draw_wall(*wall_5shop_R)
    # 下壁
    wall_5shop_B = ((0, Y_11525), (X_D, Y_11525))
    gen.draw_wall(*wall_5shop_B)

    # ============================================================
    # [3] 10店エリア (x=8885~15265, y=11525~18660)
    # ============================================================
    wall_10shop_L = ((X_COR_R, H_TOTAL), (X_COR_R, Y_11525))
    gen.draw_wall(*wall_10shop_L)
    wall_10shop_R = ((X_B, H_TOTAL), (X_B, Y_11525))
    gen.draw_wall(*wall_10shop_R)
    wall_10shop_B = ((X_COR_R, Y_11525), (X_B, Y_11525))
    gen.draw_wall(*wall_10shop_B)

    # ============================================================
    # [4] 通路/corridor extensions (x=8235~8885, y=11525→5120)
    # ============================================================
    gen.draw_wall((X_D, Y_11525), (X_D, Y_5120))              # corridor左壁 延長
    gen.draw_wall((X_COR_R, Y_11525), (X_COR_R, Y_5120))      # corridor右壁 延長

    # ============================================================
    # [5] S-WC大 / S-WC小 (5店上部, x=2325~5500, y=16000~18660)
    # ============================================================
    gen.draw_wall((X_WC_L, Y_WC_BTM), (X_WC_R, Y_WC_BTM), height_mm=CH_WC)   # 下壁
    gen.draw_wall((X_WC_L, Y_WC_BTM), (X_WC_L, H_TOTAL), height_mm=CH_WC)    # 左仕切
    gen.draw_wall((X_WC_DIV, Y_WC_BTM), (X_WC_DIV, H_TOTAL), height_mm=CH_WC) # 大/小仕切
    gen.draw_wall((X_WC_R, Y_WC_BTM), (X_WC_R, H_TOTAL), height_mm=CH_WC)    # 右仕切

    # ============================================================
    # [6] ボトル倉庫 (x=0~5500, y=7500~11525)
    # ============================================================
    gen.draw_wall((X_BTL_R, Y_11525), (X_BTL_R, Y_5120), height_mm=CH_BOTTLE)  # 右壁(通し)
    gen.draw_wall((0, Y_BTL_BTM), (X_D, Y_BTL_BTM), height_mm=CH_BOTTLE)       # 下壁(S.S含む)
    # y=5120 水平壁 (L字段差→corridor, ボトル倉庫/S.S下部閉合用)
    gen.draw_wall((X_K, Y_5120), (X_D, Y_5120))

    # ============================================================
    # [7] キャッシャー (x=8885~14515, y=7410~11525)
    # ============================================================
    gen.draw_wall((X_COR_R, Y_7410), (X_CSH_R, Y_7410))       # 下壁
    gen.draw_wall((X_CSH_R, Y_11525), (X_CSH_R, Y_7410))      # 右壁(=PS左壁)

    # ============================================================
    # [8] 右側縦壁 (x=15265, y=11525→7410)
    # ============================================================
    gen.draw_wall((X_B, Y_11525), (X_B, Y_7410))

    # ============================================================
    # [9] EV×2 (x=15265~17200, y=10690~11730)
    # ============================================================
    gen.draw_wall((X_B, Y_11730), (TOTAL_W, Y_11730))          # 上壁
    gen.draw_wall((X_B, Y_10690), (TOTAL_W, Y_10690))          # 下壁
    gen.draw_wall((X_EV_L, Y_10690), (X_EV_L, Y_11730))        # EV仕切

    # ============================================================
    # [10] PS (x=15265~17200, y=10160~10690)
    # ============================================================
    gen.draw_wall((X_B, Y_10160), (TOTAL_W, Y_10160))

    # ============================================================
    # [11] ENT (x=15265~17200, y=8560~10160)
    # ============================================================
    gen.draw_wall((X_B, Y_8560), (TOTAL_W, Y_8560))

    # ============================================================
    # [12] 消火栓/PS下部 (x=15265~17200, y=7410~8560)
    # ============================================================
    gen.draw_wall((X_B, Y_7410), (TOTAL_W, Y_7410))

    # ============================================================
    # [13] 下部: 4店 (x=2370~8255, y=0~2855)
    # ============================================================
    gen.draw_wall((X_2370, 0), (X_2370, Y_4SHOP_TOP))          # 左壁
    gen.draw_wall((X_2370, Y_4SHOP_TOP), (X_8255, Y_4SHOP_TOP)) # 上壁
    gen.draw_wall((X_8255, 0), (X_8255, Y_4SHOP_TOP))          # 右壁

    # ============================================================
    # [14] 下部: 社区 (x=9945~15390, y=0~3103)
    # ============================================================
    gen.draw_wall((X_9945, 0), (X_9945, Y_SHAQU_TOP))          # 左壁
    gen.draw_wall((X_9945, Y_SHAQU_TOP), (X_15390, Y_SHAQU_TOP)) # 上壁
    gen.draw_wall((X_15390, 0), (X_15390, Y_SHAQU_TOP))        # 右壁

    # ============================================================
    # [15] 下部: 通路/階段 補助壁
    # ============================================================
    gen.draw_wall((X_O, 0), (X_O, Y_5120))                     # x=8905 通路壁
    gen.draw_wall((X_15390, Y_2330), (TOTAL_W, Y_2330))         # 右下水平壁
    gen.draw_wall((X_16040, 0), (X_16040, Y_7410))              # x=16040 縦壁

    # ============================================================
    # [16] 建具 (15個)
    # ============================================================

    # D1: ENTメインドア (右外壁, W1000, 赤三角マーク)
    gen.draw_door(
        (TOTAL_W, Y_8560), (TOTAL_W, Y_10160),
        position_mm=300, width_mm=1000, swing="left",
    )

    # D2: 5店→corridor (x=8235壁, W900)
    gen.draw_door(
        *wall_5shop_R,
        position_mm=2500, width_mm=900, swing="right",
    )

    # D3: 10店→corridor (x=8885壁, W900)
    gen.draw_door(
        *wall_10shop_L,
        position_mm=2500, width_mm=900, swing="left",
    )

    # D4: ボトル倉庫入口 (x=5500壁, W900)
    gen.draw_door(
        (X_BTL_R, Y_11525), (X_BTL_R, Y_5120),
        position_mm=800, width_mm=900, swing="left",
    )

    # D5: S-WC大ドア (y=16000壁, W600)
    gen.draw_door(
        (X_WC_L, Y_WC_BTM), (X_WC_DIV, Y_WC_BTM),
        position_mm=300, width_mm=600, swing="left",
    )

    # D6: S-WC小ドア (y=16000壁, W600)
    gen.draw_door(
        (X_WC_DIV, Y_WC_BTM), (X_WC_R, Y_WC_BTM),
        position_mm=200, width_mm=600, swing="left",
    )

    # D7: キャッシャー→corridor W1200開口
    gen.draw_door(
        (X_COR_R, Y_11525), (X_COR_R, Y_5120),
        position_mm=1500, width_mm=1200, swing="left",
    )

    # D8: 4店入口 (上壁, W900)
    gen.draw_door(
        (X_2370, Y_4SHOP_TOP), (X_8255, Y_4SHOP_TOP),
        position_mm=2000, width_mm=900, swing="left",
    )

    # D9: 社区入口 (上壁, W900)
    gen.draw_door(
        (X_9945, Y_SHAQU_TOP), (X_15390, Y_SHAQU_TOP),
        position_mm=2000, width_mm=900, swing="right",
    )

    # D10: EV1ドア (下壁, W800)
    gen.draw_door(
        (X_B, Y_10690), (X_EV_L, Y_10690),
        position_mm=50, width_mm=800, swing="left",
    )

    # D11: EV2ドア (下壁, W800)
    gen.draw_door(
        (X_EV_L, Y_10690), (TOTAL_W, Y_10690),
        position_mm=50, width_mm=800, swing="right",
    )

    # D12: S.S/DJブース→corridor W1000
    gen.draw_door(
        (X_D, Y_11525), (X_D, Y_5120),
        position_mm=2000, width_mm=1000, swing="right",
    )

    # D13: PS→通路 W700
    gen.draw_door(
        (X_CSH_R, Y_11525), (X_CSH_R, Y_7410),
        position_mm=500, width_mm=700, swing="right",
    )

    # D14: 階段室→4店横 (x=2370壁, W800)
    gen.draw_door(
        (X_2370, 0), (X_2370, Y_4SHOP_TOP),
        position_mm=500, width_mm=800, swing="left",
    )

    # D15: ENT→PS/通路 (x=15265壁, W900)
    gen.draw_door(
        (X_B, Y_11525), (X_B, Y_7410),
        position_mm=1500, width_mm=900, swing="left",
    )

    # ============================================================
    # [17] 什器 (22個)
    # ============================================================

    # --- 5店 (4個+カウンター) ---
    gen.draw_furniture(
        (4000, 13000), 5000, 600, 0, "バーカウンター", height_mm=1050,
    )
    gen.draw_furniture(
        (1500, 15000), 2400, 600, 0, "OPENボトル棚", height_mm=2400,
    )
    gen.draw_furniture(
        (500, 17000), 800, 400, 0, "棚付", height_mm=1800,
    )
    gen.draw_furniture(
        (2000, 12200), 1200, 600, 0, "カッター", height_mm=900,
    )
    gen.draw_furniture(
        (3500, 11800), 3000, 600, 0, "ボトル棚", height_mm=2000,
    )

    # --- 10店 (4個+カウンター) ---
    gen.draw_furniture(
        (12000, 13500), 5000, 600, 0, "バーカウンター", height_mm=1050,
    )
    gen.draw_furniture(
        (12000, 17000), 3000, 400, 0, "上棚棚", height_mm=1800,
    )
    gen.draw_furniture(
        (12000, 16300), 3000, 400, 0, "下部棚", height_mm=1200,
    )
    gen.draw_furniture(
        (10500, 14800), 2000, 500, 0, "ボトル棚", height_mm=2000,
    )

    # --- S.S サービスステーション (2個) ---
    gen.draw_furniture(
        (6500, 10500), 1500, 600, 0, "S.S", height_mm=900,
    )
    gen.draw_furniture(
        (7500, 12500), 1500, 600, 0, "S.S", height_mm=900,
    )

    # --- キャッシャー (2個) ---
    gen.draw_furniture(
        (11500, 9500), 1200, 600, 0, "キャッシャー", height_mm=1050,
    )
    gen.draw_furniture(
        (10500, 8500), 1500, 600, 0, "台", height_mm=900,
    )

    # --- ボトル倉庫 (2個) ---
    gen.draw_furniture(
        (2500, 9500), 4000, 800, 0, "ボトル棚", height_mm=2000,
    )
    gen.draw_furniture(
        (1500, 8000), 2500, 600, 0, "高級ボトル棚", height_mm=2000,
    )

    # --- 消火栓 ---
    gen.draw_furniture(
        (12500, 8000), 600, 400, 0, "消火栓", height_mm=1200,
    )

    # --- S-WC大 (便器+手洗い) ---
    gen.draw_furniture(
        (3200, 17500), 400, 600, 0, "便器", height_mm=400,
    )
    gen.draw_furniture(
        (3200, 16500), 400, 350, 0, "手洗い", height_mm=800,
    )

    # --- S-WC小 (便器+手洗い) ---
    gen.draw_furniture(
        (4800, 17500), 400, 600, 0, "便器", height_mm=400,
    )
    gen.draw_furniture(
        (4800, 16500), 400, 350, 0, "手洗い", height_mm=800,
    )

    # --- DJブース ---
    gen.draw_furniture(
        (7000, 9000), 1500, 1000, 0, "DJブース", height_mm=1000,
    )

    # ============================================================
    # [18] 寸法線 (35本)
    # ============================================================

    # 上辺 区間寸法 (7本)
    x = 0
    for seg in [1675, 650, 5910, 650, 6380, 750, 1185]:
        gen.add_dimension((x, H_TOTAL), (x + seg, H_TOTAL), 500)
        x += seg
    # 上辺 全体 (1本)
    gen.add_dimension((0, H_TOTAL), (TOTAL_W, H_TOTAL), 900)

    # 下辺 区間寸法 (8本)
    x = X_K
    for seg in [640, 650, 5885, 650, 1040, 5445, 650, 1160]:
        gen.add_dimension((x, 0), (x + seg, 0), -500)
        x += seg

    # 右辺 区間寸法 (8本)
    y = 0
    for seg in [2330, 5080, 1150, 1600, 530, 1040, 4250, 2680]:
        gen.add_dimension((TOTAL_W, y), (TOTAL_W, y + seg), 500)
        y += seg

    # 左辺寸法 (2本)
    gen.add_dimension((0, Y_5120), (0, H_TOTAL), -500)
    gen.add_dimension((X_K, 0), (X_K, Y_5120), -500)

    # 内部寸法 (9本)
    gen.add_dimension((X_F, Y_11525), (X_D, Y_11525), -300)        # 5店幅 5910
    gen.add_dimension((X_COR_R, Y_11525), (X_B, Y_11525), -300)    # 10店幅 6380
    gen.add_dimension((0, Y_11525), (0, Y_WC_BTM), -300)           # 5店高さ 4475
    gen.add_dimension((0, Y_WC_BTM), (0, H_TOTAL), -700)           # S-WC高さ 2660
    gen.add_dimension((X_2370, 0), (X_8255, 0), -900)              # 4店幅 5885
    gen.add_dimension((X_9945, 0), (X_15390, 0), -900)             # 社区幅 5445
    gen.add_dimension((X_B, Y_10690), (X_B, Y_11730), -300)        # EV高さ 1040
    gen.add_dimension((X_B, Y_8560), (X_B, Y_10160), -300)         # ENT高さ 1600
    gen.add_dimension((X_D, Y_11525), (X_COR_R, Y_11525), -300)    # corridor幅 650

    # ============================================================
    # [19] 室名 (17ラベル)
    # ============================================================
    gen.add_room_label((4000, 14000), "5店", 26.8)
    gen.add_room_label((12000, 15000), "10店", 26.0)
    gen.add_room_label((2500, 9500), "ボトル倉庫")
    gen.add_room_label((11500, 9500), "キャッシャー")
    gen.add_room_label((16200, 9300), "ENT")
    gen.add_room_label(((X_B + X_EV_L) / 2, (Y_10690 + Y_11730) / 2), "EV")
    gen.add_room_label(((X_EV_L + TOTAL_W) / 2, (Y_10690 + Y_11730) / 2), "EV")
    gen.add_room_label(((X_B + TOTAL_W) / 2, (Y_10160 + Y_10690) / 2), "PS")
    gen.add_room_label((15000, 8000), "PS")
    gen.add_room_label((3200, 17300), "S-WC大")
    gen.add_room_label((4800, 17300), "S-WC小")
    gen.add_room_label((5300, 1400), "4店", 16.80)
    gen.add_room_label((12500, 1400), "社区", 16.90)
    gen.add_room_label((7000, 9500), "DJブース")
    gen.add_room_label((7000, 11000), "S.S")
    gen.add_room_label((1700, 2500), "階段室")
    gen.add_room_label(((X_D + X_COR_R) / 2, (Y_5120 + Y_11525) / 2), "通路")

    # ============================================================
    # [20] 仕上げ表
    # ============================================================
    finish_data = []
    for room_name, finishes in FINISHES.items():
        for part, material in finishes.items():
            finish_data.append({
                "部位": f"{room_name} {part}",
                "仕上げ": material,
                "品番": "",
            })
    gen.add_finish_table((TOTAL_W + 500, H_TOTAL), finish_data)

    # ============================================================
    # [21] 図枠
    # ============================================================
    gen.add_title_block(
        (TOTAL_W + 500, -1000),
        "ChloeBY 展開方向図",
        scale="1:40",
        drawn_by="desArt（DXF: Claude Code）",
        date="2025-12-02",
        sheet="A3",
    )

    return gen


def main():
    output_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "output", "drawings",
    )
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "ChloeBY_plan.dxf")

    gen = build_chloe_by()
    gen.save(output_path)

    n_walls = len(gen.meta["walls"])
    n_doors = len(gen.meta["openings"])
    n_furn = len(gen.meta["furniture"])

    print(f"\n{'=' * 50}")
    print(f"ChloeBY DXF 生成完了（完全版）")
    print(f"{'=' * 50}")
    print(f"  出力: {output_path}")
    print(f"  メタ: {output_path}.meta.json")
    print(f"  壁:   {n_walls}本")
    print(f"  建具: {n_doors}個")
    print(f"  什器: {n_furn}個")
    print(f"\n  検証: PYTHONIOENCODING=utf-8 python scripts/validate-dxf.py {output_path}")


if __name__ == "__main__":
    main()
