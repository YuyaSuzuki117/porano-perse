#!/usr/bin/env python3
"""render-deco-bar-v2.py — Art Deco Bar with high-quality Blender_Codex assets.

Blender_Codex の高品質 .blend モデルを使って Art Deco バーシーンを構築・レンダリングする。
既存パイプラインで部屋（壁・床・天井）を生成し、家具はCodexアセットに差し替える。

Usage:
    blender --background --python scripts/render-deco-bar-v2.py -- --quality=preview --camera=main
    blender --background --python scripts/render-deco-bar-v2.py -- --quality=final
    blender --background --python scripts/render-deco-bar-v2.py -- --quality=preview --camera=bar
"""

import sys
import os
import json
import time
import math
import argparse

sys.dont_write_bytecode = True

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)

import bpy
import mathutils

from blender.core import (
    clear_scene,
    setup_collections,
    get_output_dir,
    hex_to_rgba,
    make_material,
    link_to_collection,
)
from blender.room_builder import build_room
from blender.lighting import setup_lighting
from blender.cameras import setup_cameras
from blender.style_applicator import apply_style
from blender.renderer import setup_render, render_scene

# =============================================================================
# アセットパス定義
# =============================================================================
CODEX_DIR = "C:/Users/LENOVO/Desktop/Blender_Codex"

BACKBAR_BLEND = os.path.join(
    CODEX_DIR,
    "20_案件_テーブル/クラシックバックバー_バーカウンター/output/classic_backbar_scene.blend",
)
TABLE_BLEND = os.path.join(
    CODEX_DIR,
    "20_案件_テーブル/カフェテーブル_モダン試作/output/modern_cafe_table.blend",
)
CHAIR_BLEND = os.path.join(
    CODEX_DIR,
    "Blender椅子試作/output/mid_century_chair_trial.blend",
)
STOOL_DIR = os.path.join(
    CODEX_DIR,
    "10_案件_椅子/バースツール_青ベルベット_マホガニー",
)

# 部屋寸法（シーンJSONと同じ）
ROOM_W = 10.0   # X方向
ROOM_D = 12.0   # Y方向
ROOM_H = 3.5    # Z方向

TEMPLATE_ID = "rt_art_deco_bar_v2"


# =============================================================================
# ユーティリティ
# =============================================================================

def _log(msg: str) -> None:
    """タイムスタンプ付きログ出力。"""
    elapsed = time.time() - _log._start if hasattr(_log, "_start") else 0.0
    print(f"[{elapsed:7.2f}s] {msg}")


def _find_blend_in_dir(directory: str) -> str | None:
    """ディレクトリ内の最初の .blend ファイルを返す。なければ None。"""
    if not os.path.isdir(directory):
        return None
    for fname in os.listdir(directory):
        if fname.endswith(".blend"):
            return os.path.join(directory, fname)
    # output サブフォルダも探索
    out_dir = os.path.join(directory, "output")
    if os.path.isdir(out_dir):
        for fname in os.listdir(out_dir):
            if fname.endswith(".blend"):
                return os.path.join(out_dir, fname)
    return None


def parse_args() -> tuple[str, str | None]:
    """コマンドライン引数をパースする。'--' 以降の引数を処理。

    Returns:
        (quality, camera) — quality は 'preview' | 'final', camera は名前 or None (全カメラ)
    """
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(description="Art Deco Bar V2 Renderer")
    parser.add_argument(
        "--quality",
        choices=["preview", "final"],
        default="preview",
        help="レンダリング品質 (default: preview)",
    )
    parser.add_argument(
        "--camera",
        type=str,
        default=None,
        help="レンダリングするカメラ名 (省略時は全カメラ)",
    )
    args = parser.parse_args(argv)
    return args.quality, args.camera


# =============================================================================
# アセット読み込み
# =============================================================================

def append_all_objects(
    blend_path: str,
    target_collection: bpy.types.Collection | None = None,
) -> list[bpy.types.Object]:
    """
    .blend ファイルから全オブジェクトをアペンドする。

    bpy.data.libraries.load() を使用（bpy.ops.wm.open_mainfile は使わない）。
    読み込んだオブジェクトを target_collection にリンクし、リストで返す。
    """
    if not os.path.isfile(blend_path):
        _log(f"  ⚠ ファイルが見つかりません: {blend_path}")
        return []

    _log(f"  読み込み中: {os.path.basename(blend_path)}")

    # ライブラリから全オブジェクト名を取得してアペンド
    with bpy.data.libraries.load(blend_path, link=False) as (data_from, data_to):
        data_to.objects = data_from.objects
        _log(f"    オブジェクト数: {len(data_from.objects)}")

    new_objects = []
    col = target_collection or bpy.context.collection

    for obj in data_to.objects:
        if obj is None:
            continue
        # シーン内のどのコレクションにも属していなければリンク
        if obj.name not in col.objects:
            col.objects.link(obj)
        new_objects.append(obj)

    _log(f"    アペンド完了: {len(new_objects)} オブジェクト")
    return new_objects


