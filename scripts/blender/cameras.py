"""プロフェッショナル内装パース用カメラ自動配置

カメラ4台 + Emptyターゲット + TrackTo制約:
  1. Cam_Main     — 対角線構図（空間を最大限に見せる）
  2. Cam_Counter  — カウンター越しショット
  3. Cam_Window   — 窓側ビュー（自然光を活かす）
  4. Cam_TopDown  — 真上俯瞰

改善点:
  - 対角線配置で空間の広がりを最大化
  - 壁から最低0.3mのマージン確保
  - 広角レンズ (24-28mm) で開放感
  - 被写界深度の微妙なボケでプロ品質
  - ターゲットを部屋中心より奥に（奥行き感）
"""

import bpy
import math

from .core import link_to_collection


# ---------------------------------------------------------------------------
# カメラプリセット定義
# ---------------------------------------------------------------------------

CAMERA_PRESETS = {
    "interior_showcase": {
        # 対角線構図 — 空間を最大限に見せる
        "height": 1.2,
        "lens_mm": 24,
        "position_rule": "corner_to_opposite",
        "target_offset": (0.0, 0.0, -0.3),  # やや下向き
        "dof_fstop": 8.0,
        "description": "対角線構図。部屋全体を広く見せる",
    },
    "counter_detail": {
        # カウンター越しのショット
        "height": 1.1,
        "lens_mm": 35,
        "position_rule": "facing_counter",
        "target_offset": (0.0, 0.0, 0.0),
        "dof_fstop": 5.6,
        "description": "カウンター正面。ディテール重視",
    },
    "entrance_view": {
        # 入口からの第一印象
        "height": 1.5,
        "lens_mm": 28,
        "position_rule": "from_door",
        "target_offset": (0.0, 0.0, -0.15),
        "dof_fstop": 8.0,
        "description": "入口からの第一印象",
    },
    "overview": {
        # やや高めの俯瞰
        "height": 2.0,
        "lens_mm": 20,
        "position_rule": "corner_high",
        "target_offset": (0.0, 0.0, -0.5),
        "dof_fstop": 11.0,
        "description": "俯瞰。空間全体の把握用",
    },
}


# ---------------------------------------------------------------------------
# 内部ヘルパー
# ---------------------------------------------------------------------------

def _create_camera(name, location, target_location, lens, sensor_width=36,
                   collection=None, dof_fstop=None):
    """カメラとEmptyターゲットをTrackTo制約付きで生成

    bpy.opsを使わずにデータAPIで生成。

    Args:
        name: カメラオブジェクト名
        location: カメラ位置 (x, y, z)
        target_location: Emptyターゲット位置 (x, y, z)
        lens: 焦点距離 (mm)
        sensor_width: センサー幅 (mm)
        collection: リンク先コレクション（任意）
        dof_fstop: 被写界深度の絞り値（Noneで無効）

    Returns:
        Tuple (camera_object, empty_object)
    """
    # カメラデータ生成
    cam_data = bpy.data.cameras.new(name=name)
    cam_data.lens = lens
    cam_data.clip_start = 0.01  # 近接オブジェクトのクリッピング防止
    cam_data.clip_end = 50
    cam_data.sensor_width = sensor_width

    # 被写界深度（プロフェッショナル品質）
    if dof_fstop is not None:
        cam_data.dof.use_dof = True
        # フォーカス距離はターゲットまでの距離の80%に設定
        dx = target_location[0] - location[0]
        dy = target_location[1] - location[1]
        dz = target_location[2] - location[2]
        dist = math.sqrt(dx*dx + dy*dy + dz*dz)
        cam_data.dof.focus_distance = dist * 0.8
        cam_data.dof.aperture_fstop = dof_fstop

    # カメラオブジェクト生成
    cam_obj = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = location

    # ターゲットEmpty生成
    empty = bpy.data.objects.new(f"{name}_Target", None)
    bpy.context.collection.objects.link(empty)
    empty.location = target_location
    empty.empty_display_size = 0.1

    # TrackTo制約
    constraint = cam_obj.constraints.new('TRACK_TO')
    constraint.target = empty
    constraint.track_axis = 'TRACK_NEGATIVE_Z'
    constraint.up_axis = 'UP_Y'

    # コレクションにリンク
    if collection:
        link_to_collection(cam_obj, collection)
        link_to_collection(empty, collection)

    print(f"[cameras] {name} 生成 — lens={lens}mm, "
          f"loc=({location[0]:.2f}, {location[1]:.2f}, {location[2]:.2f})"
          + (f", DOF f/{dof_fstop}" if dof_fstop else ""))
    return cam_obj, empty


