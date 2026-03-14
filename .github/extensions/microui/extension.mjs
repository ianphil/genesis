// MicroUI Extension — Entry Point
// Registers microui tools with the Copilot CLI session.
// Spawns native WebView windows via the microui binary (JSON Lines protocol).

import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";

import { createMicroUITools } from "./tools/microui-tools.mjs";

const session = await joinSession({
  onPermissionRequest: approveAll,
  hooks: {
    onSessionStart: async () => {
      console.error("microui: extension loaded");
    },
  },
  tools: createMicroUITools(),
});
