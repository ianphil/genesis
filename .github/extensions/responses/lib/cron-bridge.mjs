import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

export function getCronExtDir(responsesExtDir) {
  return resolve(responsesExtDir, "..", "cron");
}

export function getCronJobsDir(responsesExtDir, agentName) {
  return join(getCronExtDir(responsesExtDir), "data", agentName, "jobs");
}

export function isCronEngineRunning(responsesExtDir, agentName) {
  const lockPath = join(getCronExtDir(responsesExtDir), "data", agentName, "engine.lock");
  try {
    const pid = parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    return { running: false };
  }
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
