// Engine control tools — cron_engine_start, cron_engine_stop, cron_engine_status

import { spawn } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getLockfilePath, getDataDir } from "../lib/paths.mjs";
import { listJobs } from "../lib/store.mjs";

/** Check if a PID is alive */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Read engine PID from lockfile. Returns { pid, alive } or null. */
function readEnginePid(extDir) {
  try {
    const raw = readFileSync(getLockfilePath(extDir), "utf-8").trim();
    const pid = parseInt(raw, 10);
    if (!pid || isNaN(pid)) return null;
    return { pid, alive: isProcessAlive(pid) };
  } catch {
    return null;
  }
}

export function createEngineControlTools(extDir) {
  return [
    {
      name: "cron_engine_start",
      description: "Start the cron engine as a detached background process. The engine evaluates schedules and executes due jobs.",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        // Check if already running
        const existing = readEnginePid(extDir);
        if (existing && existing.alive) {
          return `Engine is already running (PID ${existing.pid}).`;
        }

        // Clean stale lockfile
        if (existing && !existing.alive) {
          try { unlinkSync(getLockfilePath(extDir)); } catch { /* ok */ }
        }

        const enginePath = join(extDir, "engine", "main.mjs");
        const logPath = join(getDataDir(extDir), "engine.log");

        const child = spawn("node", [enginePath], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          cwd: extDir,
        });

        child.unref();
        const pid = child.pid;

        // Brief wait for lockfile to confirm startup
        await new Promise((r) => setTimeout(r, 1000));

        const check = readEnginePid(extDir);
        if (check && check.alive) {
          const jobs = listJobs(extDir);
          return `Engine started (PID ${check.pid}). ${jobs.length} job(s) registered.`;
        } else {
          return `Engine process spawned (PID ${pid}) but lockfile not yet confirmed. Check \`${logPath}\` for details.`;
        }
      },
    },

    {
      name: "cron_engine_stop",
      description: "Stop the running cron engine.",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        const info = readEnginePid(extDir);
        if (!info) return "Engine is not running (no lockfile found).";
        if (!info.alive) {
          try { unlinkSync(getLockfilePath(extDir)); } catch { /* ok */ }
          return "Engine was not running (stale lockfile cleaned up).";
        }

        try {
          process.kill(info.pid, "SIGTERM");
        } catch (err) {
          return `Failed to stop engine (PID ${info.pid}): ${err.message}`;
        }

        // Wait for graceful shutdown (up to 5s)
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 500));
          if (!isProcessAlive(info.pid)) {
            return `Engine stopped (PID ${info.pid}).`;
          }
        }

        // Force kill
        try {
          process.kill(info.pid, "SIGKILL");
        } catch { /* already dead */ }

        try { unlinkSync(getLockfilePath(extDir)); } catch { /* ok */ }
        return `Engine force-stopped (PID ${info.pid}).`;
      },
    },

    {
      name: "cron_engine_status",
      description: "Check if the cron engine is running and report active job count.",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        const info = readEnginePid(extDir);
        if (!info || !info.alive) {
          const jobs = listJobs(extDir);
          const stale = info && !info.alive ? " (stale lockfile cleaned)" : "";
          if (info && !info.alive) {
            try { unlinkSync(getLockfilePath(extDir)); } catch { /* ok */ }
          }
          return `Engine is **not running**${stale}.\n${jobs.length} job(s) registered.`;
        }

        const jobs = listJobs(extDir);
        const enabled = jobs.filter((j) => j.status === "enabled").length;
        const disabled = jobs.filter((j) => j.status === "disabled").length;

        return `Engine is **running** (PID ${info.pid}).\n` +
          `Jobs: ${jobs.length} total (${enabled} enabled, ${disabled} disabled)`;
      },
    },
  ];
}
