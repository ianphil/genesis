import { readLockfile, removeLockfile, writeLockfile, isProcessAlive } from "../lib/lifecycle.mjs";
import { loadConfig } from "../lib/config.mjs";
import { getLockfilePath, getConfigPath } from "../lib/paths.mjs";

/**
 * Tools exposed to the agent for managing the Responses API server.
 */
export function createApiTools(server, extDir, agentName) {
  const lockPath = getLockfilePath(extDir, agentName);
  const configPath = getConfigPath(extDir, agentName);

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
        const running = server.isRunning();
        const port = server.getPort();
        if (running) {
          return [
            `Responses API server is running on http://127.0.0.1:${port} (agent: ${agentName})`,
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
          return `Responses API server is running in another session (pid ${lock.pid}, port ${lock.port}, agent: ${agentName}).`;
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
        removeLockfile(lockPath);
        const config = loadConfig(configPath);
        const actualPort = await server.start(args.port || config.port);
        writeLockfile(lockPath, process.pid, actualPort);
        return `Responses API server restarted on http://127.0.0.1:${actualPort}`;
      },
    },
  ];
}
