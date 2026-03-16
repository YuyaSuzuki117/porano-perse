"""
Blender 内装パース制作セットアップスクリプト
============================================
使い方: blender --background --python scripts/blender-setup.py

- 日本語UI設定
- EEVEE Next レンダラー最適化（Intel Iris Xe対応）
- 内装パース向けカラーマネジメント
- デフォルトシーン設定（部屋サイズ・カメラ・照明）
- GLB出力プリセット
"""

import bpy
import os

def setup_japanese():
    """日本語UI設定"""
    prefs = bpy.context.preferences
    prefs.view.language = 'ja_JP'
    prefs.view.use_translate_interface = True
    prefs.view.use_translate_tooltips = True
    prefs.view.use_translate_new_dataname = False  # データ名は英語のまま（スクリプト互換性）
    print("[Setup] 日本語UI設定完了")

def setup_eevee_interior():
    """EEVEE Next 内装パース向け最適化"""
    scene = bpy.context.scene

    # レンダラー: EEVEE（Intel Iris Xe対応、高速）
    scene.render.engine = 'BLENDER_EEVEE'

    # 解像度: 軽量設定（AIエージェント向け — 必要時にスクリプトで上げる）
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100

    # サンプル数を最小に（軽量化 — ヘッドレス実行高速化）
    try:
        scene.eevee.taa_render_samples = 32  # デフォルト64→32
        scene.eevee.taa_samples = 16  # ビューポート
    except:
        pass

    # EEVEE品質設定（内装向け最適化）
    eevee = scene.eevee

    # レイトレーシング（Blender 4.4 EEVEE Next）
    try:
        eevee.use_raytracing = True
        eevee.ray_tracing_method = 'SCREEN'  # スクリーンスペース
        print("[Setup] EEVEE レイトレーシング有効化")
    except AttributeError:
        print("[Setup] EEVEE レイトレーシング設定スキップ（バージョン非対応）")

    # シャドウ
    try:
        eevee.shadow_cube_size = '1024'
        eevee.shadow_cascade_size = '2048'
        eevee.use_shadow_high_bitdepth = True
        eevee.use_soft_shadows = True
    except AttributeError:
        pass

    # スクリーンスペースリフレクション
    try:
        eevee.use_ssr = True
        eevee.use_ssr_refraction = True
        eevee.ssr_quality = 0.5
        eevee.ssr_thickness = 0.1
    except AttributeError:
        pass

    # アンビエントオクルージョン
    try:
        eevee.use_gtao = True
        eevee.gtao_distance = 1.0
        eevee.gtao_quality = 0.5
    except AttributeError:
        pass

    # ブルーム（照明のグロー効果）
    try:
        eevee.use_bloom = True
        eevee.bloom_threshold = 0.8
        eevee.bloom_intensity = 0.05
    except AttributeError:
        pass

    # カラーマネジメント（内装パース向け）
    scene.view_settings.view_transform = 'AgX'  # Blender 4.x推奨
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    # 出力設定
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.compression = 15

    # フィルム
    scene.render.film_transparent = False  # 内装は背景あり

    print("[Setup] EEVEE 内装パース最適化完了")

