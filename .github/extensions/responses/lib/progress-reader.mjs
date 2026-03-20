// Reads JSONL progress files and returns status items for the RSS feed / job detail.

import { readFileSync, existsSync } from "node:fs";

/**
 * Read a progress JSONL file and return an array of status items.
 * Returns [] if the file doesn't exist, is empty, or is entirely malformed.
 * Skips individual malformed lines (handles partial writes during active execution).
 *
 * @param {string} filePath - Absolute path to the .progress.jsonl file
 * @returns {Array<{ title: string, description: string, timestamp: string, fullText?: string }>}
 */
export function readProgressEvents(filePath) {
  try {
    if (!filePath || !existsSync(filePath)) return [];

    const content = readFileSync(filePath, "utf-8");
    if (!content.trim()) return [];

    const items = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        items.push({
          title: event.title || "Progress",
          description: event.description || "",
          timestamp: event.timestamp || "",
          ...(event.fullText ? { fullText: event.fullText } : {}),
        });
      } catch {
        // Skip malformed lines (e.g. partial write at end of file)
      }
    }
    return items;
  } catch {
    return [];
  }
}
