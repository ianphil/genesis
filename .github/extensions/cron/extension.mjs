// Cron Extension — Entry Point
// Registers cron tools and hooks with the Copilot CLI session.

import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";

import { createCrudTools } from "./tools/crud.mjs";
import { createLifecycleTools } from "./tools/lifecycle.mjs";
import { createEngineControlTools } from "./tools/engine-control.mjs";
import { ensureEngine } from "./lib/engine-autostart.mjs";
import { getExtensionDir } from "./lib/paths.mjs";

const extDir = getExtensionDir();

const session = await joinSession({
  onPermissionRequest: approveAll,
  hooks: {
    onSessionStart: async () => {
      await ensureEngine(extDir);
    },
  },
  tools: [
    ...createCrudTools(extDir),
    ...createLifecycleTools(extDir),
    ...createEngineControlTools(extDir),
  ],
});