def _create_parent_empty(
    name: str,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """位置決め用の空オブジェクト（Empty）を作成する。"""
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.3
    empty.location = mathutils.Vector(location)
    collection.objects.link(empty)
    return empty


def _parent_objects(
    objects: list[bpy.types.Object],
    parent: bpy.types.Object,
) -> None:
    """オブジェクト群を parent にペアレント設定する（トランスフォーム維持）。"""
    for obj in objects:
        if obj == parent:
            continue
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()


def _get_bounds(objects: list[bpy.types.Object]) -> tuple[mathutils.Vector, mathutils.Vector]:
    """オブジェクト群のバウンディングボックスを計算する。"""
    min_co = mathutils.Vector((float("inf"),) * 3)
    max_co = mathutils.Vector((float("-inf"),) * 3)

    for obj in objects:
        if obj.type not in {"MESH", "CURVE", "SURFACE", "FONT"}:
            continue
        for corner in obj.bound_box:
            world_co = obj.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                min_co[i] = min(min_co[i], world_co[i])
                max_co[i] = max(max_co[i], world_co[i])

    return min_co, max_co


# =============================================================================
# バックバー配置 — 北壁に沿って中央配置
# =============================================================================

def place_backbar(collection: bpy.types.Collection) -> bpy.types.Object | None:
    """
    バックバー＋バーカウンターを北壁沿いに配置する。

    - カウンター前面を Y ≈ -5.5（北壁手前）に配置
    - X 方向は部屋中央に整列
    - 必要に応じてスケール調整
    """
    _log("[バックバー] アセット読み込み開始")

    if not os.path.isfile(BACKBAR_BLEND):
        _log("[バックバー] .blend が見つかりません — スキップ")
        return None

    objs = append_all_objects(BACKBAR_BLEND, collection)
    if not objs:
        return None

    # バウンディングボックスを計算
    bb_min, bb_max = _get_bounds(objs)
    size = bb_max - bb_min
    center = (bb_min + bb_max) / 2.0

    _log(f"  元サイズ: {size.x:.2f} x {size.y:.2f} x {size.z:.2f}")
    _log(f"  元中心:   ({center.x:.2f}, {center.y:.2f}, {center.z:.2f})")

    # 親Emptyを作成
    parent = _create_parent_empty("Backbar_Root", (0, 0, 0), collection)
    _parent_objects(objs, parent)

    # スケール: バックバーが部屋幅（10m）の80%以内に収まるようにする
    max_width = ROOM_W * 0.8
    scale_factor = 1.0
    if size.x > max_width:
        scale_factor = max_width / size.x
        _log(f"  スケール調整: {scale_factor:.3f}")

    parent.scale = mathutils.Vector((scale_factor,) * 3)

    # 位置: 北壁（Y = +ROOM_D/2）に沿って配置
    # バックバー背面が北壁に接する位置
    north_wall_y = ROOM_D / 2.0
    # 背面（bb_max.y * scale）を北壁に合わせる
    offset_y = north_wall_y - (bb_max.y * scale_factor) - 0.05  # 壁から5cm離す
    offset_x = -center.x * scale_factor  # X中央揃え
    offset_z = -bb_min.z * scale_factor   # 床に接地

    parent.location = mathutils.Vector((offset_x, offset_y, offset_z))

    _log(f"  配置位置: ({offset_x:.2f}, {offset_y:.2f}, {offset_z:.2f})")
    _log(f"[バックバー] 完了 — {len(objs)} オブジェクト")

    return parent


# =============================================================================
# テーブル＆チェア配置 — 南半分のラウンジエリア
# =============================================================================

# テーブル配置座標（X, Y）— 南側客席エリア
TABLE_POSITIONS = [
    (-3.0, -2.0),
    (-1.0,  0.5),
    ( 1.0, -1.0),
    ( 3.0, -2.0),
    (-2.0,  2.5),
    ( 2.0,  1.5),
]

# 各テーブルに対するチェア配置（テーブル中心からの相対位置と回転角度）
CHAIR_OFFSETS = [
    (( 0.5,  0.0), math.radians(-90)),   # 東側、西を向く
    ((-0.5,  0.0), math.radians(90)),     # 西側、東を向く
]


def place_tables_and_chairs(collection: bpy.types.Collection) -> None:
    """
    カフェテーブルとミッドセンチュリーチェアを配置する。

    - テーブル: TABLE_BLEND から読み込み、6箇所に配置
    - チェア: CHAIR_BLEND から読み込み、各テーブルに2脚ずつ配置
    """
    _log("[テーブル & チェア] 配置開始")

    # --- テーブルのマスターコピーを読み込み ---
    table_master_objs = []
    if os.path.isfile(TABLE_BLEND):
        table_master_objs = append_all_objects(TABLE_BLEND, collection)
    else:
        _log("  テーブル .blend が見つかりません — スキップ")

    # --- チェアのマスターコピーを読み込み ---
    chair_master_objs = []
    if os.path.isfile(CHAIR_BLEND):
        chair_master_objs = append_all_objects(CHAIR_BLEND, collection)
    else:
        _log("  チェア .blend が見つかりません — スキップ")

    if not table_master_objs and not chair_master_objs:
        _log("[テーブル & チェア] アセットなし — スキップ")
        return

    # --- マスターのバウンディング計算 ---
    if table_master_objs:
        t_min, t_max = _get_bounds(table_master_objs)
        t_center = (t_min + t_max) / 2.0
        t_size = t_max - t_min
        _log(f"  テーブルサイズ: {t_size.x:.2f} x {t_size.y:.2f} x {t_size.z:.2f}")

    if chair_master_objs:
        c_min, c_max = _get_bounds(chair_master_objs)
        c_center = (c_min + c_max) / 2.0
        c_size = c_max - c_min
        _log(f"  チェアサイズ: {c_size.x:.2f} x {c_size.y:.2f} x {c_size.z:.2f}")

    # --- マスターコピーの親Empty ---
    table_master_parent = _create_parent_empty("Table_Master", (0, 0, 0), collection)
    _parent_objects(table_master_objs, table_master_parent)
    # 床に接地、中心を原点に
    if table_master_objs:
        table_master_parent.location = mathutils.Vector(
            (-t_center.x, -t_center.y, -t_min.z)
        )

    chair_master_parent = _create_parent_empty("Chair_Master", (0, 0, 0), collection)
    _parent_objects(chair_master_objs, chair_master_parent)
    if chair_master_objs:
        chair_master_parent.location = mathutils.Vector(
            (-c_center.x, -c_center.y, -c_min.z)
        )

    # マスターを非表示（レンダリングにも非表示）
    table_master_parent.hide_set(True)
    table_master_parent.hide_render = True
    for obj in table_master_objs:
        obj.hide_set(True)
        obj.hide_render = True

    chair_master_parent.hide_set(True)
    chair_master_parent.hide_render = True
    for obj in chair_master_objs:
        obj.hide_set(True)
        obj.hide_render = True

    # --- テーブルを各位置に複製配置 ---
    for i, (tx, ty) in enumerate(TABLE_POSITIONS):
        _log(f"  テーブル {i + 1}/{len(TABLE_POSITIONS)}: ({tx:.1f}, {ty:.1f})")

        # テーブル複製
        if table_master_objs:
            _duplicate_group(
                table_master_objs,
                table_master_parent,
                f"Table_{i + 1}",
                location=(tx, ty, 0),
                rotation_z=0.0,
                collection=collection,
                offset_z=-t_min.z,
                center_xy=(t_center.x, t_center.y),
            )

        # チェア複製（各テーブルに2脚）
        if chair_master_objs:
            # チェアの配置距離はテーブル半径 + チェア奥行き/2 + 隙間
            chair_dist = (max(t_size.x, t_size.y) / 2.0 + c_size.y / 2.0 + 0.1) if table_master_objs else 0.7
            for j, (offset, rot) in enumerate(CHAIR_OFFSETS):
                cx = tx + offset[0] * chair_dist * 2.0
                cy = ty + offset[1] * chair_dist * 2.0
                _duplicate_group(
                    chair_master_objs,
                    chair_master_parent,
                    f"Chair_{i + 1}_{j + 1}",
                    location=(cx, cy, 0),
                    rotation_z=rot,
                    collection=collection,
                    offset_z=-c_min.z,
                    center_xy=(c_center.x, c_center.y),
                )

    _log(f"[テーブル & チェア] 完了 — {len(TABLE_POSITIONS)} セット")


def _duplicate_group(
    master_objs: list[bpy.types.Object],
    master_parent: bpy.types.Object,
    name: str,
    location: tuple[float, float, float],
    rotation_z: float,
    collection: bpy.types.Collection,
    offset_z: float = 0.0,
    center_xy: tuple[float, float] = (0.0, 0.0),
) -> bpy.types.Object:
    """
    マスターオブジェクト群を複製して指定位置に配置する。

    オブジェクトを linked duplicate（データ共有）で複製し、メモリ効率を高める。
    """
    parent_empty = _create_parent_empty(
        name,
        (location[0], location[1], location[2] + offset_z),
        collection,
    )
    parent_empty.rotation_euler.z = rotation_z

    for obj in master_objs:
        if obj == master_parent:
            continue
        # linked duplicate: メッシュデータを共有
        dup = obj.copy()
        # マテリアルは共有のままでOK（同一デザイン）
        collection.objects.link(dup)
        dup.parent = parent_empty
        # 元の親からの相対位置を維持
        dup.matrix_parent_inverse = parent_empty.matrix_world.inverted()
        # 元オブジェクトのローカル座標から中心オフセットを差し引く
        dup.location = mathutils.Vector((
            obj.location.x - center_xy[0],
            obj.location.y - center_xy[1],
            obj.location.z,
        ))
        dup.rotation_euler = obj.rotation_euler.copy()
        dup.scale = obj.scale.copy()

        # 表示を有効にする
        dup.hide_set(False)
        dup.hide_render = False

    return parent_empty


# =============================================================================
# バースツール配置 — カウンター前面に等間隔配置
# =============================================================================

def place_bar_stools(collection: bpy.types.Collection) -> None:
    """
    バースツールをバーカウンター前面に6脚配置する。

    STOOL_DIR に .blend があればそれを使用。なければプロシージャルで生成する。
    """
    _log("[バースツール] 配置開始")

    stool_blend = _find_blend_in_dir(STOOL_DIR)
    stool_objs = []

    if stool_blend:
        _log(f"  .blend 発見: {os.path.basename(stool_blend)}")
        stool_objs = append_all_objects(stool_blend, collection)
    else:
        _log("  .blend なし — プロシージャル生成にフォールバック")

    # スツール配置位置: バーカウンター前面 Y ≈ 4.0（北壁から約2m手前）
    stool_y = ROOM_D / 2.0 - 2.5  # カウンター前面から少し離す
    num_stools = 6
    # X方向: 部屋中央に等間隔配置（幅7mの範囲）
    spread = 6.0
    x_positions = [
        -spread / 2.0 + i * spread / (num_stools - 1)
        for i in range(num_stools)
    ]

    if stool_objs:
        # .blend アセットを使用
        s_min, s_max = _get_bounds(stool_objs)
        s_center = (s_min + s_max) / 2.0

        # マスターを非表示
        stool_master = _create_parent_empty("Stool_Master", (0, 0, 0), collection)
        _parent_objects(stool_objs, stool_master)
        stool_master.hide_set(True)
        stool_master.hide_render = True
        for obj in stool_objs:
            obj.hide_set(True)
            obj.hide_render = True

        for i, sx in enumerate(x_positions):
            _duplicate_group(
                stool_objs,
                stool_master,
                f"BarStool_{i + 1}",
                location=(sx, stool_y, 0),
                rotation_z=math.radians(180),  # カウンター方向を向く
                collection=collection,
                offset_z=-s_min.z,
                center_xy=(s_center.x, s_center.y),
            )
    else:
        # フォールバック: プロシージャルバースツール
        for i, sx in enumerate(x_positions):
            _make_procedural_stool(
                f"BarStool_{i + 1}",
                location=(sx, stool_y, 0),
                collection=collection,
            )

    _log(f"[バースツール] 完了 — {num_stools} 脚")


def _make_procedural_stool(
    name: str,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """
    プロシージャルでバースツールを生成する（フォールバック用）。

    マホガニー色の脚 + 青ベルベットの座面。
    """
    # 座面
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.18,
        depth=0.06,
        location=(location[0], location[1], location[2] + 0.72),
    )
    seat = bpy.context.active_object
    seat.name = f"{name}_Seat"

    seat_mat = make_material(
        f"{name}_Velvet",
        color=hex_to_rgba("#1A3A5C"),
        roughness=0.85,
        metallic=0.0,
    )
    seat.data.materials.append(seat_mat)

    # 脚（中央支柱）
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.025,
        depth=0.7,
        location=(location[0], location[1], location[2] + 0.35),
    )
    leg = bpy.context.active_object
    leg.name = f"{name}_Leg"

    leg_mat = make_material(
        f"{name}_Mahogany",
        color=hex_to_rgba("#4A2020"),
        roughness=0.35,
        metallic=0.1,
    )
    leg.data.materials.append(leg_mat)

    # 足掛けリング
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.15,
        minor_radius=0.012,
        location=(location[0], location[1], location[2] + 0.30),
    )
    footrest = bpy.context.active_object
    footrest.name = f"{name}_Footrest"

    brass_mat = make_material(
        f"{name}_Brass",
        color=hex_to_rgba("#B8860B"),
        roughness=0.25,
        metallic=0.9,
    )
    footrest.data.materials.append(brass_mat)

    # ベース
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.22,
        depth=0.02,
        location=(location[0], location[1], location[2] + 0.01),
    )
    base = bpy.context.active_object
    base.name = f"{name}_Base"
    base.data.materials.append(leg_mat)

    # 全パーツをコレクションにリンク、親Emptyにまとめる
    parent = _create_parent_empty(name, location, collection)
    for part in [seat, leg, footrest, base]:
        # デフォルトのSceneコレクションからアンリンク
        for c in part.users_collection:
            c.objects.unlink(part)
        collection.objects.link(part)
        part.parent = parent

    return parent


