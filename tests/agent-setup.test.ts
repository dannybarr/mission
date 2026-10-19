import { describe, expect, it } from "vitest";
import { agentSetup, formatAgentConfig } from "../src/agent-setup";

const config = { mcpServers: { mission: { command: "node", args: ["C:\\My Files\\mission.mjs"], env: { MISSION_PORT: "1234", MISSION_TOKEN: "test-only" } } } };
describe("agent configuration formats", () => {
  it("preserves stdio credentials for JSON clients", () => {
    expect(JSON.parse(formatAgentConfig("Cursor", config))).toEqual(config);
  });
  it("uses the VS Code servers wrapper and stdio type", () => {
    expect(JSON.parse(formatAgentConfig("GitHub Copilot (VS Code)", config)).servers.mission).toEqual({type: "stdio", ...config.mcpServers.mission});
  });
  it("escapes Windows paths in Codex TOML and preserves the environment", () => {
    const text = formatAgentConfig("Codex", config);
    expect(text).toContain('[mcp_servers.mission.env]');
    expect(text).toContain('MISSION_TOKEN = "test-only"');
    expect(JSON.parse(text.split("\n").find(line => line.startsWith("args = "))!.slice(7))).toEqual(config.mcpServers.mission.args);
  });
  it("does not advertise unverified clients as connected adapters", () => {
    expect(agentSetup("Grok Bot").supported).toBe(false);
    expect(agentSetup("Gemini CLI").supported).toBe(true);
  });
});
