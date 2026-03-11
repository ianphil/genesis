// Prompt executor — spawns a CopilotClient with the mind's identity.
// Resolves the SDK from ~/.copilot/pkg/universal/.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getCachedIdentity } from "./identity.mjs";
import { getMindRoot } from "./paths.mjs";

/**
 * Resolve the Copilot SDK from the well-known install location.
 * @returns {Promise<{ CopilotClient: any }>}
 */
async function resolveSdk() {
  const sdkBase = join(homedir(), ".copilot", "pkg", "universal");

  let versions;
  try {
    versions = readdirSync(sdkBase)
      .filter((d) => !d.startsWith("."))
      .sort();
  } catch (err) {
    throw new Error(`Cannot find Copilot SDK at ${sdkBase}: ${err.message}`);
  }

  if (versions.length === 0) {
    throw new Error(`No SDK versions found in ${sdkBase}`);
  }

  // Use the latest version
  const latest = versions[versions.length - 1];
  const sdkPath = join(sdkBase, latest, "copilot-sdk", "index.js");

  try {
    return await import(`file://${sdkPath.replace(/\\/g, "/")}`);
  } catch (err) {
    throw new Error(`Failed to import SDK from ${sdkPath}: ${err.message}`);
  }
}

/**
 * Execute a prompt payload using the Copilot SDK.
 * @param {string} extDir - Extension directory
 * @param {object} payload - { prompt, model?, preloadToolNames?, timeoutSeconds }
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

  let client;
  try {
    client = new sdk.CopilotClient({
      Cwd: mindRoot,
      AutoStart: true,
      UseStdio: true,
    });

    const sessionOpts = {
      Streaming: true,
    };
    if (payload.model) {
      sessionOpts.Model = payload.model;
    }
    if (identity) {
      sessionOpts.SystemMessage = {
        Mode: "append",
        Content: identity,
      };
    }

    const session = await client.CreateSessionAsync(sessionOpts);

    // Send the prompt and collect the response
    const result = await Promise.race([
      collectResponse(session, payload.prompt),
      timeout(timeoutMs),
    ]);

    if (result.timedOut) {
      return {
        success: false,
        output: "",
        durationMs: Date.now() - startTime,
        error: `Prompt timed out after ${payload.timeoutSeconds}s`,
      };
    }

    return {
      success: true,
      output: result.content || "",
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
    // Guaranteed cleanup — never leak sessions
    try {
      if (client && typeof client.Dispose === "function") {
        client.Dispose();
      } else if (client && typeof client.dispose === "function") {
        client.dispose();
      }
    } catch { /* best effort */ }
  }
}

/** Collect the response from a session after sending a prompt. */
async function collectResponse(session, prompt) {
  return new Promise((resolve, reject) => {
    let content = "";

    session.on("AssistantMessageEvent", (event) => {
      content = event.Content || event.content || content;
    });

    session.on("SessionErrorEvent", (event) => {
      reject(new Error(event.Message || event.message || "Session error"));
    });

    session.on("SessionIdleEvent", () => {
      resolve({ content, timedOut: false });
    });

    session.SendAsync(prompt).catch(reject);
  });
}

/** Timeout helper that resolves with a marker. */
function timeout(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ timedOut: true }), ms);
  });
}
