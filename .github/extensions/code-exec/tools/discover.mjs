// discover_data_sources — tool for discovering MCP servers and their tools.
//
// No params: returns all server names + tool counts.
// With server param: returns full tool schemas for that server.

import { getMcpClient } from "../lib/mcp-client.mjs";
import { formatError } from "../lib/errors.mjs";
import { readToolSchema, formatCapturedSchema, listCapturedSchemas } from "../lib/schema-store.mjs";

/**
 * Format tool schemas into readable text for the LLM.
 * Includes learned output schemas when available.
 * @param {string} serverName
 * @param {Array<object>} tools
 * @param {string} extDir
 * @returns {string}
 */
function formatToolSchemas(serverName, tools, extDir) {
  const lines = [`## ${serverName} — ${tools.length} tool(s)\n`];

  for (const tool of tools) {
    lines.push(`### ${tool.name}`);
    if (tool.description) {
      lines.push(tool.description);
    }

    if (tool.inputSchema?.properties) {
      lines.push("\n**Parameters:**");
      const required = new Set(tool.inputSchema.required || []);
      for (const [param, schema] of Object.entries(tool.inputSchema.properties)) {
        const req = required.has(param) ? " (required)" : "";
        const type = schema.type || "any";
        const desc = schema.description ? ` — ${schema.description}` : "";
        const enumVals = schema.enum ? ` [${schema.enum.join(", ")}]` : "";
        lines.push(`- \`${param}\`: ${type}${enumVals}${req}${desc}`);
      }
    } else {
      lines.push("\n**Parameters:** none");
    }

    lines.push("");

    // Append learned output schema if available
    const captured = readToolSchema(extDir, serverName, tool.name);
    if (captured) {
      lines.push(formatCapturedSchema(captured));
    }
  }

  return lines.join("\n");
}

/**
 * Format server summary for the overview (no server param).
 * @param {Record<string, any>} discovery
 * @param {string} extDir
 * @returns {string}
 */
function formatOverview(discovery, extDir) {
  const lines = ["# Available MCP Data Sources\n"];

  for (const [name, tools] of Object.entries(discovery)) {
    if (tools.error) {
      lines.push(`- **${name}**: ⚠ ${tools.error}`);
    } else {
      const toolNames = tools.map((t) => t.name).join(", ");
      const captured = listCapturedSchemas(extDir, name);
      const schemaNote = captured.length > 0
        ? ` (${captured.length} with learned output schemas)`
        : "";
      lines.push(`- **${name}** (${tools.length} tools${schemaNote}): ${toolNames}`);
    }
  }

  lines.push(
    "\nUse `discover_data_sources` with a specific `server` name to get full parameter schemas."
  );

  return lines.join("\n");
}

/**
 * Create the discover_data_sources tool definition.
 * @param {string} extDir
 * @returns {object} Tool definition for joinSession
 */
export function createDiscoverTool(extDir) {
  return {
    name: "discover_data_sources",
    description:
      "Discover available MCP data sources and their tools. " +
      "Call without params to list all servers and tool names. " +
      "Call with a server name to get full tool schemas with parameter details.",
    parameters: {
      type: "object",
      properties: {
        server: {
          type: "string",
          description:
            "Specific server to introspect. Omit to list all servers.",
        },
      },
    },
    handler: async (args) => {
      try {
        const client = getMcpClient();
        client.initialize(extDir);

        if (args.server) {
          const tools = await client.discoverServer(args.server, extDir);
          return formatToolSchemas(args.server, tools, extDir);
        } else {
          const discovery = await client.discoverAll(extDir);
          return formatOverview(discovery, extDir);
        }
      } catch (err) {
        return formatError("discovering data sources", err);
      }
    },
  };
}