# =============================================================================
# マテリアル改善 — 床・天井・壁の質感向上
# =============================================================================

def improve_room_materials() -> None:
    """
    build_room() が生成した部屋マテリアルを後から調整する。

    - 床: テラゾーをさらにダークでマットに
    - 天井: 暖色系に調整
    - 壁: 微妙なラフネスバリエーション追加
    """
    _log("[マテリアル改善] 開始")

    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is None:
            continue

        mat_lower = mat.name.lower()

        # --- 床 ---
        if "floor" in mat_lower or "terrazzo" in mat_lower:
            _log(f"  床マテリアル調整: {mat.name}")
            # よりダークでマットに
            bsdf.inputs["Base Color"].default_value = hex_to_rgba("#080808")
            bsdf.inputs["Roughness"].default_value = 0.75
            bsdf.inputs["Specular IOR Level"].default_value = 0.3
            # テラゾーの微粒子感: ノイズテクスチャでバンプ追加
            _add_subtle_bump(mat, scale=80.0, strength=0.02)

        # --- 天井 ---
        elif "ceiling" in mat_lower:
            _log(f"  天井マテリアル調整: {mat.name}")
            bsdf.inputs["Base Color"].default_value = hex_to_rgba("#C8B898")
            bsdf.inputs["Roughness"].default_value = 0.65
            # 天井にも微細テクスチャ
            _add_subtle_bump(mat, scale=30.0, strength=0.01)

        # --- 壁 ---
        elif "wall" in mat_lower:
            _log(f"  壁マテリアル調整: {mat.name}")
            bsdf.inputs["Roughness"].default_value = 0.55
            # 壁にノイズでラフネスバリエーション
            _add_roughness_variation(mat, base_roughness=0.55, variation=0.1, scale=15.0)

    _log("[マテリアル改善] 完了")


