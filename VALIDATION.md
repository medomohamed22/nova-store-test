# Validation — AiWay 3.1.0

Validated locally on 2026-10-01 on Windows with Node.js v20.20.0 and installed Google Chrome. The supported deployment target is Node.js 22.x, as pinned in package.json; the local runtime differs from that target.

- Production frontend build: passed; public/index.html and public/assets generated.
- Unit checks: 10 passed.
- Native server regression: 1 passed. A real isolated Codex app-server process answered initialize sent immediately on WebSocket open, then account/read returned no logged-in account.
- Browser integration checks: 17 passed.
- Desktop, mobile, task-results and login screenshots inspected. Login screenshot uses a mock code, not real credentials.
- Delivery ZIP checked with CRC32 and SHA-256; expected source, API, build and public files verified.

Browser checks covered login cancellation/retry, polling after a missed login-completion notification, device-code rejection without a stuck button, concurrent startup/login sharing one handshake, automatic reconnect, task templates and language direction, real JavaScript test pass/fail evidence, running tests against proposed files before acceptance, terminating an infinite-loop test while the app stays responsive, and preventing test code from accessing DOM/localStorage/network.

Existing editor, dark theme, ZIP roundtrip, reload recovery, ordered multi-file JavaScript, React/TSX preview, GitHub upload preservation using a mocked API, staged AI review, backup/restore, split layout, keyboard resizing and project deletion also passed.

No real ChatGPT account login, real AI request, live GitHub upload, Private Blob persistence or Vercel deployment was performed. Login browser tests mock the app-server protocol and OpenAI page. The native regression validates transport and process startup, not account authorization. Enable Device Code on the real account and Fluid compute on Vercel, then verify the deployed login with that account.

The in-browser test runner implements a documented subset of node:test and node:assert/strict in a sandboxed worker. It does not run arbitrary npm test suites or backend services. TypeScript preview/test compilation strips types; it is not type checking. English mode translates navigation, task templates and task labels, not every setting or message.
