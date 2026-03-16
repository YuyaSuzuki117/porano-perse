"""Room builder — constructs walls, floor, ceiling with openings in Blender.

Builds axis-aligned room geometry centred at the origin, with the floor at z=0.
Includes architectural trim: baseboards, crown molding.
Openings (doors/windows) are indicated by glass panes + frames.
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
    """Add a unit cube, set its location and scale, and return the object."""
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
    bpy.context.view_layer.objects.active = wall_obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
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
    frame_w = 0.04
    frame_d = 0.06

    if wall in ("north", "south"):
        cx = -W / 2 + pos_along
        cy = D / 2 + t if wall == "north" else -D / 2 - t
        pieces = [
            (f"Frame_{wall}_top",
             (cx, cy, elev + oh + frame_w / 2),
             (ow / 2 + frame_w, frame_d / 2, frame_w / 2)),
            (f"Frame_{wall}_bot",
             (cx, cy, elev - frame_w / 2),
             (ow / 2 + frame_w, frame_d / 2, frame_w / 2)),
            (f"Frame_{wall}_left",
             (cx - ow / 2 - frame_w / 2, cy, centre_z),
             (frame_w / 2, frame_d / 2, oh / 2 + frame_w)),
            (f"Frame_{wall}_right",
             (cx + ow / 2 + frame_w / 2, cy, centre_z),
             (frame_w / 2, frame_d / 2, oh / 2 + frame_w)),
        ]
    else:
        cy = -D / 2 + pos_along
        cx = W / 2 + t if wall == "east" else -W / 2 - t
        pieces = [
            (f"Frame_{wall}_top",
             (cx, cy, elev + oh + frame_w / 2),
             (frame_d / 2, ow / 2 + frame_w, frame_w / 2)),
            (f"Frame_{wall}_bot",
             (cx, cy, elev - frame_w / 2),
             (frame_d / 2, ow / 2 + frame_w, frame_w / 2)),
            (f"Frame_{wall}_left",
             (cx, cy - ow / 2 - frame_w / 2, centre_z),
             (frame_d / 2, frame_w / 2, oh / 2 + frame_w)),
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
# Architectural trim
# ---------------------------------------------------------------------------

def _make_trim_material(name, color_rgba, roughness=0.4):
    """Create a material for baseboards and crown molding."""
    mat = make_material(name, color_rgba, roughness=roughness)
    return mat


def _build_baseboards(W, D, H, wall_color_rgba, room_col):
    """Add baseboards (巾木) along all 4 walls.

    Height: 80mm, depth: 12mm, slight offset from wall.
    """
    baseboard_h = 0.08
    baseboard_d = 0.012
    # Slightly lighter than wall for contrast
    r, g, b, a = wall_color_rgba
    bb_color = (min(r * 1.15, 1.0), min(g * 1.15, 1.0), min(b * 1.15, 1.0), 1.0)
    bb_mat = _make_trim_material("M_Baseboard", bb_color, roughness=0.35)

    pieces = [
        # North wall
        ("Baseboard_N", (0, D / 2 - baseboard_d / 2, baseboard_h / 2),
         (W / 2, baseboard_d / 2, baseboard_h / 2)),
        # South wall
        ("Baseboard_S", (0, -D / 2 + baseboard_d / 2, baseboard_h / 2),
         (W / 2, baseboard_d / 2, baseboard_h / 2)),
        # East wall
        ("Baseboard_E", (W / 2 - baseboard_d / 2, 0, baseboard_h / 2),
         (baseboard_d / 2, D / 2 - baseboard_d, baseboard_h / 2)),
        # West wall
        ("Baseboard_W", (-W / 2 + baseboard_d / 2, 0, baseboard_h / 2),
         (baseboard_d / 2, D / 2 - baseboard_d, baseboard_h / 2)),
    ]

    created = []
    for name, loc, scl in pieces:
        obj = _add_cube(name, loc, scl)
        _apply_material(obj, bb_mat)
        # Add slight bevel for profile
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = 0.003
        mod.segments = 2
        mod.limit_method = "ANGLE"
        link_to_collection(obj, room_col)
        created.append(obj)

    print(f"[room_builder] Baseboards: 4 pieces")
    return created


def _build_crown_molding(W, D, H, ceiling_color_rgba, room_col):
    """Add crown molding (廻り縁) at wall-ceiling junction.

    Profile: 60mm drop, 40mm projection.
    """
    cm_drop = 0.06
    cm_proj = 0.04
    # Slightly different tone from ceiling
    r, g, b, a = ceiling_color_rgba
    cm_color = (min(r * 1.05, 1.0), min(g * 1.05, 1.0), min(b * 1.05, 1.0), 1.0)
    cm_mat = _make_trim_material("M_CrownMolding", cm_color, roughness=0.3)

    pieces = [
        # North wall
        ("Crown_N", (0, D / 2 - cm_proj / 2, H - cm_drop / 2),
         (W / 2, cm_proj / 2, cm_drop / 2)),
        # South wall
        ("Crown_S", (0, -D / 2 + cm_proj / 2, H - cm_drop / 2),
         (W / 2, cm_proj / 2, cm_drop / 2)),
        # East wall
        ("Crown_E", (W / 2 - cm_proj / 2, 0, H - cm_drop / 2),
         (cm_proj / 2, D / 2 - cm_proj, cm_drop / 2)),
        # West wall
        ("Crown_W", (-W / 2 + cm_proj / 2, 0, H - cm_drop / 2),
         (cm_proj / 2, D / 2 - cm_proj, cm_drop / 2)),
    ]

    created = []
    for name, loc, scl in pieces:
        obj = _add_cube(name, loc, scl)
        _apply_material(obj, cm_mat)
        # Bevel for molding profile
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = 0.008
        mod.segments = 3
        mod.limit_method = "ANGLE"
        link_to_collection(obj, room_col)
        created.append(obj)

    print(f"[room_builder] Crown molding: 4 pieces")
    return created


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_room(scene_data, collections):
    """Build room geometry (floor, ceiling, walls) with openings and trim.

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
    t = wall_thickness / 2

    room_col = collections["01_Room"]
    created = {}

    # --- Materials -----------------------------------------------------------
    wall_color_hex = style.get("wallColor", "#FFFFFF")
    floor_color_hex = style.get("floorColor", "#C8A882")
    ceiling_color_hex = style.get("ceilingColor", "#FAFAFA")
    floor_texture = style.get("floorTexture", "wood")

    wood_type = style.get("woodType", "oak")

    wall_color_rgba = hex_to_rgba(wall_color_hex)
    ceiling_color_rgba = hex_to_rgba(ceiling_color_hex)

    wall_mat = create_wall_material(color_hex=wall_color_hex)
    floor_mat = create_floor_material(
        texture_type=floor_texture,
        color=hex_to_rgba(floor_color_hex),
        wood_type=wood_type,
    )
    ceiling_mat = make_material("M_Ceiling", ceiling_color_rgba, roughness=0.9)

    # --- Floor ---------------------------------------------------------------
    print(f"[room_builder] Floor: {W}m x {D}m")
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "Floor"
    floor.scale = (W, D, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _apply_material(floor, floor_mat)
    link_to_collection(floor, room_col)
    created["Floor"] = floor

    # --- Ceiling -------------------------------------------------------------
    print(f"[room_builder] Ceiling at z={H}")
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, H),
                                      rotation=(math.pi, 0, 0))
    ceiling = bpy.context.active_object
    ceiling.name = "Ceiling"
    ceiling.scale = (W, D, 1)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    _apply_material(ceiling, ceiling_mat)
    link_to_collection(ceiling, room_col)
    created["Ceiling"] = ceiling

    # --- Walls ---------------------------------------------------------------
    walls = {}
    wall_builds = [
        ("north", (0, D / 2, H / 2), (-math.pi / 2, 0, 0), (W, H, 1)),
        ("south", (0, -D / 2, H / 2), (math.pi / 2, 0, 0), (W, H, 1)),
        ("east", (W / 2, 0, H / 2), (0, math.pi / 2, 0), (D, H, 1)),
        ("west", (-W / 2, 0, H / 2), (0, -math.pi / 2, 0), (D, H, 1)),
    ]

    for direction, loc, rot, scl in wall_builds:
        name = f"Wall_{direction.capitalize()}"
        print(f"[room_builder] {name}")
        bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
        wall = bpy.context.active_object
        wall.name = name
        wall.scale = scl
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        _apply_material(wall, wall_mat)
        link_to_collection(wall, room_col)
        walls[direction] = wall
        created[name] = wall

    # --- Baseboards (巾木) ---------------------------------------------------
    _build_baseboards(W, D, H, wall_color_rgba, room_col)

    # --- Crown Molding (廻り縁) ----------------------------------------------
    _build_crown_molding(W, D, H, ceiling_color_rgba, room_col)

    # --- Openings ------------------------------------------------------------
    glass_mat = None

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

        if o_type == "window":
            if glass_mat is None:
                glass_mat = _make_glass()
            _make_window_glass(opening, wall_dir, W, D, glass_mat, collections)

        _make_frame(opening, wall_dir, W, D, t, collections)

    print(f"[room_builder] Room complete: {len(created)} objects, {len(openings)} openings, baseboards + crown molding.")
    return created
