import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { request } from "node:http";

import { createLogger } from "./logger.mjs";
import { loadConfig, saveConfig, DEFAULT_CONFIG } from "./config.mjs";
import { createChatApiServer } from "./server.mjs";
import {
  isProcessAlive,
  isPortInUse,
  readLockfile,
  writeLockfile,
  removeLockfile,
  ensureServer,
  migrateLegacyData,
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
    saveConfig(p, { port: 9999, logLevel: "debug" });
    assert.deepEqual(loadConfig(p), { port: 9999, logLevel: "debug" });
  });

  it("falls back on invalid port (too low)", () => {
    const p = join(tmp, "low.json");
    saveConfig(p, { port: 80 });
    assert.deepEqual(loadConfig(p), { port: DEFAULT_CONFIG.port, logLevel: "info" });
  });

  it("falls back on invalid port (non-integer)", () => {
    const p = join(tmp, "float.json");
    saveConfig(p, { port: 3.14 });
    assert.deepEqual(loadConfig(p), { port: DEFAULT_CONFIG.port, logLevel: "info" });
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
// logger.mjs
// ---------------------------------------------------------------------------

describe("createLogger", () => {
  it("returns all methods at debug level", () => {
    const log = createLogger("debug");
    assert.equal(log.level, "debug");
    assert.equal(typeof log.debug, "function");
    assert.equal(typeof log.info, "function");
    assert.equal(typeof log.error, "function");
  });

  it("silences debug at info level", () => {
    const log = createLogger("info");
    assert.equal(log.level, "info");
    // debug should be a noop — confirm it doesn't throw
    log.debug("should not appear");
  });

  it("silences info and debug at error level", () => {
    const log = createLogger("error");
    assert.equal(log.level, "error");
    log.info("noop");
    log.debug("noop");
  });

  it("silences everything at silent level", () => {
    const log = createLogger("silent");
    assert.equal(log.level, "silent");
    log.error("noop");
    log.info("noop");
    log.debug("noop");
  });

  it("defaults to info on invalid level", () => {
    const log = createLogger("banana");
    assert.equal(log.level, "info");
  });
});

// ---------------------------------------------------------------------------
// config.mjs — logLevel validation
// ---------------------------------------------------------------------------

describe("loadConfig logLevel", () => {
  let tmp;
  before(() => { tmp = mkdtempSync(join(tmpdir(), "resp-log-")); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("reads valid logLevel", () => {
    const p = join(tmp, "debug.json");
    saveConfig(p, { port: 15210, logLevel: "debug" });
    assert.equal(loadConfig(p).logLevel, "debug");
  });

  it("falls back on invalid logLevel", () => {
    const p = join(tmp, "bad.json");
    saveConfig(p, { port: 15210, logLevel: "banana" });
    assert.equal(loadConfig(p).logLevel, "info");
  });

  it("falls back when logLevel is missing", () => {
    const p = join(tmp, "missing.json");
    saveConfig(p, { port: 15210 });
    assert.equal(loadConfig(p).logLevel, "info");
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
    // Use a high ephemeral port unlikely to be in use
    assert.equal(await isPortInUse(19876), false);
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
// lifecycle.mjs — migrateLegacyData
// ---------------------------------------------------------------------------

describe("migrateLegacyData", () => {
  let tmp;
  before(() => { tmp = mkdtempSync(join(tmpdir(), "resp-mig-")); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("moves legacy config.json into namespaced dir", () => {
    const extDir = join(tmp, "ext-a");
    mkdirSync(join(extDir, "data"), { recursive: true });
    writeFileSync(join(extDir, "data", "config.json"), '{"port":15212}');

    migrateLegacyData(extDir, "fox");

    assert.equal(existsSync(join(extDir, "data", "config.json")), false);
    assert.equal(existsSync(join(extDir, "data", "fox", "config.json")), true);
    const content = JSON.parse(readFileSync(join(extDir, "data", "fox", "config.json"), "utf-8"));
    assert.equal(content.port, 15212);
  });

  it("moves legacy responses.lock into namespaced dir", () => {
    const extDir = join(tmp, "ext-b");
    mkdirSync(join(extDir, "data"), { recursive: true });
    writeFileSync(join(extDir, "data", "responses.lock"), '{"pid":1,"port":9999}');

    migrateLegacyData(extDir, "ender");

    assert.equal(existsSync(join(extDir, "data", "responses.lock")), false);
    assert.equal(existsSync(join(extDir, "data", "ender", "responses.lock")), true);
  });

  it("deletes old file when namespaced target already exists", () => {
    const extDir = join(tmp, "ext-c");
    mkdirSync(join(extDir, "data", "elliot"), { recursive: true });
    writeFileSync(join(extDir, "data", "config.json"), '{"port":1111}');
    writeFileSync(join(extDir, "data", "elliot", "config.json"), '{"port":2222}');

    migrateLegacyData(extDir, "elliot");

    assert.equal(existsSync(join(extDir, "data", "config.json")), false);
    const content = JSON.parse(readFileSync(join(extDir, "data", "elliot", "config.json"), "utf-8"));
    assert.equal(content.port, 2222); // namespaced copy wins
  });

  it("is idempotent — no-op when no legacy files exist", () => {
    const extDir = join(tmp, "ext-d");
    assert.doesNotThrow(() => migrateLegacyData(extDir, "default"));
    assert.equal(existsSync(join(extDir, "data", "default")), true);
  });

  it("handles both files at once", () => {
    const extDir = join(tmp, "ext-e");
    mkdirSync(join(extDir, "data"), { recursive: true });
    writeFileSync(join(extDir, "data", "config.json"), '{"port":5555}');
    writeFileSync(join(extDir, "data", "responses.lock"), '{"pid":42,"port":5555}');

    migrateLegacyData(extDir, "fox");

    assert.equal(existsSync(join(extDir, "data", "config.json")), false);
    assert.equal(existsSync(join(extDir, "data", "responses.lock")), false);
    assert.equal(existsSync(join(extDir, "data", "fox", "config.json")), true);
    assert.equal(existsSync(join(extDir, "data", "fox", "responses.lock")), true);
  });
});

// ---------------------------------------------------------------------------
// ensureServer — state machine
// ---------------------------------------------------------------------------

describe("ensureServer", () => {
  let tmp;
  const log = createLogger("silent");
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
    const result = await ensureServer(srv, 9000, lp, log);
    assert.equal(result, 9000);
    assert.equal(existsSync(lp), false);
  });

  it("cleans stale lockfile and starts", async () => {
    const lp = join(tmp, "b.lock");
    writeLockfile(lp, 999999, 9001);
    let started = false;
    const srv = mockServer({ start: async (p) => { started = true; return p; } });
    const result = await ensureServer(srv, 9001, lp, log);
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
    const result = await ensureServer(srv, extPort, lp, log);
    assert.equal(result, null);
    extSrv.close();
  });

  it("starts cleanly and writes lockfile", async () => {
    const lp = join(tmp, "d.lock");
    const srv = mockServer({ start: async (p) => p });
    const result = await ensureServer(srv, 18000, lp, log);
    assert.equal(result, 18000);
    const lock = readLockfile(lp);
    assert.equal(lock.pid, process.pid);
    assert.equal(lock.port, 18000);
  });

  it("returns null when another live session owns the lockfile", async () => {
    const lp = join(tmp, "e.lock");
    writeLockfile(lp, process.pid, 7777);
    const srv = mockServer();
    const result = await ensureServer(srv, 7777, lp, log);
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// server.mjs — session guard (503 when deps are null)
// ---------------------------------------------------------------------------

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function httpPost(port, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request({
      hostname: "127.0.0.1", port, path, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

describe("server session guard", () => {
  const log = createLogger("silent");
  let server;
  let port;

  // Start with null deps (no session)
  const deps = {
    sendAndWait: null,
    send: null,
    getMessages: null,
    onEvent: null,
  };

  before(async () => {
    server = createChatApiServer(deps, log);
    port = await server.start(0);
  });

  after(async () => {
    await server.stop();
  });

  it("returns 503 on POST /v1/responses when no session", async () => {
    const res = await httpPost(port, "/v1/responses", { input: "hello" });
    assert.equal(res.status, 503);
    assert.equal(res.body.error.message, "No active session");
  });

  it("returns 503 on GET /history when no session", async () => {
    const res = await httpGet(port, "/history");
    assert.equal(res.status, 503);
    assert.equal(res.body.error.message, "No active session");
  });

  it("reports session: disconnected on GET /health when no session", async () => {
    const res = await httpGet(port, "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.session, "disconnected");
  });

  it("reports session: connected on GET /health after binding deps", async () => {
    deps.sendAndWait = async () => ({ data: { content: "ok" } });
    deps.getMessages = async () => [];
    const res = await httpGet(port, "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.session, "connected");
  });

  it("succeeds on POST /v1/responses after binding deps", async () => {
    deps.sendAndWait = async () => ({ data: { content: "test response" } });
    const res = await httpPost(port, "/v1/responses", { input: "hello" });
    assert.equal(res.status, 200);
    assert.equal(res.body.output_text, "test response");
  });

  it("returns 503 again after unbinding deps", async () => {
    deps.sendAndWait = null;
    deps.send = null;
    deps.getMessages = null;
    deps.onEvent = null;
    const res = await httpPost(port, "/v1/responses", { input: "hello" });
    assert.equal(res.status, 503);
  });
});
