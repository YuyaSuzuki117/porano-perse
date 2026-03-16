"""Import GLB furniture models with style-based material overrides.

For each furniture item in scene_data.furniture[]:
  - Import the GLB model from modelsDir if available
  - Fall back to a placeholder cube if the GLB is missing
  - Override materials based on defaultMaterial + style config
"""

import bpy
import math
import os

from .core import to_blender, rot_to_blender, scale_to_blender, link_to_collection
from .materials import create_wood_material, create_metal_material, create_fabric_material

# Custom high-quality model generators
_custom_generators = {}
try:
    from .models.cafe_chair import create_cafe_chair
    from .models.cafe_table import create_cafe_table
    from .models.bar_stool import create_bar_stool
    from .models.club_chair import create_club_chair
    from .models.brass_table import create_brass_table
    _custom_generators['chair'] = create_cafe_chair
    _custom_generators['table_round'] = create_cafe_table
    _custom_generators['stool'] = create_bar_stool
    _custom_generators['club_chair'] = create_club_chair
    _custom_generators['brass_table'] = create_brass_table
except ImportError as e:
    print(f"[furniture] Custom model import warning: {e}")
    pass


# ---------------------------------------------------------------------------
# Material cache
# ---------------------------------------------------------------------------

_mat_cache = {}


def _get_style_material(default_material, style):
    """Get or create a cached style material.

    Args:
        default_material: Material type string ('wood', 'metal', 'fabric').
        style: Style dict from scene_data.

    Returns:
        bpy.types.Material or None.
    """
    if default_material == 'wood':
        wood_type = style.get('woodType', 'oak')
        key = f"wood_{wood_type}"
        if key not in _mat_cache:
            _mat_cache[key] = create_wood_material(wood_type)
        return _mat_cache[key]

    elif default_material == 'metal':
        metal_finish = style.get('metalFinish', 'brushed')
        key = f"metal_{metal_finish}"
        if key not in _mat_cache:
            _mat_cache[key] = create_metal_material(metal_finish)
        return _mat_cache[key]

    elif default_material == 'fabric':
        fabric_type = style.get('fabricType', 'linen')
        key = f"fabric_{fabric_type}"
        if key not in _mat_cache:
            _mat_cache[key] = create_fabric_material(fabric_type)
        return _mat_cache[key]

    return None


def _should_override_material(obj):
    """Check if an object's materials should be overridden with style materials.

    Returns True for objects with:
    - No material slots
    - Generic/placeholder materials (Material, Material.001, etc)
    - Materials from gen-glb.mjs (ending in _mat, porano-gen generated)

    Returns False only for materials with clearly custom names that indicate
    hand-crafted shaders we should preserve.
    """
    if not obj.data or not hasattr(obj.data, 'materials'):
        return True
    if len(obj.data.materials) == 0:
        return True
    for mat in obj.data.materials:
        if mat is None:
            continue
        name = mat.name.lower()
        # gen-glb.mjs generates materials named like "seat_ring_mat", "top_mat"
        # These should all be overridden by style materials
        if name.endswith('_mat') or name.startswith('material') or name == '' or name == 'default':
            continue
        # Any other named material — keep it
        return False
    return True


def _apply_material_to_hierarchy(parent_obj, material):
    """Apply a material to all mesh children of parent_obj.

    Only overrides objects that have placeholder materials.
    """
    for child in parent_obj.children:
        if child.type == 'MESH' and _should_override_material(child):
            if len(child.data.materials) == 0:
                child.data.materials.append(material)
            else:
                child.data.materials[0] = material
        # Recurse into nested children
        _apply_material_to_hierarchy(child, material)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def import_furniture(scene_data, collections):
    """Import furniture GLB models and apply style materials.

    Args:
        scene_data: Parsed scene JSON dict.
        collections: Dict mapping collection names to bpy.types.Collection.
    """
    furniture_items = scene_data.get("furniture", [])
    style = scene_data.get("style", {})
    models_dir = scene_data.get("modelsDir", "")

    furniture_col = collections.get("02_Furniture")

    success_count = 0
    fallback_count = 0
    fail_count = 0

    for idx, item in enumerate(furniture_items):
        item_type = item.get("type", "unknown")
        item_name = item.get("name", f"{item_type}_{idx:03d}")
        app_pos = item.get("position", [0, 0, 0])
        app_rot = item.get("rotation", [0, 0, 0])
        app_scale = item.get("scale", [1, 1, 1])
        default_material = item.get("defaultMaterial")

        bl_pos = to_blender(app_pos)
        bl_rot = rot_to_blender(app_rot)
        bl_scale = scale_to_blender(app_scale)

        glb_path = os.path.join(models_dir, f"{item_type}.glb") if models_dir else ""

        # Check for custom Blender model generator
        if item_type in _custom_generators:
            try:
                gen_func = _custom_generators[item_type]
                custom_obj = gen_func(name=item_name, location=bl_pos)
                custom_obj.rotation_euler = bl_rot
                # Custom models are built at real-world scale — don't apply
                # the GLB-intended scale which would distort them
                custom_obj.scale = (1.0, 1.0, 1.0)

                # Link to furniture collection
                if furniture_col:
                    link_to_collection(custom_obj, furniture_col)
                    for child in custom_obj.children:
                        link_to_collection(child, furniture_col)

                success_count += 1
                continue  # Skip GLB import
            except Exception as e:
                print(f"[furniture] Custom model failed for {item_name}: {e}, falling back to GLB")

        try:
            if models_dir and os.path.isfile(glb_path):
                # ----- Import GLB -----
                # Record existing objects before import
                existing_objects = set(bpy.data.objects[:])

                bpy.ops.import_scene.gltf(filepath=glb_path)

                # Identify newly imported objects
                new_objects = [o for o in bpy.data.objects if o not in existing_objects]

                # Create parent empty
                parent_empty = bpy.data.objects.new(item_name, None)
                bpy.context.collection.objects.link(parent_empty)
                parent_empty.location = bl_pos
                parent_empty.rotation_euler = bl_rot
                parent_empty.scale = bl_scale

                # Parent all imported objects to the empty
                for obj in new_objects:
                    obj.parent = parent_empty

                # Apply style material override if specified
                if default_material:
                    mat = _get_style_material(default_material, style)
                    if mat:
                        _apply_material_to_hierarchy(parent_empty, mat)

                # Link to furniture collection
                if furniture_col:
                    link_to_collection(parent_empty, furniture_col)
                    for obj in new_objects:
                        link_to_collection(obj, furniture_col)

                success_count += 1

            else:
                # ----- Fallback cube -----
                bpy.ops.mesh.primitive_cube_add(size=0.3, location=bl_pos)
                fallback = bpy.context.active_object
                fallback.name = f"{item_name}_fallback"
                fallback.rotation_euler = bl_rot
                fallback.scale = bl_scale

                # Apply style material to fallback if specified
                if default_material:
                    mat = _get_style_material(default_material, style)
                    if mat:
                        if len(fallback.data.materials) == 0:
                            fallback.data.materials.append(mat)
                        else:
                            fallback.data.materials[0] = mat

                if furniture_col:
                    link_to_collection(fallback, furniture_col)

                fallback_count += 1

        except Exception as e:
            print(f"[furniture] ERROR importing {item_name}: {e}")
            fail_count += 1

    # Summary
    total = len(furniture_items)
    print(f"[furniture] Import complete — "
          f"{success_count} GLB / {fallback_count} fallback / "
          f"{fail_count} failed / {total} total")
