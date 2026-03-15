// Engine control tools — cron_engine_start, cron_engine_stop, cron_engine_status

import { spawn } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getLockfilePath, getDataDir, getEngineLogPath } from "../lib/paths.mjs";
import { listJobs } from "../lib/store.mjs";
import { migrateLegacyData } from "../lib/migration.mjs";

/**
 * Sanitize an agent name to filesystem-safe characters.
 */
function sanitizeAgent(name) {
  const cleaned = (name || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

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
function readEnginePid(extDir, agentName) {
  try {
    const raw = readFileSync(getLockfilePath(extDir, agentName), "utf-8").trim();
    const pid = parseInt(raw, 10);
    if (!pid || isNaN(pid)) return null;
    return { pid, alive: isProcessAlive(pid) };
  } catch {
    return null;
  }
}

export function createEngineControlTools(extDir, state) {
  return [
    {
      name: "cron_engine_start",
      description: "Start the cron engine as a detached background process. The engine evaluates schedules and executes due jobs.",
      parameters: {
        type: "object",
        properties: {
          agent: {
            type: "string",
            description:
              "Agent name for per-agent data isolation. Switches jobs, history, and engine " +
              "to data/{agent}/. Persists for the rest of this session.",
          },
        },
      },
      handler: async (args) => {
        // Switch agent namespace if requested
        const newAgent = args.agent ? sanitizeAgent(args.agent) : null;
        if (newAgent && newAgent !== state.agentName) {
          // Stop existing engine if running under old namespace
          const oldInfo = readEnginePid(extDir, state.agentName);
          if (oldInfo && oldInfo.alive) {
            try { process.kill(oldInfo.pid, "SIGTERM"); } catch { /* ok */ }
          }
          state.agentName = newAgent;
          migrateLegacyData(extDir, newAgent);
        }

        // Check if already running
        const existing = readEnginePid(extDir, state.agentName);
        if (existing && existing.alive) {
          return `Engine is already running (PID ${existing.pid}, agent: ${state.agentName}).`;
        }

        // Clean stale lockfile
        if (existing && !existing.alive) {
          try { unlinkSync(getLockfilePath(extDir, state.agentName)); } catch { /* ok */ }
        }

        const enginePath = join(extDir, "engine", "main.mjs");
        const logPath = getEngineLogPath(extDir, state.agentName);

        const child = spawn("node", [enginePath, "--agent", state.agentName], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          cwd: extDir,
        });

        child.unref();
        const pid = child.pid;

        // Brief wait for lockfile to confirm startup
        await new Promise((r) => setTimeout(r, 1000));

        const check = readEnginePid(extDir, state.agentName);
        if (check && check.alive) {
          const jobs = listJobs(extDir, state.agentName);
          return `Engine started (PID ${check.pid}, agent: ${state.agentName}). ${jobs.length} job(s) registered.`;
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
        const info = readEnginePid(extDir, state.agentName);
        if (!info) return `Engine is not running (no lockfile found, agent: ${state.agentName}).`;
        if (!info.alive) {
          try { unlinkSync(getLockfilePath(extDir, state.agentName)); } catch { /* ok */ }
          return `Engine was not running (stale lockfile cleaned up, agent: ${state.agentName}).`;
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
            return `Engine stopped (PID ${info.pid}, agent: ${state.agentName}).`;
          }
        }

        // Force kill
        try {
          process.kill(info.pid, "SIGKILL");
        } catch { /* already dead */ }

        try { unlinkSync(getLockfilePath(extDir, state.agentName)); } catch { /* ok */ }
        return `Engine force-stopped (PID ${info.pid}, agent: ${state.agentName}).`;
      },
    },

    {
      name: "cron_engine_status",
      description: "Check if the cron engine is running and report active job count.",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        const info = readEnginePid(extDir, state.agentName);
        if (!info || !info.alive) {
          const jobs = listJobs(extDir, state.agentName);
          const stale = info && !info.alive ? " (stale lockfile cleaned)" : "";
          if (info && !info.alive) {
            try { unlinkSync(getLockfilePath(extDir, state.agentName)); } catch { /* ok */ }
          }
          return `Engine is **not running**${stale} (agent: ${state.agentName}).\n${jobs.length} job(s) registered.`;
        }

        const jobs = listJobs(extDir, state.agentName);
        const enabled = jobs.filter((j) => j.status === "enabled").length;
        const disabled = jobs.filter((j) => j.status === "disabled").length;

        return `Engine is **running** (PID ${info.pid}, agent: ${state.agentName}).\n` +
          `Jobs: ${jobs.length} total (${enabled} enabled, ${disabled} disabled)`;
      },
    },
  ];
}
