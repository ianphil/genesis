import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";
import { createTunnelTools } from "./tools/tunnel-tools.mjs";
import { cleanup } from "./lib/tunnel.mjs";

const session = await joinSession({
  onPermissionRequest: approveAll,

  hooks: {
    onSessionStart: async () => {
      console.error("tunnel: extension loaded (tunnel stopped by default)");
    },

    onSessionEnd: async () => {
      await cleanup();
      console.error("tunnel: cleaned up");
    },
  },

  tools: createTunnelTools(),
});
