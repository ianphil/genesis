// Prompt executor — spawns a CopilotClient with the mind's identity.
// Resolves the SDK from ~/.copilot/pkg/universal/.
// Loads code-exec tools so prompt jobs can access MCP data sources.
// Captures SDK events to a progress JSONL file when progressFilePath is set.

import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { getCachedIdentity } from "./identity.mjs";
import { getMindRoot } from "./paths.mjs";
import { initProgress, appendEvent } from "./progress-writer.mjs";

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
 * Truncate a string for status descriptions.
 */
function truncate(text, max = 200) {
  if (!text) return "";
  const s = String(text);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Summarize tool arguments into a short description string.
 */
function summarizeArgs(toolName, args) {
  if (!args) return "";
  try {
    if (typeof args === "string") return truncate(args);
    if (args.pattern) return `pattern: ${truncate(args.pattern, 80)}`;
    if (args.command) return truncate(args.command, 120);
    if (args.path) return String(args.path);
    if (args.query) return truncate(args.query, 120);
    if (args.prompt) return truncate(args.prompt, 120);
    return truncate(JSON.stringify(args), 120);
  } catch {
    return "";
  }
}

/**
 * Subscribe to SDK session events and write them to a progress file.
 * Returns an unsubscribe function. All errors are caught — never breaks execution.
 */
function subscribeProgressEvents(session, progressFilePath) {
  const unsubs = [];

  try {
    unsubs.push(session.on("tool.execution_start", (event) => {
      try {
        const d = event?.data || {};
        appendEvent(progressFilePath, {
          type: "tool_start",
          title: `Tool: ${d.toolName || "unknown"}`,
          description: summarizeArgs(d.toolName, d.arguments),
          timestamp: event?.timestamp || new Date().toISOString(),
          detail: { toolCallId: d.toolCallId, toolName: d.toolName },
        });
      } catch { /* fire-and-forget */ }
    }));

    unsubs.push(session.on("tool.execution_complete", (event) => {
      try {
        const d = event?.data || {};
        const ok = d.success !== false;
        const desc = ok
          ? truncate(d.result?.content || "")
          : truncate(d.result?.content || "Tool execution failed");
        appendEvent(progressFilePath, {
          type: "tool_complete",
          title: `${ok ? "✓" : "✗"} ${d.toolName || "tool"}`,
          description: desc,
          timestamp: event?.timestamp || new Date().toISOString(),
          detail: { toolCallId: d.toolCallId, success: ok },
        });
      } catch { /* fire-and-forget */ }
    }));

    unsubs.push(session.on("assistant.turn_start", (event) => {
      try {
        appendEvent(progressFilePath, {
          type: "turn_start",
          title: "Agent turn started",
          timestamp: event?.timestamp || new Date().toISOString(),
        });
      } catch { /* fire-and-forget */ }
    }));

    unsubs.push(session.on("assistant.turn_end", (event) => {
      try {
        appendEvent(progressFilePath, {
          type: "turn_end",
          title: "Agent turn completed",
          timestamp: event?.timestamp || new Date().toISOString(),
        });
      } catch { /* fire-and-forget */ }
    }));

    unsubs.push(session.on("subagent.started", (event) => {
      try {
        const d = event?.data || {};
        appendEvent(progressFilePath, {
          type: "subagent_start",
          title: `Sub-agent: ${truncate(d.description || d.name || "task", 80)}`,
          timestamp: event?.timestamp || new Date().toISOString(),
        });
      } catch { /* fire-and-forget */ }
    }));

    unsubs.push(session.on("subagent.completed", (event) => {
      try {
        appendEvent(progressFilePath, {
          type: "subagent_complete",
          title: "Sub-agent completed",
          timestamp: event?.timestamp || new Date().toISOString(),
        });
      } catch { /* fire-and-forget */ }
    }));

    unsubs.push(session.on("subagent.failed", (event) => {
      try {
        appendEvent(progressFilePath, {
          type: "subagent_failed",
          title: "Sub-agent failed",
          description: truncate(event?.data?.error || ""),
          timestamp: event?.timestamp || new Date().toISOString(),
        });
      } catch { /* fire-and-forget */ }
    }));
  } catch (err) {
    process.stderr.write(`[prompt-executor] Failed to subscribe to events: ${err.message}\n`);
  }

  return () => {
    for (const fn of unsubs) {
      try { fn(); } catch { /* best effort */ }
    }
  };
}

/**
 * Execute a prompt payload using the Copilot SDK.
 * @param {string} extDir - Extension directory
 * @param {object} payload - { prompt, model?, preloadToolNames?, timeoutSeconds, progressFilePath? }
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

    // Subscribe to session events for progress tracking
    let unsubscribe = () => {};
    if (payload.progressFilePath) {
      try {
        initProgress(payload.progressFilePath);
        unsubscribe = subscribeProgressEvents(session, payload.progressFilePath);
      } catch (err) {
        process.stderr.write(`[prompt-executor] Progress init failed: ${err.message}\n`);
      }
    }

    let response;
    try {
      response = await session.sendAndWait(
        { prompt: payload.prompt },
        timeoutMs,
      );
    } finally {
      unsubscribe();
    }

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
