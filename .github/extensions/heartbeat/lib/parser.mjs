// Parser for memory.md and log.md formats.
// Handles structured read/write so the LLM never improvises the format.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

// ─── Memory.md ──────────────────────────────────────────────────────────────

/**
 * A single memory entry.
 * @typedef {{
 *   text: string,
 *   section: "corrected" | "learned",
 *   date: string,
 *   reinforced: string | null,
 *   raw: string,
 * }} MemoryEntry
 */

const DATE_RE = /\*(?:learned|corrected):\s*(\d{4}-\d{2}-\d{2})\s*(?:,\s*reinforced:\s*(\d{4}-\d{2}-\d{2}))?\s*\*/;

/**
 * Parse a single memory line into a MemoryEntry.
 * Expected format: `- Some text — *learned: 2026-03-11, reinforced: 2026-03-11*`
 */
function parseMemoryLine(line, section) {
  const match = line.match(DATE_RE);
  if (!match) return null;

  const dateField = match[1];
  const reinforced = match[2] || null;
  // Strip the leading `- ` and the trailing metadata
  const text = line
    .replace(/^-\s*/, "")
    .replace(/\s*—\s*\*(?:learned|corrected):.*\*\s*$/, "")
    .trim();

  return { text, section, date: dateField, reinforced, raw: line };
}

/**
 * Parse memory.md into structured entries.
 * @param {string} filePath
 * @returns {{ corrected: MemoryEntry[], learned: MemoryEntry[] }}
 */
export function parseMemory(filePath) {
  const result = { corrected: [], learned: [] };
  if (!existsSync(filePath)) return result;

  const content = readFileSync(filePath, "utf-8");
  let currentSection = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (/^##\s+Corrected/i.test(trimmed)) {
      currentSection = "corrected";
      continue;
    }
    if (/^##\s+Learned/i.test(trimmed)) {
      currentSection = "learned";
      continue;
    }
    if (/^#\s/.test(trimmed)) {
      currentSection = null;
      continue;
    }
    if (!currentSection || !trimmed.startsWith("- ")) continue;

    const entry = parseMemoryLine(trimmed, currentSection);
    if (entry) {
      result[currentSection].push(entry);
    }
  }

  return result;
}

/**
 * Serialize memory entries back to memory.md format.
 * @param {{ corrected: MemoryEntry[], learned: MemoryEntry[] }} memory
 * @param {string} filePath
 */
export function writeMemory(memory, filePath) {
  const lines = ["# AI Notes — Memory", ""];

  lines.push("## Corrected");
  if (memory.corrected.length === 0) {
    lines.push("");
  } else {
    for (const entry of memory.corrected) {
      lines.push(formatEntry(entry));
    }
  }

  lines.push("");
  lines.push("## Learned");
  if (memory.learned.length === 0) {
    lines.push("");
  } else {
    for (const entry of memory.learned) {
      lines.push(formatEntry(entry));
    }
  }

  lines.push("");
  writeFileSync(filePath, lines.join("\n"), "utf-8");
}

function formatEntry(entry) {
  const kind = entry.section === "corrected" ? "corrected" : "learned";
  let meta = `*${kind}: ${entry.date}`;
  if (entry.reinforced) {
    meta += `, reinforced: ${entry.reinforced}`;
  }
  meta += "*";
  return `- ${entry.text} — ${meta}`;
}

// ─── Log.md ─────────────────────────────────────────────────────────────────

/**
 * A log entry.
 * @typedef {{ date: string, text: string, lineNumber: number }} LogEntry
 */

/**
 * Parse log.md into dated entries.
 * @param {string} filePath
 * @returns {LogEntry[]}
 */
export function parseLog(filePath) {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  const entries = [];
  let currentDate = null;

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Date header: ## 2026-03-11
    const dateMatch = trimmed.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    // Entry: - Some text
    if (currentDate && trimmed.startsWith("- ")) {
      entries.push({
        date: currentDate,
        text: trimmed.replace(/^-\s*/, "").trim(),
        lineNumber: i + 1,
      });
    }
  }

  return entries;
}

/**
 * Remove specific entries from log.md by line number.
 * Cleans up empty date headers after removal.
 * @param {string} filePath
 * @param {number[]} lineNumbers — 1-based line numbers to remove
 */
export function removeLogEntries(filePath, lineNumbers) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const toRemove = new Set(lineNumbers);

  // Mark lines for removal
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (toRemove.has(i + 1)) continue;
    kept.push(lines[i]);
  }

  // Clean up orphaned date headers (## DATE with no entries below)
  const cleaned = [];
  for (let i = 0; i < kept.length; i++) {
    const isDateHeader = /^##\s+\d{4}-\d{2}-\d{2}/.test(kept[i].trim());
    if (isDateHeader) {
      // Check if there are any entries before the next header or EOF
      let hasEntries = false;
      for (let j = i + 1; j < kept.length; j++) {
        const next = kept[j].trim();
        if (next.startsWith("#")) break;
        if (next.startsWith("- ")) { hasEntries = true; break; }
      }
      if (!hasEntries) continue;
    }
    cleaned.push(kept[i]);
  }

  writeFileSync(filePath, cleaned.join("\n"), "utf-8");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Today's date as YYYY-MM-DD */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Days between two YYYY-MM-DD strings */
export function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.abs(Math.round((b - a) / (1000 * 60 * 60 * 24)));
}
