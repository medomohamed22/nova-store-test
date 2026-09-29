# SceneForge AI — Root Fixed Architecture

This version intentionally **does not run Blender inside Vercel**.

## Why

The previous Vercel Python function could install `bpy`, but at runtime Blender failed with:

`ImportError: libX11.so.6: cannot open shared object file`

Blender on Linux depends on native X11/EGL/graphics libraries. The Vercel Python Function runtime is not a general Docker/apt environment, so the reliable architecture is:

- **Vercel:** frontend + AI API proxy + model discovery
- **Docker worker:** Blender 5.2.2 + X11/Mesa/Xvfb + render/export

The NVIDIA `ResourceExhausted` error is separate. `api/chat.js` now automatically retries 429/503/ResourceExhausted responses with exponential backoff.

## Repository

```
index.html
api/
  chat.js
  models.js
worker/
  Dockerfile
  app.py
  driver.py
  requirements.txt
vercel.json
package.json
```

## 1. Deploy frontend to Vercel

Import this repository into Vercel.

Framework preset: **Other**

No Python dependencies are needed anymore.

## 2. Deploy the Blender worker

Deploy the `worker/` directory to any service that supports Docker containers with at least ~2 GB RAM.

Recommended for this hackathon:
- Nebius VM / container host
- Railway
- Render paid container
- Fly.io
- Any VPS with Docker

Build locally:

```bash
cd worker
docker build -t sceneforge-worker .
docker run --rm -p 8080:8080 \
  -e SCENEFORGE_WORKER_TOKEN=change-me \
  sceneforge-worker
```

Test:

```bash
curl http://localhost:8080/health
```

Expected response includes Blender 5.2.2.

Then put the public worker origin in the SceneForge page, for example:

`https://worker.example.com`

Do not append `/render`; the UI adds that automatically.

## 3. Optional worker security

Set:

`SCENEFORGE_WORKER_TOKEN=some-long-random-secret`

Then type the same token in the Worker Token field in the page.

Set allowed site origin if desired:

`ALLOWED_ORIGINS=https://your-vercel-site.vercel.app`

## NVIDIA hosted endpoint saturation

If you see:

`ResourceExhausted: Worker local total request limit reached`

that is upstream model capacity/rate limiting, not Blender.

This project now retries automatically 3 times.

If it still happens:
1. wait 10–30 seconds and retry;
2. choose another model;
3. switch Provider to Nebius Token Factory for the final hackathon deployment.

## Security

The worker rejects non-Blender imports and several dangerous Python names, but it is still a hackathon MVP, not a hardened multi-tenant sandbox. For production, execute each job in a disposable isolated container/microVM with no secrets and network disabled.
