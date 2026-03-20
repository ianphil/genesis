import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  getCronExtDir,
  getCronJobsDir,
  isCronEngineRunning,
  findRunningEngines,
  createOneShotCronJob,
} from "./cron-bridge.mjs";

// ---------------------------------------------------------------------------
// getCronExtDir
// ---------------------------------------------------------------------------

describe("getCronExtDir", () => {
  it("resolves sibling cron directory", () => {
    const responsesExtDir = join("/fake", "extensions", "responses");
    const result = getCronExtDir(responsesExtDir);
    assert.ok(result.endsWith(join("extensions", "cron")));
  });
});

// ---------------------------------------------------------------------------
// getCronJobsDir
// ---------------------------------------------------------------------------

describe("getCronJobsDir", () => {
  it("returns correct nested path", () => {
    const responsesExtDir = join("/fake", "extensions", "responses");
    const result = getCronJobsDir(responsesExtDir, "fox");
    assert.ok(result.endsWith(join("cron", "data", "fox", "jobs")));
  });
});

// ---------------------------------------------------------------------------
// isCronEngineRunning
// ---------------------------------------------------------------------------

describe("isCronEngineRunning", () => {
  let tmpBase;
  let responsesExtDir;
  const agentName = "test-agent";

  before(() => {
    tmpBase = mkdtempSync(join(tmpdir(), "cron-bridge-"));
    responsesExtDir = join(tmpBase, "responses");
    mkdirSync(responsesExtDir, { recursive: true });
  });
  after(() => { rmSync(tmpBase, { recursive: true, force: true }); });

  it("returns { running: true, pid } for alive PID", () => {
    const lockDir = join(tmpBase, "cron", "data", agentName);
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "engine.lock"), String(process.pid));
    const result = isCronEngineRunning(responsesExtDir, agentName);
    assert.equal(result.running, true);
    assert.equal(result.pid, process.pid);
  });

  it("returns { running: false } when lockfile missing", () => {
    const result = isCronEngineRunning(responsesExtDir, "no-such-agent");
    assert.deepEqual(result, { running: false });
  });

  it("returns { running: false } for dead PID", () => {
    const lockDir = join(tmpBase, "cron", "data", "dead-agent");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "engine.lock"), "999999");
    const result = isCronEngineRunning(responsesExtDir, "dead-agent");
    assert.deepEqual(result, { running: false });
  });

  it("returns { running: false } for corrupt lockfile", () => {
    const lockDir = join(tmpBase, "cron", "data", "corrupt-agent");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "engine.lock"), "NOT VALID");
    const result = isCronEngineRunning(responsesExtDir, "corrupt-agent");
    assert.deepEqual(result, { running: false });
  });
});

// ---------------------------------------------------------------------------
// findRunningEngines
// ---------------------------------------------------------------------------

describe("findRunningEngines", () => {
  let tmpBase;
  let responsesExtDir;

  before(() => {
    tmpBase = mkdtempSync(join(tmpdir(), "cron-scan-"));
    responsesExtDir = join(tmpBase, "responses");
    mkdirSync(responsesExtDir, { recursive: true });
  });
  after(() => { rmSync(tmpBase, { recursive: true, force: true }); });

  it("returns empty array when no data dir exists", () => {
    const result = findRunningEngines(responsesExtDir);
    assert.deepEqual(result, []);
  });

  it("finds a single running engine", () => {
    const lockDir = join(tmpBase, "cron", "data", "alpha");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "engine.lock"), String(process.pid));
    const result = findRunningEngines(responsesExtDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].agentName, "alpha");
    assert.equal(result[0].pid, process.pid);
  });

  it("skips dead PIDs and corrupt lockfiles", () => {
    const deadDir = join(tmpBase, "cron", "data", "dead");
    mkdirSync(deadDir, { recursive: true });
    writeFileSync(join(deadDir, "engine.lock"), "999999");

    const corruptDir = join(tmpBase, "cron", "data", "corrupt");
    mkdirSync(corruptDir, { recursive: true });
    writeFileSync(join(corruptDir, "engine.lock"), "GARBAGE");

    const result = findRunningEngines(responsesExtDir);
    const names = result.map((e) => e.agentName);
    assert.ok(!names.includes("dead"));
    assert.ok(!names.includes("corrupt"));
  });

  it("finds multiple running engines", () => {
    const betaDir = join(tmpBase, "cron", "data", "beta");
    mkdirSync(betaDir, { recursive: true });
    writeFileSync(join(betaDir, "engine.lock"), String(process.pid));

    const result = findRunningEngines(responsesExtDir);
    const names = result.map((e) => e.agentName).sort();
    assert.ok(names.includes("alpha"));
    assert.ok(names.includes("beta"));
    assert.ok(names.length >= 2);
  });
});

