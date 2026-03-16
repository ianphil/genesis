import { readLockfile, removeLockfile, writeLockfile, isProcessAlive, migrateLegacyData } from "../lib/lifecycle.mjs";
import { loadConfig } from "../lib/config.mjs";
import { getLockfilePath, getConfigPath } from "../lib/paths.mjs";

/**
 * Sanitize an agent name to filesystem-safe characters.
 */
function sanitizeAgent(name) {
  const cleaned = (name || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Tools exposed to the agent for managing the Responses API server.
 * @param {object} server - The HTTP server instance
 * @param {string} extDir - Extension root directory
 * @param {object} state  - Mutable state with `agentName` property
 * @param {object} log    - Logger instance
 */
export function createApiTools(server, extDir, state, log) {
  return [
    {
      name: "responses_status",
      description:
        "Get the status of the Responses API server, including its port and whether it is running.",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const lockPath = getLockfilePath(extDir, state.agentName);
        const running = server.isRunning();
        const port = server.getPort();
        if (running) {
          return [
            `Responses API server is running on http://127.0.0.1:${port} (agent: ${state.agentName})`,
            `Session: ${server.hasSession() ? "connected" : "disconnected"}`,
            "",
            "Endpoints:",
            `  POST http://127.0.0.1:${port}/v1/responses  — OpenAI Responses API (compatible)`,
            `  POST http://127.0.0.1:${port}/chat          — send a message, get a response`,
            `  GET  http://127.0.0.1:${port}/chat/stream   — SSE stream (query: ?prompt=...)`,
            `  GET  http://127.0.0.1:${port}/history        — conversation history`,
            `  GET  http://127.0.0.1:${port}/health         — health check`,
          ].join("\n");
        }

        // Not running in this session — check lockfile for another session
        const lock = readLockfile(lockPath);
        if (lock && isProcessAlive(lock.pid)) {
          return `Responses API server is running in another session (pid ${lock.pid}, port ${lock.port}, agent: ${state.agentName}).`;
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
        "Restart the Responses API server. Use if the server becomes unresponsive. " +
        "Use the 'agent' parameter to switch the per-agent namespace (config and lockfile isolation).",
      parameters: {
        type: "object",
        properties: {
          port: {
            type: "number",
            description:
              "Port to bind to. Defaults to the configured port in data/config.json.",
          },
          agent: {
            type: "string",
            description:
              "Agent name for per-agent data isolation. Switches config and lockfile " +
              "to data/{agent}/. Persists for the rest of this session.",
          },
        },
      },
      handler: async (args) => {
        // Switch agent namespace if requested
        const newAgent = args.agent ? sanitizeAgent(args.agent) : null;
        if (newAgent && newAgent !== state.agentName) {
          const oldLockPath = getLockfilePath(extDir, state.agentName);
          if (server.isRunning()) {
            await server.stop();
          }
          removeLockfile(oldLockPath);
          state.agentName = newAgent;
          migrateLegacyData(extDir, newAgent);
          log.info(`switched to agent=${newAgent}`);
        } else if (server.isRunning()) {
          await server.stop();
        }

        const lockPath = getLockfilePath(extDir, state.agentName);
        removeLockfile(lockPath);
        const configPath = getConfigPath(extDir, state.agentName);
        const config = loadConfig(configPath);
        const actualPort = await server.start(args.port || config.port);
        writeLockfile(lockPath, process.pid, actualPort);
        return `Responses API server restarted on http://127.0.0.1:${actualPort} (agent: ${state.agentName})`;
      },
    },
  ];
}
