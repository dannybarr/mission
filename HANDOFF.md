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

## Next authorized work: hosted AI pilot

The user has a Requesty API key restricted to approved models and says models are already configured. No key has been supplied or stored. Requesty integration is NOT implemented. Verify Requesty's current routing/model discovery API rather than repeatedly asking the user to name a model. Add in-app key entry, approved-model selection or configured routing, explicit context consent and a reviewed proposal flow. Prefer session-only credentials; any persisted secret must be encrypted on the USB. Never log credentials or memory, or commit them. Hosted inference sends selected context off device and must be disclosed honestly. Local laptop inference comes later.

## Verification and remaining gates

Latest multi-agent revision: frontend and Windows native builds pass; 22 TypeScript unit tests and seven browser tests pass. Previous backend revision: 25 Rust tests and one Node adapter test pass. No real USB or live external-agent test has been performed. SQLCipher VirtualLock error 1453 means locked RAM cannot be claimed on this host. Physical unplug timing, OS write tracing, recovery and signed packaging remain unverified or unfinished. Email, calendar, camera and health connectors are not implemented. Do not claim the complete product is production-ready.

Do not seed personal memories, format drives, enable broad agent access by default, or represent a configuration as a verified connection. Preserve review before saving imports and AI proposals.
