import { createConnection } from "node:net";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const noopLogger = { debug() {}, info() {}, error() {} };

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isPortInUse(port) {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: "127.0.0.1" });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      resolve(false);
    });
  });
}

export function readLockfile(lockPath) {
  try {
    const raw = readFileSync(lockPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.pid === "number" && typeof parsed.port === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLockfile(lockPath, pid, port) {
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, JSON.stringify({ pid, port }) + "\n");
}

export function removeLockfile(lockPath) {
  try {
    unlinkSync(lockPath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

/**
 * Idempotent server startup. Mirrors cron engine's ensureEngine() pattern.
 *
 * Returns the port number on success, or null if startup was skipped.
 */
export async function ensureServer(server, requestedPort, lockPath, log = noopLogger) {
  if (server.isRunning()) {
    log.debug("server already running this session");
    return server.getPort();
  }

  const lock = readLockfile(lockPath);
  if (lock) {
    if (isProcessAlive(lock.pid)) {
      log.info(
        `server already running (pid ${lock.pid}, port ${lock.port}) — skipping start`
      );
      return null;
    }
    log.info("cleaning stale lockfile");
    removeLockfile(lockPath);
  }

  const portBusy = await isPortInUse(requestedPort);
  if (portBusy) {
    log.error(`port ${requestedPort} already in use — skipping start`);
    return null;
  }

  const actualPort = await server.start(requestedPort);
  writeLockfile(lockPath, process.pid, actualPort);
  log.info(`listening on http://127.0.0.1:${actualPort}`);
  return actualPort;
}
