import { readLockfile, removeLockfile, writeLockfile, isProcessAlive } from "../lib/lifecycle.mjs";
import { loadConfig } from "../lib/config.mjs";
import { getLockfilePath, getConfigPath } from "../lib/paths.mjs";

/**
 * Tools exposed to the agent for managing the Responses API server.
 * @param {object} server    - The HTTP server instance
 * @param {string} extDir    - Extension root directory
 * @param {string} agentName - Agent namespace
 * @param {object} log       - Logger instance
 */
export function createApiTools(server, extDir, agentName, log) {
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
        const port = server.getPort();
        if (server.isRunning()) {
          return [
            `Responses API server is running on http://127.0.0.1:${port} (agent: ${agentName})`,
            "",
            "Endpoints:",
            `  POST http://127.0.0.1:${port}/v1/responses  — OpenAI Responses API (compatible)`,
            `  GET  http://127.0.0.1:${port}/history        — conversation history`,
            `  GET  http://127.0.0.1:${port}/health         — health check`,
          ].join("\n");
        }

        const lockPath = getLockfilePath(extDir, agentName);
        const lock = readLockfile(lockPath);
        if (lock && isProcessAlive(lock.pid)) {
          return `Responses API server is running in another session (pid ${lock.pid}, port ${lock.port}).`;
        }
        if (lock) {
          removeLockfile(lockPath);
          return "Responses API server is not running (stale lockfile cleaned).";
        }
        return "Responses API server is not running.";
      },
    },
    {
      name: "responses_restart",
      description:
        "Restart the Responses API server. Use if the server becomes unresponsive.",
      parameters: {
        type: "object",
        properties: {
          port: {
            type: "number",
            description:
              "Port to bind to. Defaults to the configured port in data/config.json.",
          },
        },
      },
      handler: async (args) => {
        if (server.isRunning()) {
          await server.stop();
        }

        const lockPath = getLockfilePath(extDir, agentName);
        removeLockfile(lockPath);
        const config = loadConfig(getConfigPath(extDir, agentName));
        const actualPort = await server.start(args.port || config.port);
        writeLockfile(lockPath, process.pid, actualPort);
        return `Responses API server restarted on http://127.0.0.1:${actualPort} (agent: ${agentName})`;
      },
    },
  ];
}
