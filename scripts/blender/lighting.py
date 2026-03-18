"""7層照明システム — シーンJSONから駆動 (Cycles).

レイヤー:
  1. プロシージャルスカイ環境 (Nishita + 暖色ミックス)
  2. 天井メインエリアライト (暖色、部屋サイズ連動)
  3. 窓自然光 — 外部バウンスライト (昼光色6500K相当)
  4. アクセントスポットライト
  5. ペンダントポイントライト (家具タイプ pendant_light)
  6. フィルライト (影なし、暗部補填)
  7. 窓外部サンパネル (大面積エリアライト)
"""

import bpy
import math

from .core import hex_to_rgba, to_blender, link_to_collection


# ---------------------------------------------------------------------------
# ヘルパー
# ---------------------------------------------------------------------------

def hex_to_linear(h):
    """16進カラー文字列を線形sRGB (r, g, b) に変換"""
    rgba = hex_to_rgba(h, alpha=1.0)
    return (rgba[0], rgba[1], rgba[2])


def _create_light_data(light_type, name, energy, color, size=None,
                       use_shadow=True, spot_size=None, spot_blend=None,
                       shadow_soft_size=None):
    """bpy.ops を使わずにライトデータ+オブジェクトを生成

    Returns:
        bpy.types.Object (ライトオブジェクト)
    """
    light_data = bpy.data.lights.new(name=name, type=light_type)
    light_data.energy = energy
    light_data.color = color
    light_data.use_shadow = use_shadow

    if light_type == 'AREA' and size is not None:
        light_data.size = size
    if light_type == 'SPOT':
        if spot_size is not None:
            light_data.spot_size = spot_size
        if spot_blend is not None:
            light_data.spot_blend = spot_blend
    if light_type == 'POINT' and shadow_soft_size is not None:
        light_data.shadow_soft_size = shadow_soft_size

    obj = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------------------
# プロシージャルスカイ環境（HDRIの代替）
# ---------------------------------------------------------------------------

def setup_hdri_environment(strength=0.3, sun_elevation_deg=45,
                           sun_rotation_deg=180, warm_tint_factor=0.7):
    """プロシージャルスカイ環境を設定（外部HDRIファイル不要）

    Nishitaスカイモデルで自然な昼光を生成し、
    暖色ティントとミックスして室内パース向きの環境光にする。

    Args:
        strength: 環境光の強度
        sun_elevation_deg: 太陽の仰角（度）
        sun_rotation_deg: 太陽の方位角（度）
        warm_tint_factor: 暖色ティントの混合比率 (0=スカイのみ, 1=暖色のみ)
    """
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    # スカイテクスチャ — Blender 5.0互換
    sky = nodes.new('ShaderNodeTexSky')
    # Blender 5.0: NISHITA廃止 → HOSEK_WILKIEを使用
    sky.sky_type = 'HOSEK_WILKIE'
    sky.sun_direction = (
        math.cos(math.radians(sun_elevation_deg)) * math.cos(math.radians(sun_rotation_deg)),
        math.cos(math.radians(sun_elevation_deg)) * math.sin(math.radians(sun_rotation_deg)),
        math.sin(math.radians(sun_elevation_deg)),
    )
    sky.turbidity = 2.5
    sky.ground_albedo = 0.3
    sky.location = (-400, 300)

    # 暖色ティントとミックス（室内の温かみを出す）
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MIX'
    mix.inputs['Factor'].default_value = warm_tint_factor
    # Color A = スカイ色、Color B = 暖色白
    mix.inputs['B'].default_value = (1.0, 0.95, 0.9, 1.0)
    mix.location = (-200, 300)
    links.new(sky.outputs['Color'], mix.inputs['A'])

    # バックグラウンドノード
    bg = nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = strength
    bg.location = (0, 300)
    links.new(mix.outputs['Result'], bg.inputs['Color'])

    # ワールド出力
    output = nodes.new('ShaderNodeOutputWorld')
    output.location = (200, 300)
    links.new(bg.outputs['Background'], output.inputs['Surface'])

    print(f"[lighting] プロシージャルスカイ環境設定完了 — "
          f"strength={strength}, sun_elev={sun_elevation_deg}°")


# ---------------------------------------------------------------------------
# メインエントリーポイント
# ---------------------------------------------------------------------------

