// call_tool — proxy tool calls to MCP servers.
//
// The LLM uses discover_data_sources to learn what's available,
// then calls this tool to invoke specific MCP tools with parameters.
// Servers connect lazily on first use.

import { getMcpClient } from "../lib/mcp-client.mjs";
import { formatError, isTransient } from "../lib/errors.mjs";
import { captureSchema } from "../lib/schema-store.mjs";

/**
 * Create the call_tool tool definition.
 * @param {string} extDir
 * @returns {object} Tool definition for joinSession
 */
export function createCallToolTool(extDir) {
  return {
    name: "call_tool",
    description:
      "Call a tool on an MCP data source. " +
      "Use discover_data_sources first to find available servers and tools. " +
      "The server connects on-demand if not already connected.",
    parameters: {
      type: "object",
      properties: {
        server: {
          type: "string",
          description: "Server name (e.g., 'ado', 'github', 'filesystem')",
        },
        tool: {
          type: "string",
          description: "Tool name on the server (e.g., 'query_work_items', 'search_code')",
        },
        params: {
          type: "object",
          description: "Parameters to pass to the tool. Check discover_data_sources for required params.",
        },
      },
      required: ["server", "tool"],
    },
    handler: async (args) => {
      try {
        const client = getMcpClient();
        client.initialize(extDir);

        const params = args.params || {};
        const result = await client.callTool(
          args.server,
          args.tool,
          params,
          extDir
        );

        // Capture output schema (best-effort, non-blocking)
        captureSchema(extDir, args.server, args.tool, params, result);

        // Return as formatted JSON for LLM readability
        if (typeof result === "string") {
          return result;
        }
        return JSON.stringify(result, null, 2);
      } catch (err) {
        const errorText = formatError(
          `calling ${args.server}/${args.tool}`,
          err
        );

        if (isTransient(err)) {
          return errorText + "\n\nThis appears to be a transient error. You may retry.";
        }

        return errorText;
      }
    },
  };
}
