// execute_script — run multi-step MCP pipelines in a sandboxed vm.
//
// The LLM writes a JS script that calls callTool() multiple times,
// filters/transforms locally, and returns only the final result.
// Intermediate data never enters LLM context.

import { getMcpClient } from "../lib/mcp-client.mjs";
import { formatError } from "../lib/errors.mjs";
import { captureSchema } from "../lib/schema-store.mjs";
import {
  runScript,
  ScriptTimeoutError,
  ScriptExecutionError,
} from "../lib/script-runner.mjs";

/**
 * Create the execute_script tool definition.
 * @param {string} extDir
 * @returns {object} Tool definition for joinSession
 */
export function createExecuteScriptTool(extDir) {
  return {
    name: "execute_script",
    description:
      "Execute a JavaScript script that can make multiple MCP tool calls. " +
      "Use for multi-step data pipelines where intermediate results are large. " +
      "The script gets `callTool(server, tool, params)` as an async function. " +
      "Return the final result — only that enters the conversation. " +
      "Use discover_data_sources first to learn available tools and their schemas.",
    parameters: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description:
            "JavaScript function body. Use `await callTool(server, tool, params)` " +
            "to call MCP tools. Use `return` to produce the final result. " +
            "Example: `const items = await callTool('ado', 'wit_query', {query: '...'}); return items.length;`",
        },
        timeout: {
          type: "integer",
          description:
            "Max execution time in seconds (default: 30, max: 120). " +
            "Increase for scripts making many MCP calls.",
        },
      },
      required: ["script"],
    },
    handler: async (args) => {
      try {
        const client = getMcpClient();
        client.initialize(extDir);

        // Bridge callTool: proxies to MCP client + captures schemas
        const callToolBridge = async (server, tool, params = {}) => {
          const result = await client.callTool(server, tool, params, extDir);
          // Schema capture (best-effort)
          captureSchema(extDir, server, tool, params, result);
          return result;
        };

        const { result, logs } = await runScript(args.script, {
          callTool: callToolBridge,
          timeoutSeconds: args.timeout,
        });

        // Format output
        let output;
        if (result === undefined || result === null) {
          output = "(script returned no value)";
        } else if (typeof result === "string") {
          output = result;
        } else {
          output = JSON.stringify(result, null, 2);
        }

        // Append console output if any
        if (logs.length > 0) {
          output += "\n\n--- Script console output ---\n" + logs.join("\n");
        }

        return output;
      } catch (err) {
        if (err instanceof ScriptTimeoutError) {
          let msg = `Script timed out after ${args.timeout || 30}s.`;
          if (err.logs?.length > 0) {
            msg += "\n\nConsole output before timeout:\n" + err.logs.join("\n");
          }
          msg += "\n\nTip: increase the `timeout` parameter or reduce the number of MCP calls.";
          return msg;
        }

        if (err instanceof ScriptExecutionError) {
          let msg = `Script error: ${err.message}`;
          if (err.scriptLine) {
            msg += ` (at line ${err.scriptLine} of your script)`;
          }
          if (err.logs?.length > 0) {
            msg += "\n\nConsole output before error:\n" + err.logs.join("\n");
          }
          msg += "\n\nFix the script and retry.";
          return msg;
        }

        return formatError("executing script", err);
      }
    },
  };
}
