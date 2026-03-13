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
 * Serialize memory entries back to memory.md.
 * Preserves all existing content — only rewrites the Corrected and Learned sections.
 * If those sections don't exist yet, appends them at the end.
 * @param {{ corrected: MemoryEntry[], learned: MemoryEntry[] }} memory
 * @param {string} filePath
 */
export function writeMemory(memory, filePath) {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "# AI Notes — Memory\n";
  const lines = existing.split("\n");

  // Find section boundaries
  const sections = findSectionRanges(lines);

  // Build replacement blocks
  const correctedBlock = buildSectionBlock("Corrected", memory.corrected);
  const learnedBlock = buildSectionBlock("Learned", memory.learned);

  if (sections.corrected && sections.learned) {
    // Both exist — replace in-place (learned first to preserve line numbers)
    const [lStart, lEnd] = sections.learned.start < sections.corrected.start
      ? [sections.learned, sections.corrected]
      : [sections.corrected, sections.learned];
    const secondBlock = lEnd === sections.corrected ? correctedBlock : learnedBlock;
    const firstBlock = lEnd === sections.corrected ? learnedBlock : correctedBlock;

    lines.splice(lEnd.start, lEnd.end - lEnd.start, ...secondBlock);
    lines.splice(lStart.start, lStart.end - lStart.start, ...firstBlock);
  } else if (sections.corrected) {
    lines.splice(sections.corrected.start, sections.corrected.end - sections.corrected.start, ...correctedBlock);
    lines.push("", ...learnedBlock);
  } else if (sections.learned) {
    lines.splice(sections.learned.start, sections.learned.end - sections.learned.start, ...learnedBlock);
    lines.push("", ...correctedBlock);
  } else {
    // Neither exists — append both at end
    lines.push("", ...correctedBlock, "", ...learnedBlock);
  }

  writeFileSync(filePath, lines.join("\n"), "utf-8");
}

/**
 * Find the line ranges for Corrected and Learned sections.
 * Returns { corrected: { start, end } | null, learned: { start, end } | null }
 */
function findSectionRanges(lines) {
  const result = { corrected: null, learned: null };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^##\s+Corrected/i.test(trimmed)) {
      result.corrected = { start: i, end: findSectionEnd(lines, i) };
    } else if (/^##\s+Learned/i.test(trimmed)) {
      result.learned = { start: i, end: findSectionEnd(lines, i) };
    }
  }

  return result;
}

/** Find where a section ends (next heading or EOF) */
function findSectionEnd(lines, start) {
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##?\s/.test(lines[i].trim())) return i;
  }
  return lines.length;
}

function buildSectionBlock(title, entries) {
  const block = [`## ${title}`];
  if (entries.length === 0) {
    block.push("");
  } else {
    for (const entry of entries) {
      block.push(formatEntry(entry));
    }
  }
  return block;
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
