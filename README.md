# AiWay — Codex workspace edition

AiWay is a lightweight browser IDE/chat workspace designed for Vercel. It keeps the existing provider system, supports ChatGPT/Codex device-code login, and adds project, review, recovery, GitHub, preview, and IDE workflows without requiring a Google login.

## Files

- `index.html` — complete UI and browser workspace.
- `api/session.js` — creates the isolated browser session cookie.
- `api/ws.js` — WebSocket bridge to the official Codex app-server plus workspace sync.
- `vercel.json` — Vercel function and security headers.

## Authentication

### OpenAI Codex

Codex can sign in with the ChatGPT device-code flow. Credentials are isolated per AiWay browser session. If Private Vercel Blob and `AIWAY_CREDENTIAL_KEY` are configured, the Codex auth file is encrypted before persistent storage.

### Gemini

Gemini remains available as a normal provider using a Gemini API key entered in Settings. **Google OAuth/sign-in has been removed completely** from this build: there is no `/api/google` route, Google OAuth UI, Google OAuth environment variables, or OAuth token storage.

## The 10 workspace upgrades

1. **Projects** — recent work is treated as persistent projects in IndexedDB, with rename and duplicate actions.
2. **GitHub integration** — load a repository branch and create commits/push from the browser with a fine-grained PAT. The token stays in browser storage and is sent directly to GitHub.
3. **Diff review** — Codex workspace changes are staged and shown before they replace the editor files. Changes can be accepted/rejected per file or all at once.
4. **Version history** — automatic restore points are created around important file changes, plus manual checkpoints and one-click restore.
5. **Agent Mode** — adds execution-oriented instructions so coding agents inspect, modify, and verify rather than only explain.
6. **Workspace Terminal** — a safe diagnostic terminal for project reads (`ls`, `cat`, `head`, `tail`, `wc`, `grep`, virtual `git status`, and `npm run` script discovery). It deliberately does not execute arbitrary shell code in the same process that holds Codex credentials.
7. **Preview error detection** — the preview reports runtime errors back to AiWay and exposes “Fix with AI”, which primes Agent Mode with the captured error.
8. **Auto provider routing** — when enabled, coding requests prefer a connected Codex account; otherwise AiWay keeps the selected provider.
9. **Context controls** — choose whether the model receives the whole project, current file priority, preview errors, and terminal output.
10. **IDE UX** — file search, open-file tabs, Command Palette (`Ctrl/Cmd + K`), save shortcut (`Ctrl/Cmd + S`), expanded workspace tabs, and a status bar.

## Deploy on Vercel

1. Import the project into Vercel.
2. Add a Private Blob store if you want Codex login to survive cold starts.
3. Add `AIWAY_CREDENTIAL_KEY` as a long random environment variable.
4. Deploy.
5. Open Settings → OpenAI Codex → “تسجيل الدخول بحساب ChatGPT”.

For Gemini/OpenRouter/compatible providers, add the API key in AiWay Settings. Keys are browser-side and are sent directly to the selected API provider.

## Security notes

- Codex auth is never placed in the HTML or browser localStorage.
- Google OAuth support is intentionally absent.
- GitHub PAT storage is opt-in; session storage is the default.
- The built-in terminal is intentionally restricted instead of exposing arbitrary server shell execution next to authentication material.
- Preview runs in a sandboxed iframe. Always review generated code before production use.
