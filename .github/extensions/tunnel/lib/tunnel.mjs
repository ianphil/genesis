import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "data", "tunnel-config.json");
const URL_TIMEOUT_MS = 20_000;
const URL_REGEX = /https:\/\/[^\s]+\.devtunnels\.ms[^\s]*/;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let hostProcess = null;
let publicUrl = null;
let tunnelId = null;
let activePort = null;
let lastError = null;

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

function loadConfig() {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch { /* ignore corrupt config */ }
  return {};
}

function saveConfig(data) {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function resolveCliPath() {
  try {
    const result = execSync("where devtunnel", { encoding: "utf-8", timeout: 5000 });
    const lines = result.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.find((l) => l.endsWith(".exe")) || lines.find((l) => l.endsWith(".cmd")) || lines[0];
  } catch {
    throw new Error(
      "devtunnel CLI not found on PATH.\n" +
      "Install: https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/get-started\n" +
      "Then run: devtunnel user login"
    );
  }
}

function runCommand(cliPath, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cliPath, args.split(" "), {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
    proc.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Tunnel ID resolution
// ---------------------------------------------------------------------------

function parseTunnelId(output) {
  // Try JSON parse first (devtunnel create outputs JSON)
  try {
    const parsed = JSON.parse(output);
    if (parsed.tunnelId) return parsed.tunnelId;
  } catch { /* not JSON */ }

  // Try regex: tunnel ID is typically a short alphanumeric slug
  const match = output.match(/Tunnel ID[:\s]+([a-zA-Z0-9-]+)/i);
  if (match) return match[1];

  // Try URL-based extraction
  const urlMatch = output.match(/https:\/\/([^.]+)\.devtunnels\.ms/);
  if (urlMatch) return urlMatch[1];

  // Last resort: first non-empty trimmed line
  const firstLine = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
  if (firstLine && firstLine.length < 100) return firstLine;

  return null;
}

async function resolveTunnelId(cliPath) {
  // 1. Check persisted config
  const config = loadConfig();
  if (config.tunnelId) {
    return config.tunnelId;
  }

  // 2. Create new tunnel
  const result = await runCommand(cliPath, "create");
  if (result.code !== 0) {
    throw new Error(`devtunnel create failed (exit ${result.code}): ${result.stderr}`);
  }

  const id = parseTunnelId(result.stdout);
  if (!id) {
    throw new Error(`Unable to parse tunnel ID from output: ${result.stdout}`);
  }

  return id;
}

// ---------------------------------------------------------------------------
// Tunnel setup
// ---------------------------------------------------------------------------

async function ensureAuth(cliPath) {
  const result = await runCommand(cliPath, "user show");
  if (result.code !== 0) {
    throw new Error(
      "Not logged in to devtunnel.\n" +
      "Run: devtunnel user login"
    );
  }
}

async function ensureAccess(cliPath, id, access) {
  const flag = access === "anonymous" ? "--anonymous" : "--tenant";
  const result = await runCommand(cliPath, `access create ${id} ${flag}`);
  // Ignore conflict (already exists)
  if (result.code !== 0 && !result.stderr.includes("Conflict")) {
    throw new Error(`devtunnel access create failed (exit ${result.code}): ${result.stderr}`);
  }
}

async function ensurePort(cliPath, id, port) {
  const result = await runCommand(cliPath, `port create ${id} -p ${port}`);
  // Ignore conflict (port already registered)
  if (result.code !== 0 && !result.stderr.includes("Conflict")) {
    throw new Error(`devtunnel port create failed (exit ${result.code}): ${result.stderr}`);
  }
}

// ---------------------------------------------------------------------------
// Host process management
// ---------------------------------------------------------------------------

function startHost(cliPath, id) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cliPath, ["host", id], {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let resolved = false;
    let stderrBuf = "";

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error(
          `Timed out waiting for tunnel URL (${URL_TIMEOUT_MS / 1000}s).\nstderr: ${stderrBuf}`
        ));
      }
    }, URL_TIMEOUT_MS);

    proc.stdout.on("data", (data) => {
      const line = data.toString();
      const match = line.match(URL_REGEX);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ process: proc, url: match[0] });
      }
    });

    proc.stderr.on("data", (data) => {
      stderrBuf += data.toString();
      // Also check stderr for URL (some versions output there)
      const match = data.toString().match(URL_REGEX);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ process: proc, url: match[0] });
      }
    });

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`devtunnel host exited with code ${code}.\nstderr: ${stderrBuf}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function start(options = {}) {
  if (hostProcess) {
    return { tunnelId, publicUrl, port: activePort, message: "Tunnel already running" };
  }

  const port = options.port || 15210;
  const access = options.access || "tenant";
  lastError = null;

  try {
    const cliPath = resolveCliPath();
    await ensureAuth(cliPath);

    const id = await resolveTunnelId(cliPath);
    tunnelId = id;

    await ensureAccess(cliPath, id, access);
    await ensurePort(cliPath, id, port);

    const host = await startHost(cliPath, id);
    hostProcess = host.process;
    publicUrl = host.url;
    activePort = port;

    // Persist tunnel ID for reuse
    saveConfig({ tunnelId: id });

    // Handle unexpected exit
    hostProcess.on("close", (code) => {
      hostProcess = null;
      publicUrl = null;
      if (code !== 0 && code !== null) {
        lastError = `Host process exited unexpectedly (code ${code})`;
      }
    });

    return { tunnelId: id, publicUrl, port };
  } catch (err) {
    lastError = err.message;
    throw err;
  }
}

export async function stop() {
  if (!hostProcess) {
    return { message: "Tunnel is not running" };
  }

  try {
    hostProcess.kill("SIGTERM");
    // Give it a moment to exit gracefully
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (hostProcess && !hostProcess.killed) {
          hostProcess.kill("SIGKILL");
        }
        resolve();
      }, 5000);

      hostProcess.on("close", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  } catch { /* already dead */ }

  const url = publicUrl;
  hostProcess = null;
  publicUrl = null;
  activePort = null;

  return { message: "Tunnel stopped", previousUrl: url };
}

export function getStatus() {
  return {
    isRunning: hostProcess !== null,
    tunnelId,
    publicUrl,
    port: activePort,
    error: lastError,
  };
}

export async function cleanup() {
  if (hostProcess) {
    await stop();
  }
}
