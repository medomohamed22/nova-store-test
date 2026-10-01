# Validation — AiWay 3.2.0

Validated locally on 2026-10-01 on Windows with Node.js v20.20.0 and installed Google Chrome. The deployment target is pinned to Node.js 22.x; the local test runtime differs from that target.

- Production frontend build: passed; public/index.html and public/assets generated and checked.
- Unit checks: 21 passed, including 11 new assistant-feature checks.
- Native server regression: 1 passed. An isolated real Codex app-server answered initialize sent immediately after WebSocket open and account/read returned no account. A Windows temporary-home PATH-alias warning did not prevent these checks.
- Browser integration checks: 26 passed, including 9 assistant-feature scenarios.
- Desktop, mobile, login, task-results and assistant-panel screenshots inspected. Screenshots and browser provider responses use test fixtures.
- Delivery ZIP checked with CRC32 and SHA-256; required sources, APIs, docs, public build and images verified. No node_modules, credentials, caches or protocol-schema artifacts are included.

New browser checks verified memory reload persistence and project isolation by inspecting actual intercepted request bodies; imported skill/persona/context-file injection; @ autocomplete and reference expansion; task-plan updates and persistence; cross-session text search and project reopening; chosen-provider failover before output; preserving partial responses without replay; redacted JSON/Markdown downloads; browser speech API invocation; editable skill drafts that are not saved or enabled automatically; Codex native plan notifications and rejection of late notifications from a previous project; and preserving project plans when restoring a backup.

Existing login cancellation/retry, polling after a missed completion event, Device Code rejection, one concurrent initialize handshake, reconnect, actual browser test pass/fail evidence, proposed-file verification, infinite-loop timeout, worker isolation, editor, ZIP, reload recovery, React/TSX, GitHub mocks, staged AI review, backups, split layout and project deletion remained covered.

No real ChatGPT approval, real model request, live GitHub upload, Private Blob persistence or Vercel deployment was performed. Provider traffic, OpenAI pages, WebSockets and speech synthesis are mocked in browser scenarios. Native testing validates transport/process startup, not account authorization or a complete model task. Actual voice output quality was not assessed and depends on installed voices. Enable Device Code on the real account and Fluid compute on Vercel, and verify the deployed login there.

Assistant memory and skills are local browser data. Skills are Markdown instructions with basic name/description frontmatter support, not executable Hermes plugins or full Agent Skills packages. Search is local lexical search, not vector retrieval. Context/reference expansion has documented size limits. Fallback is opt-in, limited to Compatible/OpenRouter/Gemini, and only occurs before visible output or tool effects. JSON/Markdown exports use an AiWay schema and common secret-pattern redaction, not a complete secret detector or Hermes trace format.

The browser test runner implements a documented subset of node:test/assert in an isolated worker; it does not execute arbitrary npm suites. TypeScript compilation strips types without type checking. English mode translates navigation and selected task UI, not every assistant-panel label or setting.
