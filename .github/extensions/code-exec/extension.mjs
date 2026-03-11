// Code Exec Extension — Entry Point
//
// Registers MCP proxy tools with the Copilot CLI session.
// Three tools: discover_data_sources, call_tool, execute_script.
// Servers connect lazily on-demand.

import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";

import { createDiscoverTool } from "./tools/discover.mjs";
import { createCallToolTool } from "./tools/call-tool.mjs";
import { createExecuteScriptTool } from "./tools/execute-script.mjs";
import { getExtensionDir } from "./lib/paths.mjs";
import { loadConfig, getEnabledServers } from "./lib/config.mjs";
import { getMcpClient } from "./lib/mcp-client.mjs";

const extDir = getExtensionDir();

const session = await joinSession({
  onPermissionRequest: approveAll,
  hooks: {
    onSessionStart: async () => {
      try {
        const config = loadConfig(extDir);
        const servers = getEnabledServers(config);
        const names = servers.map(([n]) => n).join(", ");
        await session.log(
          `code-exec: ${servers.length} MCP server(s) available — ${names}`
        );
      } catch (err) {
        await session.log(
          `code-exec: ${err.message}`,
          { level: "warning" }
        );
      }
    },
    onSessionEnd: async () => {
      try {
        const client = getMcpClient();
        await client.cleanup();
      } catch {
        // Best-effort cleanup
      }
    },
  },
  tools: [
    createDiscoverTool(extDir),
    createCallToolTool(extDir),
    createExecuteScriptTool(extDir),
  ],
});
