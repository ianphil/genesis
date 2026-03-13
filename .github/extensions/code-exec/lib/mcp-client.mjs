// MCP Client Manager — lazy-loading connections to MCP servers.
//
// Servers connect on-demand when first called. Tool schemas are cached
// after initial connection. This is the core of the progressive
// disclosure pattern applied to a Copilot CLI extension.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadConfig, getEnabledServers } from "./config.mjs";
import { normalizeFieldNames } from "./normalize-fields.mjs";
import { formatError, isTransient } from "./errors.mjs";

class McpClientManager {
  /** @type {Map<string, import("@modelcontextprotocol/sdk/client/index.js").Client>} */
  #clients = new Map();

  /** @type {Map<string, Array<object>>} */
  #toolCache = new Map();

  /** @type {object|null} */
  #config = null;

  /** @type {string|null} */
  #extDir = null;

  /**
   * Initialize the client manager by loading configuration.
   * Does NOT connect to any servers — that happens lazily.
   * @param {string} extDir - Extension root directory
   */
  initialize(extDir) {
    this.#extDir = extDir;
    this.#config = loadConfig(extDir);
    const servers = getEnabledServers(this.#config);
    console.error(`[code-exec] Config loaded: ${servers.length} server(s) enabled`);
  }

  /**
   * Get the loaded config, initializing if needed.
   * @param {string} [extDir]
   * @returns {object}
   */
  #ensureConfig(extDir) {
    if (!this.#config) {
      if (!extDir && !this.#extDir) {
        throw new Error("McpClientManager not initialized — call initialize(extDir) first.");
      }
      this.initialize(extDir || this.#extDir);
    }
    return this.#config;
  }

  /**
   * Connect to a single MCP server via stdio.
   * @param {string} name - Server name
   * @param {object} serverConfig - Server configuration
   */
  async #connectToServer(name, serverConfig) {
    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: {
        ...process.env,
        ...serverConfig.env,
      },
    });

    const client = new Client(
      { name: "copilot-code-exec", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    await client.connect(transport);
    this.#clients.set(name, client);

    // Cache tool list
    const result = await client.listTools();
    this.#toolCache.set(name, result.tools);

    console.error(`[code-exec] Connected to ${name} (${result.tools.length} tools)`);
  }

  /**
   * Ensure a server is connected, connecting lazily if needed.
   * @param {string} name - Server name
   * @param {string} [extDir]
   */
  async #ensureServer(name, extDir) {
    const config = this.#ensureConfig(extDir);

    if (this.#clients.has(name)) return;

    const serverConfig = config.mcpServers[name];
    if (!serverConfig) {
      const available = getEnabledServers(config).map(([n]) => n);
      throw new Error(
        `Server not configured: '${name}'. Available: ${available.join(", ") || "none"}`
      );
    }
    if (serverConfig.disabled) {
      throw new Error(`Server '${name}' is disabled in config.`);
    }

    console.error(`[code-exec] Connecting on-demand: ${name}`);
    await this.#connectToServer(name, serverConfig);
  }

  /**
   * Discover tools on a specific server.
   * Connects lazily if not already connected.
   * @param {string} name - Server name
   * @param {string} [extDir]
   * @returns {Promise<Array<{name: string, description: string, inputSchema: object}>>}
   */
  async discoverServer(name, extDir) {
    await this.#ensureServer(name, extDir);
    return this.#toolCache.get(name) || [];
  }

  /**
   * Discover tools on all enabled servers.
   * Connects to each server lazily.
   * @param {string} [extDir]
   * @returns {Promise<Record<string, Array<{name: string, description: string}>>>}
   */
  async discoverAll(extDir) {
    const config = this.#ensureConfig(extDir);
    const servers = getEnabledServers(config);
    const result = {};

    for (const [name] of servers) {
      try {
        await this.#ensureServer(name);
        const tools = this.#toolCache.get(name) || [];
        result[name] = tools.map((t) => ({
          name: t.name,
          description: t.description || "",
        }));
      } catch (err) {
        result[name] = { error: err.message };
      }
    }

    return result;
  }

  /**
   * Call a tool on an MCP server.
   * Connects lazily if not already connected.
   * @param {string} server - Server name
   * @param {string} tool - Tool name
   * @param {object} [params={}] - Tool parameters
   * @param {string} [extDir]
   * @returns {Promise<any>}
   */
  async callTool(server, tool, params = {}, extDir) {
    await this.#ensureServer(server, extDir);

    const client = this.#clients.get(server);
    if (!client) {
      throw new Error(`No client for server: ${server}`);
    }

    // Validate tool exists
    const tools = this.#toolCache.get(server) || [];
    const toolDef = tools.find((t) => t.name === tool);
    if (!toolDef) {
      const available = tools.map((t) => t.name).join(", ");
      throw new Error(
        `Tool '${tool}' not found on server '${server}'. Available: ${available}`
      );
    }

    const result = await client.callTool({ name: tool, arguments: params });

    // Unwrap MCP response content
    let data = result;
    if (result.content && Array.isArray(result.content)) {
      if (result.content.length === 1 && result.content[0].type === "text") {
        const text = result.content[0].text;
        // Try to parse JSON
        if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }
        } else {
          data = text;
        }
      } else {
        data = result.content;
      }
    }

    // Apply field normalization if configured
    return normalizeFieldNames(data, server);
  }

  /**
   * Get list of configured server names (without connecting).
   * @param {string} [extDir]
   * @returns {string[]}
   */
  getServerNames(extDir) {
    const config = this.#ensureConfig(extDir);
    return getEnabledServers(config).map(([name]) => name);
  }

  /**
   * Disconnect from all servers and reset state.
   */
  async cleanup() {
    const closePromises = Array.from(this.#clients.entries()).map(
      async ([name, client]) => {
        try {
          await client.close();
          console.error(`[code-exec] Disconnected from ${name}`);
        } catch (err) {
          console.error(`[code-exec] Error closing ${name}: ${err.message}`);
        }
      }
    );
    await Promise.all(closePromises);
    this.#clients.clear();
    this.#toolCache.clear();
    this.#config = null;
  }
}

// Singleton
let instance = null;

/**
 * Get the singleton McpClientManager instance.
 * @returns {McpClientManager}
 */
export function getMcpClient() {
  if (!instance) {
    instance = new McpClientManager();
  }
  return instance;
}
