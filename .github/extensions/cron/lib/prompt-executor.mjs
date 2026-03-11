// Prompt executor — shells out to `copilot -p` with full extension support.
// Uses --experimental to load .github/extensions/ so MCP tools are available.

import { spawn } from "node:child_process";
import { getMindRoot } from "./paths.mjs";

/**
 * Execute a prompt payload by spawning `copilot -p`.
 * Runs from the mind root so SOUL.md, custom instructions, and extensions
 * are automatically loaded by the Copilot CLI.
 * @param {string} extDir - Extension directory
 * @param {object} payload - { prompt, model?, agent?, timeoutSeconds }
 * @returns {Promise<{ success: boolean, output: string, durationMs: number, error?: string }>}
 */
export async function executePrompt(extDir, payload) {
  const startTime = Date.now();
  const timeoutMs = (payload.timeoutSeconds || 120) * 1000;
  const mindRoot = getMindRoot(extDir);

  const args = [
    "-p", payload.prompt,
    "--experimental",
    "--allow-all",
  ];
  if (payload.agent) {
    args.push("--agent", payload.agent);
  }
  if (payload.model) {
    args.push("--model", payload.model);
  }

  return new Promise((resolve) => {
    const child = spawn("copilot", args, {
      cwd: mindRoot,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    });

    const chunks = [];
    const errChunks = [];

    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => errChunks.push(d));

    child.on("error", (err) => {
      resolve({
        success: false,
        output: "",
        durationMs: Date.now() - startTime,
        error: `spawn error: ${err.message}`,
      });
    });

    child.on("close", (code) => {
      const output = Buffer.concat(chunks).toString().trim();
      const stderr = Buffer.concat(errChunks).toString().trim();

      if (code === 0) {
        resolve({
          success: true,
          output,
          durationMs: Date.now() - startTime,
        });
      } else {
        resolve({
          success: false,
          output,
          durationMs: Date.now() - startTime,
          error: stderr || `copilot exited with code ${code}`,
        });
      }
    });
  });
}
