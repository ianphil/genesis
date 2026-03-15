import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";
import { createChatApiServer } from "./lib/server.mjs";
import { ensureServer, removeLockfile } from "./lib/lifecycle.mjs";
import { loadConfig } from "./lib/config.mjs";
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

const server = createChatApiServer({
  sendAndWait: (...a) => deps.sendAndWait(...a),
  send: (...a) => deps.send(...a),
  getMessages: (...a) => deps.getMessages(...a),
  onEvent: (...a) => deps.onEvent(...a),
});

const session = await joinSession({
  onPermissionRequest: approveAll,

  hooks: {
    onSessionStart: async () => {
      const config = loadConfig(configPath);
      const port = await ensureServer(server, config.port, lockPath);
      if (port) {
        console.error(`responses: listening on http://127.0.0.1:${port}`);
      }
    },

    onSessionEnd: async () => {
      await server.stop();
      removeLockfile(lockPath);
      console.error("responses: server stopped");
    },
  },

  tools: createApiTools(server, extDir),
});

// Wire up session methods now that joinSession has resolved
deps.sendAndWait = session.sendAndWait.bind(session);
deps.send = session.send.bind(session);
deps.getMessages = session.getMessages.bind(session);
deps.onEvent = session.on.bind(session);
