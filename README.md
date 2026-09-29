# AiWay + ChatGPT/Codex on Vercel

This version runs the official `@openai/codex` app-server inside a Vercel WebSocket Function and lets the browser authenticate with ChatGPT using Codex device-code login.

## Deploy

1. Import this folder/repository into Vercel.
2. Create a **Private Vercel Blob** store and connect it to the project (recommended).
3. Add environment variable `AIWAY_CREDENTIAL_KEY` with a long random value (32+ random bytes; do not expose it to the browser).
4. Deploy.

Generate a key locally, for example:

```bash
openssl rand -base64 48
```

Private Blob can authenticate with either a connected `BLOB_READ_WRITE_TOKEN` or Vercel OIDC. This project still requires `AIWAY_CREDENTIAL_KEY` before it persists ChatGPT credentials.

If Vercel reports that the Codex Function bundle exceeds 250 MB, enable Fluid Compute / Large Functions. For older projects set `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` and redeploy; newer projects are normally enrolled automatically.

## How login works

- `/api/session` creates a random HttpOnly, Secure, SameSite=Strict browser session cookie.
- `/api/ws` creates an isolated temporary `CODEX_HOME` for that browser session and starts `codex app-server --stdio`.
- AiWay calls `account/login/start` with `type: chatgptDeviceCode`.
- The user opens OpenAI's device verification page and enters the shown code.
- Codex writes `auth.json` in its isolated home.
- If Private Blob + `AIWAY_CREDENTIAL_KEY` are configured, the server encrypts `auth.json` with AES-256-GCM before storing it.

## Important

- ChatGPT credentials are never placed in localStorage or JavaScript.
- Do not make the Blob store public.
- Clearing browser cookies creates a new AiWay session and the old encrypted credential object becomes unreachable from that browser.
- Vercel WebSocket Functions are currently a platform feature with plan/runtime limits; long chats depend on the WebSocket Function remaining alive.