def _add_subtle_bump(
    mat: bpy.types.Material,
    scale: float = 50.0,
    strength: float = 0.02,
) -> None:
    """マテリアルにノイズベースの微細バンプを追加する。"""
    tree = mat.node_tree
    nodes = tree.nodes
    links = tree.links

    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        return

    # ノイズテクスチャ
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.6
    noise.location = (-400, -300)

    # バンプノード
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = 0.01
    bump.location = (-200, -300)

    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def _add_roughness_variation(
    mat: bpy.types.Material,
    base_roughness: float = 0.5,
    variation: float = 0.1,
    scale: float = 10.0,
) -> None:
    """ラフネスにノイズバリエーションを加える。"""
    tree = mat.node_tree
    nodes = tree.nodes
    links = tree.links

    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        return

    # ノイズテクスチャ
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 4.0
    noise.location = (-400, -100)

    # MapRange でラフネス範囲にマッピング
    map_range = nodes.new("ShaderNodeMapRange")
    map_range.inputs["From Min"].default_value = 0.0
    map_range.inputs["From Max"].default_value = 1.0
    map_range.inputs["To Min"].default_value = base_roughness - variation
    map_range.inputs["To Max"].default_value = base_roughness + variation
    map_range.location = (-200, -100)

    links.new(noise.outputs["Fac"], map_range.inputs["Value"])
    links.new(map_range.outputs["Result"], bsdf.inputs["Roughness"])


