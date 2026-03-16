"""Core utilities for coordinate transformation and Blender scene management.

Coordinate systems:
  App:     y = up,  z = front(+) / back(-)
  Blender: z = up,  y = front(-) / back(+)

Mapping:  app (x, y, z)  ->  blender (x, -z, y)
"""

import bpy
import os
import math
from pathlib import Path


# ---------------------------------------------------------------------------
# Coordinate transforms
# ---------------------------------------------------------------------------

def to_blender(app_pos):
    """Convert app coordinates [x, y, z] to Blender (x, -z, y).

    App:     y = up, z = front(+)/back(-)
    Blender: z = up, y = front(-)/back(+)
    """
    x, y, z = app_pos
    return (x, -z, y)


def rot_to_blender(app_rot):
    """Convert app rotation [rx, ry, rz] to Blender (rx, -rz, ry)."""
    rx, ry, rz = app_rot
    return (rx, -rz, ry)


def scale_to_blender(app_scale):
    """Convert app scale [sx, sy, sz] to Blender (sx, sz, sy)."""
    sx, sy, sz = app_scale
    return (sx, sz, sy)


# ---------------------------------------------------------------------------
# Scene management
# ---------------------------------------------------------------------------

def clear_scene():
    """Select all objects, delete them, and purge orphan data."""
    print("[core] Clearing scene...")

    # Select and delete all objects
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    # Purge orphan meshes
    for mesh in bpy.data.meshes:
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)

    # Purge orphan materials
    for mat in bpy.data.materials:
        if mat.users == 0:
            bpy.data.materials.remove(mat)

    # Purge orphan images
    for img in bpy.data.images:
        if img.users == 0:
            bpy.data.images.remove(img)

    print("[core] Scene cleared.")


def setup_collections(names=None):
    """Create named collections and return a dict mapping name -> collection.

    Args:
        names: List of collection names. Defaults to the standard set:
               01_Room, 02_Furniture, 03_Openings, 04_Lighting, 05_Cameras

    Returns:
        dict: {name: bpy.types.Collection}
    """
    if names is None:
        names = [
            "01_Room",
            "02_Furniture",
            "03_Openings",
            "04_Lighting",
            "05_Cameras",
        ]

    scene_col = bpy.context.scene.collection
    collections = {}

    for name in names:
        col = bpy.data.collections.new(name)
        scene_col.children.link(col)
        collections[name] = col
        print(f"[core] Collection created: {name}")

    return collections


# ---------------------------------------------------------------------------
# Color / Material helpers
# ---------------------------------------------------------------------------

def hex_to_rgba(hex_str, alpha=1.0):
    """Convert CSS hex color '#RRGGBB' to (r, g, b, a) in linear sRGB.

    Args:
        hex_str: Color string like '#FF8800' or 'FF8800'.
        alpha: Alpha value (0.0 - 1.0).

    Returns:
        Tuple (r, g, b, a) with values in linear sRGB space.
    """
    hex_str = hex_str.lstrip("#")
    r_srgb = int(hex_str[0:2], 16) / 255.0
    g_srgb = int(hex_str[2:4], 16) / 255.0
    b_srgb = int(hex_str[4:6], 16) / 255.0

    # sRGB -> linear conversion
    def to_linear(c):
        if c <= 0.04045:
            return c / 12.92
        return ((c + 0.055) / 1.055) ** 2.4

    return (to_linear(r_srgb), to_linear(g_srgb), to_linear(b_srgb), alpha)


def make_material(name, color_rgba, roughness=0.5, metallic=0.0):
    """Create a simple Principled BSDF material.

    Args:
        name: Material name.
        color_rgba: Base color as (r, g, b, a) tuple in linear sRGB.
        roughness: Surface roughness (0.0 - 1.0).
        metallic: Metallic factor (0.0 - 1.0).

    Returns:
        bpy.types.Material
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color_rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    print(f"[core] Material created: {name}")
    return mat


# ---------------------------------------------------------------------------
# Collection helpers
# ---------------------------------------------------------------------------

def link_to_collection(obj, collection):
    """Unlink object from all collections, then link to the target collection.

    Args:
        obj: bpy.types.Object to move.
        collection: Target bpy.types.Collection.
    """
    # Unlink from all current collections
    for col in obj.users_collection:
        col.objects.unlink(obj)

    # Link to target
    collection.objects.link(obj)


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def get_project_dir():
    """Return the project root directory (parent of scripts/).

    Returns:
        pathlib.Path to the project root.
    """
    # This file: <project>/scripts/blender/core.py
    return Path(__file__).resolve().parent.parent.parent


def get_models_dir():
    """Return the public/models directory path.

    Returns:
        pathlib.Path to public/models.
    """
    return get_project_dir() / "public" / "models"


def get_output_dir():
    """Return the output directory, creating it if it does not exist.

    Returns:
        pathlib.Path to the output directory.
    """
    out = get_project_dir() / "output"
    out.mkdir(parents=True, exist_ok=True)
    return out
