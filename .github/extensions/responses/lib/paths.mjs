import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export function getExtensionDir() {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
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

export function getDataDir(extDir, agentName) {
  return join(extDir, "data", agentName);
}

export function getLockfilePath(extDir, agentName) {
  return join(extDir, "data", agentName, "responses.lock");
}

export function getConfigPath(extDir, agentName) {
  return join(extDir, "data", agentName, "config.json");
}
