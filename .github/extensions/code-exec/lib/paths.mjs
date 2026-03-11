// Shared path helpers for the code-exec extension.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Extension root directory (.github/extensions/code-exec/) */
export function getExtensionDir() {
  return resolve(__dirname, "..");
}

/** Data directory for runtime state and config */
export function getDataDir(extDir) {
  return join(extDir, "data");
}

/** Path to mcp-config.json */
export function getConfigPath(extDir) {
  return join(getDataDir(extDir), "mcp-config.json");
}
