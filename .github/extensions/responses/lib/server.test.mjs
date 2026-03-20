import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request } from "node:http";

import { createChatApiServer } from "./server.mjs";

// ---------------------------------------------------------------------------
// Shared HTTP helper
// ---------------------------------------------------------------------------

function httpRequest(method, portNum, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "127.0.0.1",
      port: portNum,
      path,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, body: JSON.parse(text), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: text, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Helper: write a job file directly into the bg-jobs dir
// ---------------------------------------------------------------------------

function writeJobFile(extDir, jobId, overrides = {}) {
  const now = new Date().toISOString();
  const job = {
    id: jobId,
    cronJobId: `bg-${jobId}`,
    sessionId: `test-agent-${jobId}`,
    prompt: "test prompt",
    status: "queued",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  writeFileSync(
    join(extDir, "data", "test-agent", "bg-jobs", `${jobId}.json`),
    JSON.stringify(job, null, 2),
  );
  return job;
}

// ---------------------------------------------------------------------------
// Helper: write a cron job file
// ---------------------------------------------------------------------------

function writeCronJobFile(tmpBase, cronJobId, overrides = {}) {
  const cronJob = {
    id: cronJobId,
    name: cronJobId,
    status: "enabled",
    maxConcurrency: 1,
    createdAtUtc: new Date().toISOString(),
    lastRunAtUtc: null,
    nextRunAtUtc: new Date(Date.now() + 60_000).toISOString(),
    schedule: { type: "oneShot", fireAtUtc: new Date(Date.now() + 60_000).toISOString() },
    payload: { type: "prompt", prompt: "test", model: null, sessionId: null, timeoutSeconds: 300 },
    backoff: null,
    source: "responses",
    ...overrides,
  };
  writeFileSync(
    join(tmpBase, "cron", "data", "test-agent", "jobs", `${cronJobId}.json`),
    JSON.stringify(cronJob, null, 2),
  );
  return cronJob;
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  const log = { info() {}, error() {}, debug() {} };
  let tmpBase, extDir, state, server, port;

  before(async () => {
    tmpBase = mkdtempSync(join(tmpdir(), "srv-health-"));
    extDir = join(tmpBase, "responses");
    mkdirSync(join(extDir, "data", "test-agent", "bg-jobs"), { recursive: true });
    state = { agentName: "test-agent" };
    server = createChatApiServer(log, extDir, state);
    port = await server.start(0);
  });

  after(async () => {
    await server.stop();
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("returns 200 with status ok", async () => {
    const res = await httpRequest("GET", port, "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.session, "connected");
    assert.equal(typeof res.body.port, "number");
    assert.equal(typeof res.body.uptime, "number");
    assert.equal(typeof res.body.timestamp, "number");
  });

  it("includes job count (zero initially)", async () => {
    const res = await httpRequest("GET", port, "/health");
    assert.equal(res.body.jobs, 0);
  });

  it("reflects job count after adding jobs", async () => {
    writeJobFile(extDir, "health-j1");
    writeJobFile(extDir, "health-j2");
    const res = await httpRequest("GET", port, "/health");
    assert.equal(res.body.jobs, 2);
  });
});

// ---------------------------------------------------------------------------
// GET /jobs
// ---------------------------------------------------------------------------

describe("GET /jobs", () => {
  const log = { info() {}, error() {}, debug() {} };
  let tmpBase, extDir, state, server, port;

  before(async () => {
    tmpBase = mkdtempSync(join(tmpdir(), "srv-jobs-"));
    extDir = join(tmpBase, "responses");
    mkdirSync(join(extDir, "data", "test-agent", "bg-jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "history"), { recursive: true });
    state = { agentName: "test-agent" };
    server = createChatApiServer(log, extDir, state);
    port = await server.start(0);
  });

  after(async () => {
    await server.stop();
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("returns empty jobs array initially", async () => {
    const res = await httpRequest("GET", port, "/jobs");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.jobs));
    assert.equal(res.body.jobs.length, 0);
  });

  it("returns jobs after creating them", async () => {
    writeJobFile(extDir, "list-j1", { prompt: "first job" });
    writeJobFile(extDir, "list-j2", { prompt: "second job" });
    const res = await httpRequest("GET", port, "/jobs");
    assert.equal(res.status, 200);
    assert.equal(res.body.jobs.length, 2);
    const ids = res.body.jobs.map((j) => j.id);
    assert.ok(ids.includes("list-j1"));
    assert.ok(ids.includes("list-j2"));
  });

  it("each job has a feed_url", async () => {
    const res = await httpRequest("GET", port, "/jobs");
    for (const job of res.body.jobs) {
      assert.ok(job.feed_url.includes(`/feed/${job.id}`));
    }
  });

  it("supports status filter", async () => {
    writeJobFile(extDir, "list-j3", { prompt: "cancelled", status: "cancelled" });
    const res = await httpRequest("GET", port, "/jobs?status=cancelled");
    assert.equal(res.status, 200);
    assert.ok(res.body.jobs.length >= 1);
    for (const j of res.body.jobs) {
      assert.equal(j.status, "cancelled");
    }
  });

  it("supports limit parameter", async () => {
    const res = await httpRequest("GET", port, "/jobs?limit=1");
    assert.equal(res.status, 200);
    assert.equal(res.body.jobs.length, 1);
  });
});

// ---------------------------------------------------------------------------
// GET /jobs/:id
// ---------------------------------------------------------------------------

describe("GET /jobs/:id", () => {
  const log = { info() {}, error() {}, debug() {} };
  let tmpBase, extDir, state, server, port;

  before(async () => {
    tmpBase = mkdtempSync(join(tmpdir(), "srv-jobid-"));
    extDir = join(tmpBase, "responses");
    mkdirSync(join(extDir, "data", "test-agent", "bg-jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "history"), { recursive: true });
    state = { agentName: "test-agent" };
    server = createChatApiServer(log, extDir, state);
    port = await server.start(0);
  });

  after(async () => {
    await server.stop();
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("returns 404 for non-existent job", async () => {
    const res = await httpRequest("GET", port, "/jobs/nonexistent");
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it("returns job detail for existing job", async () => {
    writeJobFile(extDir, "detail-j1", { prompt: "my detailed prompt" });
    const res = await httpRequest("GET", port, "/jobs/detail-j1");
    assert.equal(res.status, 200);
    assert.equal(res.body.id, "detail-j1");
    assert.equal(res.body.prompt, "my detailed prompt");
    assert.ok(res.body.createdAt);
    assert.ok(res.body.updatedAt);
    assert.ok(Array.isArray(res.body.statusItems));
  });

  it("includes feed_url in response", async () => {
    const res = await httpRequest("GET", port, "/jobs/detail-j1");
    assert.equal(res.status, 200);
    assert.ok(res.body.feed_url);
    assert.ok(res.body.feed_url.includes("/feed/detail-j1"));
  });
});

// ---------------------------------------------------------------------------
// GET /feed/:jobId
// ---------------------------------------------------------------------------

describe("GET /feed/:jobId", () => {
  const log = { info() {}, error() {}, debug() {} };
  let tmpBase, extDir, state, server, port;

  before(async () => {
    tmpBase = mkdtempSync(join(tmpdir(), "srv-feed-"));
    extDir = join(tmpBase, "responses");
    mkdirSync(join(extDir, "data", "test-agent", "bg-jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "history"), { recursive: true });
    state = { agentName: "test-agent" };
    server = createChatApiServer(log, extDir, state);
    port = await server.start(0);
  });

  after(async () => {
    await server.stop();
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("returns 404 for non-existent job", async () => {
    const res = await httpRequest("GET", port, "/feed/nonexistent");
    assert.equal(res.status, 404);
  });

  it("returns RSS XML for existing job", async () => {
    writeJobFile(extDir, "feed-j1", { prompt: "rss test prompt" });
    const res = await httpRequest("GET", port, "/feed/feed-j1");
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"].includes("application/rss+xml"));
    // body is raw XML string since it won't parse as JSON
    assert.equal(typeof res.body, "string");
    assert.ok(res.body.includes("<?xml"));
    assert.ok(res.body.includes("<rss"));
  });

  it("XML contains job ID", async () => {
    const res = await httpRequest("GET", port, "/feed/feed-j1");
    assert.ok(res.body.includes("feed-j1"));
  });
});

// ---------------------------------------------------------------------------
// DELETE /jobs/:id
// ---------------------------------------------------------------------------

describe("DELETE /jobs/:id", () => {
  const log = { info() {}, error() {}, debug() {} };
  let tmpBase, extDir, state, server, port;

  before(async () => {
    tmpBase = mkdtempSync(join(tmpdir(), "srv-del-"));
    extDir = join(tmpBase, "responses");
    mkdirSync(join(extDir, "data", "test-agent", "bg-jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "history"), { recursive: true });
    state = { agentName: "test-agent" };
    server = createChatApiServer(log, extDir, state);
    port = await server.start(0);
  });

  after(async () => {
    await server.stop();
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("returns 404 for non-existent job", async () => {
    const res = await httpRequest("DELETE", port, "/jobs/nonexistent");
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it("cancels a queued job", async () => {
    writeJobFile(extDir, "del-j1");
    writeCronJobFile(tmpBase, "bg-del-j1");

    const res = await httpRequest("DELETE", port, "/jobs/del-j1");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "cancelled");
    assert.equal(res.body.id, "del-j1");

    // Verify job file was updated
    const updatedJob = JSON.parse(
      readFileSync(join(extDir, "data", "test-agent", "bg-jobs", "del-j1.json"), "utf-8"),
    );
    assert.equal(updatedJob.status, "cancelled");

    // Verify cron job was disabled
    const updatedCron = JSON.parse(
      readFileSync(join(tmpBase, "cron", "data", "test-agent", "jobs", "bg-del-j1.json"), "utf-8"),
    );
    assert.equal(updatedCron.status, "disabled");
    assert.equal(updatedCron.nextRunAtUtc, null);
  });

  it("returns 409 for already-cancelled job", async () => {
    writeJobFile(extDir, "del-j2", { status: "cancelled" });
    const res = await httpRequest("DELETE", port, "/jobs/del-j2");
    assert.equal(res.status, 409);
    assert.ok(res.body.error.includes("cancelled"));
  });

  it("returns 409 for completed job", async () => {
    writeJobFile(extDir, "del-j3");
    // Write cron history so resolveJobStatus sees outcome=success → "completed"
    writeFileSync(
      join(tmpBase, "cron", "data", "test-agent", "history", "bg-del-j3.json"),
      JSON.stringify([{
        outcome: "success",
        startedAtUtc: new Date().toISOString(),
        completedAtUtc: new Date().toISOString(),
        durationMs: 100,
      }]),
    );
    const res = await httpRequest("DELETE", port, "/jobs/del-j3");
    assert.equal(res.status, 409);
    assert.ok(res.body.error.includes("terminal"));
  });
});

// ---------------------------------------------------------------------------
// POST /v1/responses
// ---------------------------------------------------------------------------

describe("POST /v1/responses", () => {
  const log = { info() {}, error() {}, debug() {} };
  let tmpBase, extDir, state, server, port;

  before(async () => {
    tmpBase = mkdtempSync(join(tmpdir(), "srv-resp-"));
    extDir = join(tmpBase, "responses");
    mkdirSync(join(extDir, "data", "test-agent", "bg-jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "history"), { recursive: true });
    state = { agentName: "test-agent" };
    server = createChatApiServer(log, extDir, state);
    port = await server.start(0);
    server.bindSession({
      sendAndWait: async (p) => ({ data: { content: "hello" } }),
      send: async () => {},
      getMessages: async () => [],
      onEvent: () => () => {},
    });
  });

  after(async () => {
    await server.stop();
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("returns 400 for missing input", async () => {
    const res = await httpRequest("POST", port, "/v1/responses", {});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
    assert.ok(res.body.error.message.includes("input"));
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await httpRequest("POST", port, "/v1/responses", "not json {{{");
    assert.equal(res.status, 400);
    assert.ok(res.body.error.message.includes("Invalid JSON"));
  });

  it("returns 503 when cron engine not running (default async mode)", async () => {
    const res = await httpRequest("POST", port, "/v1/responses", { input: "run in background" });
    assert.equal(res.status, 503);
    assert.ok(res.body.error.message.toLowerCase().includes("cron"));
  });

  it("returns 200 with completed response in sync mode", async () => {
    const res = await httpRequest("POST", port, "/v1/responses", {
      input: "hello sync",
      async: false,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "completed");
    assert.equal(res.body.output_text, "hello");
    assert.equal(res.body.object, "response");
    assert.ok(res.body.id.startsWith("resp_"));
    assert.ok(Array.isArray(res.body.output));
  });

  it("returns 502 when session.sendAndWait throws in sync mode", async () => {
    // Create a separate server with a failing session
    const tmpFail = mkdtempSync(join(tmpdir(), "srv-fail-"));
    const extFail = join(tmpFail, "responses");
    mkdirSync(join(extFail, "data", "test-agent", "bg-jobs"), { recursive: true });
    const failState = { agentName: "test-agent" };
    const failServer = createChatApiServer(log, extFail, failState);
    const failPort = await failServer.start(0);
    failServer.bindSession({
      sendAndWait: async () => { throw new Error("session exploded"); },
      send: async () => {},
      getMessages: async () => [],
      onEvent: () => () => {},
    });

    try {
      const res = await httpRequest("POST", failPort, "/v1/responses", {
        input: "will fail",
        async: false,
      });
      assert.equal(res.status, 502);
      assert.ok(res.body.error.message.includes("Agent failed"));
    } finally {
      await failServer.stop();
      rmSync(tmpFail, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// POST /v1/responses — async mode with running cron engine
// ---------------------------------------------------------------------------

describe("POST /v1/responses async with cron engine", () => {
  const log = { info() {}, error() {}, debug() {} };
  let tmpBase, extDir, state, server, port;

  before(async () => {
    tmpBase = mkdtempSync(join(tmpdir(), "srv-async-"));
    extDir = join(tmpBase, "responses");
    mkdirSync(join(extDir, "data", "test-agent", "bg-jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "jobs"), { recursive: true });
    mkdirSync(join(tmpBase, "cron", "data", "test-agent", "history"), { recursive: true });

    // Fake cron engine lockfile with current PID so isCronEngineRunning returns true
    writeFileSync(
      join(tmpBase, "cron", "data", "test-agent", "engine.lock"),
      JSON.stringify({ pid: process.pid }),
    );

    state = { agentName: "test-agent" };
    server = createChatApiServer(log, extDir, state);
    port = await server.start(0);
    server.bindSession({
      sendAndWait: async () => ({ data: { content: "bg response" } }),
      send: async () => {},
      getMessages: async () => [],
      onEvent: () => () => {},
    });
  });

  after(async () => {
    await server.stop();
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("returns 202 with queued status and feed_url", async () => {
    const res = await httpRequest("POST", port, "/v1/responses", { input: "background task" });
    assert.equal(res.status, 202);
    assert.equal(res.body.status, "queued");
    assert.equal(res.body.object, "response");
    assert.ok(res.body.id);
    assert.ok(res.body.feed_url);
    assert.ok(res.body.feed_url.includes("/feed/"));
  });

  it("creates job and cron files on disk", async () => {
    const res = await httpRequest("POST", port, "/v1/responses", {
      input: "disk check",
      id: "custom-job-id",
    });
    assert.equal(res.status, 202);
    assert.equal(res.body.id, "custom-job-id");

    // Verify bg-job file
    const jobPath = join(extDir, "data", "test-agent", "bg-jobs", "custom-job-id.json");
    const job = JSON.parse(readFileSync(jobPath, "utf-8"));
    assert.equal(job.id, "custom-job-id");
    assert.equal(job.status, "queued");
    assert.equal(job.prompt, "disk check");

    // Verify cron job file
    const cronPath = join(tmpBase, "cron", "data", "test-agent", "jobs", "bg-custom-job-id.json");
    const cronJob = JSON.parse(readFileSync(cronPath, "utf-8"));
    assert.equal(cronJob.id, "bg-custom-job-id");
    assert.equal(cronJob.status, "enabled");
    assert.equal(cronJob.schedule.type, "oneShot");
  });
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

describe("404 handler", () => {
  const log = { info() {}, error() {}, debug() {} };
  let tmpBase, extDir, state, server, port;

  before(async () => {
    tmpBase = mkdtempSync(join(tmpdir(), "srv-404-"));
    extDir = join(tmpBase, "responses");
    mkdirSync(join(extDir, "data", "test-agent", "bg-jobs"), { recursive: true });
    state = { agentName: "test-agent" };
    server = createChatApiServer(log, extDir, state);
    port = await server.start(0);
  });

  after(async () => {
    await server.stop();
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("returns 404 with endpoint list for unknown paths", async () => {
    const res = await httpRequest("GET", port, "/unknown/path");
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "Not found");
    assert.ok(res.body.endpoints);
    assert.ok(res.body.endpoints["GET /health"]);
    assert.ok(res.body.endpoints["POST /v1/responses"]);
    assert.ok(res.body.endpoints["GET /jobs"]);
    assert.ok(res.body.endpoints["GET /jobs/:id"]);
    assert.ok(res.body.endpoints["DELETE /jobs/:id"]);
    assert.ok(res.body.endpoints["GET /feed/:jobId"]);
  });

  it("returns 404 for POST to unknown path", async () => {
    const res = await httpRequest("POST", port, "/nope", {});
    assert.equal(res.status, 404);
  });
});
