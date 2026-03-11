// Load and validate MCP server configuration from data/mcp-config.json.

import { readFileSync, existsSync } from "node:fs";
import { getConfigPath } from "./paths.mjs";

/**
 * Load and validate the MCP config.
 * @param {string} extDir - Extension root directory
 * @returns {{ mcpServers: Record<string, object> }} Validated config
 * @throws {Error} If config is missing or invalid
 */
export function loadConfig(extDir) {
  const configPath = getConfigPath(extDir);

  if (!existsSync(configPath)) {
    throw new Error(
      `MCP config not found: ${configPath}\n` +
      `Copy data/mcp-config.example.json to data/mcp-config.json and configure your servers.`
    );
  }

  let raw;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read MCP config: ${err.message}`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in MCP config: ${err.message}`);
  }

  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    throw new Error("Invalid MCP config: missing or invalid 'mcpServers' key.");
  }

  const serverNames = Object.keys(config.mcpServers);
  if (serverNames.length === 0) {
    throw new Error("Invalid MCP config: no servers defined in 'mcpServers'.");
  }

  // Validate each server entry
  for (const name of serverNames) {
    const server = config.mcpServers[name];
    if (server.disabled) continue;
    if (!server.command || typeof server.command !== "string") {
      throw new Error(`Invalid MCP config: server '${name}' is missing 'command'.`);
    }
  }

  return config;
}

/**
 * Get enabled servers from config (filters out disabled ones).
 * @param {{ mcpServers: Record<string, object> }} config
 * @returns {[string, object][]} Array of [name, serverConfig] entries
 */
export function getEnabledServers(config) {
  return Object.entries(config.mcpServers).filter(
    ([, server]) => !server.disabled
  );
}
