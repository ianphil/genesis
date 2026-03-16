// Shared path helpers for the cron extension.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Extension root directory (.github/extensions/cron/) */
export function getExtensionDir() {
  return resolve(__dirname, "..");
}

/** Mind repository root (three levels up from extension dir) */
export function getMindRoot(extDir) {
  return resolve(extDir, "..", "..", "..");
}

/**
 * Derive the agent name from COPILOT_AGENT env var.
 * Only [a-zA-Z0-9_-] characters are kept (filesystem safety).
 * Falls back to "default" if empty or entirely invalid.
 */
export function getAgentName() {
  const raw = (process.env.COPILOT_AGENT || "").trim();
  const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  return sanitized.length > 0 ? sanitized : "default";
}

/** Data directory for an agent's runtime state */
export function getDataDir(extDir, agentName) {
  return join(extDir, "data", agentName);
}

/** Jobs directory for an agent */
export function getJobsDir(extDir, agentName) {
  return join(getDataDir(extDir, agentName), "jobs");
}

/** History directory for an agent */
export function getHistoryDir(extDir, agentName) {
  return join(getDataDir(extDir, agentName), "history");
}

/** Engine lockfile path for an agent */
export function getLockfilePath(extDir, agentName) {
  return join(getDataDir(extDir, agentName), "engine.lock");
}

/** Engine log path for an agent */
export function getEngineLogPath(extDir, agentName) {
  return join(getDataDir(extDir, agentName), "engine.log");
}
