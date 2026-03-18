"""
Blender パース制作標準プリセット
建築パース制作に必要なカメラ・照明・レンダリング設定を集約

改善点:
- レンダリング品質: preview 32→64サンプル、適応サンプリング最適化
- カラーマネジメント: AgX exposure 0.0（暗すぎ修正）、Punchy look
- ライトバウンス: diffuse 6→8、transparent 8→12、Fast GI有効化
- カメラプリセット: 対角線構図、被写界深度対応
"""
import bpy
import math


# ============================================================
# レンダリング品質プリセット（ノイズ低減・品質向上）
# ============================================================
RENDER_QUALITY = {
    'preview': {
        'samples': 64,           # 32→64（ノイズ大幅減）
        'resolution_x': 1920,
        'resolution_y': 1080,
        'use_denoiser': True,
        'denoiser': 'OPENIMAGEDENOISE',
        'time_limit': 90,        # 60→90（品質向上分）
        'adaptive_threshold': 0.05,  # 高速化しつつ品質維持
    },
    'draft': {
        'samples': 128,          # 64→128
        'resolution_x': 2560,
        'resolution_y': 1440,
        'use_denoiser': True,
        'denoiser': 'OPENIMAGEDENOISE',
        'time_limit': 240,       # 180→240
        'adaptive_threshold': 0.02,
    },
    'production': {
        'samples': 256,
        'resolution_x': 3840,
        'resolution_y': 2160,
        'use_denoiser': True,
        'denoiser': 'OPENIMAGEDENOISE',
        'time_limit': 600,
        'adaptive_threshold': 0.01,
    },
    'ultra': {
        'samples': 512,
        'resolution_x': 3840,
        'resolution_y': 2160,
        'use_denoiser': True,
        'denoiser': 'OPENIMAGEDENOISE',
        'time_limit': 1200,
        'adaptive_threshold': 0.005,
    },
}


# ============================================================
# カメラプリセット（建築パース用 — 被写界深度対応）
# ============================================================
CAMERA_PRESETS = {
    # 人の目線高さからの標準アングル（室内パースは広角が基本）
    'eye_level': {
        'height_m': 1.5,
        'fov_deg': 65,
        'dof_fstop': 8.0,        # f/8 — ほぼパンフォーカス
        'description': '人の目線高さ。室内パース標準の広角',
    },
    # カウンター越しの視点
    'counter_view': {
        'height_m': 1.1,
        'fov_deg': 45,
        'dof_fstop': 5.6,        # f/5.6 — 適度なボケ
        'description': 'カウンターに座った客の視点',
    },
    # やや高めの俯瞰
    'overview': {
        'height_m': 2.2,
        'fov_deg': 55,
        'pitch_deg': -15,
        'dof_fstop': 11.0,       # f/11 — 全体にピント
        'description': '全体を見渡す俯瞰。空間把握用',
    },
    # ローアングル（迫力重視）
    'low_angle': {
        'height_m': 0.8,
        'fov_deg': 40,
        'dof_fstop': 5.6,
        'description': '低い位置から見上げる。天井の印象を強調',
    },
    # コーナーからの対角線ショット（空間を最大限に見せる）
    'corner_diagonal': {
        'height_m': 1.2,
        'fov_deg': 70,            # 60→70（より広角で開放感）
        'dof_fstop': 8.0,
        'description': '部屋のコーナーから対角線方向。空間の広がりを最大限に表現',
    },
    # 入口からの第一印象
    'entrance': {
        'height_m': 1.5,
        'fov_deg': 60,            # 55→60（入口は広く見せる）
        'dof_fstop': 8.0,
        'description': '入口に立った時の第一印象',
    },
}


