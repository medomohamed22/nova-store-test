# AiWay + ChatGPT/Codex on Vercel — fixed build

This package uses three Vercel Functions:

- `api/session.js`
- `api/ws.js`
- `api/google.js` (optional official Google OAuth + Gemini proxy)

Do **not** add `.mjs` copies with the same names. Vercel treats `api/session.js` and `api/session.mjs` as the same route (`/api/session`) and rejects the project as a conflicting path.

## Deploy

1. Upload/import the **contents of this folder** as the project root.
2. Confirm the repository contains the three `.js` Functions above and **no** duplicate `.mjs` routes.
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
- That function starts `codex app-server --listen stdio://` inside the Function, bridges JSON-RPC messages, and synchronizes the browser workspace with Codex before/after each turn so native Codex file tools work against the same files.
- `/api/google` implements optional official Google OAuth for the Gemini API and proxies Gemini requests without exposing OAuth tokens to the browser.
- The browser uses Codex device-code login for ChatGPT.
- If Private Blob + `AIWAY_CREDENTIAL_KEY` are configured, `auth.json` is encrypted with AES-256-GCM before persistence.

## Important

`package.json` already has `"type": "module"`, so `.js` Functions use ESM correctly. Do not rename them to `.mjs` unless you also remove the `.js` files and update `vercel.json` consistently.


## Optional Google sign-in for Gemini

AiWay can use Gemini either with the existing AI Studio API key flow or with official Google OAuth for the Gemini API. OAuth is **not** implemented by copying/reusing Gemini CLI or Antigravity credentials.

1. In Google Cloud, enable the Generative Language API.
2. Configure the Google Auth consent screen.
3. Create an OAuth 2.0 **Web application** client.
4. Add this redirect URI exactly: `https://YOUR-DOMAIN/api/google?action=callback`.
5. Add `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_CLOUD_PROJECT` to Vercel.
6. Keep Private Vercel Blob and `AIWAY_CREDENTIAL_KEY` configured; Google refresh tokens are encrypted before storage.
7. Redeploy, open Settings, and use **تسجيل الدخول بحساب Google**.
