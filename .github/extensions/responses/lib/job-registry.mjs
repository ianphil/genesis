// Background job registry — one JSON file per job with atomic writes.

import { readFileSync, writeFileSync, unlinkSync, readdirSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getDataDir } from "./paths.mjs";

/**
 * Atomic write: write to temp file, then rename.
 * Rename is atomic on both NTFS and Linux.
 */
function atomicWrite(filePath, data) {
  const tmp = filePath + "." + randomBytes(6).toString("hex") + ".tmp";
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    renameSync(tmp, filePath);
  } finally {
    try { unlinkSync(tmp); } catch { /* tmp already renamed or never written */ }
  }
}

/** Return the bg-jobs directory for an agent. */
export function getBgJobsDir(extDir, agentName) {
  return join(getDataDir(extDir, agentName), "bg-jobs");
}

/** Ensure the bg-jobs directory exists. */
function ensureBgJobsDir(extDir, agentName) {
  mkdirSync(getBgJobsDir(extDir, agentName), { recursive: true });
}

/** Create a new background job. Returns the job object. */
export function createJob(extDir, agentName, { id, cronJobId, sessionId, prompt }) {
  ensureBgJobsDir(extDir, agentName);
  const now = new Date().toISOString();
  const job = {
    id,
    cronJobId,
    sessionId,
    prompt,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  atomicWrite(join(getBgJobsDir(extDir, agentName), `${id}.json`), job);
  return job;
}

/** Read a single job by ID. Returns null if not found. */
export function getJob(extDir, agentName, jobId) {
  try {
    const raw = readFileSync(join(getBgJobsDir(extDir, agentName), `${jobId}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** List all jobs. Returns an array of job objects sorted by createdAt descending. */
export function listJobs(extDir, agentName) {
  ensureBgJobsDir(extDir, agentName);
  const dir = getBgJobsDir(extDir, agentName);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    try {
      return JSON.parse(readFileSync(join(dir, f), "utf-8"));
    } catch {
      return null;
    }
  }).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Update a job's status. Returns the updated job or null if not found. */
export function updateJobStatus(extDir, agentName, jobId, status) {
  const job = getJob(extDir, agentName, jobId);
  if (!job) return null;
  job.status = status;
  job.updatedAt = new Date().toISOString();
  atomicWrite(join(getBgJobsDir(extDir, agentName), `${jobId}.json`), job);
  return job;
}

/** Delete a job by ID. Returns true if deleted, false if not found. */
export function removeJob(extDir, agentName, jobId) {
  try {
    unlinkSync(join(getBgJobsDir(extDir, agentName), `${jobId}.json`));
    return true;
  } catch {
    return false;
  }
}

/** Delete a job's progress JSONL file. Returns true if deleted, false if not found. */
export function removeProgressFile(extDir, agentName, jobId) {
  try {
    unlinkSync(join(getBgJobsDir(extDir, agentName), `${jobId}.progress.jsonl`));
    return true;
  } catch {
    return false;
  }
}
