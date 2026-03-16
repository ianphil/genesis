import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";
import { createChatApiServer } from "./lib/server.mjs";
import { cleanStaleLockfile, writeLockfile, removeLockfile, migrateLegacyData, writeStartupBreadcrumb } from "./lib/lifecycle.mjs";
import { loadConfig } from "./lib/config.mjs";
import { createLogger } from "./lib/logger.mjs";
import { getExtensionDir, getAgentName, getLockfilePath, getConfigPath, getBreadcrumbPath } from "./lib/paths.mjs";
import { createApiTools } from "./tools/api-tools.mjs";

const extDir = getExtensionDir();
const agentName = getAgentName();
const breadcrumbPath = getBreadcrumbPath(extDir, agentName);

// First thing: leave a trace so crashes are diagnosable
writeStartupBreadcrumb(breadcrumbPath, "init", { agent: agentName });

const config = loadConfig(getConfigPath(extDir, agentName));
const log = createLogger(config.logLevel);
const lockPath = getLockfilePath(extDir, agentName);

// --- Extension level (once per process) ---
migrateLegacyData(extDir, agentName);
cleanStaleLockfile(lockPath, log);

const server = createChatApiServer(log);
const port = await server.start(config.port);
writeLockfile(lockPath, process.pid, port);
writeStartupBreadcrumb(breadcrumbPath, "server_up", { agent: agentName, port });
log.info(`listening on http://127.0.0.1:${port} (agent=${agentName})`);

function cleanup() {
  server.stop();
  removeLockfile(lockPath);
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });

// --- Session level (bind once, process dies on session end) ---
const session = await joinSession({
  onPermissionRequest: approveAll,

  hooks: {
    onSessionStart: async () => {
      log.info(`session started (agent=${agentName})`);
    },
    onSessionEnd: async () => {
      log.info("session ended");
    },
  },

  tools: createApiTools(server, extDir, agentName, log),
});

server.bindSession({
  sendAndWait: session.sendAndWait.bind(session),
  send: session.send.bind(session),
  getMessages: session.getMessages.bind(session),
  onEvent: session.on.bind(session),
});

writeStartupBreadcrumb(breadcrumbPath, "ready", { agent: agentName, port });