# ============================================================
# 照明プリセット
# ============================================================
LIGHTING_PRESETS = {
    'daylight': {
        'sun_strength': 3.0,
        'sun_angle': (math.radians(45), 0, math.radians(-30)),
        'ambient_strength': 0.5,
        'color_temp_k': 5500,
        'environment_strength': 0.3,   # プロシージャルスカイ環境の強度
        'description': '昼間の自然光。窓からの光を重視',
    },
    'evening': {
        'sun_strength': 1.0,
        'sun_angle': (math.radians(15), 0, math.radians(-60)),
        'ambient_strength': 0.3,
        'color_temp_k': 3500,
        'environment_strength': 0.15,
        'description': '夕方の暖かい光。雰囲気重視',
    },
    'night_warm': {
        'sun_strength': 0,
        'ambient_strength': 0.1,
        'point_lights': True,
        'color_temp_k': 2700,
        'environment_strength': 0.05,
        'description': '夜の室内照明。暖色LED',
    },
    'night_cool': {
        'sun_strength': 0,
        'ambient_strength': 0.1,
        'point_lights': True,
        'color_temp_k': 4000,
        'environment_strength': 0.05,
        'description': '夜の室内照明。白色LED',
    },
    'showroom': {
        'sun_strength': 0,
        'ambient_strength': 0.2,
        'point_lights': True,
        'color_temp_k': 5000,
        'environment_strength': 0.1,
        'description': 'ショールーム照明。均一で明るい',
    },
}


# ============================================================
# 建築マテリアルプリセット
# ============================================================
MATERIAL_PRESETS = {
    # --- 壁 ---
    'wall_white': {
        'base_color': (0.9, 0.9, 0.88, 1.0),
        'roughness': 0.45,
        'metallic': 0.0,
    },
    'wall_concrete': {
        'base_color': (0.65, 0.63, 0.60, 1.0),
        'roughness': 0.9,
        'metallic': 0.0,
    },
    'wall_mortar': {
        'base_color': (0.82, 0.80, 0.76, 1.0),
        'roughness': 0.92,
        'metallic': 0.0,
    },
    # --- 床 ---
    'floor_oak': {
        'base_color': (0.55, 0.38, 0.22, 1.0),
        'roughness': 0.55,
        'metallic': 0.0,
    },
    'floor_walnut': {
        'base_color': (0.35, 0.22, 0.12, 1.0),
        'roughness': 0.50,
        'metallic': 0.0,
    },
    'floor_tile_white': {
        'base_color': (0.92, 0.91, 0.88, 1.0),
        'roughness': 0.3,
        'metallic': 0.0,
    },
    'floor_terrazzo': {
        'base_color': (0.85, 0.83, 0.80, 1.0),
        'roughness': 0.35,
        'metallic': 0.0,
    },
    'floor_mortar': {
        'base_color': (0.72, 0.70, 0.67, 1.0),
        'roughness': 0.88,
        'metallic': 0.0,
    },
    # --- 天井 ---
    'ceiling_white': {
        'base_color': (0.95, 0.95, 0.93, 1.0),
        'roughness': 0.9,
        'metallic': 0.0,
    },
    'ceiling_wood': {
        'base_color': (0.62, 0.45, 0.28, 1.0),
        'roughness': 0.6,
        'metallic': 0.0,
    },
    # --- 金属 ---
    'metal_black': {
        'base_color': (0.02, 0.02, 0.02, 1.0),
        'roughness': 0.25,
        'metallic': 0.95,
    },
    'metal_brass': {
        'base_color': (0.80, 0.60, 0.20, 1.0),
        'roughness': 0.3,
        'metallic': 0.95,
    },
    'metal_stainless': {
        'base_color': (0.75, 0.75, 0.75, 1.0),
        'roughness': 0.2,
        'metallic': 0.95,
    },
    # --- ガラス ---
    'glass_clear': {
        'base_color': (0.95, 0.95, 0.95, 1.0),
        'roughness': 0.0,
        'metallic': 0.0,
        'transmission': 0.95,
        'ior': 1.5,
    },
    'glass_frosted': {
        'base_color': (0.92, 0.92, 0.92, 1.0),
        'roughness': 0.4,
        'metallic': 0.0,
        'transmission': 0.8,
        'ior': 1.5,
    },
    # --- 木材 ---
    'wood_light': {
        'base_color': (0.72, 0.55, 0.35, 1.0),
        'roughness': 0.55,
        'metallic': 0.0,
    },
    'wood_medium': {
        'base_color': (0.50, 0.35, 0.20, 1.0),
        'roughness': 0.50,
        'metallic': 0.0,
    },
    'wood_dark': {
        'base_color': (0.25, 0.15, 0.08, 1.0),
        'roughness': 0.45,
        'metallic': 0.0,
    },
    # --- レザー・ファブリック ---
    'leather_black': {
        'base_color': (0.05, 0.04, 0.04, 1.0),
        'roughness': 0.65,
        'metallic': 0.0,
    },
    'leather_brown': {
        'base_color': (0.40, 0.25, 0.12, 1.0),
        'roughness': 0.60,
        'metallic': 0.0,
    },
    'fabric_gray': {
        'base_color': (0.45, 0.44, 0.42, 1.0),
        'roughness': 0.95,
        'metallic': 0.0,
    },
}


