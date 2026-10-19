# Security posture and release gates

This is unaudited development software. Do not interpret the frontend or the presence of encryption code as a security certification. No physical USB removal timing, cold-boot resistance or host-disk non-persistence guarantee is established.

## Threat model (STRIDE)

| Threat | Implemented boundary | Residual risk / release gate |
|---|---|---|
| Spoofed device or copied vault | Self-signed manifest, wrapped key authenticated with header, encrypted vault ID checked | A self-signed key is not a manufacturer trust anchor. Copies are indistinguishable. Add enrolled volume identity; secure element later. |
| Stolen stick | Argon2id plus random wrapped database key and SQLCipher | Offline guesses remain possible with weak passphrases. Recovery and key rotation absent. |
| Tampering | AES-GCM wrapper authentication, Ed25519 manifest check, SQLCipher authenticated pages | Whole-vault rollback is not prevented; host file-path race resistance needs platform handle-relative opens. |
| Repudiation | Revisions and audit records committed in one encrypted transaction | Audit is not append-only or independently anchored. No signed audit export. |
| Information disclosure | Device-only database paths, in-memory temp store, no renderer persistence API, sensitive domain disabled | OS pagefile, hibernation, dumps, browser/WebView caches, screenshots, accessibility clients, malware and previously shared agent context remain risks. Zeroizing selected buffers does not erase every copy. |
| Denial of service | Bounded inputs, version conflict detection, exclusive vault creation, parameterized queries | Disk full, surprise removal during writes, malformed database and blocking OS I/O require fault injection. |
| Elevation of privilege | Default-deny policy; authenticated read-only agent surface; no filesystem/shell plugin permission | Owner IPC is privileged. XSS or compromised dependencies in an unlocked renderer can act as owner. Loopback broker credentials are bound to an agent and session. |
| Malicious connector | No connector execution or tokens in this build | Future connectors need explicit scopes, isolated execution, revocation and proposal-only ingestion. |
| Prompt injection | Content displayed as plain text; no AI or action execution enabled | Future model output must be untrusted, schema-validated proposals; retrieved memory must never become system instructions. |

## Before calling milestone 1 complete

- [ ] Native crypto/storage tests pass on supported build platforms.
- [ ] Confirm SQLCipher file and journal ciphertext using a unique synthetic canary.
- [ ] Trace process file writes using Procmon (Windows) / fs_usage (macOS); inspect temp, WebView profiles, app support, crash reports and logs for that canary.
- [ ] OS event handling and watchdog lease revoke access within one second in repeated physical unplug tests, including blocked I/O and active writes.
- [ ] Locked UI drops all session state and in-flight callbacks cannot restore it.
- [ ] Disable or constrain core dumps, page swapping, hibernation and WebView persistence where the platform permits; document exceptions.
- [ ] Power-loss, disk-full, read-only, corruption, drive-letter reuse, reconnect and rollback tests.
- [ ] Reject symlink/junction/reparse substitution using native handle-based operations, not only path checks.
- [ ] Recovery creation, restore and passphrase-change tests.
- [ ] Independent security review before real personal data is recommended.

Browser tests cover UI clearing only. Unit tests with temporary directories cover logic only. Neither substitutes for hardware removal and OS write tracing. Native test fixtures are synthetic and may be written to the host test temp directory; this is not a production storage path.

## Reporting

Until a private reporting channel is established, provide reproducible findings directly to the project owner. Do not post real memory, credentials, vault keys or unredacted logs in issues.

## Windows pilot observations

25 native tests pass. SQLCipher reports VirtualLock error 1453 on this host; page locking is not established. The executable is an unsigned GNU development build with a multiple-manifests linker warning. Physical unplug timing, host write tracing and live Claude testing remain acceptance gates.

## Requesty pilot

The optional hosted AI pilot uses Requesty's OpenAI-compatible endpoint. The API key is held in native process memory for the unlocked vault session, never persisted. The owner selects which memory items to send and approves each request. Returned text is temporary until manually reviewed and saved as a new memory. The model catalogue may include models the key cannot access; Requesty enforces the key's restrictions on the actual call. Hosted context and prompts may remain with external providers after the vault is locked. Local inference is a separate future milestone.
