// Error classification — transient vs permanent.
// Determines whether a failed job should retry or disable.

/** Transient error patterns — these are retryable */
const TRANSIENT_PATTERNS = [
  /timeout/i,
  /timed?\s*out/i,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /ENOTFOUND/,
  /ENETUNREACH/,
  /EPIPE/,
  /EAI_AGAIN/,
  /network/i,
  /socket hang up/i,
  /rate limit/i,
  /429/,
  /503/,
  /502/,
  /504/,
];

/**
 * Classify an error as transient or permanent.
 * @param {Error|string} error
 * @returns {"transient"|"permanent"}
 */
export function classifyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error?.code || "";

  for (const pattern of TRANSIENT_PATTERNS) {
    if (pattern.test(message) || pattern.test(code)) {
      return "transient";
    }
  }

  return "permanent";
}

/**
 * Check if an error is transient (retryable).
 * @param {Error|string} error
 * @returns {boolean}
 */
export function isTransient(error) {
  return classifyError(error) === "transient";
}
