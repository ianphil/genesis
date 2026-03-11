// Command executor — spawn a command with timeout, combined output, process tree kill.

import { spawn } from "node:child_process";

/**
 * Execute a command payload.
 * @param {object} payload - { command, arguments, workingDirectory, timeoutSeconds }
 * @returns {Promise<{ success: boolean, output: string, durationMs: number, error?: string }>}
 */
export function executeCommand(payload) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeoutMs = (payload.timeoutSeconds || 300) * 1000;

    const fullCommand = payload.arguments
      ? `${payload.command} ${payload.arguments}`
      : payload.command;
    const options = {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: true,
      cwd: payload.workingDirectory || undefined,
    };

    let child;
    try {
      child = spawn(fullCommand, [], options);
    } catch (err) {
      resolve({
        success: false,
        output: "",
        durationMs: Date.now() - startTime,
        error: `Failed to spawn: ${err.message}`,
      });
      return;
    }

    let output = "";
    let killed = false;

    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });

    const timer = setTimeout(() => {
      killed = true;
      killProcessTree(child.pid);
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        output,
        durationMs: Date.now() - startTime,
        error: err.message,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      if (killed) {
        resolve({
          success: false,
          output,
          durationMs,
          error: `Timed out after ${payload.timeoutSeconds}s`,
        });
      } else {
        resolve({
          success: code === 0,
          output,
          durationMs,
          error: code !== 0 ? `Exit code ${code}` : undefined,
        });
      }
    });
  });
}

/**
 * Kill a process tree.
 * On Windows: taskkill /T /F /PID
 * On Unix: kill the process group
 */
function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/T", "/F", "/PID", String(pid)], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      // Kill the process group
      try { process.kill(-pid, "SIGKILL"); } catch { /* ignore */ }
      try { process.kill(pid, "SIGKILL"); } catch { /* ignore */ }
    }
  } catch {
    // Best effort
  }
}
