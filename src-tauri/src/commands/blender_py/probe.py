# Rockoon: probe a Blender install (run with `blender -b --python probe.py`).
# Prints one line `ROCKOON_JSON:{...}`: Blender version, the user_default extension
# repo directory (where BBP gets unzipped to), and every BBP module Blender can see
# (new `bbp_ng` and the pre-4.0 `ballance_blender_plugin`).
import bpy, addon_utils, json, os

prefs = bpy.context.preferences
repo = next((r for r in prefs.extensions.repos if r.module == "user_default"), None)
out = {
    "version": ".".join(str(v) for v in bpy.app.version),
    "extensionsDir": repo.directory if repo else "",
    "bbp": [],
}
for mod in addon_utils.modules(refresh=False):
    name = mod.__name__
    if name.rsplit(".", 1)[-1] not in ("bbp_ng", "ballance_blender_plugin"):
        continue
    info = addon_utils.module_bl_info(mod)
    enabled = name in prefs.addons
    tex = ""
    if enabled:
        tex = getattr(prefs.addons[name].preferences, "ballance_texture_folder", "") or ""
    out["bbp"].append({
        "module": name,
        "version": ".".join(str(v) for v in info.get("version", ())),
        "enabled": enabled,
        "textureFolder": tex,
        "path": os.path.dirname(mod.__file__),
    })
print("ROCKOON_JSON:" + json.dumps(out))
