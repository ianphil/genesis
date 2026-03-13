// Memory tools — tool definitions and handlers for heartbeat memory operations.

import { consolidate } from "../lib/consolidate.mjs";
import { promote } from "../lib/promote.mjs";
import { decay } from "../lib/decay.mjs";
import { reinforce } from "../lib/reinforce.mjs";
import { parseMemory, parseLog } from "../lib/parser.mjs";
import { getMemoryPath, getLogPath } from "../lib/paths.mjs";
import { removeLogEntries } from "../lib/parser.mjs";

export function createMemoryTools(mindRoot, toast) {
  return [
    {
      name: "heartbeat_consolidate",
      description:
        "Reads the session log (.working-memory/log.md) and returns all entries for evaluation. " +
        "Use this to see what's in short-term memory before deciding what to promote to long-term memory.",
      parameters: { type: "object", properties: {}, required: [] },
      handler: async () => {
        const result = consolidate(mindRoot);
        if (result.totalCount === 0) {
          return "Log is empty — nothing to consolidate.";
        }
        const lines = [`**${result.totalCount} entries** (${result.dateRange}):\n`];
        for (const entry of result.entries) {
          lines.push(`- [${entry.date}] ${entry.text}  (line ${entry.lineNumber})`);
        }
        return lines.join("\n");
      },
    },

    {
      name: "heartbeat_promote",
      description:
        "Promotes entries from the log to long-term memory (.working-memory/memory.md). " +
        "Provide entries with text and category. Also removes promoted entries from the log by line number.",
      parameters: {
        type: "object",
        properties: {
          entries: {
            type: "array",
            description: "Entries to promote to long-term memory",
            items: {
              type: "object",
              properties: {
                text: { type: "string", description: "The memory text (clean, concise)" },
                section: {
                  type: "string",
                  enum: ["learned", "corrected"],
                  description: "Category: 'corrected' for human corrections (never decays), 'learned' for agent observations (decays after 90 days)",
                },
                logLineNumber: {
                  type: "number",
                  description: "Line number in log.md to remove after promoting (from heartbeat_consolidate output)",
                },
              },
              required: ["text", "section"],
            },
          },
        },
        required: ["entries"],
      },
      handler: async (args) => {
        const result = promote(mindRoot, args.entries);

        // Remove promoted entries from log
        const lineNumbers = args.entries
          .filter((e) => e.logLineNumber)
          .map((e) => e.logLineNumber);
        if (lineNumbers.length > 0) {
          removeLogEntries(getLogPath(mindRoot), lineNumbers);
        }

        const parts = [`Promoted ${result.promoted} entries to memory.`];
        if (result.duplicatesSkipped > 0) {
          parts.push(`Skipped ${result.duplicatesSkipped} duplicates.`);
        }
        if (lineNumbers.length > 0) {
          parts.push(`Removed ${lineNumbers.length} entries from log.`);
        }
        return parts.join(" ");
      },
    },

    {
      name: "heartbeat_decay",
      description:
        "Scans long-term memory and removes 'learned' entries that haven't been reinforced " +
        "within the decay threshold (default: 90 days). 'Corrected' entries never decay. " +
        "Use dryRun=true to preview what would be removed.",
      parameters: {
        type: "object",
        properties: {
          decayDays: {
            type: "number",
            description: "Days without reinforcement before a learned entry is removed (default: 90)",
          },
          dryRun: {
            type: "boolean",
            description: "If true, report what would be removed without actually removing (default: false)",
          },
        },
      },
      handler: async (args) => {
        const result = decay(mindRoot, {
          decayDays: args.decayDays,
          dryRun: args.dryRun,
        });

        if (result.removed.length === 0) {
          return `No stale memories found (threshold: ${result.decayThreshold} days). ${result.kept} memories retained.`;
        }

        const verb = args.dryRun ? "Would remove" : "Removed";
        const lines = [
          `${verb} ${result.removed.length} stale memories (threshold: ${result.decayThreshold} days):`,
        ];
        for (const entry of result.removed) {
          lines.push(`  - ${entry}`);
        }
        lines.push(`\n${result.kept} memories retained.`);
        return lines.join("\n");
      },
    },

    {
      name: "heartbeat_reinforce",
      description:
        "Bumps the 'reinforced' date on a memory entry to today. " +
        "Call this during normal sessions when you use or re-encounter a memory — it prevents decay.",
      parameters: {
        type: "object",
        properties: {
          substring: {
            type: "string",
            description: "Text substring to match against memory entries (case-insensitive)",
          },
        },
        required: ["substring"],
      },
      handler: async (args) => {
        const result = reinforce(mindRoot, args.substring);
        if (!result.found) {
          return `No memory entry matched "${args.substring}".`;
        }
        return `Reinforced: "${result.entry}" (${result.section} section)`;
      },
    },

    {
      name: "heartbeat_status",
      description:
        "Shows memory system status: entry counts, oldest entries, next decay candidates, and log size.",
      parameters: { type: "object", properties: {}, required: [] },
      handler: async () => {
        const memory = parseMemory(getMemoryPath(mindRoot));
        const logEntries = parseLog(getLogPath(mindRoot));
        const { today: nowStr, daysBetween: days } = await import("../lib/parser.mjs");
        const now = nowStr();

        const lines = ["**Memory Status**\n"];

        // Counts
        lines.push(`- Corrected: ${memory.corrected.length} (permanent)`);
        lines.push(`- Learned: ${memory.learned.length} (subject to decay)`);
        lines.push(`- Log entries: ${logEntries.length} (pending consolidation)\n`);

        // Decay candidates
        if (memory.learned.length > 0) {
          const withAge = memory.learned.map((e) => ({
            text: e.text,
            age: days(e.reinforced || e.date, now),
            lastActive: e.reinforced || e.date,
          }));
          withAge.sort((a, b) => b.age - a.age);

          const stale = withAge.filter((e) => e.age > 90);
          if (stale.length > 0) {
            lines.push(`**⚠️ ${stale.length} entries past decay threshold:**`);
            for (const e of stale.slice(0, 5)) {
              lines.push(`  - ${e.text} (${e.age}d since last activity)`);
            }
          } else {
            const oldest = withAge[0];
            lines.push(`Next decay candidate: "${oldest.text}" (${oldest.age}d, decays at 90d)`);
          }
        }

        const total = memory.corrected.length + memory.learned.length;
        toast("Heartbeat", `${total} memories · ${logEntries.length} pending`);

        return lines.join("\n");
      },
    },
  ];
}
