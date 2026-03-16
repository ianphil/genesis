import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

const noopLogger = { debug() {}, info() {}, error() {} };

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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
 * Detect and remove a stale lockfile left by a previous process that died
 * without cleanup (e.g. SIGKILL). If the lockfile's PID is still alive,
 * it belongs to another running instance — leave it alone.
 */
export function cleanStaleLockfile(lockPath, log = noopLogger) {
  const lock = readLockfile(lockPath);
  if (!lock) return;

  if (isProcessAlive(lock.pid)) {
    log.info(`another instance running (pid ${lock.pid}, port ${lock.port})`);
    return;
  }

  log.info("cleaning stale lockfile");
  removeLockfile(lockPath);
}

/**
 * Write a breadcrumb file that records how far startup progressed.
 * Survives crashes — if the process dies, the file shows the last stage reached.
 * Stages: "init" → "server_up" → "session_bound" → "ready"
 */
export function writeStartupBreadcrumb(breadcrumbPath, stage, extra = {}) {
  mkdirSync(dirname(breadcrumbPath), { recursive: true });
  const data = { pid: process.pid, stage, ts: new Date().toISOString(), ...extra };
  writeFileSync(breadcrumbPath, JSON.stringify(data, null, 2) + "\n");
}

export function readStartupBreadcrumb(breadcrumbPath) {
  try {
    return JSON.parse(readFileSync(breadcrumbPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Migrate legacy flat data/config.json and data/responses.lock into the
 * namespaced data/{agentName}/ directory.  Idempotent — safe to call every
 * session.  If the target file already exists the old copy is simply removed.
 */
export function migrateLegacyData(extDir, agentName) {
  const targetDir = join(extDir, "data", agentName);
  mkdirSync(targetDir, { recursive: true });

  for (const filename of ["config.json", "responses.lock"]) {
    const oldPath = join(extDir, "data", filename);
    const newPath = join(targetDir, filename);

    if (!existsSync(oldPath)) continue;

    try {
      if (existsSync(newPath)) {
        unlinkSync(oldPath);
      } else {
        renameSync(oldPath, newPath);
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
}