def _clamp_to_room(x, y, half_w, half_d, margin=0.3):
    """カメラ位置を壁から最低marginメートル離す"""
    x = max(-half_w + margin, min(half_w - margin, x))
    y = max(-half_d + margin, min(half_d - margin, y))
    return x, y


# ---------------------------------------------------------------------------
# メインエントリーポイント
# ---------------------------------------------------------------------------

def setup_cameras(scene_data, collections):
    """部屋寸法からプロフェッショナル品質の4カメラを自動配置

    改善点:
    - 対角線配置で空間の広がりを最大化
    - 壁から最低0.3m離す
    - 広角レンズ (24-28mm) で開放感
    - ターゲットを部屋中心より奥に（奥行き感）
    - 被写界深度の微妙なボケ

    Args:
        scene_data: シーンJSONデータ
        collections: コレクション名→bpy.types.Collection のマッピング
    """
    room = scene_data.get("room", {})
    W = float(room.get("width", 5.0))
    D = float(room.get("depth", 5.0))
    H = float(room.get("height", 3.0))

    cam_col = collections.get("05_Cameras")

    half_w = W / 2
    half_d = D / 2
    margin = max(0.5, min(W, D) * 0.12)  # 壁からの最小マージン（廻り縁干渉防止）

    # -------------------------------------------------------------------
    # Cam_Main: 対角線構図（角から対角を見る = 空間が最大に見える）
    # -------------------------------------------------------------------
    # カメラを(-x, -y)角に配置、対角方向を見る
    main_cam_x, main_cam_y = _clamp_to_room(
        -half_w + margin, -half_d + margin, half_w, half_d, margin
    )
    # ターゲットは中心よりやや対角寄り（奥行き感）
    main_target_x = half_w * 0.3
    main_target_y = half_d * 0.5

    # -------------------------------------------------------------------
    # Cam_Counter: カウンター正面（やや低め目線）
    # -------------------------------------------------------------------
    counter_cam_x, counter_cam_y = _clamp_to_room(
        0, -half_d + margin, half_w, half_d, margin
    )
    counter_target_y = half_d * 0.35

    # -------------------------------------------------------------------
    # Cam_Window: 窓側からの自然光ショット
    # -------------------------------------------------------------------
    window_cam_x, window_cam_y = _clamp_to_room(
        -half_w + margin, half_d * 0.15, half_w, half_d, margin
    )
    window_target_x = half_w * 0.2
    window_target_y = -half_d * 0.1

    # -------------------------------------------------------------------
    # カメラ定義: (名前, 位置, ターゲット, レンズ, DOF f値)
    # -------------------------------------------------------------------
    camera_defs = [
        (
            "Cam_Main",
            (main_cam_x, main_cam_y, 1.2),        # 日本人目線高1.2m
            (main_target_x, main_target_y, H * 0.35),
            24,   # 24mm広角 — 空間の広がりを最大化
            8.0,  # f/8 — ほぼパンフォーカスだが微妙なボケ
        ),
        (
            "Cam_Counter",
            (counter_cam_x, counter_cam_y, 1.1),   # カウンター目線
            (0, counter_target_y, H * 0.35),
            28,   # 28mm — やや広角
            5.6,  # f/5.6 — 適度なボケ
        ),
        (
            "Cam_Window",
            (window_cam_x, window_cam_y, 1.3),
            (window_target_x, window_target_y, H * 0.32),
            28,
            8.0,
        ),
        (
            "Cam_TopDown",
            (0, 0, H - 0.15),                     # 天井直下
            (0, 0, 0),
            14,   # 超広角で全体を捉える
            None, # 俯瞰はDOF不要
        ),
    ]

    first_cam = None
    for name, loc, target, lens, dof in camera_defs:
        cam, _empty = _create_camera(
            name=name,
            location=loc,
            target_location=target,
            lens=lens,
            sensor_width=36,
            collection=cam_col,
            dof_fstop=dof,
        )
        if first_cam is None:
            first_cam = cam

    # アクティブカメラ設定
    if first_cam:
        bpy.context.scene.camera = first_cam
        print(f"[cameras] アクティブカメラ: {first_cam.name}")

    print(f"[cameras] セットアップ完了 — {len(camera_defs)}台生成 "
          f"(対角線配置、DOF有効、壁マージン{margin:.2f}m)")
