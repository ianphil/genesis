// Stagger — deterministic offset per job ID to prevent thundering herd.
// Uses SHA-256 hash of job ID to produce a stable offset within a window.

import { createHash } from "node:crypto";

const DEFAULT_WINDOW_MS = 30_000; // 30 second stagger window

/**
 * Calculate a deterministic stagger offset for a job ID.
 * The same job ID always produces the same offset.
 *
 * @param {string} jobId - The job ID
 * @param {number} windowMs - Maximum stagger window in milliseconds
 * @returns {number} Offset in milliseconds (0 to windowMs)
 */
export function getStaggerOffset(jobId, windowMs = DEFAULT_WINDOW_MS) {
  const hash = createHash("sha256").update(jobId).digest();
  // Use first 4 bytes as uint32
  const value = hash.readUInt32BE(0);
  return Math.floor((value / 0xFFFFFFFF) * windowMs);
}

/**
 * Apply stagger to a next-run timestamp.
 * @param {string} nextRunAtUtc - ISO 8601 timestamp
 * @param {string} jobId - The job ID for deterministic offset
 * @param {number} windowMs - Stagger window
 * @returns {string} Adjusted ISO 8601 timestamp
 */
export function applyStagger(nextRunAtUtc, jobId, windowMs = DEFAULT_WINDOW_MS) {
  if (!nextRunAtUtc) return nextRunAtUtc;
  const base = new Date(nextRunAtUtc);
  const offset = getStaggerOffset(jobId, windowMs);
  return new Date(base.getTime() + offset).toISOString();
}