# ============================================================
# 天井高さプリセット（用途別）
# ============================================================
CEILING_HEIGHT_MM = {
    'residential': 2400,
    'office': 2700,
    'retail': 3000,
    'cafe': 2800,
    'restaurant': 3000,
    'bar': 2700,
    'salon': 2600,
    'clinic': 2700,
    'warehouse': 4000,
}


# ============================================================
# ヘルパー関数
# ============================================================
def apply_render_quality(quality='preview'):
    """レンダリング品質プリセットを適用（間接光・カラマネ強化版）"""
    preset = RENDER_QUALITY.get(quality, RENDER_QUALITY['preview'])
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = preset['samples']
    scene.render.resolution_x = preset['resolution_x']
    scene.render.resolution_y = preset['resolution_y']
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.compression = 15

    # デノイザー
    if preset['use_denoiser']:
        scene.cycles.use_denoising = True
        scene.cycles.denoiser = preset['denoiser']

    # 適応サンプリング（品質プリセット別の閾値）
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = preset.get('adaptive_threshold', 0.01)

    # -----------------------------------------------------------------------
    # ライトバウンス（間接光の品質向上）
    # -----------------------------------------------------------------------
    scene.cycles.max_bounces = 12
    scene.cycles.diffuse_bounces = 8       # 6→8（間接光強化）
    scene.cycles.glossy_bounces = 6
    scene.cycles.transmission_bounces = 12
    scene.cycles.transparent_max_bounces = 12  # 8→12

    # Fast GI — 品質/速度のバランス向上
    scene.cycles.use_fast_gi = True
    scene.cycles.fast_gi_method = 'REPLACE'

    # -----------------------------------------------------------------------
    # カラーマネジメント（AgX最適化）
    # -----------------------------------------------------------------------
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'  # コントラスト強めで印象的
    scene.view_settings.exposure = 0.0          # -0.2→0.0（暗すぎ修正）
    scene.view_settings.gamma = 1.0

    # 単位
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0

    # GPU自動検出
    _detect_gpu()

    print(f"[presets] レンダリング品質: {quality} "
          f"({preset['resolution_x']}x{preset['resolution_y']}, "
          f"{preset['samples']}samples, "
          f"adaptive={preset.get('adaptive_threshold', 0.01)}, "
          f"diffuse_bounces=8, Fast GI=ON, exposure=0.0)")

    return preset


def apply_material_preset(obj, preset_name):
    """マテリアルプリセットをオブジェクトに適用"""
    preset = MATERIAL_PRESETS.get(preset_name)
    if not preset:
        print(f"Warning: Unknown material preset '{preset_name}'")
        return None

    mat = bpy.data.materials.new(name=preset_name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]

    bsdf.inputs["Base Color"].default_value = preset['base_color']
    bsdf.inputs["Roughness"].default_value = preset['roughness']
    bsdf.inputs["Metallic"].default_value = preset['metallic']

    if 'transmission' in preset:
        bsdf.inputs["Transmission Weight"].default_value = preset['transmission']
    if 'ior' in preset:
        bsdf.inputs["IOR"].default_value = preset['ior']

    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)

    return mat


