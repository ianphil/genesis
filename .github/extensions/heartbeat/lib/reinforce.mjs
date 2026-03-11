// Reinforce: bump the reinforced date on a memory entry.

import { parseMemory, writeMemory, today } from "./parser.mjs";
import { getMemoryPath } from "./paths.mjs";

/**
 * Find a memory entry by substring match and bump its reinforced date.
 * Searches both sections. Case-insensitive.
 *
 * @param {string} mindRoot
 * @param {string} substring — text to match against memory entries
 * @returns {{ found: boolean, entry: string | null, section: string | null }}
 */
export function reinforce(mindRoot, substring) {
  const memPath = getMemoryPath(mindRoot);
  const memory = parseMemory(memPath);
  const needle = substring.toLowerCase();
  const dateStr = today();

  for (const section of ["corrected", "learned"]) {
    for (const entry of memory[section]) {
      if (entry.text.toLowerCase().includes(needle)) {
        entry.reinforced = dateStr;
        writeMemory(memory, memPath);
        return { found: true, entry: entry.text, section };
      }
    }
  }

  return { found: false, entry: null, section: null };
}
