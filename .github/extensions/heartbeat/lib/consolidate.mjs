// Consolidate: read log.md entries for LLM evaluation.

import { parseLog } from "./parser.mjs";
import { getLogPath } from "./paths.mjs";

/**
 * Read log.md and return entries grouped by date.
 * The LLM uses this to decide what's worth promoting to memory.
 * @param {string} mindRoot
 * @returns {{ entries: import("./parser.mjs").LogEntry[], totalCount: number, dateRange: string }}
 */
export function consolidate(mindRoot) {
  const logPath = getLogPath(mindRoot);
  const entries = parseLog(logPath);

  if (entries.length === 0) {
    return { entries: [], totalCount: 0, dateRange: "none" };
  }

  const dates = [...new Set(entries.map((e) => e.date))].sort();
  const dateRange =
    dates.length === 1 ? dates[0] : `${dates[0]} to ${dates.at(-1)}`;

  return { entries, totalCount: entries.length, dateRange };
}
