#!/usr/bin/env python3
"""
ホストクラブ内装パース — プロンプト仕様準拠
221.6㎡ ラグジュアリー＆サイバーデザイン

Usage:
  "/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
    --background --python scripts/render-hostclub.py \
    -- [--quality preview|draft|production] [--camera main|overview|a_booth|all]

レイアウト (17m × 13m):
  Y↑
  13 +--------+----------+----------+
     |  VIP   | D Booth  | C Booth  |
     | 4×3    | 5×3      | 4×3      |
  10 +--------+----------+----------+
     |       Main Corridor 17×2.5   |
   7.5+-----+----------------------+
     | B   |    A Booth (Sunken)    |
     | 5×4 |    12×4  FL-400       |
   3.5+-----+---+----------+-------+
     | Bar Counter(L字)   |Bottle  |
   1 +----------+  ENT  +-+Shelf  |
   0 +----------+--------+---------+
     0    5   6.5  9.5  10       17

座標: X=東西(0=西), Y=南北(0=南), Z=高さ(0=FL±0)
入口(ENT): 南面 X[6.5,9.5]
"""

import bpy
import bmesh
import math
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, os.path.join(SCRIPT_DIR, 'blender'))
from core import clear_scene, setup_collections


# ===========================================================================
# レイアウト定数
# ===========================================================================
BW, BD = 17.0, 13.0          # 建物寸法
WT, IWT = 0.12, 0.10         # 壁厚

# ゾーン: (x0, y0, x1, y1), FL, CH[低, 高...]
ZONES = {
    'entrance':  ((6.5, 0, 9.5, 1.0),    0.0,  [2.4]),
    'bar_area':  ((0, 1.0, 10.0, 3.5),   0.0,  [2.4]),
    'bottle':    ((10.0, 1.0, BW, 3.5),   0.0,  [2.4]),
    'b_booth':   ((0, 3.5, 5.0, 7.5),    0.0,  [2.17, 2.4]),
    'a_booth':   ((5.0, 3.5, BW, 7.5),   -0.4, [2.5, 3.0]),
    'corridor':  ((0, 7.5, BW, 10.0),    0.0,  [2.4]),
    'vip':       ((0, 10.0, 4.0, BD),    0.0,  [2.1, 2.45]),
    'd_booth':   ((4.0, 10.0, 9.0, BD),  0.0,  [2.17, 2.4]),
    'c_booth':   ((9.0, 10.0, BW-4, BD), 0.0,  [2.17, 2.75]),
}

CLIENT = ['bar_area', 'b_booth', 'a_booth', 'corridor', 'vip', 'd_booth', 'c_booth', 'bottle']
COFFER = 0.5   # 折り上げインセット

# プレースホルダー (name, x, y, w, d, h)
PH = [
    # A Booth (FL-400)
    ('A_sofa_S',  5.5, 3.8, 5.0, 0.85, 0.75),
    ('A_sofa_N',  5.5, 6.65, 5.0, 0.85, 0.75),
    ('A_sofa_E', 16.0, 4.2, 0.85, 3.0, 0.75),
    ('A_tbl1', 6.5, 5.0, 0.8, 0.8, 0.40),
    ('A_tbl2', 8.5, 5.0, 0.8, 0.8, 0.40),
    ('A_tbl3', 10.5, 5.0, 0.8, 0.8, 0.40),
    ('A_tbl4', 12.5, 5.0, 0.8, 0.8, 0.40),
    ('A_tbl5', 14.5, 5.0, 0.8, 0.8, 0.40),
    # B Booth
    ('B_sofa_W', 0.2, 3.8, 0.85, 3.2, 0.75),
    ('B_sofa_S', 0.5, 3.8, 3.5, 0.85, 0.75),
    ('B_sofa_N', 0.5, 6.65, 3.5, 0.85, 0.75),
    ('B_tbl1', 1.5, 5.0, 0.7, 0.7, 0.40),
    ('B_tbl2', 3.0, 5.0, 0.7, 0.7, 0.40),
    # VIP
    ('VIP_sofa_W', 0.2, 10.3, 0.85, 2.2, 0.75),
    ('VIP_sofa_N', 0.5, 12.2, 3.0, 0.60, 0.75),
    ('VIP_tbl1', 1.0, 11.0, 0.65, 0.65, 0.38),
    ('VIP_tbl2', 2.2, 11.0, 0.65, 0.65, 0.38),
    # D Booth
    ('D_sofa_S', 4.3, 10.3, 4.0, 0.85, 0.75),
    ('D_sofa_N', 4.3, 12.2, 4.0, 0.85, 0.75),
    ('D_tbl1', 5.0, 11.0, 0.7, 0.7, 0.40),
    ('D_tbl2', 6.5, 11.0, 0.7, 0.7, 0.40),
    ('D_tbl3', 8.0, 11.0, 0.7, 0.7, 0.40),
    # C Booth
    ('C_sofa_S', 9.3, 10.3, 3.5, 0.85, 0.75),
    ('C_sofa_N', 9.3, 12.2, 3.5, 0.85, 0.75),
    ('C_tbl1', 10.0, 11.0, 0.7, 0.7, 0.40),
    ('C_tbl2', 11.5, 11.0, 0.7, 0.7, 0.40),
    # スツール
    *[(f'stool_{i}', 2.0+i*1.0, 2.8, 0.38, 0.38, 0.75) for i in range(7)],
]

