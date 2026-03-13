// discover_data_sources — progressive discovery of MCP servers and tools.
//
// Three tiers to minimize context consumption:
//   1. No params       → server names + tool counts (lightweight)
//   2. server only     → tool names + descriptions for that server
//   3. server + tool   → full parameter schema + learned output schema

import { getMcpClient } from "../lib/mcp-client.mjs";
import { formatError } from "../lib/errors.mjs";
import { readToolSchema, formatCapturedSchema, listCapturedSchemas } from "../lib/schema-store.mjs";

/**
 * Tier 3: Full schema for a single tool.
 * @param {string} serverName
 * @param {object} tool - Tool definition from MCP
 * @param {string} extDir
 * @returns {string}
 */
function formatSingleToolSchema(serverName, tool, extDir) {
  const lines = [`## ${serverName} / ${tool.name}\n`];

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

  // Append learned output schema if available
  const captured = readToolSchema(extDir, serverName, tool.name);
  if (captured) {
    lines.push("");
    lines.push(formatCapturedSchema(captured));
  }

  return lines.join("\n");
}

/**
 * Tier 2: Tool names + descriptions for a server (no parameter schemas).
 * @param {string} serverName
 * @param {Array<object>} tools
 * @param {string} extDir
 * @returns {string}
 */
function formatServerToolList(serverName, tools, extDir) {
  const captured = listCapturedSchemas(extDir, serverName);
  const capturedNames = new Set(captured.map((c) => c.tool));

  const lines = [`## ${serverName} — ${tools.length} tool(s)\n`];

  for (const tool of tools) {
    const schema = capturedNames.has(tool.name) ? " 📊" : "";
    const desc = tool.description ? ` — ${tool.description}` : "";
    lines.push(`- **${tool.name}**${schema}${desc}`);
  }

  lines.push(
    "\n📊 = has learned output schema" +
    "\n\nUse `discover_data_sources` with `server` and `tool` to get full parameter details."
  );

  return lines.join("\n");
}

/**
 * Tier 1: Server names + tool counts only.
 * @param {Record<string, any>} discovery
 * @returns {string}
 */
function formatOverview(discovery) {
  const lines = ["# Available MCP Data Sources\n"];

  for (const [name, tools] of Object.entries(discovery)) {
    if (tools.error) {
      lines.push(`- **${name}**: ⚠ ${tools.error}`);
    } else {
      lines.push(`- **${name}** — ${tools.length} tools`);
    }
  }

  lines.push(
    "\nUse `discover_data_sources` with a `server` name to see its tools."
  );

  return lines.join("\n");
}

/**
 * Create the discover_data_sources tool definition.
 * @param {string} extDir
 * @param {string[]} serverNames - Pre-loaded server names for the tool description
 * @returns {object} Tool definition for joinSession
 */
export function createDiscoverTool(extDir, serverNames = []) {
  const serverHint = serverNames.length > 0
    ? ` Available servers: ${serverNames.join(", ")}.`
    : "";

  return {
    name: "discover_data_sources",
    description:
      "Discover available MCP data sources and their tools. " +
      "Progressive: no params → server list, server → tool names, server+tool → full schema." +
      serverHint,
    parameters: {
      type: "object",
      properties: {
        server: {
          type: "string",
          description:
            "Server to introspect. Omit to list all servers with tool counts.",
        },
        tool: {
          type: "string",
          description:
            "Specific tool to get full parameter schema for. Requires server.",
        },
      },
    },
    handler: async (args) => {
      try {
        const client = getMcpClient();
        client.initialize(extDir);

        if (args.server && args.tool) {
          // Tier 3: single tool full schema
          const tools = await client.discoverServer(args.server, extDir);
          const match = tools.find((t) => t.name === args.tool);
          if (!match) {
            const available = tools.map((t) => t.name).join(", ");
            return `Tool '${args.tool}' not found on ${args.server}. Available: ${available}`;
          }
          return formatSingleToolSchema(args.server, match, extDir);
        } else if (args.server) {
          // Tier 2: tool names + descriptions
          const tools = await client.discoverServer(args.server, extDir);
          return formatServerToolList(args.server, tools, extDir);
        } else {
          // Tier 1: server names + tool counts
          const discovery = await client.discoverAll(extDir);
          return formatOverview(discovery);
        }
      } catch (err) {
        return formatError("discovering data sources", err);
      }
    },
  };
}
