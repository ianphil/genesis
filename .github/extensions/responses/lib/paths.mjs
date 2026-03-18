import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export function getExtensionDir() {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * Validate and sanitize an agent name.
 * Only [a-zA-Z0-9_-] characters are kept (filesystem safety).
 * Returns null if the input is empty or entirely invalid.
 */
export function sanitizeAgentName(raw) {
  if (!raw || typeof raw !== "string") return null;
  const sanitized = raw.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return sanitized.length > 0 ? sanitized : null;
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
