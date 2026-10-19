# Local USB pilot

1. Open pilot/mission-core.exe. This is the native app; the browser preview cannot access USB storage.
2. Insert a removable USB drive. Select it, create a vault with a strong passphrase, then unlock. Creation does not format the drive or overwrite an existing mission directory.
3. Complete the interview. Use the supplied export prompt with Claude or ChatGPT if desired; import text, Markdown or Mission JSON. Review each fact, domain and privacy choice before saving. No seed memories are supplied.
4. In Agents, select Claude and explicitly grant only the domains and sensitivity levels intended for this test. Summary-only access currently withholds content; Sensitive is disabled.
5. Generate MCP configuration. Merge its mission entry into Claude Desktop Settings > Developer > Edit Config, preserving other servers. Node.js must be available. Restart Claude Desktop while Mission stays unlocked.
6. Ask Claude to search/read an allowed fact. Verify an ungranted domain is withheld. Revoke the grant and repeat. Pull the USB and repeat; new reads should fail. Previously received text cannot be recalled from Claude.
7. Unlocking a new session requires generating fresh MCP credentials and updating Claude configuration.

Use ordinary, replaceable facts for this pilot. OS memory locking is not established on this machine. Email/calendar/camera/health connections are planned and are labelled unavailable. The executable is an unsigned Windows development build and depends on the local workspace adapter script; it is not a portable installer.
