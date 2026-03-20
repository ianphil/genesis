import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";
import { createChatApiServer } from "./lib/server.mjs";
import { removeLockfile } from "./lib/lifecycle.mjs";
import { createLogger } from "./lib/logger.mjs";
import { getExtensionDir, getLockfilePath } from "./lib/paths.mjs";
import { createApiTools } from "./tools/api-tools.mjs";

const extDir = getExtensionDir();
const log = createLogger("info");

// Server is created but NOT started. An agent must claim a namespace
// by calling responses_restart(agent: "name") before the server listens.
const state = { agentName: null };
const server = createChatApiServer(log, extDir, state);

function cleanup() {
  if (server.isRunning()) server.stop();
  if (state.agentName) removeLockfile(getLockfilePath(extDir, state.agentName));
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });

const session = await joinSession({
  onPermissionRequest: approveAll,

  hooks: {
    onSessionStart: async () => log.info("session started"),
    onSessionEnd: async () => log.info("session ended"),
  },

  tools: createApiTools(server, extDir, state, log),
});

server.bindSession({
  sendAndWait: session.sendAndWait.bind(session),
  send: session.send.bind(session),
  getMessages: session.getMessages.bind(session),
  onEvent: session.on.bind(session),
});

log.info("responses extension loaded — awaiting agent claim via responses_restart");
