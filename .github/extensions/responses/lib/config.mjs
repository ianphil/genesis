import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_CONFIG = Object.freeze({ port: 15210 });

function isValidPort(port) {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

export function loadConfig(configPath) {
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      port: isValidPort(parsed.port) ? parsed.port : DEFAULT_CONFIG.port,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(configPath, config) {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}
