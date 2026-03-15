import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";
import { createChatApiServer } from "./lib/server.mjs";
import { ensureServer, removeLockfile } from "./lib/lifecycle.mjs";
import { loadConfig } from "./lib/config.mjs";
import { createLogger } from "./lib/logger.mjs";
import { getExtensionDir, getDataDir, getLockfilePath, getConfigPath } from "./lib/paths.mjs";
import { createApiTools } from "./tools/api-tools.mjs";

// Bind session methods lazily — they're set once joinSession completes
const deps = {
  sendAndWait: null,
  send: null,
  getMessages: null,
  onEvent: null,
};

const extDir = getExtensionDir();
const lockPath = getLockfilePath(extDir);
const configPath = getConfigPath(extDir);

// Logger uses config at load time — acceptable for log level.
// Port is read fresh in onSessionStart so config changes take effect without reload.
const log = createLogger(loadConfig(configPath).logLevel);

const server = createChatApiServer({
  sendAndWait: (...a) => deps.sendAndWait(...a),
  send: (...a) => deps.send(...a),
  getMessages: (...a) => deps.getMessages(...a),
  onEvent: (...a) => deps.onEvent(...a),
}, log);

const session = await joinSession({
  onPermissionRequest: approveAll,

  hooks: {
    onSessionStart: async () => {
      const config = loadConfig(configPath);
      await ensureServer(server, config.port, lockPath, log);
    },

    onSessionEnd: async () => {
      await server.stop();
      removeLockfile(lockPath);
      log.info("server stopped");
    },
  },

  tools: createApiTools(server, extDir),
});

// Wire up session methods now that joinSession has resolved
deps.sendAndWait = session.sendAndWait.bind(session);
deps.send = session.send.bind(session);
deps.getMessages = session.getMessages.bind(session);
deps.onEvent = session.on.bind(session);
