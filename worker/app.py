import os, ast, base64, tempfile, subprocess, time
from pathlib import Path
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="SceneForge Blender Worker")

allowed_origins = [x.strip() for x in os.getenv("ALLOWED_ORIGINS","*").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins != ["*"] else ["*"],
    allow_credentials=False,
    allow_methods=["GET","POST","OPTIONS"],
    allow_headers=["*"],
)

TOKEN = os.getenv("SCENEFORGE_WORKER_TOKEN","").strip()

ALLOWED_IMPORTS = {"bpy","math","mathutils","random"}
BLOCKED_NAMES = {
    "open","exec","eval","compile","input","breakpoint",
    "globals","locals","vars","getattr","setattr","delattr"
}
BLOCKED_MODULES = {"os","sys","subprocess","socket","requests","urllib","pathlib","shutil","ctypes","multiprocessing"}

class RenderReq(BaseModel):
    script: str
    engine: str = "BLENDER_EEVEE_NEXT"
    iteration: int = 1

def auth(x_worker_token: str|None):
    if TOKEN and x_worker_token != TOKEN:
        raise HTTPException(401,"Invalid worker token")

def validate(code: str):
    if not code.strip(): raise HTTPException(400,"Empty Blender script")
    if len(code) > 180_000: raise HTTPException(413,"Script too large")
    try: tree = ast.parse(code)
    except SyntaxError as e: raise HTTPException(400,f"Python syntax error line {e.lineno}: {e.msg}")

    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            for a in n.names:
                root=a.name.split(".")[0]
                if root not in ALLOWED_IMPORTS or root in BLOCKED_MODULES:
                    raise HTTPException(400,f"Blocked import: {a.name}")
        elif isinstance(n, ast.ImportFrom):
            root=(n.module or "").split(".")[0]
            if root not in ALLOWED_IMPORTS or root in BLOCKED_MODULES:
                raise HTTPException(400,f"Blocked import: {n.module}")
        elif isinstance(n, ast.Name) and n.id in BLOCKED_NAMES:
            raise HTTPException(400,f"Blocked name: {n.id}")
        elif isinstance(n, ast.Attribute) and n.attr.startswith("__"):
            raise HTTPException(400,f"Blocked attribute: {n.attr}")

def to_data(path: Path, mime: str):
    b=path.read_bytes()
    return "data:"+mime+";base64,"+base64.b64encode(b).decode(), len(b)

@app.get("/health")
def health():
    try:
        p=subprocess.run(
            ["xvfb-run","-a","blender","--version"],
            capture_output=True,text=True,timeout=30
        )
        return {"ok":p.returncode==0,"blender":p.stdout.splitlines()[0] if p.stdout else p.stderr[:200]}
    except Exception as e:
        return {"ok":False,"error":str(e)}

@app.post("/render")
def render(req: RenderReq, x_worker_token: str|None=Header(default=None)):
    auth(x_worker_token)
    validate(req.script)
    started=time.time()

    with tempfile.TemporaryDirectory(prefix="sf_") as td:
        work=Path(td)
        scene_py=work/"scene.py"
        scene_py.write_text(req.script,encoding="utf-8")

        cmd=[
            "xvfb-run","-a","blender","-b",
            "--python","/app/driver.py",
            "--",str(scene_py),str(work),req.engine
        ]
        try:
            p=subprocess.run(
                cmd,capture_output=True,text=True,
                timeout=int(os.getenv("RENDER_TIMEOUT","180")),
                env={
                    "PATH":os.environ.get("PATH",""),
                    "HOME":"/tmp",
                    "TMPDIR":"/tmp",
                    "BLENDER_USER_CONFIG":"/tmp/blender-config"
                }
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(504,"Blender render timed out")

        if p.returncode != 0:
            raise HTTPException(500,detail=("Blender failed:\n"+p.stderr[-5000:]+"\n"+p.stdout[-5000:]))

        jpg=work/"render.jpg"; glb=work/"scene.glb"
        if not jpg.exists():
            raise HTTPException(500,"Blender completed but render.jpg was not created")

        render_data,jpg_n=to_data(jpg,"image/jpeg")
        glb_data=None; glb_n=0
        if glb.exists():
            glb_data,glb_n=to_data(glb,"model/gltf-binary")

        return {
            "ok":True,
            "render_data_url":render_data,
            "glb_data_url":glb_data,
            "render_bytes":jpg_n,
            "glb_bytes":glb_n,
            "elapsed_ms":int((time.time()-started)*1000),
            "iteration":req.iteration
        }

if __name__=="__main__":
    import uvicorn
    uvicorn.run(app,host="0.0.0.0",port=int(os.getenv("PORT","8080")))
