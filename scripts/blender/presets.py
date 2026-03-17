"""
Blender パース制作標準プリセット
建築パース制作に必要なカメラ・照明・レンダリング設定を集約
"""
import bpy
import math


# ============================================================
# レンダリング品質プリセット
# ============================================================
RENDER_QUALITY = {
    'preview': {
        'samples': 32,
        'resolution_x': 1920,
        'resolution_y': 1080,
        'use_denoiser': True,
        'denoiser': 'OPENIMAGEDENOISE',
        'time_limit': 60,
    },
    'draft': {
        'samples': 64,
        'resolution_x': 2560,
        'resolution_y': 1440,
        'use_denoiser': True,
        'denoiser': 'OPENIMAGEDENOISE',
        'time_limit': 180,
    },
    'production': {
        'samples': 256,
        'resolution_x': 3840,
        'resolution_y': 2160,
        'use_denoiser': True,
        'denoiser': 'OPENIMAGEDENOISE',
        'time_limit': 600,
    },
    'ultra': {
        'samples': 512,
        'resolution_x': 3840,
        'resolution_y': 2160,
        'use_denoiser': True,
        'denoiser': 'OPENIMAGEDENOISE',
        'time_limit': 1200,
    },
}


# ============================================================
# カメラプリセット（建築パース用）
# ============================================================
CAMERA_PRESETS = {
    # 人の目線高さからの標準アングル
    'eye_level': {
        'height_m': 1.5,
        'fov_deg': 50,
        'description': '人の目線高さ。最も自然な印象',
    },
    # カウンター越しの視点
    'counter_view': {
        'height_m': 1.1,
        'fov_deg': 45,
        'description': 'カウンターに座った客の視点',
    },
    # やや高めの俯瞰
    'overview': {
        'height_m': 2.2,
        'fov_deg': 55,
        'pitch_deg': -15,
        'description': '全体を見渡す俯瞰。空間把握用',
    },
    # ローアングル（迫力重視）
    'low_angle': {
        'height_m': 0.8,
        'fov_deg': 40,
        'description': '低い位置から見上げる。天井の印象を強調',
    },
    # コーナーからの対角線ショット
    'corner_diagonal': {
        'height_m': 1.5,
        'fov_deg': 60,
        'description': '部屋のコーナーから対角線方向。空間の広がりを表現',
    },
    # 入口からの第一印象
    'entrance': {
        'height_m': 1.6,
        'fov_deg': 55,
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
        'description': '昼間の自然光。窓からの光を重視',
    },
    'evening': {
        'sun_strength': 1.0,
        'sun_angle': (math.radians(15), 0, math.radians(-60)),
        'ambient_strength': 0.3,
        'color_temp_k': 3500,
        'description': '夕方の暖かい光。雰囲気重視',
    },
    'night_warm': {
        'sun_strength': 0,
        'ambient_strength': 0.1,
        'point_lights': True,
        'color_temp_k': 2700,
        'description': '夜の室内照明。暖色LED',
    },
    'night_cool': {
        'sun_strength': 0,
        'ambient_strength': 0.1,
        'point_lights': True,
        'color_temp_k': 4000,
        'description': '夜の室内照明。白色LED',
    },
    'showroom': {
        'sun_strength': 0,
        'ambient_strength': 0.2,
        'point_lights': True,
        'color_temp_k': 5000,
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
        'roughness': 0.85,
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
    """レンダリング品質プリセットを適用"""
    preset = RENDER_QUALITY.get(quality, RENDER_QUALITY['preview'])
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = preset['samples']
    scene.render.resolution_x = preset['resolution_x']
    scene.render.resolution_y = preset['resolution_y']
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    # デノイザー
    if preset['use_denoiser']:
        scene.cycles.use_denoising = True
        scene.cycles.denoiser = preset['denoiser']

    # GPU自動検出
    _detect_gpu()

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


def setup_camera_from_preset(preset_name, room_center, room_width, room_depth):
    """カメラプリセットを適用してカメラを配置"""
    preset = CAMERA_PRESETS.get(preset_name)
    if not preset:
        print(f"Warning: Unknown camera preset '{preset_name}'")
        return None

    cam_data = bpy.data.cameras.new(name=f"Camera_{preset_name}")
    cam_data.lens = _fov_to_focal_length(preset['fov_deg'])
    cam_data.clip_start = 0.1
    cam_data.clip_end = 100

    cam_obj = bpy.data.objects.new(f"Camera_{preset_name}", cam_data)
    bpy.context.collection.objects.link(cam_obj)

    # 位置はコーナーから対角線方向をデフォルトに
    margin = 0.3  # 壁からの距離(m)
    cam_x = room_center[0] - room_width / 2 + margin
    cam_z = room_center[1] - room_depth / 2 + margin
    cam_y = preset['height_m']

    cam_obj.location = (cam_x, cam_z, cam_y)

    # 部屋中心を向く
    direction = (
        room_center[0] - cam_x,
        room_center[1] - cam_z,
        preset.get('height_m', 1.5) * 0.7 - cam_y
    )

    import mathutils
    rot = mathutils.Vector(direction).to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot.to_euler()

    return cam_obj


def _fov_to_focal_length(fov_deg, sensor_width=36):
    """FOV(度)を焦点距離(mm)に変換"""
    return sensor_width / (2 * math.tan(math.radians(fov_deg / 2)))


def _detect_gpu():
    """GPU自動検出: CUDA → OPTIX → CPU"""
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
                    print(f"GPU detected: {compute_type}")
                    return
            except Exception:
                continue
    print("No GPU detected, using CPU")
    bpy.context.scene.cycles.device = 'CPU'
