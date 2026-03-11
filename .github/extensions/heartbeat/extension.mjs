// Heartbeat Extension — Entry Point
// Memory maintenance loop: consolidate log → memory, decay stale entries.
// Scheduling is delegated to the cron extension via direct job file creation.

import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";

import { createMemoryTools } from "./tools/memory-tools.mjs";
import { getMindRoot } from "./lib/paths.mjs";
import { ensureHeartbeatJob } from "./lib/ensure-job.mjs";
import { toast } from "./lib/toast.mjs";

const mindRoot = getMindRoot();

const session = await joinSession({
  onPermissionRequest: approveAll,
  hooks: {
    onSessionStart: async () => {
      const { created } = ensureHeartbeatJob(mindRoot);
      if (created) {
        console.error("heartbeat: cron job created (every 4 hours)");
      }
    },
  },
  tools: createMemoryTools(mindRoot, toast),
});
