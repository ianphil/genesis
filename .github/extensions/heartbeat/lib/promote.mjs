// Promote: write entries to memory.md with timestamps.

import { parseMemory, writeMemory, today } from "./parser.mjs";
import { getMemoryPath } from "./paths.mjs";

/**
 * Promote one or more entries to memory.md.
 * @param {string} mindRoot
 * @param {{ text: string, section: "learned" | "corrected" }[]} entries
 * @returns {{ promoted: number, duplicatesSkipped: number }}
 */
export function promote(mindRoot, entries) {
  const memPath = getMemoryPath(mindRoot);
  const memory = parseMemory(memPath);
  const dateStr = today();

  let promoted = 0;
  let duplicatesSkipped = 0;

  for (const entry of entries) {
    const section = entry.section === "corrected" ? "corrected" : "learned";
    const textLower = entry.text.toLowerCase();

    // Skip duplicates (case-insensitive substring match)
    const isDuplicate = memory[section].some(
      (existing) => existing.text.toLowerCase() === textLower
    );
    if (isDuplicate) {
      duplicatesSkipped++;
      continue;
    }

    memory[section].push({
      text: entry.text,
      section,
      date: dateStr,
      reinforced: null,
      raw: "",
    });
    promoted++;
  }

  writeMemory(memory, memPath);
  return { promoted, duplicatesSkipped };
}