# =============================================================================
# ライティング改善 — バーエリアのアクセントライト追加
# =============================================================================

def improve_lighting(collections: dict) -> None:
    """
    標準ライティングに加えてバーシーン用のアクセントを追加する。

    - バーカウンター上のスポットライト（暖色）
    - アンビエントフィルの減光
    - ペンダントライト強化
    """
    _log("[ライティング改善] 開始")

    light_col = collections.get("03_Lighting")
    if light_col is None:
        # コレクションが見つからない場合はシーンコレクションを使用
        light_col = bpy.context.scene.collection

    # --- バーカウンター上のアクセントスポット ---
    bar_y = ROOM_D / 2.0 - 1.5  # カウンター上方
    accent_positions = [
        (-2.5, bar_y, ROOM_H - 0.3),
        (-0.8, bar_y, ROOM_H - 0.3),
        ( 0.8, bar_y, ROOM_H - 0.3),
        ( 2.5, bar_y, ROOM_H - 0.3),
    ]
    for i, pos in enumerate(accent_positions):
        light_data = bpy.data.lights.new(f"BarAccent_{i + 1}", "SPOT")
        light_data.energy = 80.0
        light_data.color = (1.0, 0.85, 0.6)  # 暖色
        light_data.spot_size = math.radians(45)
        light_data.spot_blend = 0.5
        light_data.shadow_soft_size = 0.3
        light_data.use_shadow = True

        light_obj = bpy.data.objects.new(f"BarAccent_{i + 1}", light_data)
        light_obj.location = mathutils.Vector(pos)
        # 真下を向く
        light_obj.rotation_euler = (0, 0, 0)
        light_col.objects.link(light_obj)

    # --- バックバー棚のインダイレクトライト ---
    shelf_lights = [
        (-2.0, ROOM_D / 2.0 - 0.5, 2.0),
        ( 0.0, ROOM_D / 2.0 - 0.5, 2.0),
        ( 2.0, ROOM_D / 2.0 - 0.5, 2.0),
    ]
    for i, pos in enumerate(shelf_lights):
        light_data = bpy.data.lights.new(f"ShelfLight_{i + 1}", "AREA")
        light_data.energy = 30.0
        light_data.color = (1.0, 0.90, 0.70)
        light_data.size = 1.0
        light_data.use_shadow = False  # 間接光なのでシャドウ不要

        light_obj = bpy.data.objects.new(f"ShelfLight_{i + 1}", light_data)
        light_obj.location = mathutils.Vector(pos)
        light_col.objects.link(light_obj)

    # --- ラウンジエリアのアンビエントフィル ---
    ambient_data = bpy.data.lights.new("AmbientFill", "AREA")
    ambient_data.energy = 15.0
    ambient_data.color = (1.0, 0.92, 0.80)
    ambient_data.size = 8.0
    ambient_data.use_shadow = False

    ambient_obj = bpy.data.objects.new("AmbientFill", ambient_data)
    ambient_obj.location = mathutils.Vector((0, -1.0, ROOM_H - 0.1))
    light_col.objects.link(ambient_obj)

    # --- 既存ライトの調整 ---
    for obj in bpy.data.objects:
        if obj.type != "LIGHT":
            continue
        # ペンダントライトの強化
        if "pendant" in obj.name.lower():
            obj.data.energy *= 1.5
            _log(f"  ペンダント強化: {obj.name} → {obj.data.energy:.0f}W")
        # アンビエントライトの減光（ハイコントラスト化）
        elif "ambient" in obj.name.lower() and obj.name != "AmbientFill":
            obj.data.energy *= 0.6
            _log(f"  アンビエント減光: {obj.name} → {obj.data.energy:.0f}W")

    _log("[ライティング改善] 完了")