// ---------------------------------------------------------------------------
// createOneShotCronJob
// ---------------------------------------------------------------------------

describe("createOneShotCronJob", () => {
  let tmpBase;
  let responsesExtDir;
  const agentName = "test-agent";
  let job;
  let jobFile;

  before(() => {
    tmpBase = mkdtempSync(join(tmpdir(), "cron-create-"));
    responsesExtDir = join(tmpBase, "responses");
    mkdirSync(responsesExtDir, { recursive: true });

    job = createOneShotCronJob(responsesExtDir, agentName, {
      cronJobId: "job-123",
      prompt: "do the thing",
      sessionId: "sess-abc",
      model: "gpt-4o",
      timeoutSeconds: 120,
    });

    const jobsDir = getCronJobsDir(responsesExtDir, agentName);
    jobFile = join(jobsDir, "job-123.json");
  });
  after(() => { rmSync(tmpBase, { recursive: true, force: true }); });

  it("creates a valid JSON file in the jobs directory", () => {
    assert.ok(existsSync(jobFile));
    const parsed = JSON.parse(readFileSync(jobFile, "utf-8"));
    assert.equal(parsed.id, "job-123");
  });

  it("sets schedule.type to oneShot", () => {
    assert.equal(job.schedule.type, "oneShot");
  });

  it("sets fireAtUtc approximately 3 seconds in the future", () => {
    const fireAt = new Date(job.schedule.fireAtUtc).getTime();
    const now = Date.now();
    // Should be within a reasonable window: -1s to +5s from now
    assert.ok(fireAt > now - 1000, "fireAtUtc should not be in the distant past");
    assert.ok(fireAt < now + 5000, "fireAtUtc should be roughly 3s in the future");
  });

  it("includes sessionId in payload", () => {
    assert.equal(job.payload.sessionId, "sess-abc");
  });

  it("sets source to responses", () => {
    assert.equal(job.source, "responses");
  });

  it("uses cronJobId as both id and name", () => {
    assert.equal(job.id, "job-123");
    assert.equal(job.name, "job-123");
  });

  it("sets status to enabled", () => {
    assert.equal(job.status, "enabled");
  });

  it("handles null model gracefully", () => {
    const nullModelJob = createOneShotCronJob(responsesExtDir, agentName, {
      cronJobId: "job-null-model",
      prompt: "test",
      sessionId: null,
      model: null,
      timeoutSeconds: 300,
    });
    assert.equal(nullModelJob.payload.model, null);
  });

  it("creates jobs directory if it doesn't exist", () => {
    const freshBase = mkdtempSync(join(tmpdir(), "cron-fresh-"));
    const freshResponses = join(freshBase, "responses");
    mkdirSync(freshResponses, { recursive: true });

    createOneShotCronJob(freshResponses, "new-agent", {
      cronJobId: "job-new",
      prompt: "hello",
      sessionId: null,
      model: null,
      timeoutSeconds: 300,
    });

    const jobsDir = getCronJobsDir(freshResponses, "new-agent");
    assert.ok(existsSync(jobsDir));
    assert.ok(existsSync(join(jobsDir, "job-new.json")));

    rmSync(freshBase, { recursive: true, force: true });
  });
});
