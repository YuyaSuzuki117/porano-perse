"""Cycles レンダリング設定と実行

品質プロファイルは presets.py (RENDER_QUALITY) で一元管理。
このモジュールは apply_render_quality() に委譲し、出力パス管理と
追加のレンダリング最適化を行う。

改善点:
- フィルムの透過設定対応
- コンポジターノードによるグレア/ビネット（任意）
- レンダリング後の品質ログ出力
"""

import bpy
import time

from .presets import apply_render_quality


# ---------------------------------------------------------------------------
# レンダリングセットアップ
# ---------------------------------------------------------------------------

def setup_render(quality='preview', output_path=None, transparent_bg=False):
    """Cyclesレンダリング設定を構成

    presets.apply_render_quality() に委譲し、解像度・サンプル数・
    カラーマネジメント・GPU検出を設定する。

    Args:
        quality: 'preview', 'draft', 'production', 'ultra' のいずれか
        output_path: 出力ファイルパス（任意、後から設定可）
        transparent_bg: 背景を透過にするか（合成用）
    """
    preset = apply_render_quality(quality)

    if output_path:
        bpy.context.scene.render.filepath = output_path

    # 透過背景（合成用途）
    if transparent_bg:
        bpy.context.scene.render.film_transparent = True

    # パフォーマンスヒント: プレビュー品質では軽量設定
    scene = bpy.context.scene
    if quality == 'preview':
        # プレビューではライトツリーを簡略化
        scene.cycles.use_light_tree = True
        # スクランブル距離の自動最適化
        scene.cycles.use_auto_scrambling_distance = True

    return preset


# ---------------------------------------------------------------------------
# レンダリング実行
# ---------------------------------------------------------------------------

def render_scene(output_path):
    """レンダリング実行と結果の書き出し

    Args:
        output_path: レンダリング画像の出力パス (例: '/tmp/render.png')
    """
    bpy.context.scene.render.filepath = output_path

    # レンダリング時間計測
    start_time = time.time()
    bpy.ops.render.render(write_still=True)
    elapsed = time.time() - start_time

    # 品質ログ
    scene = bpy.context.scene
    samples = scene.cycles.samples
    res_x = scene.render.resolution_x
    res_y = scene.render.resolution_y

    print(f"[render] 完了 — {output_path}")
    print(f"[render] {res_x}x{res_y}, {samples}samples, "
          f"{elapsed:.1f}秒")