def setup_lighting(scene_data, collections):
    """シーンデータから7層照明をセットアップ

    後方互換: 既存の引数シグネチャを維持。
    """
    room = scene_data.get("room", {})
    style = scene_data.get("style", {})
    openings = scene_data.get("openings", [])
    furniture = scene_data.get("furniture", [])

    W = float(room.get("width", 5.0))
    D = float(room.get("depth", 5.0))
    H = float(room.get("height", 3.0))

    spot_intensity = float(style.get("spotlightIntensity", 1.0))
    spot_color_hex = style.get("spotlightColor", "#FFD090")
    sky_color_hex = style.get("hemisphereSkyColor", "#C8D8E8")

    spot_color = hex_to_linear(spot_color_hex)
    sky_color = hex_to_linear(sky_color_hex)

    lighting_col = collections.get("04_Lighting")

    room_area = W * D
    area_scale = math.sqrt(room_area / 20.0)  # 20m²を基準(1.0)

    # -----------------------------------------------------------------------
    # レイヤー1: プロシージャルスカイ環境（HDRIの代替）
    # -----------------------------------------------------------------------
    setup_hdri_environment(strength=0.3)

    # -----------------------------------------------------------------------
    # レイヤー2: 天井メインエリアライト — 暖色4000K相当、部屋サイズ連動
    # -----------------------------------------------------------------------
    ceiling_energy = spot_intensity * 120 * area_scale  # 80→120に増加

    ceiling_light = _create_light_data(
        'AREA', "Light_Ceiling_Main",
        energy=ceiling_energy,
        color=(1.0, 0.95, 0.9),  # 暖色4000K相当
        size=max(W, D) * 0.6,    # 部屋の60%サイズ（ソフトシャドウ）
        use_shadow=True,
    )
    ceiling_light.location = (0, 0, H - 0.05)
    if lighting_col:
        link_to_collection(ceiling_light, lighting_col)
    print(f"[lighting] レイヤー2: 天井メイン — energy={ceiling_energy:.0f} "
          f"(area_scale={area_scale:.2f}), size={max(W, D) * 0.6:.1f}m")

    # -----------------------------------------------------------------------
    # レイヤー3: 窓自然光 — 内側エリアライト + 外部サンパネル
    # -----------------------------------------------------------------------
    win_count = 0
    for idx, opening in enumerate(openings):
        if opening.get("type") != "window":
            continue

        wall = opening.get("wall", "north")
        pos_along = float(opening.get("positionAlongWall", W / 2))
        ow = float(opening.get("width", 1.0))
        oh = float(opening.get("height", 1.2))
        elev = float(opening.get("elevation", 0.9))

        # 壁別の位置・回転計算
        if wall == "north":
            cx = -W / 2 + pos_along
            loc = (cx, D / 2 - 0.3, elev + oh / 2)
            rot = (math.pi / 2, 0, 0)
            # 外部パネル位置（窓の外1m）
            sun_loc = (cx, D / 2 + 1.0, elev + oh / 2)
            sun_rot = (-math.pi / 2, 0, 0)
        elif wall == "south":
            cx = -W / 2 + pos_along
            loc = (cx, -D / 2 + 0.3, elev + oh / 2)
            rot = (-math.pi / 2, 0, 0)
            sun_loc = (cx, -D / 2 - 1.0, elev + oh / 2)
            sun_rot = (math.pi / 2, 0, 0)
        elif wall == "east":
            cy = -D / 2 + pos_along
            loc = (W / 2 - 0.3, cy, elev + oh / 2)
            rot = (0, math.pi / 2, 0)
            sun_loc = (W / 2 + 1.0, cy, elev + oh / 2)
            sun_rot = (0, -math.pi / 2, 0)
        elif wall == "west":
            cy = -D / 2 + pos_along
            loc = (-W / 2 + 0.3, cy, elev + oh / 2)
            rot = (0, -math.pi / 2, 0)
            sun_loc = (-W / 2 - 1.0, cy, elev + oh / 2)
            sun_rot = (0, math.pi / 2, 0)
        else:
            continue

        # 窓内側ライト（従来のまま、エネルギー増加）
        win_light = _create_light_data(
            'AREA', f"Light_Window_{idx:02d}",
            energy=25 * area_scale,   # 15→25に増加
            color=(0.95, 0.97, 1.0),  # 昼光色6500K相当
            size=ow * 0.8,
            use_shadow=True,
        )
        win_light.location = loc
        win_light.rotation_euler = rot
        if lighting_col:
            link_to_collection(win_light, lighting_col)

        # 窓外部サンパネル — 大面積エリアライトで自然光のバウンスを再現
        sun_panel = _create_light_data(
            'AREA', f"Light_Window_Sun_{idx:02d}",
            energy=200 * area_scale,
            color=(0.93, 0.96, 1.0),  # やや青みのある昼光色
            size=max(ow, oh) * 1.5,   # 窓より大きめ
            use_shadow=True,
        )
        sun_panel.location = sun_loc
        sun_panel.rotation_euler = sun_rot
        if lighting_col:
            link_to_collection(sun_panel, lighting_col)

        win_count += 1

    print(f"[lighting] レイヤー3: 窓自然光 — {win_count}箇所 "
          f"(内側+外部サンパネル)")

    # -----------------------------------------------------------------------
    # レイヤー4: アクセントスポットライト — 奥行き感のあるダウンライト
    # -----------------------------------------------------------------------
    accent_loc = (0, D / 4, H - 0.1)
    accent = _create_light_data(
        'SPOT', "Light_Accent_Spot",
        energy=spot_intensity * 60 * area_scale,  # 50→60に増加
        color=spot_color,
        spot_size=1.2,
        spot_blend=0.5,
    )
    accent.location = accent_loc
    accent.rotation_euler = (math.pi / 2, 0, 0)
    if lighting_col:
        link_to_collection(accent, lighting_col)
    print(f"[lighting] レイヤー4: アクセントスポット — "
          f"energy={accent.data.energy:.0f}")

    # -----------------------------------------------------------------------
    # レイヤー5: ペンダントポイントライト — 暖かい親密な灯り
    # -----------------------------------------------------------------------
    pendant_count = 0
    warm_color = (
        min(spot_color[0] * 1.1, 1.0),
        spot_color[1] * 0.85,
        spot_color[2] * 0.6,
    )
    for idx, item in enumerate(furniture):
        if item.get("type") != "pendant_light":
            continue

        app_pos = item.get("position", [0, 0, 0])
        bl_pos = to_blender(app_pos)

        pendant = _create_light_data(
            'POINT', f"Light_Pendant_{idx:02d}",
            energy=25,
            color=warm_color,
            shadow_soft_size=0.15,
        )
        pendant.location = bl_pos
        if lighting_col:
            link_to_collection(pendant, lighting_col)
        pendant_count += 1

    print(f"[lighting] レイヤー5: ペンダントライト — {pendant_count}個")

    # -----------------------------------------------------------------------
    # レイヤー6: フィルライト（影なし、暗部補填強化）
    # -----------------------------------------------------------------------
    fill = _create_light_data(
        'AREA', "Light_Fill",
        energy=30 * area_scale,        # 15→30に増加（暗い角を消す）
        color=(1.0, 0.97, 0.93),
        size=max(W, D) * 1.0,
        use_shadow=False,              # 影なし（補助光）
    )
    fill.location = (0, 0, H - 0.3)
    if lighting_col:
        link_to_collection(fill, lighting_col)
    print("[lighting] レイヤー6: フィルライト (影なし、energy増加)")

    # -----------------------------------------------------------------------
    # レイヤー7: LED間接照明 — 壁際の床付近カラーストリップ
    # style.ledStripColor で有効化（未指定ならスキップ）
    # -----------------------------------------------------------------------
    led_color_hex = style.get("ledStripColor")
    if led_color_hex:
        led_color = hex_to_linear(led_color_hex)
        led_energy = float(style.get("ledStripEnergy", 15)) * area_scale
        led_height = 0.05  # 床上5cm
        strip_count = 0

        # 4辺の壁際にLEDストリップ配置
        positions = [
            # (位置, サイズ幅, サイズ奥行, 回転)
            ((0, -D/2 + 0.1, led_height), W * 0.8, 0.05, (0, 0, 0)),       # south
            ((0, D/2 - 0.1, led_height), W * 0.8, 0.05, (0, 0, 0)),        # north
            ((-W/2 + 0.1, 0, led_height), 0.05, D * 0.8, (0, 0, 0)),       # west
            ((W/2 - 0.1, 0, led_height), 0.05, D * 0.8, (0, 0, 0)),        # east
        ]

        for idx, (loc, sx, sy, rot) in enumerate(positions):
            led = _create_light_data(
                'AREA', f"Light_LED_Strip_{idx:02d}",
                energy=led_energy,
                color=led_color,
                size=max(sx, sy),
                use_shadow=False,
            )
            led.location = loc
            led.rotation_euler = rot
            # エリアライト上向き
            led.rotation_euler = (0, 0, 0)
            if lighting_col:
                link_to_collection(led, lighting_col)
            strip_count += 1

        print(f"[lighting] レイヤー7: LED間接照明 — {strip_count}本, "
              f"color={led_color_hex}, energy={led_energy:.0f}")
    else:
        print("[lighting] レイヤー7: LED間接照明 — スキップ (ledStripColor未設定)")

    # -----------------------------------------------------------------------
    # レイヤー8: マルチダウンライト — 複数スポットで天井を演出
    # style.downlightCount で有効化（未指定ならスキップ）
    # -----------------------------------------------------------------------
    dl_count = int(style.get("downlightCount", 0))
    if dl_count > 0:
        dl_color_hex = style.get("downlightColor", spot_color_hex)
        dl_color = hex_to_linear(dl_color_hex)
        dl_energy = float(style.get("downlightEnergy", 30)) * area_scale

        # グリッド配置
        cols = max(2, int(math.sqrt(dl_count * W / D)))
        rows = max(2, dl_count // cols)
        actual = 0
        for r in range(rows):
            for c in range(cols):
                x = -W/2 + W * (c + 0.5) / cols
                y = -D/2 + D * (r + 0.5) / rows
                dl = _create_light_data(
                    'SPOT', f"Light_Downlight_{actual:02d}",
                    energy=dl_energy,
                    color=dl_color,
                    spot_size=0.8,
                    spot_blend=0.6,
                )
                dl.location = (x, y, H - 0.05)
                dl.rotation_euler = (0, 0, 0)
                if lighting_col:
                    link_to_collection(dl, lighting_col)
                actual += 1
                if actual >= dl_count:
                    break
            if actual >= dl_count:
                break

        print(f"[lighting] レイヤー8: マルチダウンライト — {actual}個, "
              f"color={dl_color_hex}, energy={dl_energy:.0f}")

    print(f"[lighting] セットアップ完了 — 拡張照明構成")
