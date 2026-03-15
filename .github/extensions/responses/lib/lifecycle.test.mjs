import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";

import { loadConfig, saveConfig, DEFAULT_CONFIG } from "./config.mjs";
import {
  isProcessAlive,
  isPortInUse,
  readLockfile,
  writeLockfile,
  removeLockfile,
  ensureServer,
} from "./lifecycle.mjs";

// ---------------------------------------------------------------------------
// config.mjs
// ---------------------------------------------------------------------------

describe("loadConfig", () => {
  let tmp;
  before(() => { tmp = mkdtempSync(join(tmpdir(), "resp-cfg-")); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("returns DEFAULT_CONFIG when file is missing", () => {
    const cfg = loadConfig(join(tmp, "nope.json"));
    assert.deepEqual(cfg, DEFAULT_CONFIG);
  });

  it("reads a valid config", () => {
    const p = join(tmp, "good.json");
    saveConfig(p, { port: 9999 });
    assert.deepEqual(loadConfig(p), { port: 9999 });
  });

  it("falls back on invalid port (too low)", () => {
    const p = join(tmp, "low.json");
    saveConfig(p, { port: 80 });
    assert.deepEqual(loadConfig(p), { port: DEFAULT_CONFIG.port });
  });

  it("falls back on invalid port (non-integer)", () => {
    const p = join(tmp, "float.json");
    saveConfig(p, { port: 3.14 });
    assert.deepEqual(loadConfig(p), { port: DEFAULT_CONFIG.port });
  });

  it("falls back on corrupt JSON", () => {
    const p = join(tmp, "corrupt.json");
    writeFileSync(p, "NOT JSON");
    assert.deepEqual(loadConfig(p), DEFAULT_CONFIG);
  });
});

describe("saveConfig", () => {
  let tmp;
  before(() => { tmp = mkdtempSync(join(tmpdir(), "resp-cfg-")); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("creates parent directories and writes JSON", () => {
    const p = join(tmp, "sub", "dir", "config.json");
    saveConfig(p, { port: 15212 });
    const written = JSON.parse(readFileSync(p, "utf-8"));
    assert.equal(written.port, 15212);
  });
});

// ---------------------------------------------------------------------------
// lifecycle.mjs — pure functions
// ---------------------------------------------------------------------------

describe("isProcessAlive", () => {
  it("returns true for current process", () => {
    assert.equal(isProcessAlive(process.pid), true);
  });

  it("returns false for bogus PID", () => {
    assert.equal(isProcessAlive(999999), false);
  });
});

describe("isPortInUse", () => {
  let srv;
  let port;

  before((_, done) => {
    srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      port = srv.address().port;
      done();
    });
  });
  after((_, done) => { srv.close(done); });

  it("returns true when port is occupied", async () => {
    assert.equal(await isPortInUse(port), true);
  });

  it("returns false when port is free", async () => {
    const freePort = port + 1000;
    assert.equal(await isPortInUse(freePort), false);
  });
});

describe("lockfile round-trip", () => {
  let tmp;
  before(() => { tmp = mkdtempSync(join(tmpdir(), "resp-lock-")); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("write → read → remove", () => {
    const lp = join(tmp, "data", "responses.lock");
    assert.equal(readLockfile(lp), null);

    writeLockfile(lp, 12345, 15212);
    const lock = readLockfile(lp);
    assert.equal(lock.pid, 12345);
    assert.equal(lock.port, 15212);

    removeLockfile(lp);
    assert.equal(readLockfile(lp), null);
  });

  it("removeLockfile is idempotent", () => {
    const lp = join(tmp, "gone.lock");
    assert.doesNotThrow(() => removeLockfile(lp));
  });
});

// ---------------------------------------------------------------------------
// ensureServer — state machine
// ---------------------------------------------------------------------------

describe("ensureServer", () => {
  let tmp;
  before(() => { tmp = mkdtempSync(join(tmpdir(), "resp-ens-")); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  function mockServer(overrides = {}) {
    return {
      isRunning: () => false,
      getPort: () => null,
      start: async (p) => p,
      ...overrides,
    };
  }

  it("returns current port if already running", async () => {
    const lp = join(tmp, "a.lock");
    const srv = mockServer({ isRunning: () => true, getPort: () => 9000 });
    const result = await ensureServer(srv, 9000, lp);
    assert.equal(result, 9000);
    assert.equal(existsSync(lp), false);
  });

  it("cleans stale lockfile and starts", async () => {
    const lp = join(tmp, "b.lock");
    writeLockfile(lp, 999999, 9001);
    let started = false;
    const srv = mockServer({ start: async (p) => { started = true; return p; } });
    const result = await ensureServer(srv, 9001, lp);
    assert.equal(result, 9001);
    assert.equal(started, true);
    const lock = readLockfile(lp);
    assert.equal(lock.port, 9001);
    assert.equal(lock.pid, process.pid);
  });

  it("skips start when port is in use by external process", async () => {
    const lp = join(tmp, "c.lock");
    const extSrv = createServer();
    const extPort = await new Promise((resolve) => {
      extSrv.listen(0, "127.0.0.1", () => resolve(extSrv.address().port));
    });

    const srv = mockServer();
    const result = await ensureServer(srv, extPort, lp);
    assert.equal(result, null);
    extSrv.close();
  });

  it("starts cleanly and writes lockfile", async () => {
    const lp = join(tmp, "d.lock");
    const srv = mockServer({ start: async (p) => p });
    const result = await ensureServer(srv, 18000, lp);
    assert.equal(result, 18000);
    const lock = readLockfile(lp);
    assert.equal(lock.pid, process.pid);
    assert.equal(lock.port, 18000);
  });

  it("returns null when another live session owns the lockfile", async () => {
    const lp = join(tmp, "e.lock");
    writeLockfile(lp, process.pid, 7777);
    const srv = mockServer();
    const result = await ensureServer(srv, 7777, lp);
    assert.equal(result, null);
  });
});
