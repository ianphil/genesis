// Heartbeat Extension — Entry Point
// Memory maintenance loop: consolidate log → memory, decay stale entries.
// Scheduling is delegated to the cron extension.

import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";

import { createMemoryTools } from "./tools/memory-tools.mjs";
import { createSetupTools } from "./tools/setup-tools.mjs";
import { getMindRoot } from "./lib/paths.mjs";

const mindRoot = getMindRoot();

const session = await joinSession({
  onPermissionRequest: approveAll,
  hooks: {
    onSessionStart: async () => {
      await session.log("Heartbeat extension loaded — memory maintenance tools available");
    },
  },
  tools: [
    ...createMemoryTools(mindRoot),
    ...createSetupTools(mindRoot),
  ],
});
