// Decay: remove stale entries from memory.md.

import { parseMemory, writeMemory, today, daysBetween } from "./parser.mjs";
import { getMemoryPath } from "./paths.mjs";

const DEFAULT_DECAY_DAYS = 90;

/**
 * Scan memory.md and remove Learned entries that haven't been
 * reinforced within the decay threshold.
 * Corrected entries never decay.
 *
 * @param {string} mindRoot
 * @param {{ decayDays?: number, dryRun?: boolean }} options
 * @returns {{ removed: string[], kept: number, decayThreshold: number }}
 */
export function decay(mindRoot, options = {}) {
  const decayDays = options.decayDays ?? DEFAULT_DECAY_DAYS;
  const dryRun = options.dryRun ?? false;
  const memPath = getMemoryPath(mindRoot);
  const memory = parseMemory(memPath);
  const now = today();

  const removed = [];
  const kept = [];

  for (const entry of memory.learned) {
    const lastActive = entry.reinforced || entry.date;
    const age = daysBetween(lastActive, now);

    if (age > decayDays) {
      removed.push(`${entry.text} (age: ${age}d, last active: ${lastActive})`);
    } else {
      kept.push(entry);
    }
  }

  if (!dryRun && removed.length > 0) {
    memory.learned = kept;
    writeMemory(memory, memPath);
  }

  return {
    removed,
    kept: kept.length + memory.corrected.length,
    decayThreshold: decayDays,
  };
}