# =============================================================================
# カメラ調整 — バーカウンター専用カメラ追加
# =============================================================================

def adjust_cameras(collections: dict) -> None:
    """
    既存カメラの微調整 + バーカウンター専用カメラ「Cam_Bar」を追加する。
    """
    _log("[カメラ調整] 開始")

    cam_col = collections.get("04_Cameras")
    if cam_col is None:
        cam_col = bpy.context.scene.collection

    # --- 既存 Cam_Main の角度微調整 ---
    for obj in bpy.data.objects:
        if obj.type == "CAMERA" and "main" in obj.name.lower():
            # バックバーがよく見える位置に少し後退
            obj.location.y -= 0.5
            obj.location.z += 0.2
            _log(f"  {obj.name}: 後退 + 上方調整")
            break

    # --- Cam_Bar: バーカウンター正面ビュー ---
    cam_data = bpy.data.cameras.new("Cam_Bar")
    cam_data.lens = 35  # 広角でバックバー全体を捉える
    cam_data.sensor_width = 36.0
    cam_data.clip_start = 0.1
    cam_data.clip_end = 100.0

    cam_obj = bpy.data.objects.new("Cam_Bar", cam_data)
    # カウンターの南側から北壁を見上げる構図
    cam_obj.location = mathutils.Vector((0.3, 1.5, 1.4))
    # 北壁方向を向く（Y+方向）
    cam_obj.rotation_euler = (math.radians(75), 0, math.radians(2))
    cam_col.objects.link(cam_obj)
    _log("  Cam_Bar 追加: カウンター正面ビュー")

    # --- Cam_Lounge: ラウンジエリア俯瞰 ---
    cam_data2 = bpy.data.cameras.new("Cam_Lounge")
    cam_data2.lens = 28
    cam_data2.sensor_width = 36.0
    cam_data2.clip_start = 0.1
    cam_data2.clip_end = 100.0

    cam_obj2 = bpy.data.objects.new("Cam_Lounge", cam_data2)
    # 部屋の角から対角線方向にラウンジを見渡す
    cam_obj2.location = mathutils.Vector((-4.5, -5.0, 2.2))
    cam_obj2.rotation_euler = (math.radians(70), 0, math.radians(-30))
    cam_col.objects.link(cam_obj2)
    _log("  Cam_Lounge 追加: ラウンジ俯瞰ビュー")

    _log("[カメラ調整] 完了")


