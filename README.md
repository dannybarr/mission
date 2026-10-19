# Mission Core

A device-owned memory application, separate from the amission.si marketing website.

**Status: development foundation, not a production vault.** The browser interface is runnable. Native vault code and tests are included; consult `STATUS.md` for actual execution evidence. No milestone is considered complete until its security acceptance tests pass on real hardware.

## Run the interface

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:1420. Choose **Explore Mission** to use an empty, temporary workspace. The preview deliberately cannot open a real vault, contact an agent, or connect an account. Lock or reload to discard preview changes. Do not enter real personal information into the browser preview: browsers and operating systems can retain process memory outside application control.

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

## Native desktop development

The source uses Tauri 2, Rust, React, SQLCipher, Argon2id, and AES-256-GCM wrapping of a random vault key. A compatible Rust/C/C++ toolchain, Perl and Make are needed to compile bundled SQLCipher/OpenSSL. Tauri also needs platform WebView dependencies.

```sh
cd src-tauri
cargo test --lib
cd ..
npm run desktop
```

On Windows, `scripts/bootstrap-native.ps1` installs a project-local GNU Rust/compiler toolchain for core testing; `scripts/test-native.ps1` uses it. This is not a supported signed Windows release toolchain. Use Tauri's recommended MSVC prerequisites for desktop packaging. macOS signing and notarization require a Mac and developer credentials.

The app discovers removable volumes. It will not create a vault at an arbitrary host path. Creation makes a new `mission` directory, never overwrites an existing directory, and never formats the drive. A failed partial creation is left intact for inspection rather than deleted automatically.

**Do not use this build for irreplaceable data.** Recovery, authenticated updates, platform memory hardening, native unmount events and physical unplug validation are not complete.

## Implemented source

- Paper-white locked and sample interfaces with locally bundled Handjet; memory capture/edit/search; provenance; permission controls; per-item access preview; explicit planned integrations.
- Versioned memory contract and deny-by-default permission model.
- Native encrypted vault creation/unlock, transactional revisions and audit records, encrypted saved grants, device presence checks, and session destruction on failed checks.
- Tests for wrapping, incorrect passphrases, manifest tampering, overwrite prevention, encrypted database header, and removal denial.
- Text/Markdown and Mission JSON import staging; individual review acceptance/dismissal; encrypted revision history and restore-as-new-revision controls. Native storage tests pass; physical USB validation remains pending.
- Monotonic session leases and epoch checks to deny expired requests independently of blocked storage I/O.
- Per-agent read-only MCP bridge and client setup; hosted Requesty pilot with session-only key, explicit selected-context review and per-request approval.

## Not implemented

Summaries, agent-originated proposals, Ollama, connectors, Sensitive's second unlock, recovery, OS device-event subscriptions, hardware identity binding, global capture hotkey, tray, encrypted export, graph/timeline, deletion/undo, signed updates and signed installers. The UI labels unavailable capabilities instead of simulating connections.

See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [MCP.md](MCP.md), and [STATUS.md](STATUS.md).

## Windows pilot

The desktop executable is built at pilot/mission-core.exe. See [PILOT.md](PILOT.md) for device onboarding, Requesty key entry in the AI page, and agent MCP setup. Current verification results and limits are in [STATUS.md](STATUS.md).
