// Run history — per-job append with auto-prune.

import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getHistoryDir } from "./paths.mjs";

const MAX_RECORDS = 500;
const MAX_BYTES = 1_048_576; // 1 MB

/** Ensure the history directory exists */
function ensureHistoryDir(extDir) {
  mkdirSync(getHistoryDir(extDir), { recursive: true });
}

/** Read history for a job. Returns array of run records (newest first). */
export function readHistory(extDir, jobId) {
  try {
    const raw = readFileSync(join(getHistoryDir(extDir), `${jobId}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Append a run record and auto-prune. */
export function appendHistory(extDir, jobId, record) {
  ensureHistoryDir(extDir);
  const filePath = join(getHistoryDir(extDir), `${jobId}.json`);

  let history = readHistory(extDir, jobId);
  history.push(record);

  // Prune by count
  if (history.length > MAX_RECORDS) {
    history = history.slice(history.length - MAX_RECORDS);
  }

  // Prune by size
  let serialized = JSON.stringify(history, null, 2);
  while (Buffer.byteLength(serialized, "utf-8") > MAX_BYTES && history.length > 1) {
    history.shift();
    serialized = JSON.stringify(history, null, 2);
  }

  writeFileSync(filePath, serialized, "utf-8");
}

/** Delete history for a job. */
export function deleteHistory(extDir, jobId) {
  try {
    unlinkSync(join(getHistoryDir(extDir), `${jobId}.json`));
    return true;
  } catch {
    return false;
  }
}

/** Create a new run record template. */
export function createRunRecord(jobId) {
  return {
    runId: randomUUID(),
    jobId,
    startedAtUtc: new Date().toISOString(),
    completedAtUtc: null,
    outcome: null, // "success" | "failure"
    errorMessage: null,
    durationMs: null,
  };
}

/** Get recent history (last N records). */
export function getRecentHistory(extDir, jobId, count = 10) {
  const history = readHistory(extDir, jobId);
  return history.slice(-count);
}