def setup_camera_from_preset(preset_name, room_center, room_width, room_depth,
                              wall_thickness=0.12):
    """カメラプリセットを適用してカメラを配置（被写界深度対応）

    TrackTo制約でターゲット（部屋中心）を安定追従する。
    マージンは部屋サイズに応じて自動計算。

    改善点:
    - 壁からの最低マージン0.3m確保
    - 被写界深度の自動設定
    - ターゲットを部屋中心より奥寄りに（奥行き感）

    Args:
        preset_name: CAMERA_PRESETS のキー名
        room_center: 部屋中心座標 (x, y) in Blender coords
        room_width: 部屋の幅 (m)
        room_depth: 部屋の奥行き (m)
        wall_thickness: 壁厚 (m)
    """
    preset = CAMERA_PRESETS.get(preset_name)
    if not preset:
        print(f"[presets] 未知のカメラプリセット '{preset_name}', eye_levelを使用")
        preset = CAMERA_PRESETS['eye_level']

    cam_data = bpy.data.cameras.new(name=f"Camera_{preset_name}")
    cam_data.lens = _fov_to_focal_length(preset['fov_deg'])
    cam_data.clip_start = 0.05
    cam_data.clip_end = 100
    cam_data.sensor_width = 36

    cam_obj = bpy.data.objects.new(f"Camera_{preset_name}", cam_data)
    bpy.context.collection.objects.link(cam_obj)

    # マージン: 壁厚+余裕。壁から最低0.3m離す
    min_dim = min(room_width, room_depth)
    margin = max(
        wall_thickness + 0.5,
        min_dim * 0.2,
        (room_width + room_depth) / 8,
        0.3,  # 最低0.3m保証
    )

    # コーナーに配置（部屋の(-x, -y)角からmargin内側）
    cam_x = room_center[0] - room_width / 2 + margin
    cam_y = room_center[1] - room_depth / 2 + margin
    cam_z = preset['height_m']

    cam_obj.location = (cam_x, cam_y, cam_z)

    # ターゲット: 部屋中心よりやや奥（奥行き感を出す）
    target_x = room_center[0] + room_width * 0.05  # 中心よりやや奥
    target_y = room_center[1] + room_depth * 0.1   # 中心よりやや奥
    target_z = preset['height_m'] * 0.7

    target_empty = bpy.data.objects.new(f"Camera_{preset_name}_Target", None)
    bpy.context.collection.objects.link(target_empty)
    target_empty.location = (target_x, target_y, target_z)
    target_empty.empty_display_size = 0.1

    # TrackTo制約で安定したカメラ追従
    constraint = cam_obj.constraints.new('TRACK_TO')
    constraint.target = target_empty
    constraint.track_axis = 'TRACK_NEGATIVE_Z'
    constraint.up_axis = 'UP_Y'

    # 被写界深度の設定
    dof_fstop = preset.get('dof_fstop')
    if dof_fstop is not None:
        cam_data.dof.use_dof = True
        dx = target_x - cam_x
        dy = target_y - cam_y
        dz = target_z - cam_z
        dist = math.sqrt(dx*dx + dy*dy + dz*dz)
        cam_data.dof.focus_distance = dist * 0.8
        cam_data.dof.aperture_fstop = dof_fstop

    print(f"[presets] カメラ '{preset_name}': "
          f"loc=({cam_x:.2f}, {cam_y:.2f}, {cam_z:.2f}), "
          f"target=({target_x:.2f}, {target_y:.2f}, {target_z:.2f}), "
          f"lens={cam_data.lens:.1f}mm, margin={margin:.2f}m"
          + (f", DOF f/{dof_fstop}" if dof_fstop else ""))

    return cam_obj


def _fov_to_focal_length(fov_deg, sensor_width=36):
    """FOV(度)を焦点距離(mm)に変換"""
    return sensor_width / (2 * math.tan(math.radians(fov_deg / 2)))


def _detect_gpu():
    """GPU自動検出: OPTIX → CUDA → CPU"""
    prefs = bpy.context.preferences.addons.get('cycles')
    if prefs:
        cprefs = prefs.preferences
        for compute_type in ('OPTIX', 'CUDA', 'NONE'):
            try:
                cprefs.compute_device_type = compute_type
                cprefs.get_devices()
                for device in cprefs.devices:
                    device.use = True
                if compute_type != 'NONE':
                    bpy.context.scene.cycles.device = 'GPU'
                    print(f"GPU検出: {compute_type}")
                    return
            except Exception:
                continue
    print("GPU未検出、CPUを使用")
    bpy.context.scene.cycles.device = 'CPU'
