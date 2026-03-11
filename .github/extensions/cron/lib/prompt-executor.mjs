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
      cwd: mindRoot,
      autoStart: true,
    });

    const sessionOpts = {
      onPermissionRequest: sdk.approveAll,
    };
    if (payload.model) {
      sessionOpts.model = payload.model;
    }
    if (identity) {
      sessionOpts.systemMessage = {
        mode: "append",
        content: identity,
      };
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
