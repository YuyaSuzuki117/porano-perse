"""Cycles render settings and execution.

Quality profiles are defined in presets.py (RENDER_QUALITY) — single source of truth.
This module delegates to apply_render_quality() and adds output path handling.
"""

import bpy

from .presets import apply_render_quality


# ---------------------------------------------------------------------------
# Render setup
# ---------------------------------------------------------------------------

def setup_render(quality='preview', output_path=None):
    """Configure Cycles render settings.

    Delegates to presets.apply_render_quality() for resolution, samples,
    color management, and GPU detection.

    Args:
        quality: One of 'preview', 'draft', 'production', 'ultra'.
        output_path: Output file path (optional, can be set later).
    """
    apply_render_quality(quality)

    if output_path:
        bpy.context.scene.render.filepath = output_path


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