# =============================================================================
# レンダリング設定
# =============================================================================

def configure_render(quality: str) -> None:
    """
    品質に応じたレンダリング設定を適用する。

    preview: 低サンプル・低解像度で高速レンダリング
    final: 高サンプル・高解像度で品質重視
    """
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"

    # デバイス設定（GPU利用可能ならGPU）
    prefs = bpy.context.preferences.addons.get("cycles")
    if prefs:
        prefs.preferences.compute_device_type = "CUDA"
        bpy.context.scene.cycles.device = "GPU"
        # デバイスをアクティベート
        try:
            prefs.preferences.get_devices()
            for device in prefs.preferences.devices:
                device.use = True
        except Exception:
            pass

    cycles = scene.cycles

    if quality == "final":
        scene.render.resolution_x = 3840
        scene.render.resolution_y = 2160
        scene.render.resolution_percentage = 100
        cycles.samples = 512
        cycles.use_denoising = True
        cycles.denoiser = "OPENIMAGEDENOISE"
        cycles.max_bounces = 12
        cycles.diffuse_bounces = 6
        cycles.glossy_bounces = 6
        cycles.transmission_bounces = 12
        cycles.transparent_max_bounces = 8
        _log("[レンダリング設定] FINAL: 3840x2160, 512 samples")
    else:
        scene.render.resolution_x = 1920
        scene.render.resolution_y = 1080
        scene.render.resolution_percentage = 100
        cycles.samples = 128
        cycles.use_denoising = True
        cycles.denoiser = "OPENIMAGEDENOISE"
        cycles.max_bounces = 8
        cycles.diffuse_bounces = 4
        cycles.glossy_bounces = 4
        cycles.transmission_bounces = 8
        cycles.transparent_max_bounces = 4
        _log("[レンダリング設定] PREVIEW: 1920x1080, 128 samples")

    # 共通設定
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 15
    scene.render.film_transparent = False

    # ワールド背景（黒）
    world = bpy.data.worlds.get("World")
    if world is None:
        world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.01, 0.01, 0.01, 1.0)
        bg.inputs["Strength"].default_value = 0.05


