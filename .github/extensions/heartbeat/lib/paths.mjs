// Path resolution for the heartbeat extension.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Extension directory (.github/extensions/heartbeat/) */
export function getExtensionDir() {
  return resolve(__dirname, "..");
}

/** Mind root (3 levels up from extension dir: .github/extensions/heartbeat/ → repo root) */
export function getMindRoot() {
  return resolve(getExtensionDir(), "..", "..", "..");
}

/** .working-memory/ directory */
export function getWorkingMemoryDir(mindRoot) {
  return resolve(mindRoot, ".working-memory");
}

/** .working-memory/log.md */
export function getLogPath(mindRoot) {
  return resolve(mindRoot, ".working-memory", "log.md");
}

/** .working-memory/memory.md */
export function getMemoryPath(mindRoot) {
  return resolve(mindRoot, ".working-memory", "memory.md");
}
