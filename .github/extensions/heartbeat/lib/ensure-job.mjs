// Ensure the heartbeat cron job exists.
// Writes the job JSON directly to the cron extension's data directory.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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

/**
 * Ensure the heartbeat cron job file exists.
 * Writes directly to the cron extension's data/jobs/ directory.
 * Idempotent — does nothing if the job file already exists.
 *
 * @param {string} mindRoot — repo root
 * @returns {{ created: boolean, path: string }}
 */
export function ensureHeartbeatJob(mindRoot) {
  const cronJobsDir = resolve(mindRoot, ".github", "extensions", "cron", "data", "jobs");
  const jobPath = resolve(cronJobsDir, "heartbeat.json");

  if (existsSync(jobPath)) {
    return { created: false, path: jobPath };
  }

  // Ensure the cron data/jobs directory exists
  mkdirSync(cronJobsDir, { recursive: true });

  const now = new Date().toISOString();

  const job = {
    id: "heartbeat",
    name: "heartbeat",
    status: "enabled",
    maxConcurrency: 1,
    createdAtUtc: now,
    createdFrom: mindRoot,
    lastRunAtUtc: null,
    nextRunAtUtc: null, // cron engine recalculates on next tick
    schedule: {
      type: "cron",
      expression: "0 */4 * * *",
      timezone: "America/New_York",
    },
    payload: {
      type: "prompt",
      prompt: HEARTBEAT_PROMPT,
      model: "claude-haiku-4.5",
      preloadToolNames: null,
      timeoutSeconds: 120,
    },
    backoff: null,
  };

  writeFileSync(jobPath, JSON.stringify(job, null, 2) + "\n", "utf-8");
  return { created: true, path: jobPath };
}
