// Setup tools — create/manage the heartbeat cron job.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const HEARTBEAT_JOB_ID = "heartbeat";

const HEARTBEAT_PROMPT = `You are running a scheduled heartbeat. Your job is memory maintenance.

1. Call heartbeat_consolidate to see recent log entries.
2. For each entry, decide: is this a lasting pattern, preference, correction, or fact worth remembering long-term? Skip one-off tasks, debugging steps, and transient context.
3. For entries worth keeping, call heartbeat_promote with:
   - Clean, concise text (rewrite if needed)
   - section: "corrected" for explicit human corrections, "learned" for everything else
   - logLineNumber from the consolidate output (so the entry is removed from the log)
4. Call heartbeat_decay to remove stale memories.
5. Call heartbeat_status for a final summary.

If nothing was promoted or decayed, respond with just: HEARTBEAT_OK
If anything significant happened, respond with a one-line summary.`;

export function createSetupTools(mindRoot) {
  return [
    {
      name: "heartbeat_setup",
      description:
        "Creates or updates the heartbeat cron job. The heartbeat periodically consolidates " +
        "the session log into long-term memory and decays stale entries. Uses the cron extension for scheduling.",
      parameters: {
        type: "object",
        properties: {
          cronExpression: {
            type: "string",
            description: 'Cron schedule (default: "0 */4 * * *" — every 4 hours)',
          },
          timezone: {
            type: "string",
            description: 'IANA timezone (default: "America/New_York")',
          },
          model: {
            type: "string",
            description: "Model to use for heartbeat prompts (default: claude-haiku-4.5 — fast and cheap)",
          },
        },
      },
      handler: async (args) => {
        // We return instructions for the agent to create the cron job,
        // since we can't call cron tools from within an extension handler.
        const cron = args.cronExpression || "0 */4 * * *";
        const tz = args.timezone || "America/New_York";
        const model = args.model || "claude-haiku-4.5";

        return [
          "**Heartbeat cron job configuration ready.** Please create it by calling:\n",
          "```",
          "cron_create({",
          `  name: "heartbeat",`,
          `  scheduleType: "cron",`,
          `  cronExpression: "${cron}",`,
          `  timezone: "${tz}",`,
          `  payloadType: "prompt",`,
          `  model: "${model}",`,
          `  prompt: ${JSON.stringify(HEARTBEAT_PROMPT)},`,
          `  timeoutSeconds: 120`,
          "});",
          "```\n",
          `Schedule: \`${cron}\` (${tz})`,
          `Model: ${model}`,
          "",
          "Then start the cron engine with: cron_engine_start()",
        ].join("\n");
      },
    },
  ];
}
