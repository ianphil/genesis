// Job store — one JSON file per job with atomic writes.

import { readFileSync, writeFileSync, unlinkSync, readdirSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getJobsDir } from "./paths.mjs";

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

/** Convert a name to a kebab-case ID */
export function nameToId(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Ensure the jobs directory exists */
function ensureJobsDir(extDir, agentName) {
  mkdirSync(getJobsDir(extDir, agentName), { recursive: true });
}

/** Read a single job by ID. Returns null if not found. */
export function readJob(extDir, agentName, jobId) {
  try {
    const raw = readFileSync(join(getJobsDir(extDir, agentName), `${jobId}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** List all jobs. Returns an array of job objects. */
export function listJobs(extDir, agentName) {
  ensureJobsDir(extDir, agentName);
  const dir = getJobsDir(extDir, agentName);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    try {
      return JSON.parse(readFileSync(join(dir, f), "utf-8"));
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/** Write a job (create or update). */
export function writeJob(extDir, agentName, job) {
  ensureJobsDir(extDir, agentName);
  atomicWrite(join(getJobsDir(extDir, agentName), `${job.id}.json`), job);
}

/** Delete a job by ID. Returns true if deleted, false if not found. */
export function deleteJob(extDir, agentName, jobId) {
  try {
    unlinkSync(join(getJobsDir(extDir, agentName), `${jobId}.json`));
    return true;
  } catch {
    return false;
  }
}

/** Check if a job ID already exists. */
export function jobExists(extDir, agentName, jobId) {
  return readJob(extDir, agentName, jobId) !== null;
}
