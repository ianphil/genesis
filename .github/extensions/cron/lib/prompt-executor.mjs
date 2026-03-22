// Prompt executor — spawns a CopilotClient with the mind's identity.
// Resolves the SDK from ~/.copilot/pkg/universal/.
// Loads code-exec tools so prompt jobs can access MCP data sources.

import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { getCachedIdentity } from "./identity.mjs";
import { getMindRoot } from "./paths.mjs";

/**
 * Resolve the Copilot SDK from the well-known install location.
 * @returns {Promise<{ CopilotClient: any }>}
 */
async function resolveSdk() {
  const pkgRoot = join(homedir(), ".copilot", "pkg");

  // Platform-specific directory first, then universal fallback
  const platformDir = `${process.platform}-${process.arch}`;
  const searchDirs = [join(pkgRoot, platformDir), join(pkgRoot, "universal")];

  for (const sdkBase of searchDirs) {
    let versions;
    try {
      versions = readdirSync(sdkBase)
        .filter((d) => !d.startsWith("."))
        .sort();
    } catch {
      continue; // directory doesn't exist, try next
    }

    if (versions.length === 0) continue;

    const latest = versions[versions.length - 1];
    const sdkPath = join(sdkBase, latest, "copilot-sdk", "index.js");

    try {
      return await import(`file://${sdkPath.replace(/\\/g, "/")}`);
    } catch {
      continue; // SDK not in this version dir, try next
    }
  }

  throw new Error(
    `Cannot find Copilot SDK in any of: ${searchDirs.join(", ")}`
  );
}

/**
 * Resolve the code-exec extension directory and load its tool factories.
 * Returns the three tools (discover, call_tool, execute_script) ready for
 * SessionConfig.tools, or an empty array if code-exec is not available.
 *
 * @param {string} cronExtDir - The cron extension directory
 * @returns {Promise<Array<object>>} Tool definitions for createSession
 */
async function loadCodeExecTools(cronExtDir) {
  const codeExecDir = resolve(cronExtDir, "..", "code-exec");

  if (!existsSync(join(codeExecDir, "extension.mjs"))) {
    return [];
  }

  try {
    const { createDiscoverTool } = await import(
      `file://${join(codeExecDir, "tools", "discover.mjs").replace(/\\/g, "/")}`
    );
    const { createCallToolTool } = await import(
      `file://${join(codeExecDir, "tools", "call-tool.mjs").replace(/\\/g, "/")}`
    );
    const { createExecuteScriptTool } = await import(
      `file://${join(codeExecDir, "tools", "execute-script.mjs").replace(/\\/g, "/")}`
    );
    const { loadConfig, getEnabledServers } = await import(
      `file://${join(codeExecDir, "lib", "config.mjs").replace(/\\/g, "/")}`
    );

    // Pre-load server names for the discover tool description
    let serverNames = [];
    try {
      const config = loadConfig(codeExecDir);
      serverNames = getEnabledServers(config).map(([n]) => n);
    } catch {
      // Config not present — serverNames stays empty
    }

    return [
      createDiscoverTool(codeExecDir, serverNames),
      createCallToolTool(codeExecDir),
      createExecuteScriptTool(codeExecDir),
    ];
  } catch (err) {
    process.stderr.write(
      `[prompt-executor] Failed to load code-exec tools: ${err.message}\n`
    );
    return [];
  }
}

/**
 * Execute a prompt payload using the Copilot SDK.
 * @param {string} extDir - Extension directory
 * @param {object} payload - { prompt, model?, preloadToolNames?, timeoutSeconds, sessionId? }
 * @returns {Promise<{ success: boolean, output: string, durationMs: number, error?: string }>}
 */
export async function executePrompt(extDir, payload) {
  const startTime = Date.now();
  const timeoutMs = (payload.timeoutSeconds || 120) * 1000;
  const mindRoot = getMindRoot(extDir);
  const identity = getCachedIdentity(extDir);

  let sdk;
  try {
    sdk = await resolveSdk();
  } catch (err) {
    return {
      success: false,
      output: "",
      durationMs: Date.now() - startTime,
      error: `SDK resolution failed: ${err.message}`,
    };
  }

  // Load code-exec tools so the agent can access MCP data sources
  const codeExecTools = await loadCodeExecTools(extDir);

  let client;
  try {
    client = new sdk.CopilotClient({
      cwd: mindRoot,
      autoStart: true,
    });

    const sessionOpts = {
      onPermissionRequest: sdk.approveAll,
    };
    if (payload.model) {
      sessionOpts.model = payload.model;
    }
    if (payload.sessionId) {
      sessionOpts.sessionId = payload.sessionId;
    }
    if (identity) {
      sessionOpts.systemMessage = {
        mode: "append",
        content: identity,
      };
    }
    if (codeExecTools.length > 0) {
      sessionOpts.tools = codeExecTools;
    }

    const session = await client.createSession(sessionOpts);

    const response = await session.sendAndWait(
      { prompt: payload.prompt },
      timeoutMs,
    );

    const output = response?.data?.content || response?.content || "";

    return {
      success: true,
      output,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      output: "",
      durationMs: Date.now() - startTime,
      error: err.message,
    };
  } finally {
    try {
      if (client && typeof client.stop === "function") {
        client.stop();
      }
    } catch { /* best effort */ }
  }
}
