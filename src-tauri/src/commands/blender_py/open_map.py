# Rockoon: open Blender with an empty scene and import a Ballance map through BBP.
# Usage: blender --python open_map.py -- <map.nmo> <textures dir>
# BBP's texture folder is pointed at the current game's Textures, so the map's
# external textures resolve against the game being edited.
import bpy, addon_utils, sys, os

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def _bbp_module():
    for mod in addon_utils.modules(refresh=False):
        if mod.__name__.rsplit(".", 1)[-1] == "bbp_ng":
            return mod.__name__
    return None


def _clear_scene():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                 bpy.data.cameras, bpy.data.lights, bpy.data.images):
        for item in list(coll):
            coll.remove(item)


def run():
    nmo = args[0]
    textures = args[1] if len(args) > 1 else ""
    module = _bbp_module()
    if module is None:
        print("ROCKOON_ERROR: BBP not installed")
        return
    if module not in bpy.context.preferences.addons:
        addon_utils.enable(module, default_set=False)
    prefs = bpy.context.preferences.addons[module].preferences
    if textures and os.path.isdir(textures):
        prefs.ballance_texture_folder = textures
    _clear_scene()
    # BBP refuses to import without at least one encoding (Ballance maps are cp1252 / gbk)
    resolver = bpy.context.scene.bbp_ptrprop_resolver
    if not any(e.encoding for e in resolver.ioport_encodings):
        resolver.ioport_encodings.clear()
        for enc in ("cp1252", "gbk"):
            resolver.ioport_encodings.add().encoding = enc
    bpy.ops.bbp.import_virtools("EXEC_DEFAULT", filepath=nmo)


# GUI mode: wait until the window/context is up before touching the scene
bpy.app.timers.register(lambda: (run(), None)[1], first_interval=0.2)
