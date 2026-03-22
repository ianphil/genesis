// events-reader.mjs — Read SDK session events from events.jsonl
//
// The Copilot SDK writes a full event stream to:
//   ~/.copilot/session-state/{sessionId}/events.jsonl
//
// This module reads that file and provides:
//   - Typed event parsing
//   - Response text extraction
//   - Session status resolution
//   - Tool call correlation (start → complete)

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SESSION_STATE_DIR = join(homedir(), ".copilot", "session-state");

/**
 * Resolve the events.jsonl path for a session.
 * @param {string} sessionId
 * @returns {string}
 */
export function eventsFilePath(sessionId) {
  return join(SESSION_STATE_DIR, sessionId, "events.jsonl");
}

/**
 * Check if a session's events file exists.
 * @param {string} sessionId
 * @returns {boolean}
 */
export function sessionExists(sessionId) {
  return existsSync(eventsFilePath(sessionId));
}

/**
 * Read and parse all events from a session's events.jsonl.
 * Skips malformed lines. Returns [] if file doesn't exist.
 *
 * @param {string} sessionId
 * @returns {Array<object>} Raw event objects from the SDK
 */
export function readEvents(sessionId) {
  const filePath = eventsFilePath(sessionId);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  if (!content.trim()) return [];

  const events = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Skip malformed lines (partial writes during active execution)
    }
  }
  return events;
}

/**
 * Extract the final assistant response text from events.
 * Finds the last assistant.message with non-empty content and no tool requests.
 * Falls back to the last assistant.message with content if all have tool requests.
 *
 * @param {Array<object>} events
 * @returns {string|null}
 */
export function extractResponse(events) {
  const assistantMessages = events.filter(
    (e) => e.type === "assistant.message" && e.data?.content?.trim(),
  );
  if (assistantMessages.length === 0) return null;

  // Prefer final message without tool requests (pure text response)
  const pureText = assistantMessages.filter(
    (e) => !e.data.toolRequests || e.data.toolRequests.length === 0,
  );
  if (pureText.length > 0) return pureText[pureText.length - 1].data.content;

  // Fall back to last message with content
  return assistantMessages[assistantMessages.length - 1].data.content;
}

/**
 * Resolve the status of a session from its events.
 *
 * @param {Array<object>} events
 * @returns {"completed"|"failed"|"running"|"queued"}
 */
export function resolveStatus(events) {
  if (events.length === 0) return "queued";

  const shutdown = events.find((e) => e.type === "session.shutdown");
  if (shutdown) {
    // Check if shutdown was clean or errored
    const type = shutdown.data?.shutdownType;
    if (type === "error" || type === "crash") return "failed";
    return "completed";
  }

  // Has events but no shutdown — still running
  const hasStart = events.some((e) => e.type === "session.start");
  return hasStart ? "running" : "queued";
}

/**
 * Build a timeline of status items from events — suitable for RSS or JSON.
 * Correlates tool starts with completions via toolCallId.
 *
 * @param {Array<object>} events
 * @returns {Array<{title: string, description: string, timestamp: string, fullText?: string}>}
 */
export function buildTimeline(events) {
  const items = [];
  const toolStarts = new Map(); // toolCallId → event

  for (const e of events) {
    switch (e.type) {
      case "session.start":
        items.push({
          title: "Session started",
          description: `Agent: ${e.data?.sessionId || "unknown"}`,
          timestamp: e.timestamp,
        });
        break;

      case "user.message":
        items.push({
          title: "Prompt",
          description: truncate(e.data?.content || ""),
          timestamp: e.timestamp,
          fullText: e.data?.content || null,
        });
        break;

      case "assistant.turn_start":
        items.push({
          title: "Agent turn started",
          description: "",
          timestamp: e.timestamp,
        });
        break;

      case "tool.execution_start":
        toolStarts.set(e.data?.toolCallId, e);
        items.push({
          title: `Tool: ${e.data?.toolName || "unknown"}`,
          description: summarizeToolArgs(e.data?.toolName, e.data?.arguments),
          timestamp: e.timestamp,
        });
        break;

      case "tool.execution_complete": {
        const success = e.data?.success !== false;
        const startEvt = toolStarts.get(e.data?.toolCallId);
        const toolName = startEvt?.data?.toolName || "tool";
        const desc = success
          ? truncate(extractToolResult(e.data?.result))
          : truncate(extractToolResult(e.data?.error) || "Tool execution failed");
        items.push({
          title: `${success ? "✓" : "✗"} ${toolName}`,
          description: desc,
          timestamp: e.timestamp,
        });
        break;
      }

      case "assistant.turn_end":
        items.push({
          title: "Agent turn completed",
          description: "",
          timestamp: e.timestamp,
        });
        break;

      case "assistant.message": {
        const content = e.data?.content?.trim();
        const hasTools = e.data?.toolRequests?.length > 0;
        // Only emit response item for pure text messages (no tool calls)
        if (content && !hasTools) {
          items.push({
            title: "Response",
            description: truncate(content),
            timestamp: e.timestamp,
            fullText: content,
          });
        }
        break;
      }

      case "session.shutdown":
        items.push({
          title: "Session completed",
          description: `${e.data?.shutdownType || "clean"} shutdown`,
          timestamp: e.timestamp,
        });
        break;
    }
  }

  return items;
}

/**
 * Full session read — events, status, response, timeline in one call.
 *
 * @param {string} sessionId
 * @returns {{ exists: boolean, status: string, response: string|null, events: Array, timeline: Array }|null}
 */
export function readSession(sessionId) {
  if (!sessionExists(sessionId)) return null;

  const events = readEvents(sessionId);
  const prompt = events.find((e) => e.type === "user.message")?.data?.content || null;
  const response = extractResponse(events);
  return {
    exists: true,
    sessionId,
    status: resolveStatus(events),
    response: response ? truncate(response, 500) : null,
    fullText: response || null,
    prompt: prompt ? truncate(prompt, 500) : null,
    timeline: buildTimeline(events),
    eventCount: events.length,
  };
}

// --- Helpers ---

function truncate(text, max = 200) {
  if (!text) return "";
  const s = String(text);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function summarizeToolArgs(toolName, args) {
  if (!args) return "";
  try {
    // For common tools, show the most relevant arg
    if (toolName === "powershell" || toolName === "bash") return truncate(args.command || "");
    if (toolName === "view") return args.path || "";
    if (toolName === "edit") return args.path || "";
    if (toolName === "create") return args.path || "";
    if (toolName === "grep") return `${args.pattern || ""} in ${args.path || "cwd"}`;
    if (toolName === "glob") return args.pattern || "";
    if (toolName === "web_fetch") return args.url || "";
    if (toolName === "report_intent") return args.intent || "";
    // Generic: JSON stringify the args
    return truncate(JSON.stringify(args));
  } catch {
    return "";
  }
}

function extractToolResult(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (result.content) return String(result.content);
  if (result.text) return String(result.text);
  try {
    return JSON.stringify(result);
  } catch {
    return "";
  }
}
