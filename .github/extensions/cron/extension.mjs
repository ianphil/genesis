// Cron Extension — Entry Point
// Registers cron tools and hooks with the Copilot CLI session.

import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";

import { createCrudTools } from "./tools/crud.mjs";
import { createLifecycleTools } from "./tools/lifecycle.mjs";
import { createEngineControlTools } from "./tools/engine-control.mjs";
import { ensureEngine } from "./lib/engine-autostart.mjs";
import { getExtensionDir, getAgentName } from "./lib/paths.mjs";
import { migrateLegacyData } from "./lib/migration.mjs";

const extDir = getExtensionDir();

// Mutable agent state — tools can switch the agent namespace at runtime
// (e.g., cron_engine_start --agent fox) since env vars can't be set
// after extension processes spawn.
const state = {
  agentName: getAgentName(),
};

const session = await joinSession({
  onPermissionRequest: approveAll,
  hooks: {
    onSessionStart: async () => {
      migrateLegacyData(extDir, state.agentName);
      await ensureEngine(extDir, state.agentName);
    },
  },
  tools: [
    ...createCrudTools(extDir, state),
    ...createLifecycleTools(extDir, state),
    ...createEngineControlTools(extDir, state),
  ],
});
