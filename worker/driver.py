import bpy, sys, traceback
from pathlib import Path
from mathutils import Vector

argv = sys.argv
if "--" not in argv:
    raise SystemExit("missing args")
args = argv[argv.index("--")+1:]
scene_script = Path(args[0])
outdir = Path(args[1])
engine = args[2] if len(args) > 2 else "BLENDER_EEVEE_NEXT"

# Execute generated scene code.
code = scene_script.read_text(encoding="utf-8")
exec(compile(code, str(scene_script), "exec"), {"__name__":"__main__"})

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"

if not scene.camera:
    bpy.ops.object.camera_add(location=(8,-8,5.5))
    cam = bpy.context.object
    cam.name = "SceneForge_AutoCamera"
    cam.rotation_euler = (Vector((0,0,1.2))-cam.location).to_track_quat("-Z","Y").to_euler()
    scene.camera = cam

scene.render.resolution_x = 960
scene.render.resolution_y = 540
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 82

try:
    scene.render.engine = engine
    if engine == "CYCLES":
        scene.cycles.device = "CPU"
        scene.cycles.samples = min(getattr(scene.cycles, "samples", 32), 32)
except Exception:
    scene.render.engine = "BLENDER_WORKBENCH"

scene.render.filepath = str(outdir/"render.jpg")

try:
    bpy.ops.render.render(write_still=True)
except Exception:
    traceback.print_exc()
    scene.render.engine = "BLENDER_WORKBENCH"
    bpy.ops.render.render(write_still=True)

bpy.ops.export_scene.gltf(
    filepath=str(outdir/"scene.glb"),
    export_format="GLB",
    export_apply=True,
    export_cameras=True,
    export_lights=True
)
