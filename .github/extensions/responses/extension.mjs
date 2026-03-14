import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";
import { createChatApiServer } from "./lib/server.mjs";
import { createApiTools } from "./tools/api-tools.mjs";

// Bind session methods lazily — they're set once joinSession completes
const deps = {
  sendAndWait: null,
  send: null,
  getMessages: null,
  onEvent: null,
};

const DEFAULT_PORT = 15210;

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
      const port = await server.start(DEFAULT_PORT);
      console.error(`responses: listening on http://127.0.0.1:${port}`);
    },

    onSessionEnd: async () => {
      await server.stop();
      console.error("responses: server stopped");
    },
  },

  tools: createApiTools(server, DEFAULT_PORT),
});

// Wire up session methods now that joinSession has resolved
deps.sendAndWait = session.sendAndWait.bind(session);
deps.send = session.send.bind(session);
deps.getMessages = session.getMessages.bind(session);
deps.onEvent = session.on.bind(session);
