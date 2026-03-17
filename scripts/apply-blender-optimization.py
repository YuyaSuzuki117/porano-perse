import argparse

import bpy


PROFILES = {
    "safe": {
        "undo_steps": 24,
        "undo_memory_limit": 256,
        "viewport_aa": "FXAA",
        "gl_texture_limit": "CLAMP_4096",
        "texture_time_out": 60,
        "texture_collection_rate": 30,
        "use_gpu_subdivision": True,
        "show_splash": False,
        "auto_save_time": 3,
    },
    "modeling": {
        "undo_steps": 16,
        "undo_memory_limit": 256,
        "viewport_aa": "FXAA",
        "gl_texture_limit": "CLAMP_2048",
        "texture_time_out": 30,
        "texture_collection_rate": 30,
        "use_gpu_subdivision": False,
        "show_splash": False,
        "auto_save_time": 3,
    },
    "preview": {
        "undo_steps": 12,
        "undo_memory_limit": 192,
        "viewport_aa": "OFF",
        "gl_texture_limit": "CLAMP_1024",
        "texture_time_out": 15,
        "texture_collection_rate": 15,
        "use_gpu_subdivision": False,
        "show_splash": False,
        "auto_save_time": 2,
    },
}


def parse_args() -> argparse.Namespace:
    argv = []
    if "--" in __import__("sys").argv:
        argv = __import__("sys").argv[__import__("sys").argv.index("--") + 1 :]

    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=sorted(PROFILES.keys()), default="modeling")
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    profile = PROFILES[args.profile]

    prefs = bpy.context.preferences
    edit = prefs.edit
    view = prefs.view
    system = prefs.system
    filepaths = prefs.filepaths

    edit.undo_steps = profile["undo_steps"]
    edit.undo_memory_limit = profile["undo_memory_limit"]
    edit.use_global_undo = True

    view.show_splash = profile["show_splash"]

    system.viewport_aa = profile["viewport_aa"]
    system.gl_texture_limit = profile["gl_texture_limit"]
    system.texture_time_out = profile["texture_time_out"]
    system.texture_collection_rate = profile["texture_collection_rate"]
    system.use_gpu_subdivision = profile["use_gpu_subdivision"]

    filepaths.auto_save_time = profile["auto_save_time"]
    filepaths.use_auto_save_temporary_files = True
    filepaths.use_file_compression = True
    filepaths.save_version = 1

    bpy.ops.wm.save_userpref()

    print(f"Applied Blender optimization profile: {args.profile}")
    print(f"undo_steps={edit.undo_steps}")
    print(f"undo_memory_limit={edit.undo_memory_limit}")
    print(f"viewport_aa={system.viewport_aa}")
    print(f"gl_texture_limit={system.gl_texture_limit}")
    print(f"texture_time_out={system.texture_time_out}")
    print(f"texture_collection_rate={system.texture_collection_rate}")
    print(f"use_gpu_subdivision={system.use_gpu_subdivision}")
    print(f"auto_save_time={filepaths.auto_save_time}")


if __name__ == "__main__":
    main()
