// Cron Engine — standalone detached process.
// Tick loop reads jobs, evaluates schedules, dispatches due jobs.

import { readFileSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { listJobs, readJob, writeJob } from "../lib/store.mjs";
import { isDue } from "../lib/scheduler.mjs";
import { applyResult } from "../lib/lifecycle.mjs";
import { executeCommand } from "../lib/executor.mjs";
import { executePrompt } from "../lib/prompt-executor.mjs";
import { appendHistory, createRunRecord } from "../lib/history.mjs";
import { getCachedIdentity, clearIdentityCache } from "../lib/identity.mjs";
import { getLockfilePath, getDataDir } from "../lib/paths.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(__dirname, "..");

const TICK_INTERVAL_MS = 2000;
const MAX_CONCURRENT = 3;

const activeJobIds = new Set();
let concurrentCount = 0;
let shuttingDown = false;
let tickTimer = null;

// --- Lockfile management ---

function acquireLock() {
  const lockPath = getLockfilePath(extDir);
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
  log(`Engine started (PID ${process.pid})`);
}

function releaseLock() {
  try {
    unlinkSync(getLockfilePath(extDir));
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
    const logPath = join(getDataDir(extDir), "engine.log");
    writeFileSync(logPath, line + "\n", { flag: "a" });
  } catch { /* best effort */ }
}

// --- Tick loop ---

async function tick() {
  if (shuttingDown) return;

  try {
    const jobs = listJobs(extDir);
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

      // Non-blocking dispatch
      dispatch(job);
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

    // Persist history
    appendHistory(extDir, job.id, record);

    // Apply lifecycle state transition
    // Re-read job in case it was modified during execution
    const currentJob = readJob(extDir, job.id);
    if (currentJob) {
      applyResult(currentJob, result);
      writeJob(extDir, currentJob);
    }

    const emoji = result.success ? "✅" : "❌";
    log(`${emoji} ${job.id}: ${record.outcome} (${record.durationMs}ms)${record.errorMessage ? " — " + record.errorMessage : ""}`);
  } catch (err) {
    log(`Dispatch error for ${job.id}: ${err.message}`);

    record.completedAtUtc = new Date().toISOString();
    record.outcome = "failure";
    record.errorMessage = err.message;
    record.durationMs = Date.now() - new Date(record.startedAtUtc).getTime();
    appendHistory(extDir, job.id, record);
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

// --- Main ---

// Pre-cache identity at startup
getCachedIdentity(extDir);

acquireLock();
tickTimer = setInterval(tick, TICK_INTERVAL_MS);
tick(); // First tick immediately

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Keep alive
process.stdin.resume();
