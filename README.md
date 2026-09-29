# SceneForge AI — FIXED Vercel build

This package fixes the two build errors shown in your Vercel logs.

## What changed

1. `pyproject.toml` now explicitly pins Python 3.13:
   `requires-python = ">=3.13,<3.14"`

2. `bpy==5.2.2` is declared in `pyproject.toml`, because its wheel is CPython 3.13.

3. `requirements.txt` was removed so there is only one Python dependency source.

4. `api/render.py` is present and `vercel.json` points to the real function.

5. `.python-version` is also included as a secondary Python 3.13 pin.

## GitHub check before redeploying

At the ROOT of the repository you must see:

- `index.html`
- `pyproject.toml`
- `.python-version`
- `vercel.json`
- `package.json`
- `api/render.py`
- `api/chat.js`
- `api/models.js`

The `api` folder must NOT be inside another folder such as `sceneforge-vercel/api`.

## Vercel project settings

Framework Preset: Other

Root Directory: `./`

Enable Fluid Compute.

If the Blender function exceeds the normal bundle-size path, add this Environment Variable:

`VERCEL_SUPPORT_LARGE_FUNCTIONS=1`

Then redeploy without using the old build cache if Vercel offers that option.

## Expected Python build log

You should now see Vercel resolve Python 3.13 rather than:

`Using python version: 3.12`

The `bpy==5.2.2` wheel requires the `cp313` ABI, which is why 3.12 failed.

## Security

`api/render.py` is still a private hackathon MVP worker. It performs best-effort AST filtering, but it is not a hardened public arbitrary-Python sandbox.


# SceneForge AI — Vercel MVP

A one-page AI Blender coding agent with:

- Arabic/English scene prompts
- Reference image upload + client-side compression
- Provider URL + API key entered in the page for testing
- `/api/chat` same-origin proxy to avoid browser CORS problems
- **Refresh Models** button through `/api/models`
- Blender 5.2 worker on Vercel using the official `bpy` Python package
- Python code generation / modification
- Vercel render + GLB generation
- Interactive GLB viewer
- Vision critique + Auto-Fix + Re-render loop
- Responsive mobile/desktop UI

## Deploy to Vercel

1. Upload this folder to GitHub.
2. Import the repository in Vercel.
3. The project pins Python **3.13** via `.python-version`.
4. In **Vercel → Project → Settings → Environment Variables**, add:

   `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`

   This is important because `bpy` is a large dependency. New Vercel projects may already be enrolled in the Large Functions beta, but setting the variable explicitly is useful for existing projects.

5. Deploy.

The first deployment can take substantially longer because the Blender `bpy` wheel is large.

## Provider setup in the page

For NVIDIA Build:

- Base URL: `https://integrate.api.nvidia.com/v1`
- API key: your NVIDIA API key
- Click **تحديث** to try `GET /models`, then select a model.

For another OpenAI-compatible provider, enter its HTTPS `/v1` base URL and key.

The key is sent from the browser to **your Vercel `/api/chat` proxy** for that request. This code does not persist it. Do not pre-fill your private production key in public HTML.

## Blender worker

`/api/render.py` uses `bpy==5.2.2`, renders a 960×540 JPEG and exports a GLB.

The response returns data URLs so the MVP needs no database or object storage. To stay under Vercel's function payload limit, the worker omits the GLB if the combined output becomes too large; the render image is still returned so the visual-critic loop can continue.

### Security warning

The render endpoint executes AI-generated Python. It uses an AST allow-list and blocks obvious filesystem/network/process operations, but **this is not a hardened Python sandbox**. Treat this worker as a private hackathon/demo endpoint. Do not expose it as a public multi-tenant arbitrary-code execution service.

For a public production service, put Blender execution in isolated disposable containers/microVMs with network disabled and no secrets.

## If EEVEE does not render in the Vercel environment

The worker automatically tries Blender Workbench as a fallback. Cycles CPU can also be selected but will be slower.

## Files

- `index.html` — responsive frontend
- `api/chat.js` — AI provider proxy
- `api/models.js` — model-list proxy
- `api/render.py` — Blender/bpy Vercel worker
- `requirements.txt` — Blender 5.2.2 Python package
- `.python-version` — Python 3.13
- `vercel.json` — function duration configuration

## Official references

- Vercel Python runtime: https://vercel.com/docs/functions/runtimes/python
- Vercel function limits: https://vercel.com/docs/functions/limitations
- Blender Python package index: https://download.blender.org/pypi/bpy/
