// Engine autostart — checks if jobs exist and engine is running; starts if needed.

import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { getJobsDir, getLockfilePath } from "./paths.mjs";

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the engine is running if there are jobs.
 * Called on every session start via the onSessionStart hook.
 */
export async function ensureEngine(extDir, agentName) {
  // Check if any jobs exist
  let hasJobs = false;
  try {
    const jobsDir = getJobsDir(extDir, agentName);
    const files = readdirSync(jobsDir).filter((f) => f.endsWith(".json"));
    hasJobs = files.length > 0;
  } catch {
    // data/{agent}/jobs/ doesn't exist yet — no jobs
  }

  if (!hasJobs) return;

  // Check if engine is already running
  const lockPath = getLockfilePath(extDir, agentName);
  try {
    const raw = readFileSync(lockPath, "utf-8").trim();
    const pid = parseInt(raw, 10);
    if (pid && isProcessAlive(pid)) return; // engine is alive, nothing to do
    // Stale lockfile — clean up
    try { unlinkSync(lockPath); } catch { /* ok */ }
  } catch {
    // No lockfile — engine not running
  }

  // Start engine with agent namespace
  const enginePath = join(extDir, "engine", "main.mjs");
  const child = spawn("node", [enginePath, "--agent", agentName], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    cwd: extDir,
  });
  child.unref();
}