# ===========================================================================
# マテリアル
# ===========================================================================
MATS = {
    'wall':          {'c': (0.82, 0.82, 0.80, 1), 'r': 0.88, 'm': 0.0},
    'ceiling':       {'c': (0.90, 0.90, 0.88, 1), 'r': 0.90, 'm': 0.0},
    'floor':         {'c': (0.07, 0.07, 0.07, 1), 'r': 0.22, 'm': 0.0},
    'floor_sunken':  {'c': (0.04, 0.04, 0.04, 1), 'r': 0.18, 'm': 0.0},
    'dark_mirror':   {'c': (0.01, 0.01, 0.01, 1), 'r': 0.02, 'm': 1.0},
    'melamine':      {'c': (0.03, 0.025, 0.02, 1),'r': 0.32, 'm': 0.0},
    'counter_top':   {'c': (0.015, 0.015, 0.015, 1),'r': 0.08, 'm': 0.0},
    'riser':         {'c': (0.04, 0.04, 0.04, 1), 'r': 0.25, 'm': 0.0},
    'glass':         {'c': (0.95, 0.95, 0.95, 1), 'r': 0.0, 'm': 0.0,
                      'tr': 0.92, 'ior': 1.5},
    'led_purple':    {'e': (0.55, 0.0, 1.0, 1),  's': 22},
    'led_blue':      {'e': (0.0, 0.12, 1.0, 1),  's': 20},
    'led_cyan':      {'e': (0.0, 0.65, 1.0, 1),  's': 14},
    'led_magenta':   {'e': (0.85, 0.0, 0.45, 1), 's': 16},
    'led_warm':      {'e': (1.0, 0.65, 0.25, 1), 's': 10},
}


# ===========================================================================
# ユーティリティ
# ===========================================================================

def box(name, mn, mx, mat=None):
    x0,y0,z0 = mn; x1,y1,z1 = mx
    m = bpy.data.meshes.new(name)
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in [
        (x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),
        (x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]]
    for f in [(3,2,1,0),(4,5,6,7),(0,1,5,4),(2,3,7,6),(3,0,4,7),(1,2,6,5)]:
        bm.faces.new([v[i] for i in f])
    bm.to_mesh(m); bm.free()
    o = bpy.data.objects.new(name, m)
    if mat: o.data.materials.append(mat)
    return o

def plane(name, corners, mat=None):
    m = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in corners]
    bm.faces.new(vs)
    bm.to_mesh(m); bm.free()
    o = bpy.data.objects.new(name, m)
    if mat: o.data.materials.append(mat)
    return o

def lk(o, col):
    col.objects.link(o); return o


# ===========================================================================
# ビルダー
# ===========================================================================

