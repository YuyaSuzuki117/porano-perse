"""EEVEE render settings and execution.

Quality profiles:
  - preview:    960x540,   16 samples
  - draft:      1280x720,  32 samples
  - production: 1920x1080, 128 samples
"""

import bpy
import math


# ---------------------------------------------------------------------------
# Quality profiles
# ---------------------------------------------------------------------------

QUALITY_PROFILES = {
    'preview': {
        'resolution_x': 960,
        'resolution_y': 540,
        'samples': 16,
    },
    'draft': {
        'resolution_x': 1280,
        'resolution_y': 720,
        'samples': 32,
    },
    'production': {
        'resolution_x': 1920,
        'resolution_y': 1080,
        'samples': 128,
    },
}


# ---------------------------------------------------------------------------
# Render setup
# ---------------------------------------------------------------------------

def setup_render(quality='preview', output_path=None):
    """Configure EEVEE render settings.

    Args:
        quality: One of 'preview', 'draft', 'production'.
        output_path: Output file path (optional, can be set later).
    """
    profile = QUALITY_PROFILES.get(quality, QUALITY_PROFILES['preview'])
    res_x = profile['resolution_x']
    res_y = profile['resolution_y']
    samples = profile['samples']
    is_production = (quality == 'production')

    scene = bpy.context.scene

    # --- Engine & resolution ---
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False

    # --- Samples ---
    eevee = scene.eevee
    try:
        eevee.taa_render_samples = samples
    except AttributeError:
        pass

    # --- Raytracing (Blender 4+) ---
    try:
        eevee.use_raytracing = True
        eevee.ray_tracing_method = 'SCREEN'
    except AttributeError:
        pass

    # --- Screen Space Reflections ---
    try:
        eevee.use_ssr = True
        eevee.use_ssr_refraction = True
        if is_production:
            eevee.ssr_quality = 1.0
            eevee.ssr_max_roughness = 0.5
    except AttributeError:
        pass

    # --- Ambient Occlusion ---
    try:
        eevee.use_gtao = True
        eevee.gtao_distance = 1.5
        if is_production:
            eevee.gtao_quality = 1.0
    except AttributeError:
        pass

    # --- Bloom ---
    try:
        eevee.use_bloom = True
        eevee.bloom_threshold = 0.8
        eevee.bloom_intensity = 0.04
    except AttributeError:
        pass

    # --- Shadows ---
    try:
        eevee.shadow_cube_size = '2048'
        eevee.shadow_cascade_size = '2048'
        eevee.use_shadow_high_bitdepth = True
        eevee.use_soft_shadows = True
    except AttributeError:
        pass

    # --- Output format ---
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.compression = 15

    if output_path:
        scene.render.filepath = output_path

    # --- Units ---
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0

    print(f"[render] Setup complete — {quality} ({res_x}x{res_y}, "
          f"{samples} samples, EEVEE)")


# ---------------------------------------------------------------------------
# Render execution
# ---------------------------------------------------------------------------

def render_scene(output_path):
    """Execute a render and write the result to disk.

    Args:
        output_path: File path for the rendered image (e.g. '/tmp/render.png').
    """
    bpy.context.scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)
    print(f"[render] Complete → {output_path}")