def setup_default_interior_scene():
    """デフォルト内装シーン設定"""
    # 既存オブジェクトを削除
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    # --- カメラ設定（内装パース標準） ---
    bpy.ops.object.camera_add(
        location=(3.0, -3.0, 1.7),  # 部屋コーナーから
        rotation=(1.396, 0, 0.785)  # 対角を見る（80度上向き、45度回転）
    )
    camera = bpy.context.active_object
    camera.name = "InteriorCamera"
    camera.data.lens = 24  # 広角（内装パース標準）
    camera.data.clip_start = 0.01
    camera.data.clip_end = 100
    camera.data.sensor_width = 36  # フルフレーム相当
    bpy.context.scene.camera = camera

    # --- 照明設定（3点照明 + 環境光） ---

    # メインライト（天窓シミュレーション）
    bpy.ops.object.light_add(
        type='AREA',
        location=(0, 0, 2.65),
        rotation=(0, 0, 0)
    )
    main_light = bpy.context.active_object
    main_light.name = "CeilingLight"
    main_light.data.energy = 200  # EEVEE用
    main_light.data.size = 3.0
    main_light.data.color = (1.0, 0.95, 0.9)  # 暖色照明
    main_light.data.use_shadow = True

    # フィルライト（窓からの自然光シミュレーション）
    bpy.ops.object.light_add(
        type='AREA',
        location=(3.5, 0, 1.5),
        rotation=(0, 1.57, 0)
    )
    fill_light = bpy.context.active_object
    fill_light.name = "WindowLight"
    fill_light.data.energy = 100
    fill_light.data.size = 2.0
    fill_light.data.color = (0.9, 0.95, 1.0)  # 冷色（自然光）
    fill_light.data.use_shadow = True

    # アクセントライト（ダウンライト）
    bpy.ops.object.light_add(
        type='POINT',
        location=(0, -1.5, 2.6)
    )
    accent_light = bpy.context.active_object
    accent_light.name = "DownLight"
    accent_light.data.energy = 50
    accent_light.data.color = (1.0, 0.92, 0.85)
    accent_light.data.shadow_soft_size = 0.1
    accent_light.data.use_shadow = True

    # --- 部屋の箱（6m x 6m x 2.7m） ---
    room_width = 6.0
    room_depth = 6.0
    room_height = 2.7

    # 床
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "Floor"
    floor.scale = (room_width / 2, room_depth / 2, 1)

    # 床マテリアル（フローリング）
    floor_mat = bpy.data.materials.new(name="FlooringMaterial")
    floor_mat.use_nodes = True
    nodes = floor_mat.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    if principled:
        principled.inputs['Base Color'].default_value = (0.45, 0.32, 0.22, 1.0)
        principled.inputs['Roughness'].default_value = 0.6
        principled.inputs['Specular IOR Level'].default_value = 0.3
    floor.data.materials.append(floor_mat)

    # 壁（4面）
    wall_configs = [
        {"name": "WallBack", "loc": (0, room_depth/2, room_height/2), "scale": (room_width/2, 1, room_height/2), "rot": (1.5708, 0, 0)},
        {"name": "WallFront", "loc": (0, -room_depth/2, room_height/2), "scale": (room_width/2, 1, room_height/2), "rot": (1.5708, 0, 3.1416)},
        {"name": "WallLeft", "loc": (-room_width/2, 0, room_height/2), "scale": (1, room_depth/2, room_height/2), "rot": (1.5708, 0, -1.5708)},
        {"name": "WallRight", "loc": (room_width/2, 0, room_height/2), "scale": (1, room_depth/2, room_height/2), "rot": (1.5708, 0, 1.5708)},
    ]

    wall_mat = bpy.data.materials.new(name="WallMaterial")
    wall_mat.use_nodes = True
    wall_nodes = wall_mat.node_tree.nodes
    wall_principled = wall_nodes.get("Principled BSDF")
    if wall_principled:
        wall_principled.inputs['Base Color'].default_value = (0.92, 0.90, 0.87, 1.0)
        wall_principled.inputs['Roughness'].default_value = 0.85

    for wc in wall_configs:
        bpy.ops.mesh.primitive_plane_add(size=1, location=wc["loc"], rotation=wc["rot"])
        wall = bpy.context.active_object
        wall.name = wc["name"]
        wall.scale = wc["scale"]
        wall.data.materials.append(wall_mat)

    # 天井
    bpy.ops.mesh.primitive_plane_add(
        size=1,
        location=(0, 0, room_height),
        rotation=(3.1416, 0, 0)
    )
    ceiling = bpy.context.active_object
    ceiling.name = "Ceiling"
    ceiling.scale = (room_width / 2, room_depth / 2, 1)

    ceiling_mat = bpy.data.materials.new(name="CeilingMaterial")
    ceiling_mat.use_nodes = True
    ceil_nodes = ceiling_mat.node_tree.nodes
    ceil_principled = ceil_nodes.get("Principled BSDF")
    if ceil_principled:
        ceil_principled.inputs['Base Color'].default_value = (0.95, 0.95, 0.95, 1.0)
        ceil_principled.inputs['Roughness'].default_value = 0.9
    ceiling.data.materials.append(ceiling_mat)

    print(f"[Setup] デフォルト内装シーン作成完了 ({room_width}m x {room_depth}m x {room_height}m)")

def setup_glb_export_preset():
    """GLB出力プリセット設定"""
    # GLB出力用のカスタムプロパティ
    scene = bpy.context.scene
    scene["glb_export_path"] = "//output/"
    scene["glb_draco_compression"] = True
    scene["glb_texture_size"] = 1024
    print("[Setup] GLB出力プリセット設定完了")

def setup_workspace():
    """内装パース向けワークスペース設定"""
    prefs = bpy.context.preferences

    # アドオン有効化
    addons_to_enable = [
        'io_scene_gltf2',        # GLTF/GLBインポート/エクスポート
        'node_wrangler',          # ノードエディタ強化
        'mesh_looptools',         # メッシュ編集強化
    ]

    for addon in addons_to_enable:
        try:
            bpy.ops.preferences.addon_enable(module=addon)
            print(f"[Setup] アドオン有効化: {addon}")
        except Exception as e:
            print(f"[Setup] アドオン有効化スキップ: {addon} ({e})")

    # 単位系: メートル
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = 'METERS'

    # ビューポート設定
    prefs.view.show_developer_ui = False

    print("[Setup] ワークスペース設定完了")

def save_startup():
    """設定をスタートアップファイルとして保存"""
    config_dir = bpy.utils.user_resource('CONFIG')
    startup_path = os.path.join(config_dir, "startup.blend")

    # ユーザー設定を保存
    bpy.ops.wm.save_userpref()

    # スタートアップファイルを保存
    bpy.ops.wm.save_as_mainfile(filepath=startup_path)

    print(f"[Setup] スタートアップファイル保存: {startup_path}")

def main():
    print("=" * 60)
    print("Blender 内装パース制作セットアップ")
    print("=" * 60)

    setup_japanese()
    setup_eevee_interior()
    setup_workspace()
    setup_default_interior_scene()
    setup_glb_export_preset()
    save_startup()

    print("=" * 60)
    print("セットアップ完了！")
    print("=" * 60)
    print("")
    print("次のステップ:")
    print("  1. blender でGUIを起動して確認")
    print("  2. blender --background --python scripts/render-interior.py でヘッドレスレンダリング")
    print("  3. 家具GLBモデルの作成/インポート")

if __name__ == "__main__":
    main()
