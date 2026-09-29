from http.server import BaseHTTPRequestHandler
import json, sys, ast, base64, tempfile, time, traceback
from pathlib import Path

# bpy 5.2.2 is intentionally imported at module load so GET /api/render proves the worker is ready.
try:
    import bpy
except Exception as _bpy_err:
    bpy = None
    BPY_IMPORT_ERROR = repr(_bpy_err)
else:
    BPY_IMPORT_ERROR = None

ALLOWED_IMPORTS = {"bpy", "math", "mathutils", "random"}
BLOCKED_NAMES = {
    "open","exec","eval","compile","__import__","input","breakpoint",
    "globals","locals","vars","getattr","setattr","delattr"
}
BLOCKED_ATTR_PARTS = {
    "open_mainfile","save_as_mainfile","save_mainfile","quit_blender",
    "addon_install","addon_enable","url_open","execute_preset",
    "python_file_run","script_reload","gltf","fbx","obj","alembic","usd"
}

def validate_script(code: str):
    if not isinstance(code, str) or not code.strip():
        raise ValueError("Empty Blender script")
    if len(code) > 180_000:
        raise ValueError("Script too large")
    tree = ast.parse(code, mode="exec")
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                root = a.name.split(".")[0]
                if root not in ALLOWED_IMPORTS:
                    raise ValueError(f"Blocked import: {a.name}")
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root not in ALLOWED_IMPORTS:
                raise ValueError(f"Blocked import: {node.module}")
        elif isinstance(node, ast.Name) and node.id in BLOCKED_NAMES:
            raise ValueError(f"Blocked name: {node.id}")
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__") or node.attr in BLOCKED_ATTR_PARTS:
                raise ValueError(f"Blocked attribute: {node.attr}")
        elif isinstance(node, ast.Call):
            f = node.func
            if isinstance(f, ast.Name) and f.id in BLOCKED_NAMES:
                raise ValueError(f"Blocked call: {f.id}")
    return tree

def reset_scene():
    # Clear standard datablocks between warm invocations.
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    except Exception:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)

def force_camera():
    scene = bpy.context.scene
    if scene.camera:
        return
    from mathutils import Vector
    bpy.ops.object.camera_add(location=(8.0, -8.0, 5.5))
    cam = bpy.context.object
    cam.name = "SceneForge_AutoCamera"
    direction = Vector((0, 0, 1.2)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z','Y').to_euler()
    scene.camera = cam

def configure_render(engine):
    scene = bpy.context.scene
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 78
    scene.render.film_transparent = False
    try:
        scene.render.engine = engine if engine in {"BLENDER_EEVEE_NEXT","CYCLES"} else "BLENDER_EEVEE_NEXT"
        if scene.render.engine == "CYCLES":
            scene.cycles.device = 'CPU'
            scene.cycles.samples = min(getattr(scene.cycles, "samples", 32), 32)
    except Exception:
        pass

def render_outputs(work: Path, engine: str):
    scene = bpy.context.scene
    force_camera()
    configure_render(engine)
    jpg = work / "render.jpg"
    glb = work / "scene.glb"
    scene.render.filepath = str(jpg)

    render_warning = None
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as first:
        render_warning = f"Primary render failed ({first}); fell back to Workbench."
        try:
            scene.render.engine = "BLENDER_WORKBENCH"
            bpy.ops.render.render(write_still=True)
        except Exception:
            raise RuntimeError(f"Render failed in requested engine and Workbench fallback: {traceback.format_exc()}")

    # Export only generated geometry. No external files are permitted in submitted script.
    bpy.ops.export_scene.gltf(
        filepath=str(glb),
        export_format='GLB',
        export_apply=True,
        export_cameras=True,
        export_lights=True
    )
    return jpg, glb, render_warning

def data_url(path: Path, mime: str):
    raw = path.read_bytes()
    return f"data:{mime};base64," + base64.b64encode(raw).decode("ascii"), len(raw)

class handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if bpy is None:
            return self._json(500, {"ok": False, "error": BPY_IMPORT_ERROR})
        return self._json(200, {
            "ok": True,
            "bpy_version": bpy.app.version_string,
            "python": sys.version.split()[0],
            "note": "Private/demo worker. Do not expose arbitrary-code execution publicly."
        })

    def do_POST(self):
        if bpy is None:
            return self._json(500, {"error": "bpy import failed", "detail": BPY_IMPORT_ERROR})
        started = time.time()
        try:
            length = int(self.headers.get("content-length", "0"))
            if length <= 0 or length > 1_000_000:
                return self._json(413, {"error": "Invalid request size"})
            req = json.loads(self.rfile.read(length))
            code = req.get("script", "")
            engine = req.get("engine", "BLENDER_EEVEE_NEXT")

            tree = validate_script(code)
            reset_scene()

            # IMPORTANT: this is a best-effort restricted execution mode for a private hackathon MVP.
            # It is not a hardened multi-tenant Python sandbox.
            safe_builtins = {
                "abs": abs, "min": min, "max": max, "range": range, "len": len,
                "float": float, "int": int, "str": str, "bool": bool,
                "enumerate": enumerate, "zip": zip, "sum": sum, "round": round,
                "print": print, "list": list, "dict": dict, "tuple": tuple, "set": set,
                "__import__": __import__,   # imports are AST allow-listed above
            }
            ns = {"__builtins__": safe_builtins}
            exec(compile(tree, "<sceneforge>", "exec"), ns, ns)

            with tempfile.TemporaryDirectory(prefix="sf_") as td:
                work = Path(td)
                jpg, glb, warning = render_outputs(work, engine)
                render_url, jpg_n = data_url(jpg, "image/jpeg")
                glb_url, glb_n = data_url(glb, "model/gltf-binary")

                # Vercel request/response payloads are capped. Keep total well below the limit.
                # If GLB gets large, still return the render so the vision loop remains usable.
                glb_included = (jpg_n + glb_n) < 2_900_000
                payload = {
                    "ok": True,
                    "render_data_url": render_url,
                    "glb_data_url": glb_url if glb_included else None,
                    "glb_included": glb_included,
                    "render_bytes": jpg_n,
                    "glb_bytes": glb_n,
                    "elapsed_ms": int((time.time() - started) * 1000),
                    "warning": warning or (None if glb_included else "GLB omitted because the response would be too large.")
                }
                return self._json(200, payload)
        except SyntaxError as e:
            return self._json(400, {"error": f"Python syntax error: line {e.lineno}: {e.msg}"})
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        except Exception as e:
            return self._json(500, {"error": str(e), "detail": traceback.format_exc()[-6000:]})
