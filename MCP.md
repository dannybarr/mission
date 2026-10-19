# Mission MCP pilot

Implemented transport: Claude Desktop launches scripts/mission-mcp.mjs over newline-delimited JSON-RPC stdio. It forwards to an authenticated loopback TCP broker in the unlocked desktop app. This is not an HTTP endpoint and must not be published.

Generate configuration in Agents. A random session credential binds the caller to one agent and vault epoch. It is kept in process memory; locking invalidates credentials. Generating another credential for the same agent replaces the old one. Saved grants are evaluated for every read. Node.js is required by the adapter.

Tools: memory_search (bounded permitted metadata results) and memory_get (permitted full item, without links). Default-deny scope, sensitivity, exclusions and expiry apply. Summary-only and Sensitive grants withhold content. There are no agent write tools, resources, connector credentials or generated summaries in this pilot.

Validation: Rust broker and policy tests plus a real Node stdio adapter test pass. A live Claude Desktop session and physical USB removal remain unverified. Follow PILOT.md. Already delivered content can remain in the agent conversation after revocation.

Multi-agent setup: Codex receives TOML, Cursor and Gemini CLI receive mcpServers JSON, and GitHub Copilot in VS Code receives servers JSON with type stdio. Custom agent exposes the generic local configuration. Each selected agent receives its own credential and saved permissions. Other listed products have permission profiles only until a verified adapter is available. Client-specific live connections remain to be tested.

References: https://prod.cursor.com/docs/mcp ; https://geminicli.com/docs/tools/mcp-server/ ; https://code.visualstudio.com/docs/agents/reference/mcp-configuration . Codex syntax verified against installed codex mcp add --help.
