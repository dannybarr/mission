# Mission Core pilot status — 19 October 2026

Mission Core is an unsigned Windows desktop pilot, not a production security release. The native app builds and opens. The browser at http://127.0.0.1:1420 is a temporary design preview and cannot use a USB vault.

Implemented: empty device-owned encrypted vault; no Mission account; globe identity, Handjet, cream/blue-haze interface; five-step reviewed onboarding; text/Markdown/JSON imports; human memory editor and history; default-deny per-agent grants; read-only MCP search/get with separate agent credentials; setup formats for Claude Desktop, Codex, Cursor, Gemini CLI, GitHub Copilot in VS Code and generic stdio clients.

Hosted AI pilot: Requesty key entered after USB unlock in the AI page, held in native session memory, cleared on lock or detected disconnect. The app retrieves a model catalogue or accepts a Requesty model/policy ID. Each request requires a question, explicit memory selection, payload review and consent. Responses stay temporary unless opened as a memory draft and manually saved. The Requesty key is not saved to the USB, app settings or Git. The selected context and question leave the device when Ask is pressed. Model listing does not prove a given key can use each listed model.

Verified locally: production frontend build; 26 TypeScript tests; 9 Playwright browser flows; 26 Rust native tests from the previous native validation; Node MCP adapter integration test; Windows native compile and executable build. The latest browser checks cover the new memory prompt and its response to saved context and domain filters. Device-selection unit tests cover a returning vault with a changed drive letter. Desktop key-entry and Requesty response paths have not been exercised with a real key because none was supplied. Browser tests cannot prove native USB and hosted API behaviour.

Remaining pilot gates: retest physical USB reinsert and unlock with this revision, live Requesty call, live agent interoperability, OS write tracing and recovery. The user reported successful context revocation on removal in the first pilot. Email, calendar, camera and health connectors, local laptop AI, signed installer and updates remain unfinished. No removable drive was detected during this revision, so the reinsert fix has not yet been physically verified.

Security limitations: SQLCipher reported VirtualLock error 1453, so locked RAM and absence of pagefile copies cannot be claimed. The GNU development build emitted a multiple-manifests linker warning. A lease check is not proof of the physical one-second unplug target. Already transmitted content can remain with a model provider or agent.

See PILOT.md and SECURITY.md. No API key, seed memory, real account connection or compiled binary is committed.
