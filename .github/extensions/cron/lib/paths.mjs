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

/** Data directory for runtime state */
export function getDataDir(extDir) {
  return join(extDir, "data");
}

/** Jobs directory */
export function getJobsDir(extDir) {
  return join(getDataDir(extDir), "jobs");
}

/** History directory */
export function getHistoryDir(extDir) {
  return join(getDataDir(extDir), "history");
}

/** Engine lockfile path */
export function getLockfilePath(extDir) {
  return join(getDataDir(extDir), "engine.lock");
}
