export function agentSetup(agent: string) {
  const instructions: Record<string, string> = {
    "Claude Desktop":
      "Open Settings → Developer → Edit Config. Merge the mission entry into mcpServers, preserving existing entries, then restart Claude Desktop.",
    Codex:
      "Merge this TOML into your user .codex/config.toml, preserving other servers. Restart your Codex session.",
    Cursor:
      "Merge this JSON into your user .cursor/mcp.json. Reload Cursor and enable Mission in MCP settings.",
    "Gemini CLI":
      "Merge this JSON into your user .gemini/settings.json. Restart Gemini CLI and check /mcp.",
    "GitHub Copilot (VS Code)":
      "Merge this JSON into .vscode/mcp.json. Use MCP: List Servers in VS Code to start Mission and review its tools.",
    "Custom agent":
      "Use this command, args and env configuration with a local stdio MCP client. Your client may require a different configuration wrapper.",
  };
  return {
    supported: agent in instructions,
    instructions:
      instructions[agent] ??
      "Permissions can be prepared here. A verified connection adapter for this app is not available yet. Use Custom agent only if your client supports local stdio MCP.",
  };
}

export function formatAgentConfig(agent: string, config: unknown): string {
  const server = (
    config as {
      mcpServers: {
        mission: {
          command: string;
          args: string[];
          env: Record<string, string>;
        };
      };
    }
  ).mcpServers.mission;
  if (agent === "Codex") {
    return `[mcp_servers.mission]\ncommand = ${JSON.stringify(server.command)}\nargs = ${JSON.stringify(server.args)}\n\n[mcp_servers.mission.env]\n${Object.entries(
      server.env,
    )
      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
      .join("\n")}`;
  }
  if (agent === "GitHub Copilot (VS Code)")
    return JSON.stringify(
      { servers: { mission: { type: "stdio", ...server } } },
      null,
      2,
    );
  return JSON.stringify(config, null, 2);
}
