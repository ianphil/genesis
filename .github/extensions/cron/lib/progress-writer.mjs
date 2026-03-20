// JSONL progress writer — appends one event per line during job execution.
// Fire-and-forget: all errors are caught and logged to stderr.

import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Initialize (create or truncate) a progress file.
 * Ensures parent directory exists.
 */
export function initProgress(filePath) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, "", "utf-8");
  } catch (err) {
    process.stderr.write(`[progress-writer] init failed: ${err.message}\n`);
  }
}

/**
 * Append a single event as a JSON line.
 * @param {string} filePath
 * @param {{ type: string, title: string, description?: string, timestamp?: string, detail?: object }} event
 */
export function appendEvent(filePath, event) {
  try {
    const line = JSON.stringify({
      type: event.type,
      title: event.title,
      description: event.description || "",
      timestamp: event.timestamp || new Date().toISOString(),
      ...(event.detail ? { detail: event.detail } : {}),
    }) + "\n";
    appendFileSync(filePath, line, "utf-8");
  } catch (err) {
    process.stderr.write(`[progress-writer] append failed: ${err.message}\n`);
  }
}
