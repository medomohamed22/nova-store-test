# AiWay + ChatGPT/Codex on Vercel — fixed build

This package has been cleaned so Vercel sees exactly two Functions:

- `api/session.js`
- `api/ws.js`

Do **not** add `.mjs` copies with the same names. Vercel treats `api/session.js` and `api/session.mjs` as the same route (`/api/session`) and rejects the project as a conflicting path.

## Deploy

1. Upload/import the **contents of this folder** as the project root.
2. Confirm the repository contains only:
   - `api/session.js`
   - `api/ws.js`
   and **no** `api/session.mjs` / `api/ws.mjs`.
3. Deploy once without changing `vercel.json`.
4. Recommended: create a **Private Vercel Blob** store and connect it to the project.
5. Add `AIWAY_CREDENTIAL_KEY` in Vercel Environment Variables with a long random secret.
6. Redeploy.

Generate a secret locally:

```bash
openssl rand -base64 48
```

## Why the previous builds failed

### Error 1

`The pattern "api/ws.mjs" defined in functions doesn't match any Serverless Functions`

The project config pointed to `api/ws.mjs`. The fixed config targets `api/ws.js`, which is the single WebSocket Function shipped in this package.

### Error 2

`api/session.js has conflicts with api/session.mjs`

Both files map to `/api/session`. The `.mjs` duplicate has been removed. The same cleanup was applied to `ws`.

## Runtime architecture

- `/api/session` creates the HttpOnly browser session cookie.
- `/api/ws` is the Vercel WebSocket Function.
- That function starts `codex app-server --listen stdio://` inside the Function and bridges JSON-RPC messages between the browser and Codex.
- The browser uses Codex device-code login for ChatGPT.
- If Private Blob + `AIWAY_CREDENTIAL_KEY` are configured, `auth.json` is encrypted with AES-256-GCM before persistence.

## Important

`package.json` already has `"type": "module"`, so `.js` Functions use ESM correctly. Do not rename them to `.mjs` unless you also remove the `.js` files and update `vercel.json` consistently.