class HostClubBuilder:

    def __init__(self):
        self.C = {}  # collections
        self.M = {}  # materials

    def build(self, quality='preview', camera='main'):
        print("=" * 50)
        print("  Host Club — 221.6㎡ — Build Start")
        print("=" * 50)

        clear_scene()
        self.C = setup_collections([
            '01_Architecture', '02_Fixtures', '03_Lighting', '04_Placeholders', '05_Cameras'])
        self._mats()
        self._floors()
        self._walls()
        self._risers()
        self._ceilings()
        self._counter()
        self._bottle_shelf()
        self._rgb()
        self._lights()
        self._placeholders()
        self._cameras(camera)
        self._render(quality)

        print("=" * 50)
        print("  Scene Ready")
        print("=" * 50)

    # ── マテリアル ──
    def _mats(self):
        for n, p in MATS.items():
            mt = bpy.data.materials.new(n)
            mt.use_nodes = True
            b = mt.node_tree.nodes["Principled BSDF"]
            if 'e' in p:
                b.inputs["Base Color"].default_value = (0,0,0,1)
                b.inputs["Emission Color"].default_value = p['e']
                b.inputs["Emission Strength"].default_value = p['s']
            else:
                b.inputs["Base Color"].default_value = p['c']
                b.inputs["Roughness"].default_value = p['r']
                b.inputs["Metallic"].default_value = p['m']
                if 'tr' in p:
                    b.inputs["Transmission Weight"].default_value = p['tr']
                    b.inputs["IOR"].default_value = p['ior']
            self.M[n] = mt
        print(f"  [mat] {len(self.M)}")

    # ── 床 ──
    def _floors(self):
        A = self.C['01_Architecture']
        for zn in CLIENT:
            (x0,y0,x1,y1), fl, _ = ZONES[zn]
            mt = self.M['floor_sunken'] if fl < 0 else self.M['floor']
            lk(plane(f"Fl_{zn}", [(x0,y0,fl),(x1,y0,fl),(x1,y1,fl),(x0,y1,fl)], mt), A)
        print("  [floor] done")

    # ── 壁 ──
    def _walls(self):
        A = self.C['01_Architecture']
        w, m, t = self.M['wall'], self.M['dark_mirror'], WT
        ch = 2.4

        # 外壁 — 下半分(H1.5mまで)は可視、上半分はカメラ不可視
        CUT = 1.5  # 壁の可視高さ

        # 南壁(入口開口)
        lk(box("W_S1", (0,-t,0), (6.5,0,CUT), w), A)
        lk(box("W_S2", (9.5,-t,0), (BW,0,CUT), w), A)
        lk(box("W_S1_hi", (0,-t,CUT), (6.5,0,ch), w), A).visible_camera = False
        lk(box("W_S2_hi", (9.5,-t,CUT), (BW,0,ch), w), A).visible_camera = False
        lk(box("W_S_tr", (6.5,-t,2.1), (9.5,0,ch), w), A).visible_camera = False
        # 北
        lk(box("W_N_lo", (0,BD,0), (BW,BD+t,CUT), w), A)
        lk(box("W_N_hi", (0,BD,CUT), (BW,BD+t,ch), w), A).visible_camera = False
        # 東
        lk(box("W_E_lo", (BW,0,0), (BW+t,BD,CUT), w), A)
        lk(box("W_E_hi", (BW,0,CUT), (BW+t,BD,ch), w), A).visible_camera = False
        # 西
        lk(box("W_W_lo", (-t,0,0), (0,BD,CUT), w), A)
        lk(box("W_W_hi", (-t,0,CUT), (0,BD,ch), w), A).visible_camera = False

        # ダークミラーアクセント
        lk(box("Mir_A_E", (BW-0.01,3.5,-0.4), (BW,7.5,2.1), m), A)  # A Booth東壁
        lk(box("Mir_A_N", (5.0,7.49,-0.4), (BW,7.5,2.1), m), A)     # A Booth北壁内側
        lk(box("Mir_C_N", (9.0,BD-0.01,0), (BW-4,BD,2.75), m), A)   # C Booth北壁

        # 間仕切り
        # B/A境界: X=5, Y[3.5,7.5]
        lk(box("IW_BA", (5-IWT/2,3.5,-0.4), (5+IWT/2,7.5,ch), w), A)
        # VIP南壁 Y=10 (ドア開口 X[1.5,2.5])
        lk(box("IW_VIP1", (0,10-IWT/2,0), (1.5,10+IWT/2,2.1), w), A)
        lk(box("IW_VIP2", (2.5,10-IWT/2,0), (4.0,10+IWT/2,2.1), w), A)
        lk(box("IW_VIP_tr", (1.5,10-IWT/2,2.0), (2.5,10+IWT/2,2.1), w), A)
        # VIP東壁 X=4
        lk(box("IW_VIP_E", (4-IWT/2,10,0), (4+IWT/2,BD,2.45), w), A)
        # VIP北壁ダークミラー
        lk(box("Mir_VIP", (0.01,BD-0.01,0), (3.99,BD,2.45), m), A)
        # D/C境界 X=9
        lk(box("IW_DC", (9-IWT/2,10,0), (9+IWT/2,BD,2.4), w), A)
        # ブース/通路境界 Y=10 腰壁
        lk(box("IW_top", (4.0,10-IWT/2,0), (BW-4,10+IWT/2,1.2), m), A)
        # バー/A境界腰壁 Y=3.5, X[10,17]
        lk(box("IW_barA", (10,3.5-IWT/2,0), (BW,3.5+IWT/2,0.9), m), A)

        print("  [walls] done")

    # ── ステップライザー (A Booth FL-400) ──
    def _risers(self):
        A = self.C['01_Architecture']
        r = self.M['riser']
        # 西面
        lk(plane("Rs_W", [(5,3.5,0),(5,7.5,0),(5,7.5,-0.4),(5,3.5,-0.4)], r), A)
        # 南面
        lk(plane("Rs_S", [(5,3.5,0),(5,3.5,-0.4),(BW,3.5,-0.4),(BW,3.5,0)], r), A)
        # 北面
        lk(plane("Rs_N", [(5,7.5,-0.4),(5,7.5,0),(BW,7.5,0),(BW,7.5,-0.4)], r), A)
        # 階段2段 X[7,8.5]
        lk(box("Step1", (7,3.3,-0.2), (8.5,3.5,0), r), A)
        lk(box("Step2", (7,3.1,-0.4), (8.5,3.3,-0.2), r), A)
        print("  [risers] done")

    # ── 天井（カメラ不可視 — 照明反射のみ） ──
    def _ceilings(self):
        A = self.C['01_Architecture']
        mc, mm = self.M['ceiling'], self.M['dark_mirror']

        for zn in CLIENT:
            (x0,y0,x1,y1), fl, chs = ZONES[zn]
            if len(chs) == 1:
                z = fl + chs[0]
                o = lk(plane(f"Cl_{zn}", [(x0,y0,z),(x0,y1,z),(x1,y1,z),(x1,y0,z)], mc), A)
                o.visible_camera = False
            else:
                lo, hi = fl + chs[0], fl + chs[-1]
                s = COFFER
                ix0,ix1,iy0,iy1 = x0+s,x1-s,y0+s,y1-s
                # 枠4辺
                for tag, cs in [
                    ('fS', [(x0,y0,lo),(x0,iy0,lo),(x1,iy0,lo),(x1,y0,lo)]),
                    ('fN', [(x0,iy1,lo),(x0,y1,lo),(x1,y1,lo),(x1,iy1,lo)]),
                    ('fW', [(x0,iy0,lo),(x0,iy1,lo),(ix0,iy1,lo),(ix0,iy0,lo)]),
                    ('fE', [(ix1,iy0,lo),(ix1,iy1,lo),(x1,iy1,lo),(x1,iy0,lo)])]:
                    o = lk(plane(f"Cl_{zn}_{tag}", cs, mc), A)
                    o.visible_camera = False
                # 中央ダークミラー
                o = lk(plane(f"Cl_{zn}_c", [(ix0,iy0,hi),(ix0,iy1,hi),(ix1,iy1,hi),(ix1,iy0,hi)], mm), A)
                o.visible_camera = False
                # 段差側面（RGBの反射面なので可視のまま）
                for tag,sx0,sy0,sx1,sy1 in [
                    ('sS',ix0,iy0-0.01,ix1,iy0),('sN',ix0,iy1,ix1,iy1+0.01),
                    ('sW',ix0-0.01,iy0,ix0,iy1),('sE',ix1,iy0,ix1+0.01,iy1)]:
                    lk(box(f"Cl_{zn}_{tag}", (sx0,sy0,lo),(sx1,sy1,hi), mc), A)
        print("  [ceil] transparent to camera")

    # ── L字バーカウンター H1050 ──
    def _counter(self):
        F = self.C['02_Fixtures']
        mb, mt = self.M['melamine'], self.M['counter_top']
        H = 1.01; TH = 0.04  # ボディ高, 天板厚

        # ロング (E-W): X[2,8.5] Y=2.0
        lk(box("Cnt_body", (2,2,0), (8.5,2.55,H), mb), F)
        lk(box("Cnt_top",  (1.95,1.95,H), (8.55,2.60,H+TH), mt), F)
        # ショート (N-S): X[1.5,2.05] Y[2,3.3]
        lk(box("Cnt_L",    (1.5,2,0), (2.05,3.3,H), mb), F)
        lk(box("Cnt_Ltop", (1.45,1.95,H), (2.10,3.35,H+TH), mt), F)
        # 作業台
        lk(box("Cnt_work", (2.1,1.2,0), (8.5,1.95,0.85), mb), F)

        print("  [fix] counter done")

    # ── ボトル棚 W4000×H2000 ──
    def _bottle_shelf(self):
        F = self.C['02_Fixtures']
        mb, mg, mw = self.M['melamine'], self.M['glass'], self.M['led_warm']
        sx, sy = 11.0, 0.3
        W, D, H = 4.0, 0.50, 2.0

        # 背板
        lk(box("BS_back", (sx,sy,0), (sx+W,sy+0.03,H), mb), F)
        # 側板
        lk(box("BS_sL", (sx,sy,0), (sx+0.03,sy+D,H), mb), F)
        lk(box("BS_sR", (sx+W-0.03,sy,0), (sx+W,sy+D,H), mb), F)
        # 棚板5段
        for i in range(6):
            z = i * 0.38
            lk(box(f"BS_b{i}", (sx,sy,z), (sx+W,sy+D,z+0.02), mb), F)
        # ガラス扉
        lk(box("BS_glL", (sx,sy+D-0.01,0.05), (sx+2,sy+D+0.005,H-0.05), mg), F)
        lk(box("BS_glR", (sx+2,sy+D-0.01,0.05), (sx+W,sy+D+0.005,H-0.05), mg), F)

        # 棚内LED (各段)
        for i in range(5):
            z = i * 0.38 + 0.36
            lk(box(f"BS_led{i}", (sx+0.05,sy+0.04,z), (sx+W-0.05,sy+0.06,z+0.02), mw), F)

        print("  [fix] bottle shelf done")

    # ── RGB間接照明 ──
    def _rgb(self):
        L = self.C['03_Lighting']
        sw = 0.03

        # ── 折り上げ天井段差のLED ──
        cfg = {
            'a_booth': 'led_purple', 'b_booth': 'led_blue',
            'vip': 'led_magenta', 'd_booth': 'led_blue', 'c_booth': 'led_cyan',
        }
        for zn, led in cfg.items():
            (x0,y0,x1,y1), fl, chs = ZONES[zn]
            if len(chs) < 2: continue
            lo = fl + chs[0]
            s = COFFER
            ix0,ix1,iy0,iy1 = x0+s,x1-s,y0+s,y1-s
            mt = self.M[led]
            lk(box(f"L_c{zn}S", (ix0,iy0,lo-sw), (ix1,iy0+0.02,lo), mt), L)
            lk(box(f"L_c{zn}N", (ix0,iy1-0.02,lo-sw), (ix1,iy1,lo), mt), L)
            lk(box(f"L_c{zn}W", (ix0,iy0,lo-sw), (ix0+0.02,iy1,lo), mt), L)
            lk(box(f"L_c{zn}E", (ix1-0.02,iy0,lo-sw), (ix1,iy1,lo), mt), L)

        # ── カウンター下 ──
        lk(box("L_cnt1", (2,2,0), (8.5,2+0.02,sw), self.M['led_purple']), L)
        lk(box("L_cnt2", (1.5,2,0), (1.5+0.02,3.3,sw), self.M['led_purple']), L)

        # ── ソファバック (壁際) ──
        backs = [
            # A Booth
            (5.5,3.6,16.5,3.6+0.02, -0.4+0.35, 'led_purple'),
            (5.5,7.3,16.5,7.3+0.02, -0.4+0.35, 'led_purple'),
            (16.5,4.0,16.5+0.02,7.0, -0.4+0.35, 'led_purple'),
            # B Booth
            (0.2,3.8,0.2+0.02,7.2, 0.35, 'led_blue'),
            (0.5,3.6,4.5,3.6+0.02, 0.35, 'led_blue'),
            (0.5,7.3,4.5,7.3+0.02, 0.35, 'led_blue'),
            # VIP
            (0.2,10.3,0.2+0.02,12.7, 0.35, 'led_magenta'),
            (0.5,12.7,3.5,12.7+0.02, 0.35, 'led_magenta'),
            # D Booth
            (4.3,10.1,8.5,10.1+0.02, 0.35, 'led_blue'),
            (4.3,12.7,8.5,12.7+0.02, 0.35, 'led_blue'),
            # C Booth
            (9.3,10.1,12.5,10.1+0.02, 0.35, 'led_cyan'),
            (9.3,12.7,12.5,12.7+0.02, 0.35, 'led_cyan'),
        ]
        for i,(x0,y0,x1,y1,z,led) in enumerate(backs):
            lk(box(f"L_sb{i}", (x0,y0,z),(x1,y1,z+sw), self.M[led]), L)

        # ── ソファ足元 ──
        feet = [
            (5.5,3.8,16.5,3.8+0.02, -0.4, 'led_magenta'),
            (5.5,7.35,16.5,7.35+0.02, -0.4, 'led_magenta'),
            (0.5,3.8,4.5,3.8+0.02, 0, 'led_cyan'),
            (0.5,7.35,4.5,7.35+0.02, 0, 'led_cyan'),
            (4.3,10.3,8.5,10.3+0.02, 0, 'led_cyan'),
            (9.3,10.3,12.5,10.3+0.02, 0, 'led_cyan'),
        ]
        for i,(x0,y0,x1,y1,z,led) in enumerate(feet):
            lk(box(f"L_sf{i}", (x0,y0,z),(x1,y1,z+sw), self.M[led]), L)

        # ── Aブースステップ下 ──
        lk(box("L_stS", (5,3.5,-0.4),(BW,3.5+0.02,-0.4+sw), self.M['led_blue']), L)
        lk(box("L_stN", (5,7.5-0.02,-0.4),(BW,7.5,-0.4+sw), self.M['led_blue']), L)

        print("  [rgb] done")

    # ── ダウンライト / エリアライト ──
    def _lights(self):
        L = self.C['03_Lighting']
        dls = [
            ('DL_ent',  8.0, 0.5, 2.35, 0.4, 60, 1,.85,.7),
            ('DL_bar1', 3.5, 2.2, 2.35, 0.6, 80, 1,.85,.7),
            ('DL_bar2', 6.5, 2.2, 2.35, 0.6, 80, 1,.85,.7),
            ('DL_A1',   7.5, 5.5, 2.05, 0.8, 50, .9,.75,1),
            ('DL_A2',  11.0, 5.5, 2.05, 0.8, 50, .9,.75,1),
            ('DL_A3',  14.5, 5.5, 2.05, 0.6, 35, .9,.75,1),
            ('DL_B',    2.5, 5.5, 2.12, 0.6, 50, .9,.85,1),
            ('DL_cor1', 4.0, 8.7, 2.35, 0.5, 45, 1,.9,.8),
            ('DL_cor2', 8.5, 8.7, 2.35, 0.5, 45, 1,.9,.8),
            ('DL_cor3',13.0, 8.7, 2.35, 0.5, 45, 1,.9,.8),
            ('DL_V',    2.0,11.5, 2.05, 0.5, 40, 1,.7,.5),
            ('DL_D',    6.5,11.5, 2.12, 0.6, 50, .9,.85,1),
            ('DL_C',   10.5,11.5, 2.12, 0.6, 50, .85,.85,1),
            ('DL_btl', 13.0, 1.5, 2.35, 0.4, 80, 1,.9,.8),
        ]
        for nm,x,y,z,sz,pw,r,g,b in dls:
            ld = bpy.data.lights.new(nm, type='AREA')
            ld.energy = pw; ld.color = (r,g,b); ld.size = sz; ld.shape = 'SQUARE'
            lo = bpy.data.objects.new(nm, ld)
            lo.location = (x,y,z)
            lk(lo, L)
        print(f"  [lights] {len(dls)}")

    # ── プレースホルダー ──
    def _placeholders(self):
        P = self.C['04_Placeholders']
        for nm,x,y,w,d,h in PH:
            fl = -0.4 if 'A_' in nm else 0.0
            o = box(f"PH_{nm}", (x,y,fl), (x+w,y+d,fl+h))
            o.display_type = 'WIRE'
            lk(o, P)
        print(f"  [ph] {len(PH)} wireframes")

    # ── カメラ ──
    def _cameras(self, active='main'):
        # rx=π/2→+Y(北), rz回転で方角変更
        # look=(-sin(rz), cos(rz), 0) at rx=π/2
        cams = {
            'main': {
                # 入口(南面)から北方向へ全体を見る
                'loc': (8.0, 0.8, 1.6),
                'rot': (1.35, 0, 0.0),  # 北向き、やや見下ろし
                'lens': 22,
            },
            'overview': {
                # 北西コーナーから南東を見渡す
                'loc': (1.5, 11.5, 2.2),
                'rot': (1.15, 0, -1.2),  # 南東向き
                'lens': 18,
            },
            'a_booth': {
                # Aブース内 南西角から北東を見る
                'loc': (6.0, 4.2, 0.8),
                'rot': (1.40, 0, -0.5),  # やや東寄りの北
                'lens': 24,
            },
        }
        ac = None
        for cn, cf in cams.items():
            cd = bpy.data.cameras.new(f"Cam_{cn}")
            cd.lens = cf['lens']; cd.clip_start = 0.1; cd.clip_end = 100
            co = bpy.data.objects.new(f"Cam_{cn}", cd)
            co.location = cf['loc']; co.rotation_euler = cf['rot']
            lk(co, self.C['05_Cameras'])
            if cn == active: ac = co
        if ac: bpy.context.scene.camera = ac
        print(f"  [cam] {active}")

    # ── レンダリング設定 ──
    def _render(self, quality='preview'):
        sc = bpy.context.scene
        sc.render.engine = 'CYCLES'

        # GPU
        pr = bpy.context.preferences.addons.get('cycles')
        if pr:
            cp = pr.preferences
            for ct in ('OPTIX','CUDA','NONE'):
                try:
                    cp.compute_device_type = ct; cp.get_devices()
                    for d in cp.devices: d.use = True
                    if ct != 'NONE':
                        sc.cycles.device = 'GPU'
                        print(f"  [gpu] {ct}"); break
                except: continue

        q = {'preview':(32,1920,1080),'draft':(64,2560,1440),'production':(256,3840,2160)}
        s,rx,ry = q.get(quality, q['preview'])
        sc.cycles.samples = s
        sc.render.resolution_x = rx; sc.render.resolution_y = ry
        sc.render.image_settings.file_format = 'PNG'
        sc.render.image_settings.color_mode = 'RGBA'
        sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'

        # 暗い環境光
        sc.render.film_transparent = False
        wd = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
        sc.world = wd; wd.use_nodes = True
        bg = wd.node_tree.nodes.get('Background')
        if bg:
            bg.inputs['Color'].default_value = (0.003,0.003,0.006,1)
            bg.inputs['Strength'].default_value = 0.2
        print(f"  [render] {quality} {s}spp {rx}x{ry}")


