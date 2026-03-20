// Cron Engine — standalone detached process.
// Tick loop reads jobs, evaluates schedules, dispatches due jobs.
// Accepts --agent <name> to scope to a specific agent namespace.

import { readFileSync, writeFileSync, unlinkSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { listJobs, readJob, writeJob } from "../lib/store.mjs";
import { isDue } from "../lib/scheduler.mjs";
import { applyResult } from "../lib/lifecycle.mjs";
import { executeCommand } from "../lib/executor.mjs";
import { executePrompt } from "../lib/prompt-executor.mjs";
import { appendHistory, createRunRecord } from "../lib/history.mjs";
import { getCachedIdentity, clearIdentityCache } from "../lib/identity.mjs";
import { getLockfilePath, getEngineLogPath, getAgentName, getDataDir } from "../lib/paths.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(__dirname, "..");

// Parse --agent from CLI args, fall back to env var, then "default"
function resolveAgentName() {
  const idx = process.argv.indexOf("--agent");
  if (idx !== -1 && process.argv[idx + 1]) {
    const raw = process.argv[idx + 1].trim();
    const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, "");
    if (sanitized.length > 0) return sanitized;
  }
  return getAgentName();
}

const agentName = resolveAgentName();

const TICK_INTERVAL_MS = 2000;
const MAX_CONCURRENT = 3;

const activeJobIds = new Set();
let concurrentCount = 0;
let shuttingDown = false;
let tickTimer = null;
let lastTickTime = Date.now();

// --- Lockfile management ---

function acquireLock() {
  const lockPath = getLockfilePath(extDir, agentName);
  // Ensure data directory exists
  mkdirSync(getDataDir(extDir, agentName), { recursive: true });
  // Check for stale lock
  try {
    const existingPid = parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
    if (existingPid && isProcessAlive(existingPid)) {
      log(`Engine already running (PID ${existingPid}). Exiting.`);
      process.exit(1);
    }
    // Stale lock — clean up
    unlinkSync(lockPath);
  } catch {
    // No lockfile — proceed
  }

  writeFileSync(lockPath, String(process.pid), "utf-8");
  log(`Engine started (PID ${process.pid}, agent: ${agentName}, Node ${process.version})`);
}

function releaseLock() {
  try {
    unlinkSync(getLockfilePath(extDir, agentName));
  } catch { /* best effort */ }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// --- Logging ---

function log(message) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}`;
  process.stderr.write(line + "\n");

  // Also append to engine.log
  try {
    const logPath = getEngineLogPath(extDir, agentName);
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath, line + "\n", { flag: "a" });
  } catch { /* best effort */ }
}

// --- Tick loop ---

async function tick() {
  lastTickTime = Date.now();
  if (shuttingDown) return;

  try {
    const jobs = listJobs(extDir, agentName);
    const dueJobs = jobs
      .filter((j) => isDue(j) && !activeJobIds.has(j.id))
      .sort((a, b) => {
        // Deterministic ordering: nextRunAtUtc then id
        const ta = new Date(a.nextRunAtUtc).getTime();
        const tb = new Date(b.nextRunAtUtc).getTime();
        if (ta !== tb) return ta - tb;
        return a.id.localeCompare(b.id);
      });

    for (const job of dueJobs) {
      if (concurrentCount >= MAX_CONCURRENT) break;
      if (activeJobIds.has(job.id)) continue;

      // Non-blocking dispatch — .catch() prevents unhandled rejections
      dispatch(job).catch((err) => {
        log(`Unhandled dispatch error for ${job.id}: ${err.stack || err.message}`);
      });
    }
  } catch (err) {
    log(`Tick error: ${err.message}`);
  }
}

async function dispatch(job) {
  activeJobIds.add(job.id);
  concurrentCount++;

  const record = createRunRecord(job.id);
  log(`Dispatching ${job.id} (${job.payload.type})`);

  try {
    let result;
    if (job.payload.type === "command") {
      result = await executeCommand(job.payload);
    } else if (job.payload.type === "prompt") {
      result = await executePrompt(extDir, job.payload);
    } else {
      result = { success: false, output: "", durationMs: 0, error: `Unknown payload type: ${job.payload.type}` };
    }

    // Complete the run record
    record.completedAtUtc = new Date().toISOString();
    record.outcome = result.success ? "success" : "failure";
    record.errorMessage = result.error || null;
    record.durationMs = result.durationMs;
    record.output = result.output || null;

    // Persist history
    appendHistory(extDir, agentName, job.id, record);

    // Apply lifecycle state transition
    // Re-read job in case it was modified during execution
    const currentJob = readJob(extDir, agentName, job.id);
    if (currentJob) {
      applyResult(currentJob, result);
      writeJob(extDir, agentName, currentJob);
    }

    const emoji = result.success ? "✅" : "❌";
    log(`${emoji} ${job.id}: ${record.outcome} (${record.durationMs}ms)${record.errorMessage ? " — " + record.errorMessage : ""}`);
  } catch (err) {
    log(`Dispatch error for ${job.id}: ${err.message}`);

    record.completedAtUtc = new Date().toISOString();
    record.outcome = "failure";
    record.errorMessage = err.message;
    record.durationMs = Date.now() - new Date(record.startedAtUtc).getTime();
    appendHistory(extDir, agentName, job.id, record);
  } finally {
    activeJobIds.delete(job.id);
    concurrentCount--;
  }
}

// --- Shutdown ---

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Received ${signal}. Draining ${activeJobIds.size} active job(s)...`);

  if (tickTimer) clearInterval(tickTimer);

  // Wait for in-flight jobs (max 60s)
  const deadline = Date.now() + 60_000;
  while (activeJobIds.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }

  if (activeJobIds.size > 0) {
    log(`Force exit with ${activeJobIds.size} job(s) still running.`);
  }

  releaseLock();
  log("Engine stopped.");
  process.exit(0);
}

// --- Global error handlers ---

process.on("uncaughtException", (err, origin) => {
  log(`UNCAUGHT EXCEPTION (${origin}): ${err.stack || err.message}`);
  // Don't exit — the engine should keep running through transient errors.
  // If the error is truly fatal, Node.js will exit anyway.
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
  log(`UNHANDLED REJECTION: ${msg}`);
  // Don't exit — log and continue. The dispatch try-catch should prevent
  // most rejections, but this catches edge cases.
});

// --- Main ---

// Pre-cache identity at startup
getCachedIdentity(extDir);

acquireLock();
tickTimer = setInterval(tick, TICK_INTERVAL_MS);
tick(); // First tick immediately

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --- Tick watchdog ---
// Detects if the tick loop has stalled and resets it.

const WATCHDOG_INTERVAL_MS = 30_000;
const WATCHDOG_MAX_STALL_MS = 60_000;

setInterval(() => {
  if (shuttingDown) return;
  const stall = Date.now() - lastTickTime;
  if (stall > WATCHDOG_MAX_STALL_MS) {
    log(`WATCHDOG: Tick loop stalled for ${Math.round(stall / 1000)}s. Resetting.`);
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(tick, TICK_INTERVAL_MS);
    tick();
  }
}, WATCHDOG_INTERVAL_MS);

// Keep alive
process.stdin.resume();
