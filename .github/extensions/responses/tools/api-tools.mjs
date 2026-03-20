import { removeLockfile, writeLockfile, cleanStaleLockfile, migrateLegacyData } from "../lib/lifecycle.mjs";
import { loadConfig } from "../lib/config.mjs";
import { getLockfilePath, getConfigPath, sanitizeAgentName } from "../lib/paths.mjs";
import { listJobs } from "../lib/job-registry.mjs";

/**
 * Tools exposed to the agent for managing the Responses API server.
 * @param {object} server - The HTTP server instance
 * @param {string} extDir - Extension root directory
 * @param {object} state  - Mutable state ({ agentName })
 * @param {object} log    - Logger instance
 */
export function createApiTools(server, extDir, state, log) {
  return [
    {
      name: "responses_status",
      description:
        "Get the status of the Responses API server, including its port and endpoints.",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        if (!state.agentName) {
          return "Responses API server is not running. Call responses_restart with agent parameter to claim a namespace and start the server.";
        }

        const port = server.getPort();
        if (server.isRunning()) {
          let jobCount = 0;
          try { jobCount = listJobs(extDir, state.agentName).length; } catch { /* best effort */ }

          return [
            `Responses API server is running on http://127.0.0.1:${port} (agent: ${state.agentName})`,
            `Background jobs: ${jobCount}`,
            "",
            "Endpoints:",
            `  POST   http://127.0.0.1:${port}/v1/responses  — OpenAI Responses API (async-default, 202 + RSS)`,
            `  GET    http://127.0.0.1:${port}/jobs            — list background jobs`,
            `  GET    http://127.0.0.1:${port}/jobs/:id        — job detail + status items`,
            `  GET    http://127.0.0.1:${port}/feed/:jobId     — RSS 2.0 feed for job progress`,
            `  DELETE http://127.0.0.1:${port}/jobs            — delete all terminal jobs`,
            `  DELETE http://127.0.0.1:${port}/jobs/:id        — delete a specific job`,
            `  GET    http://127.0.0.1:${port}/history         — conversation history`,
            `  GET    http://127.0.0.1:${port}/health          — health check`,
          ].join("\n");
        }

        return "Responses API server is not running.";
      },
    },
    {
      name: "responses_restart",
      description:
        "Start or restart the Responses API server under a named agent namespace. The agent parameter is required.",
      parameters: {
        type: "object",
        properties: {
          agent: {
            type: "string",
            description:
              "Agent namespace (e.g. 'fox', 'ender'). Determines config and lockfile paths under data/{agent}/. Required.",
          },
          port: {
            type: "number",
            description:
              "Port override. Defaults to the configured port in data/{agent}/config.json.",
          },
        },
        required: ["agent"],
      },
      handler: async (args) => {
        const agentName = sanitizeAgentName(args.agent);
        if (!agentName) {
          return "Error: agent parameter is required and must contain valid characters [a-zA-Z0-9_-].";
        }

        // Stop existing server and clean up previous namespace
        if (server.isRunning()) {
          await server.stop();
          if (state.agentName) {
            removeLockfile(getLockfilePath(extDir, state.agentName));
          }
        }

        state.agentName = agentName;
        migrateLegacyData(extDir, agentName);

        const lockPath = getLockfilePath(extDir, agentName);
        cleanStaleLockfile(lockPath, log);

        const config = loadConfig(getConfigPath(extDir, agentName));
        const actualPort = await server.start(args.port || config.port);
        writeLockfile(lockPath, process.pid, actualPort);

        log.info(`server started on port ${actualPort} (agent=${agentName})`);
        return `Responses API server started on http://127.0.0.1:${actualPort} (agent: ${agentName})`;
      },
    },
  ];
}
