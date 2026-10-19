# Agent handoff

Mission Core is the USB-owned personal memory desktop product. The adjacent marketing website is a separate project and is not included here.

## Start here

Read README.md, STATUS.md, SECURITY.md, MCP.md and PILOT.md. Frontend: React/TypeScript/Vite. Desktop: Tauri 2/Rust. Encrypted vault: SQLCipher with passphrase-wrapped key. No Mission account or hosted identity service. The removable vault and passphrase are the access boundary.

## Run and build

- Node.js and npm: npm ci; npm run dev (browser design preview only); npm run build.
- Checks: npm test; npx playwright install chromium; npm run test:e2e; node --test tests/mcp-adapter.test.mjs.
- Windows native development: scripts/bootstrap-native.ps1 provisions local GNU tooling. scripts/test-native.ps1 runs native tests; add -DesktopBuild to build the embedded desktop after npm run build. See the script for toolchain prerequisites and output path (TEMP/mission-core-native-target/debug).
- For the local pilot, keep mission-core.exe beside WebView2Loader.dll. WebView2 runtime is required. The MCP adapter currently resolves scripts/mission-mcp.mjs from the build workspace: keep that workspace present. A distributable installer must bundle and resolve the adapter as an application resource.
- No compiled desktop binary, downloaded toolchain, dependency directory or private vault is committed. Build from source; this is an unsigned development pilot.

## Current implementation

Handjet is bundled locally. Globe logo, cream canvas and blue haze follow user direction. Empty onboarding collects identity, work, goals and routines, offers a memory export prompt, imports text/Markdown/JSON, and requires review before atomic saving to the USB. Agent access defaults to none. MCP is read-only search/get, with per-agent credentials, grants and session epochs. Setup formats exist for Claude Desktop, Codex, Cursor, Gemini CLI, GitHub Copilot in VS Code and generic local stdio clients. Other profiles must remain clearly marked adapter pending.

## Hosted AI pilot

The user has a Requesty API key restricted to approved models and says models are configured. The app now asks for the key in the unlocked native AI page, lists Requesty models or accepts a configured policy ID, and sends only explicitly selected memory after per-request approval. No key has been supplied or stored in this workspace. Live authenticated calls remain untested. Never log credentials or memory, or commit them. Hosted inference sends selected context off device. Local laptop inference comes later.

## Verification and remaining gates

Latest revision: frontend and Windows native builds pass; 22 TypeScript unit tests, eight browser flows, 26 Rust tests and one Node adapter test pass. No real USB or live external-agent test has been performed. SQLCipher VirtualLock error 1453 means locked RAM cannot be claimed on this host. Physical unplug timing, OS write tracing, recovery and signed packaging remain unverified or unfinished. Email, calendar, camera and health connectors are not implemented. Do not claim the complete product is production-ready.

Do not seed personal memories, format drives, enable broad agent access by default, or represent a configuration as a verified connection. Preserve review before saving imports and AI proposals.

Requesty pilot is now implemented. The key is entered inside the unlocked native app and held for that session. The owner chooses a model or policy and approves selected memory for each call. The resulting answer is temporary unless reviewed and saved. See PILOT.md. No live Requesty call or physical USB test is claimed yet.
