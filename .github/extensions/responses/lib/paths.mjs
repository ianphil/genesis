import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export function getExtensionDir() {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

export function getDataDir(extDir) {
  return join(extDir, "data");
}

export function getLockfilePath(extDir) {
  return join(extDir, "data", "responses.lock");
}

export function getConfigPath(extDir) {
  return join(extDir, "data", "config.json");
}
