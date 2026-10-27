# Rockoon: enable BBP (unzipped into extensions/user_default/bbp_ng) and set its
# "External Texture Folder" to the game's Textures directory, then save user prefs.
# Usage: blender -b --python configure.py -- <textures dir>
# Prints ROCKOON_OK, or ROCKOON_ERROR:<reason>.
import bpy, addon_utils, sys, os

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
textures = args[0] if args else ""


def run():
    mod = next((m.__name__ for m in addon_utils.modules(refresh=True)
                if m.__name__ == "bl_ext.user_default.bbp_ng"), None)
    if mod is None:
        return "BBP not found in extensions/user_default"
    if mod not in bpy.context.preferences.addons:
        addon_utils.enable(mod, default_set=True, handle_error=None)
    if mod not in bpy.context.preferences.addons:
        return "failed to enable BBP (Blender version too old?)"
    if textures and os.path.isdir(textures):
        bpy.context.preferences.addons[mod].preferences.ballance_texture_folder = textures
    bpy.ops.wm.save_userpref()
    return None


err = run()
print("ROCKOON_ERROR:" + err if err else "ROCKOON_OK")
