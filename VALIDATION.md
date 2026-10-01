# Validation — AiWay 3

Validated locally on 2026-10-01 using Windows, Node.js v20.20.0 and installed Google Chrome. Deployment and Codex require Node.js 22 or newer as declared in package.json.

- Production frontend build: passed.
- Vercel outputDirectory: public; generated public/index.html and public/assets verified.
- Local browser checks serve the generated public directory.
- Node engine pinned to 22.x.
- Unit checks: 6 passed.
- Browser integration checks: 9 passed.
- npm audit during dependency installation: zero reported vulnerabilities.
- Mobile and desktop screenshots inspected.

Browser checks covered editor editing, dark theme, ZIP import/export, persistence after reload, ordered multi-file scripts, React/TSX, GitHub upload preservation using a mocked API, staged AI changes using a mocked streaming provider, backup/restore, split layout, keyboard resizing, automatic Codex reconnect using a mocked socket, and deleting the active project.

No real account login, real provider request, live GitHub upload, Private Blob persistence or Vercel deployment was performed. These require user account credentials and hosting configuration. TypeScript preview compiles types away; it is not full type checking. Preview supports text/SVG files and bundled React packages, not arbitrary npm packages or backend services.
