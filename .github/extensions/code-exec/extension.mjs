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

// Pre-load server names for the tool description (no MCP connections yet)
let serverNames = [];
try {
  const config = loadConfig(extDir);
  serverNames = getEnabledServers(config).map(([n]) => n);
} catch {
  // Config not present — serverNames stays empty
}

const session = await joinSession({
  onPermissionRequest: approveAll,
  hooks: {
    onSessionStart: async () => {
      if (serverNames.length > 0) {
        console.error(
          `code-exec: ${serverNames.length} MCP server(s) available — ${serverNames.join(", ")}`
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
    createDiscoverTool(extDir, serverNames),
    createCallToolTool(extDir),
    createExecuteScriptTool(extDir),
  ],
});
