import { readFileSync, readdirSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

export function getCronExtDir(responsesExtDir) {
  return resolve(responsesExtDir, "..", "cron");
}

export function getCronJobsDir(responsesExtDir, agentName) {
  return join(getCronExtDir(responsesExtDir), "data", agentName, "jobs");
}

/**
 * Check whether a specific agent's cron engine lockfile exists and the PID is alive.
 */
function checkLockfile(lockPath) {
  try {
    const pid = parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
    if (!pid || isNaN(pid)) return null;
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

export function isCronEngineRunning(responsesExtDir, agentName) {
  const lockPath = join(getCronExtDir(responsesExtDir), "data", agentName, "engine.lock");
  const pid = checkLockfile(lockPath);
  return pid ? { running: true, pid } : { running: false };
}

/**
 * Scan all agent namespaces under cron/data/ for running engine lockfiles.
 * Returns an array of { agentName, pid } for each live engine.
 */
export function findRunningEngines(responsesExtDir) {
  const dataDir = join(getCronExtDir(responsesExtDir), "data");
  let dirs;
  try {
    dirs = readdirSync(dataDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }

  const engines = [];
  for (const name of dirs) {
    const pid = checkLockfile(join(dataDir, name, "engine.lock"));
    if (pid) engines.push({ agentName: name, pid });
  }
  return engines;
}

export function createOneShotCronJob(responsesExtDir, agentName, { cronJobId, prompt, sessionId, model, timeoutSeconds }) {
  const jobsDir = getCronJobsDir(responsesExtDir, agentName);
  if (!existsSync(jobsDir)) mkdirSync(jobsDir, { recursive: true });

  const fireAtUtc = new Date(Date.now() + 3000).toISOString();
  const job = {
    id: cronJobId,
    name: cronJobId,
    status: "enabled",
    maxConcurrency: 1,
    createdAtUtc: new Date().toISOString(),
    createdFrom: process.cwd(),
    lastRunAtUtc: null,
    nextRunAtUtc: fireAtUtc,
    schedule: { type: "oneShot", fireAtUtc },
    payload: {
      type: "prompt",
      prompt,
      model: model ?? null,
      sessionId: sessionId ?? null,
      preloadToolNames: null,
      timeoutSeconds: timeoutSeconds ?? 300,
    },
    backoff: null,
    source: "responses",
  };

  const filePath = join(jobsDir, `${cronJobId}.json`);
  const tmpPath = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(job, null, 2));
  renameSync(tmpPath, filePath);

  return job;
}
