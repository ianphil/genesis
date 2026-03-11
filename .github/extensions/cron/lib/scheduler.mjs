// Schedule evaluation — cron, interval, and one-shot.
// Uses croner for cron expression parsing with timezone support.

import { Cron } from "croner";

/**
 * Calculate the next run time for a schedule.
 * @param {object} schedule - { type, expression?, timezone?, intervalMs?, fireAtUtc? }
 * @param {Date|null} lastRunAt - When the job last ran (null if never)
 * @returns {string|null} ISO 8601 UTC timestamp, or null if no future run
 */
export function calculateNextRun(schedule, lastRunAt = null) {
  const now = new Date();

  switch (schedule.type) {
    case "cron": {
      const opts = {};
      if (schedule.timezone) {
        opts.timezone = schedule.timezone;
      }
      const job = new Cron(schedule.expression, opts);
      const next = job.nextRun(now);
      return next ? next.toISOString() : null;
    }

    case "interval": {
      if (lastRunAt) {
        const last = new Date(lastRunAt);
        const next = new Date(last.getTime() + schedule.intervalMs);
        // If next is in the past, fire immediately (relative to now)
        return next <= now ? now.toISOString() : next.toISOString();
      }
      // First run fires immediately
      return now.toISOString();
    }

    case "oneShot": {
      const fireAt = new Date(schedule.fireAtUtc);
      return fireAt > now ? fireAt.toISOString() : null;
    }

    default:
      return null;
  }
}

/**
 * Check if a job is due to run.
 * @param {object} job - The job object
 * @returns {boolean}
 */
export function isDue(job) {
  if (job.status !== "enabled") return false;
  if (!job.nextRunAtUtc) return false;

  const now = new Date();
  const nextRun = new Date(job.nextRunAtUtc);

  if (nextRun > now) return false;

  // Check backoff
  if (job.backoff && job.backoff.nextRetryAtUtc) {
    const retryAt = new Date(job.backoff.nextRetryAtUtc);
    if (retryAt > now) return false;
  }

  return true;
}

/**
 * Validate a schedule object.
 * @param {object} schedule
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSchedule(schedule) {
  if (!schedule || !schedule.type) {
    return { valid: false, error: "Schedule must have a type" };
  }

  switch (schedule.type) {
    case "cron": {
      if (!schedule.expression) {
        return { valid: false, error: "Cron schedule requires an expression" };
      }
      try {
        const opts = {};
        if (schedule.timezone) opts.timezone = schedule.timezone;
        new Cron(schedule.expression, opts);
        return { valid: true };
      } catch (e) {
        return { valid: false, error: `Invalid cron expression: ${e.message}` };
      }
    }

    case "interval": {
      if (!schedule.intervalMs || schedule.intervalMs < 1000) {
        return { valid: false, error: "Interval must be at least 1000ms" };
      }
      return { valid: true };
    }

    case "oneShot": {
      if (!schedule.fireAtUtc) {
        return { valid: false, error: "One-shot schedule requires fireAtUtc" };
      }
      const d = new Date(schedule.fireAtUtc);
      if (isNaN(d.getTime())) {
        return { valid: false, error: "Invalid fireAtUtc date" };
      }
      return { valid: true };
    }

    default:
      return { valid: false, error: `Unknown schedule type: ${schedule.type}` };
  }
}
