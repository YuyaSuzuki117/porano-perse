"""Room builder — constructs walls, floor, ceiling with openings in Blender.

Builds axis-aligned room geometry centred at the origin, with the floor at z=0.
Openings (doors/windows) are cut via Boolean DIFFERENCE modifiers.
"""

import bpy
import math

from .core import (
    hex_to_rgba,
    make_material,
    link_to_collection,
)
from .materials.floor_finishes import create_floor_material
from .materials.wall_finishes import create_wall_material


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _make_glass():
    """Create a simple glass material for windows."""
    mat = bpy.data.materials.new("M_Glass")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs['Base Color'].default_value = (0.85, 0.92, 1.0, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.02
    bsdf.inputs['Alpha'].default_value = 0.12
    try:
        bsdf.inputs['Transmission Weight'].default_value = 0.95
    except KeyError:
        try:
            bsdf.inputs['Transmission'].default_value = 0.95
        except KeyError:
            pass
    try:
        mat.surface_render_method = 'BLENDED'
    except AttributeError:
        pass
    return mat


def _add_cube(name, location, scale):
    """Add a unit cube, set its location and scale, and return the object.

    Uses bpy.ops.mesh.primitive_cube_add(size=1) so that scale values
    correspond to half-extents.
    """
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def _apply_material(obj, mat):
    """Assign a material to an object."""
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def _cut_opening(wall_obj, cutter_obj):
    """Apply a Boolean DIFFERENCE modifier and delete the cutter."""
    mod = wall_obj.modifiers.new(name="Opening", type='BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter_obj
    # Set active and apply
    bpy.context.view_layer.objects.active = wall_obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Delete cutter
    bpy.data.objects.remove(cutter_obj, do_unlink=True)


def _make_window_glass(opening, wall_name, W, D, glass_mat, collections):
    """Place a glass plane at the opening position."""
    wall = opening["wall"]
    pos_along = opening["positionAlongWall"]
    ow = opening["width"]
    oh = opening["height"]
    elev = opening.get("elevation", 0.0)
    centre_z = elev + oh / 2

    if wall in ("north", "south"):
        cx = -W / 2 + pos_along
        cy = D / 2 if wall == "north" else -D / 2
        loc = (cx, cy, centre_z)
        rot = (math.pi / 2, 0, 0)
        sx, sy = ow / 2, oh / 2
    else:
        cy = -D / 2 + pos_along
        cx = W / 2 if wall == "east" else -W / 2
        loc = (cx, cy, centre_z)
        rot = (math.pi / 2, 0, math.pi / 2)
        sx, sy = ow / 2, oh / 2

    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    glass = bpy.context.active_object
    glass.name = f"Glass_{wall.capitalize()}_{int(pos_along * 100)}"
    glass.scale = (sx * 2, sy * 2, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _apply_material(glass, glass_mat)
    link_to_collection(glass, collections["03_Openings"])


def _make_frame(opening, wall_name, W, D, t, collections):
    """Create 4 frame pieces around an opening."""
    wall = opening["wall"]
    pos_along = opening["positionAlongWall"]
    ow = opening["width"]
    oh = opening["height"]
    elev = opening.get("elevation", 0.0)
    centre_z = elev + oh / 2
    frame_w = 0.04  # frame profile width
    frame_d = 0.06  # frame depth

    if wall in ("north", "south"):
        cx = -W / 2 + pos_along
        cy = D / 2 + t if wall == "north" else -D / 2 - t
        pieces = [
            # Top
            (f"Frame_{wall}_top",
             (cx, cy, elev + oh + frame_w / 2),
             (ow / 2 + frame_w, frame_d / 2, frame_w / 2)),
            # Bottom
            (f"Frame_{wall}_bot",
             (cx, cy, elev - frame_w / 2),
             (ow / 2 + frame_w, frame_d / 2, frame_w / 2)),
            # Left
            (f"Frame_{wall}_left",
             (cx - ow / 2 - frame_w / 2, cy, centre_z),
             (frame_w / 2, frame_d / 2, oh / 2 + frame_w)),
            # Right
            (f"Frame_{wall}_right",
             (cx + ow / 2 + frame_w / 2, cy, centre_z),
             (frame_w / 2, frame_d / 2, oh / 2 + frame_w)),
        ]
    else:
        cy = -D / 2 + pos_along
        cx = W / 2 + t if wall == "east" else -W / 2 - t
        pieces = [
            # Top
            (f"Frame_{wall}_top",
             (cx, cy, elev + oh + frame_w / 2),
             (frame_d / 2, ow / 2 + frame_w, frame_w / 2)),
            # Bottom
            (f"Frame_{wall}_bot",
             (cx, cy, elev - frame_w / 2),
             (frame_d / 2, ow / 2 + frame_w, frame_w / 2)),
            # Left
            (f"Frame_{wall}_left",
             (cx, cy - ow / 2 - frame_w / 2, centre_z),
             (frame_d / 2, frame_w / 2, oh / 2 + frame_w)),
            # Right
            (f"Frame_{wall}_right",
             (cx, cy + ow / 2 + frame_w / 2, centre_z),
             (frame_d / 2, frame_w / 2, oh / 2 + frame_w)),
        ]

    frame_mat = make_material(f"M_Frame_{wall}", (0.9, 0.9, 0.88, 1.0), roughness=0.35)

    for name, loc, scl in pieces:
        obj = _add_cube(name, loc, scl)
        _apply_material(obj, frame_mat)
        link_to_collection(obj, collections["03_Openings"])


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_room(scene_data, collections):
    """Build room geometry (floor, ceiling, walls) with openings.

    Args:
        scene_data: dict with keys:
            room.width, room.depth, room.height (metres)
            room.wallThickness (default 0.12)
            openings: list of opening dicts
            style.wallColor, style.floorColor, style.ceilingColor: hex strings
            style.floorTexture: texture type string
        collections: dict from setup_collections()

    Returns:
        dict of created objects keyed by name.
    """
    print("[room_builder] Building room geometry...")

    room = scene_data.get("room", {})
    style = scene_data.get("style", {})
    openings = scene_data.get("openings", [])

    W = room.get("width", 5.0)
    D = room.get("depth", 4.0)
    H = room.get("height", 2.7)
    wall_thickness = room.get("wallThickness", 0.12)
    t = wall_thickness / 2  # half-thickness

    room_col = collections["01_Room"]
    created = {}

    # --- Materials -----------------------------------------------------------
    wall_color_hex = style.get("wallColor", "#FFFFFF")
    floor_color_hex = style.get("floorColor", "#C8A882")
    ceiling_color_hex = style.get("ceilingColor", "#FAFAFA")
    floor_texture = style.get("floorTexture", "wood")

    wall_mat = create_wall_material(color_hex=wall_color_hex)
    floor_mat = create_floor_material(texture_type=floor_texture, color=hex_to_rgba(floor_color_hex))
    ceiling_mat = make_material("M_Ceiling", hex_to_rgba(ceiling_color_hex), roughness=0.3)

    # --- Floor ---------------------------------------------------------------
    print(f"[room_builder] Floor: {W}m x {D}m")
    floor = _add_cube("Floor", (0, 0, -0.025), (W / 2, D / 2, 0.025))
    _apply_material(floor, floor_mat)
    link_to_collection(floor, room_col)
    created["Floor"] = floor

    # --- Ceiling -------------------------------------------------------------
    print(f"[room_builder] Ceiling at z={H}")
    ceiling = _add_cube("Ceiling", (0, 0, H + 0.025), (W / 2, D / 2, 0.025))
    _apply_material(ceiling, ceiling_mat)
    link_to_collection(ceiling, room_col)
    created["Ceiling"] = ceiling

    # --- Walls ---------------------------------------------------------------
    wall_specs = {
        "north": {
            "loc": (0, D / 2 + t, H / 2),
            "scale": (W / 2 + t * 2, t, H / 2),
        },
        "south": {
            "loc": (0, -D / 2 - t, H / 2),
            "scale": (W / 2 + t * 2, t, H / 2),
        },
        "east": {
            "loc": (W / 2 + t, 0, H / 2),
            "scale": (t, D / 2, H / 2),
        },
        "west": {
            "loc": (-W / 2 - t, 0, H / 2),
            "scale": (t, D / 2, H / 2),
        },
    }

    walls = {}
    for direction, spec in wall_specs.items():
        name = f"Wall_{direction.capitalize()}"
        print(f"[room_builder] {name}")
        wall = _add_cube(name, spec["loc"], spec["scale"])
        _apply_material(wall, wall_mat)
        link_to_collection(wall, room_col)
        walls[direction] = wall
        created[name] = wall

    # --- Openings ------------------------------------------------------------
    glass_mat = None  # lazy-init

    for i, opening in enumerate(openings):
        wall_dir = opening.get("wall", "north")
        pos_along = opening.get("positionAlongWall", 0.0)
        ow = opening.get("width", 0.9)
        oh = opening.get("height", 2.0)
        elev = opening.get("elevation", 0.0)
        o_type = opening.get("type", "door")

        wall_obj = walls.get(wall_dir)
        if wall_obj is None:
            print(f"[room_builder] WARNING: unknown wall '{wall_dir}', skipping opening {i}")
            continue

        print(f"[room_builder] Opening {i}: {o_type} on {wall_dir} wall")

        centre_z = elev + oh / 2

        # Build cutter cube
        if wall_dir in ("north", "south"):
            cx = -W / 2 + pos_along
            wall_y = wall_specs[wall_dir]["loc"][1]
            cutter_loc = (cx, wall_y, centre_z)
            cutter_scale = (ow / 2 + 0.01, 0.15, oh / 2 + 0.01)
        else:
            cy = -D / 2 + pos_along
            wall_x = wall_specs[wall_dir]["loc"][0]
            cutter_loc = (wall_x, cy, centre_z)
            cutter_scale = (0.15, ow / 2 + 0.01, oh / 2 + 0.01)

        cutter = _add_cube(f"Cutter_{wall_dir}_{i}", cutter_loc, cutter_scale)
        cutter.display_type = 'WIRE'

        # Deselect all, select wall
        bpy.ops.object.select_all(action='DESELECT')
        wall_obj.select_set(True)
        bpy.context.view_layer.objects.active = wall_obj

        _cut_opening(wall_obj, cutter)

        # Window glass
        if o_type == "window":
            if glass_mat is None:
                glass_mat = _make_glass()
            _make_window_glass(opening, wall_dir, W, D, glass_mat, collections)

        # Frame
        _make_frame(opening, wall_dir, W, D, t, collections)

    print(f"[room_builder] Room complete: {len(created)} objects, {len(openings)} openings.")
    return created
