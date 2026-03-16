"""Cycles render settings and execution.

Quality profiles:
  - preview:    960x540,   32 samples, denoiser ON
  - draft:      1280x720,  64 samples, denoiser ON
  - production: 1920x1080, 256 samples, denoiser ON
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
        'samples': 32,
    },
    'draft': {
        'resolution_x': 1280,
        'resolution_y': 720,
        'samples': 64,
    },
    'production': {
        'resolution_x': 1920,
        'resolution_y': 1080,
        'samples': 256,
    },
}


# ---------------------------------------------------------------------------
# Render setup
# ---------------------------------------------------------------------------

def setup_render(quality='preview', output_path=None):
    """Configure Cycles render settings.

    Args:
        quality: One of 'preview', 'draft', 'production'.
        output_path: Output file path (optional, can be set later).
    """
    profile = QUALITY_PROFILES.get(quality, QUALITY_PROFILES['preview'])
    res_x = profile['resolution_x']
    res_y = profile['resolution_y']
    samples = profile['samples']

    scene = bpy.context.scene

    # --- Engine & resolution ---
    scene.render.engine = 'CYCLES'
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False

    # --- Cycles samples & denoising ---
    scene.cycles.device = 'CPU'  # safe default
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'

    # --- Try GPU ---
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'CUDA'
        prefs.get_devices()
        for device in prefs.devices:
            device.use = True
        scene.cycles.device = 'GPU'
    except Exception:
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = 'OPTIX'
            prefs.get_devices()
            for device in prefs.devices:
                device.use = True
            scene.cycles.device = 'GPU'
        except Exception:
            scene.cycles.device = 'CPU'

    # --- Performance ---
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.01
    try:
        scene.render.tile_x = 256
        scene.render.tile_y = 256
    except AttributeError:
        pass  # Blender 4.0+ handles tiles automatically

    # --- Light paths (interior scene needs more bounces) ---
    scene.cycles.max_bounces = 12
    scene.cycles.diffuse_bounces = 6
    scene.cycles.glossy_bounces = 6
    scene.cycles.transmission_bounces = 12
    scene.cycles.transparent_max_bounces = 8

    # --- Color management ---
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'
    scene.view_settings.exposure = -0.5

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
          f"{samples} samples, Cycles, device={scene.cycles.device})")


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