def render_all_cameras(quality: str, camera_filter: str | None = None) -> list[str]:
    """
    シーン内の全カメラ（またはフィルタ指定のカメラ）でレンダリングする。

    Returns:
        レンダリングした画像ファイルパスのリスト
    """
    output_dir = get_output_dir()
    render_dir = os.path.join(output_dir, TEMPLATE_ID)
    os.makedirs(render_dir, exist_ok=True)

    cameras = [
        obj for obj in bpy.data.objects
        if obj.type == "CAMERA" and not obj.hide_render
    ]

    if camera_filter:
        # フィルタに部分一致するカメラのみ
        filter_lower = camera_filter.lower()
        cameras = [c for c in cameras if filter_lower in c.name.lower()]

    if not cameras:
        _log("[レンダリング] 対象カメラがありません")
        return []

    _log(f"[レンダリング] {len(cameras)} カメラをレンダリング")

    rendered = []
    for cam in cameras:
        cam_name = cam.name.replace(" ", "_")
        filepath = os.path.join(render_dir, f"{TEMPLATE_ID}_{cam_name}_{quality}.png")

        bpy.context.scene.camera = cam
        bpy.context.scene.render.filepath = filepath

        _log(f"  レンダリング中: {cam.name} → {os.path.basename(filepath)}")
        render_start = time.time()

        bpy.ops.render.render(write_still=True)

        elapsed = time.time() - render_start
        _log(f"  完了: {elapsed:.1f}秒")
        rendered.append(filepath)

    return rendered


# =============================================================================
# メイン
# =============================================================================

def main() -> None:
    """メインエントリーポイント。"""
    _log._start = time.time()
    _log("=" * 60)
    _log("Art Deco Bar V2 — Blender_Codex アセット統合レンダリング")
    _log("=" * 60)

    quality, camera = parse_args()
    _log(f"品質: {quality}, カメラ: {camera or '全カメラ'}")

    # --- シーンJSON読み込み ---
    scene_path = os.path.join(PROJECT_DIR, "output", "scene-json", "rt_art_deco_bar.json")
    if not os.path.isfile(scene_path):
        _log(f"シーンJSONが見つかりません: {scene_path}")
        _log("先に template-to-json で生成してください")
        sys.exit(1)

    with open(scene_path, "r", encoding="utf-8") as f:
        scene_data = json.load(f)

    _log(f"シーンJSON読み込み完了: {os.path.basename(scene_path)}")

    # スタイルオーバーライド（床をさらにダーク、天井を暖色に）
    if "style" in scene_data:
        scene_data["style"]["floorColor"] = "#0A0A0A"
        scene_data["style"]["ceilingColor"] = "#C8B898"

    # ===========================================
    # Phase 1: シーン初期化
    # ===========================================
    _log("\n[Phase 1] シーン初期化")
    clear_scene()
    collections = setup_collections()

    # ===========================================
    # Phase 2: 部屋構築（壁・床・天井）
    # ===========================================
    _log("\n[Phase 2] 部屋構築")
    build_room(scene_data, collections)

    # ===========================================
    # Phase 3: ライティング（標準 + 改善）
    # ===========================================
    _log("\n[Phase 3] ライティング")
    setup_lighting(scene_data, collections)
    improve_lighting(collections)

    # ===========================================
    # Phase 4: Codex アセット読み込み・配置
    # ===========================================
    _log("\n[Phase 4] Codex アセット読み込み")
    furniture_col = collections.get("02_Furniture")
    if furniture_col is None:
        furniture_col = bpy.context.scene.collection
        _log("  02_Furniture コレクション未発見 — Scene Collection を使用")

    place_backbar(furniture_col)
    place_tables_and_chairs(furniture_col)
    place_bar_stools(furniture_col)

    # ===========================================
    # Phase 5: カメラ（標準 + 調整 + 追加）
    # ===========================================
    _log("\n[Phase 5] カメラ設定")
    setup_cameras(scene_data, collections)
    adjust_cameras(collections)

    # ===========================================
    # Phase 6: スタイル適用 + マテリアル改善
    # ===========================================
    _log("\n[Phase 6] スタイル適用 & マテリアル改善")
    apply_style(scene_data)
    improve_room_materials()

    # ===========================================
    # Phase 7: .blend 保存
    # ===========================================
    _log("\n[Phase 7] .blend ファイル保存")
    output_dir = get_output_dir()
    blend_path = os.path.join(output_dir, f"{TEMPLATE_ID}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    _log(f"  保存完了: {blend_path}")

    # ===========================================
    # Phase 8: レンダリング
    # ===========================================
    _log("\n[Phase 8] レンダリング")
    configure_render(quality)
    rendered_files = render_all_cameras(quality, camera)

    # ===========================================
    # 完了レポート
    # ===========================================
    elapsed = time.time() - _log._start
    _log("\n" + "=" * 60)
    _log("完了レポート")
    _log(f"  所要時間:     {elapsed:.1f}秒")
    _log(f"  品質:         {quality}")
    _log(f"  .blend:       {blend_path}")
    _log(f"  レンダリング: {len(rendered_files)} 枚")
    for f in rendered_files:
        _log(f"    → {f}")
    _log("=" * 60)


if __name__ == "__main__":
    main()
