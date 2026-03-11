// Placeholder — engine autostart logic (Phase 4).
// Checks if jobs exist and engine is running; starts engine if needed.

import { readdirSync } from "node:fs";
import { getJobsDir } from "./paths.mjs";

/**
 * Ensure the engine is running if there are jobs.
 * Implemented in Phase 4 (hook-autostart). For now, a no-op.
 */
export async function ensureEngine(extDir) {
  try {
    const jobsDir = getJobsDir(extDir);
    const files = readdirSync(jobsDir).filter((f) => f.endsWith(".json"));
    if (files.length === 0) return; // no jobs, nothing to start
    // TODO: check engine.lock, spawn if not running
  } catch {
    // data/jobs/ doesn't exist yet — no jobs
  }
}
