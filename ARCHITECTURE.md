# Mission Core architecture

## Boundaries

React holds the visible session state in memory. It has no localStorage, IndexedDB, service worker, filesystem plugin or remote HTTP permission. Browser preview uses fictional data and never invokes a real vault. Tauri IPC is the only native path.

Rust owns the database and validates writes independently of TypeScript. All commands recheck the vault before and after work. A single mutex serializes storage and unlock transitions. Passphrases, wrapping keys, database-key formatting buffers and intermediate serialized payloads use zeroizing buffers where practical. SQLCipher owns its in-process key material until the connection is dropped.

The renderer is not the agent bridge. Future agents must use a distinct authenticated dispatcher, never the owner IPC commands. A renderer compromise remains an owner-session compromise; the frontend must not render untrusted HTML or execute memory contents.

## Vault layout and lifecycle

```
<removable volume>/mission/
  manifest.json    public signed format identity and wrapped random key
  vault.db         SQLCipher canonical store
  vault.db-journal encrypted rollback journal during transactions
```

Creation requires a freshly enumerated removable mount, an unused directory, and a passphrase of at least 14 UTF-8 bytes. Argon2id uses 64 MiB, three passes, one lane and a 16-byte random salt. The derived key wraps a random 256-bit database key with AES-256-GCM and a fresh 96-bit nonce. Canonical serialized header data is authenticated as associated data. An Ed25519 signature protects manifest consistency. The database stores the corresponding vault ID internally.

The signature is self-signed: it does not certify genuine Mission hardware or prevent cloning. It is not presented as such. Volume UUID enrollment and secure-element attestation remain future work.

SQLCipher is checked at runtime (`cipher_version`). A build that silently links ordinary SQLite fails closed. Temp storage is memory-only, mmap is disabled, journal mode is DELETE, synchronous mode is FULL, and secure deletion and cipher memory security are requested. Queries use parameters; the sole dynamic SQL key pragma contains only hex-encoded random key bytes in a zeroizing buffer.

The removal fallback checks files every 200 ms. The UI checks session status every 250 ms and clears on error; it does not repeatedly fetch personal content. Snapshots are requested only after unlock and mutations. These are implementation intervals, **not a demonstrated one-second security guarantee**. Cached reads, blocked I/O, long transactions, sleep/resume and scheduling can delay detection. Native unmount events plus a deadline-driven session lease are required before acceptance.

## Data

`src/model.ts` defines the UI contract. `src-tauri/src/model.rs` validates native writes. JSON Schema in `schemas/memory-item.schema.json` publishes the portable contract. Domain and item types follow the brief; structured validation currently specializes commitments, routines and metrics. Other types have a bounded extensible object.

Each accepted owner edit checks the revision number, preserves original source and creation time, stamps owner provenance on the backend, and transactionally writes current memory, history and an audit row. The renderer cannot spoof the author of an accepted owner change. Audit is encrypted in the same database.

Sensitive items are rejected by native validation and access policy until independent unlock exists. Summary grants return no detailed items. Aggregate summaries must be generated exclusively from a principal's allowed records, including item/tag exclusions; a general domain summary would leak excluded information.

## Visual direction

- Canvas `#F6F6F4`, surface `#FFFFFF`, ink `#222527`, graphite `#2B2D31`, connection blue `#286598`, hairlines `#E5E7E2`.
- System grotesk (Segoe UI Variable / Segoe UI / Apple system) avoids runtime font requests. Consolas is reserved for JSON and keyboard hints.
- Persistent quiet navigation, generous workspace, list/detail memory view, per-agent controls, simple modal capture.
- A physical graphite device is the distinctive locked-screen element. Locked screen never displays a vault name, item, person or previous session detail.
- Keyboard focus, native modal focus containment and reduced-motion support. Small-screen navigation collapses visually while retaining accessible button names.

## Delivery order

1. Compile native core; execute tests; prove create/unlock/remove on a disposable USB device and scan host writes.
2. Finish memory deletion, history/undo, structured editors and migration tests.
3. Build authenticated MCP transports and independent policy tests before enabling any agent badge.
4. Imports/triage/interview, then local AI, then explicit-permission connectors.
5. Platform hardening, recovery, signed distribution and updates.

No telemetry or remote relay is configured. The working directory is OneDrive-backed; **never put a real vault or decrypted fixture in this repository**.
