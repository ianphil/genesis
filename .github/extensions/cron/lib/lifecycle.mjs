// Lifecycle state machine — handles job state transitions after execution.
// Ports Gateway's CronJobLifecycle.ApplyResult() logic.

import { calculateNextRun } from "./scheduler.mjs";
import { classifyError } from "./errors.mjs";

// Exponential backoff steps: 30s → 1m → 5m → 15m → 1h (capped)
const BACKOFF_STEPS_MS = [
  30_000,      // 30s
  60_000,      // 1m
  300_000,     // 5m
  900_000,     // 15m
  3_600_000,   // 1h
];

const MAX_CONSECUTIVE_FAILURES = 10;

/**
 * Apply a run result to a job, returning the updated job.
 * Mutates the job object in place.
 *
 * @param {object} job - The job object
 * @param {{ success: boolean, error?: string }} result - The execution result
 * @returns {object} The mutated job
 */
export function applyResult(job, result) {
  const now = new Date();
  job.lastRunAtUtc = now.toISOString();

  if (result.success) {
    return applySuccess(job);
  } else {
    return applyFailure(job, result.error || "Unknown error");
  }
}

/** Handle successful execution */
function applySuccess(job) {
  // Reset backoff on success
  job.backoff = null;

  // One-shot jobs disable after success
  if (job.schedule.type === "oneShot") {
    job.status = "disabled";
    job.nextRunAtUtc = null;
    return job;
  }

  // Calculate next run
  job.nextRunAtUtc = calculateNextRun(job.schedule, job.lastRunAtUtc);
  return job;
}

/** Handle failed execution */
function applyFailure(job, errorMessage) {
  const errorType = classifyError(errorMessage);

  if (errorType === "permanent") {
    // Permanent errors disable the job immediately
    job.status = "disabled";
    job.nextRunAtUtc = null;
    job.backoff = {
      consecutiveFailures: (job.backoff?.consecutiveFailures || 0) + 1,
      nextRetryAtUtc: null,
      lastErrorMessage: errorMessage,
    };
    return job;
  }

  // Transient errors use exponential backoff
  const failures = (job.backoff?.consecutiveFailures || 0) + 1;

  // Circuit breaker: disable after too many consecutive failures
  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    job.status = "disabled";
    job.nextRunAtUtc = null;
    job.backoff = {
      consecutiveFailures: failures,
      nextRetryAtUtc: null,
      lastErrorMessage: `Disabled after ${failures} consecutive failures. Last: ${errorMessage}`,
    };
    return job;
  }

  const stepIndex = Math.min(failures - 1, BACKOFF_STEPS_MS.length - 1);
  const delayMs = BACKOFF_STEPS_MS[stepIndex];
  const retryAt = new Date(Date.now() + delayMs);

  job.backoff = {
    consecutiveFailures: failures,
    nextRetryAtUtc: retryAt.toISOString(),
    lastErrorMessage: errorMessage,
  };

  // Keep nextRunAtUtc as-is — the isDue() check uses backoff.nextRetryAtUtc
  return job;
}

/**
 * Check if a job has been disabled due to permanent failure.
 * @param {object} job
 * @returns {boolean}
 */
export function isPermanentlyFailed(job) {
  return job.status === "disabled" &&
    job.backoff !== null &&
    job.backoff.nextRetryAtUtc === null;
}
