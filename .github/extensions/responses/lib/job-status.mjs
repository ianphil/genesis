// Lazy job-status resolution — merges registry, cron, and session data
// into a unified timeline on each request.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildStatusItemsFromSession } from "./session-reader.mjs";
import { getJob, updateJobStatus, getBgJobsDir } from "./job-registry.mjs";
import { readProgressEvents } from "./progress-reader.mjs";

/**
 * Read and parse a JSON file. Returns null on any failure.
 */
function readJson(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Read the most recent run record from the cron history file.
 * History is an array of { outcome, startedAtUtc, completedAtUtc, errorMessage, durationMs, output }.
 * Returns the last entry or null.
 */
function readLatestHistoryRecord(extDir, agentName, cronJobId) {
  const historyPath = resolve(extDir, "..", "cron", "data", agentName, "history", `${cronJobId}.json`);
  const records = readJson(historyPath);
  if (!Array.isArray(records) || records.length === 0) return null;
  return records[records.length - 1];
}

/**
 * Check whether a one-shot cron job has fired.
 * A one-shot is considered fired when its status is "disabled".
 */
function hasCronJobFired(extDir, agentName, cronJobId) {
  const jobPath = resolve(extDir, "..", "cron", "data", agentName, "jobs", `${cronJobId}.json`);
  const cronJob = readJson(jobPath);
  if (!cronJob) return false;
  return cronJob.status === "disabled" && cronJob.schedule?.type === "oneShot";
}

/**
 * Resolve the current status of a background job by merging data from
 * the job registry, cron system, and session store into a unified timeline.
 *
 * Returns { status, statusItems, response } or null if the job doesn't exist.
 * `response` contains the full output text when available (from session store
 * turns or cron history), or null.
 */
export function resolveJobStatus(extDir, agentName, jobId) {
  const job = getJob(extDir, agentName, jobId);
  if (!job) return null;

  const statusItems = [
    { title: "Job Created", description: "Request received and queued.", timestamp: job.createdAt },
  ];

  // Cron execution data
  const historyRecord = readLatestHistoryRecord(extDir, agentName, job.cronJobId);
  const cronFired = hasCronJobFired(extDir, agentName, job.cronJobId);

  // Session progress data
  const sessionItems = buildStatusItemsFromSession(job.sessionId);
  statusItems.push(...sessionItems);

  // Progress file data (tool calls, sub-agents, turn events)
  const progressFilePath = join(getBgJobsDir(extDir, agentName), `${jobId}.progress.jsonl`);
  const progressItems = readProgressEvents(progressFilePath);
  statusItems.push(...progressItems);

  // Determine resolved status and capture response text
  let resolvedStatus;
  let response = null;

  if (job.status === "cancelled") {
    resolvedStatus = "cancelled";
  } else if (historyRecord?.outcome === "success") {
    resolvedStatus = "completed";

    // Prefer session-store turns for response text; fall back to progress file, then cron history
    const lastTurn = sessionItems.filter((i) => i.fullText).pop();
    const lastProgress = progressItems.filter((i) => i.fullText).pop();
    response = lastTurn?.fullText || lastProgress?.fullText || historyRecord.output || null;

    // When session store is empty, surface the response from cron history
    if (!lastTurn && historyRecord.output) {
      statusItems.push({
        title: "Response",
        description: historyRecord.output,
        timestamp: historyRecord.completedAtUtc,
        fullText: historyRecord.output,
      });
    }

    statusItems.push({
      title: "Completed",
      description: "Job finished successfully.",
      timestamp: historyRecord.completedAtUtc,
    });
  } else if (historyRecord?.outcome === "failure") {
    resolvedStatus = "failed";
    statusItems.push({
      title: "Failed",
      description: historyRecord.errorMessage ?? "Unknown error.",
      timestamp: historyRecord.completedAtUtc,
    });
  } else if (cronFired) {
    resolvedStatus = "running";
  } else {
    resolvedStatus = "queued";
  }

  // Sync registry if status drifted (but never override a cancellation)
  if (resolvedStatus !== job.status && job.status !== "cancelled") {
    updateJobStatus(extDir, agentName, jobId, resolvedStatus);
  }

  statusItems.sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    return 0;
  });

  return { status: resolvedStatus, statusItems, response };
}
