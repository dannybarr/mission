# Local USB pilot

1. Open pilot/mission-core.exe. This is the native app; the browser preview cannot access USB storage.
2. Insert a removable USB drive. Select it, create a vault with a strong passphrase, then unlock. Creation does not format the drive or overwrite an existing mission directory.
3. Complete the interview. Use the supplied export prompt with Claude or ChatGPT if desired; import text, Markdown or Mission JSON. Review each fact, domain and privacy choice before saving. No seed memories are supplied.
4. In Agents, select Claude and explicitly grant only the domains and sensitivity levels intended for this test. Summary-only access currently withholds content; Sensitive is disabled.
5. Generate MCP configuration. Merge its mission entry into Claude Desktop Settings > Developer > Edit Config, preserving other servers. Node.js must be available. Restart Claude Desktop while Mission stays unlocked.
6. Ask Claude to search/read an allowed fact. Verify an ungranted domain is withheld. Revoke the grant and repeat. Pull the USB and repeat; new reads should fail. Previously received text cannot be recalled from Claude.
7. Unlocking a new session requires generating fresh MCP credentials and updating Claude configuration.

After removing the USB, the app clears the open session. When the same vault returns, including under a different drive letter, it should be recognised as an existing Mission and show **Unlock vault**. Enter the original passphrase; stored memories and grants should reappear without repeating onboarding. The passphrase and agent credentials are intentionally not remembered by the laptop. If two Mission vaults are attached, choose the correct one from the device list. Confirm the new MCP configuration before testing an agent again.

Use ordinary, replaceable facts for this pilot. OS memory locking is not established on this machine. Email/calendar/camera/health connections are planned and are labelled unavailable. The executable is an unsigned Windows development build and depends on the local workspace adapter script; it is not a portable installer.

## Optional hosted AI pilot

Requesty integration is available after unlocking the USB vault. In AI, enter the API key in the native app, discover model IDs or enter a configured Requesty policy/model ID, select up to 12 memory items, inspect the exact question and context, then approve each request. The key is held in the desktop process for the current vault session and cleared on lock or detected disconnect. It is not written to the vault or repository. A network request sends the selected content and question to Requesty and its model provider; information already sent cannot be recalled. Answers are ephemeral unless the user opens a memory draft and saves it. Model listing is a catalogue; the key's actual permissions are checked by Requesty when a model is used. The build and UI have been tested locally without a live user key, so live Requesty authentication and model use remain to be verified during the pilot.

The Requesty API uses https://router.requesty.ai/v1. The app calls /models and /chat/completions using the native backend. Official reference: https://docs.requesty.ai/ . Local Ollama remains future work.
