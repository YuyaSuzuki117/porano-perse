"""Auto-computed camera setup from room dimensions.

Creates 4 cameras with Empty targets and TrackTo constraints:
  1. Cam_Main     — 入口コーナー→対角俯瞰
  2. Cam_Counter  — カウンター正面
  3. Cam_Window   — 窓側ビュー
  4. Cam_TopDown  — 真上俯瞰
"""

import bpy
import math

from .core import link_to_collection


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _create_camera(name, location, target_location, lens, sensor_width=36,
                   collection=None):
    """Create a camera with an Empty target and TrackTo constraint.

    Args:
        name: Camera object name.
        location: Camera location (x, y, z).
        target_location: Empty target location (x, y, z).
        lens: Focal length in mm.
        sensor_width: Sensor width in mm.
        collection: Optional collection to link into.

    Returns:
        Tuple (camera_object, empty_object).
    """
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.active_object
    cam.name = name
    cam.data.lens = lens
    cam.data.clip_start = 0.05
    cam.data.clip_end = 50
    cam.data.sensor_width = sensor_width

    # Create target empty
    empty = bpy.data.objects.new(f"{name}_Target", None)
    bpy.context.collection.objects.link(empty)
    empty.location = target_location
    empty.empty_display_size = 0.1

    # TrackTo constraint
    constraint = cam.constraints.new('TRACK_TO')
    constraint.target = empty
    constraint.track_axis = 'TRACK_NEGATIVE_Z'
    constraint.up_axis = 'UP_Y'

    # Link to collection
    if collection:
        link_to_collection(cam, collection)
        link_to_collection(empty, collection)

    print(f"[cameras] Created {name} — lens={lens}mm, loc={location}")
    return cam, empty


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def setup_cameras(scene_data, collections):
    """Create 4 auto-positioned cameras from room dimensions.

    Args:
        scene_data: Parsed scene JSON dict.
        collections: Dict mapping collection names to bpy.types.Collection.
    """
    room = scene_data.get("room", {})
    W = float(room.get("width", 5.0))
    D = float(room.get("depth", 5.0))
    H = float(room.get("height", 3.0))

    cam_col = collections.get("05_Cameras")

    # Camera definitions: (name, location, target, lens)
    camera_defs = [
        (
            "Cam_Main",
            (W * 0.35, -D * 0.35, H * 0.6),
            (0, D * 0.1, H * 0.35),
            22,
        ),
        (
            "Cam_Counter",
            (0, -D * 0.25, H * 0.5),
            (0, D * 0.4, H * 0.35),
            24,
        ),
        (
            "Cam_Window",
            (-W * 0.35, D * 0.15, H * 0.55),
            (W * 0.1, -D * 0.1, H * 0.3),
            26,
        ),
        (
            "Cam_TopDown",
            (0, 0, H * 1.8),
            (0, 0, 0),
            18,
        ),
    ]

    first_cam = None
    for name, loc, target, lens in camera_defs:
        cam, _empty = _create_camera(
            name=name,
            location=loc,
            target_location=target,
            lens=lens,
            sensor_width=36,
            collection=cam_col,
        )
        if first_cam is None:
            first_cam = cam

    # Set first camera as active scene camera
    if first_cam:
        bpy.context.scene.camera = first_cam
        print(f"[cameras] Active camera set to {first_cam.name}")

    print(f"[cameras] Setup complete — {len(camera_defs)} cameras created")