# ===========================================================================
# Main
# ===========================================================================

def main():
    argv = sys.argv
    if '--' in argv: argv = argv[argv.index('--')+1:]
    else: argv = []

    quality, camera = 'preview', 'main'
    for i,a in enumerate(argv):
        if a == '--quality' and i+1 < len(argv): quality = argv[i+1]
        elif a == '--camera' and i+1 < len(argv): camera = argv[i+1]

    HostClubBuilder().build(quality, camera)

    out = os.path.abspath(os.path.join(PROJECT_DIR, 'output', 'hostclub'))
    os.makedirs(out, exist_ok=True)

    # .blend保存
    blend_path = os.path.join(out, 'hostclub.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"  blend: {blend_path}")

    # レンダリング — 各カメラで保存
    targets = ['main','overview','a_booth'] if camera == 'all' else [camera]
    for cn in targets:
        co = bpy.data.objects.get(f"Cam_{cn}")
        if co:
            bpy.context.scene.camera = co
            png = os.path.join(out, f'hostclub_{cn}.png')
            bpy.context.scene.render.filepath = png
            bpy.ops.render.render(write_still=True)
            # Blenderがフレーム番号を付ける場合のフォールバック
            if not os.path.exists(png):
                for suffix in ['0001', '0000', '']:
                    alt = png.replace('.png', f'{suffix}.png')
                    if os.path.exists(alt):
                        os.rename(alt, png)
                        break
            print(f"  png: {png} ({'OK' if os.path.exists(png) else 'MISSING'})")

    print("\n  Done!")

if __name__ == '__main__':
    main()
