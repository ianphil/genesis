import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";
import { createChatApiServer } from "./lib/server.mjs";
import { ensureServer, removeLockfile, migrateLegacyData } from "./lib/lifecycle.mjs";
import { loadConfig } from "./lib/config.mjs";
import { createLogger } from "./lib/logger.mjs";
import { getExtensionDir, getAgentName, getLockfilePath, getConfigPath } from "./lib/paths.mjs";
import { createApiTools } from "./tools/api-tools.mjs";

// Bind session methods lazily — rebound on each onSessionStart,
// nulled on onSessionEnd. The server proxies through these so it
// survives session transitions (e.g. /clear) without recycling.
const deps = {
  sendAndWait: null,
  send: null,
  getMessages: null,
  onEvent: null,
};

const extDir = getExtensionDir();

// Mutable agent state — tools can switch the agent namespace at runtime
// (e.g., responses_restart --agent fox) since env vars can't be set
// after extension processes spawn.
const state = {
  agentName: getAgentName(),
};

const configPath = () => getConfigPath(extDir, state.agentName);

// Logger uses config at load time — acceptable for log level.
const log = createLogger(loadConfig(configPath()).logLevel);

const server = createChatApiServer(deps, log);

// --- Process lifecycle: start server once, clean up on exit ---
migrateLegacyData(extDir, state.agentName);
const config = loadConfig(configPath());
await ensureServer(server, config.port, getLockfilePath(extDir, state.agentName), log);

function cleanup() {
  if (server.isRunning()) {
    // stop() is async but process.on('exit') is sync — best-effort
    server.stop();
  }
  removeLockfile(getLockfilePath(extDir, state.agentName));
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });

// --- Session lifecycle: rebind deps so the server talks to the current session ---
const session = await joinSession({
  onPermissionRequest: approveAll,

  hooks: {
    onSessionStart: async () => {
      log.info(`session started (agent=${state.agentName})`);
    },

    onSessionEnd: async () => {
      deps.sendAndWait = null;
      deps.send = null;
      deps.getMessages = null;
      deps.onEvent = null;
      log.info("session ended — deps unbound");
    },
  },

  tools: createApiTools(server, extDir, state, log),
});

// Wire up session methods now that joinSession has resolved
deps.sendAndWait = session.sendAndWait.bind(session);
deps.send = session.send.bind(session);
deps.getMessages = session.getMessages.bind(session);
deps.onEvent = session.on.bind(session);
