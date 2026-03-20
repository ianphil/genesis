import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  getBgJobsDir,
  createJob,
  getJob,
  listJobs,
  updateJobStatus,
  removeJob,
} from "./job-registry.mjs";

const AGENT = "test-agent";

// ---------------------------------------------------------------------------
// getBgJobsDir
// ---------------------------------------------------------------------------

describe("getBgJobsDir", () => {
  it("returns correct path", () => {
    const dir = getBgJobsDir("/fake/ext", "myagent");
    assert.equal(dir, join("/fake/ext", "data", "myagent", "bg-jobs"));
  });
});

// ---------------------------------------------------------------------------
// createJob
// ---------------------------------------------------------------------------

describe("createJob", () => {
  let tmp;
  before(() => { tmp = mkdtempSync(join(tmpdir(), "jr-create-")); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("creates a job file on disk with correct fields", () => {
    const job = createJob(tmp, AGENT, {
      id: "j1",
      cronJobId: "cron-1",
      sessionId: "sess-1",
      prompt: "do stuff",
    });
    assert.equal(job.id, "j1");
    assert.equal(job.cronJobId, "cron-1");
    assert.equal(job.sessionId, "sess-1");
    assert.equal(job.prompt, "do stuff");

    const filePath = join(getBgJobsDir(tmp, AGENT), "j1.json");
    assert.ok(existsSync(filePath));
  });

  it("sets status to 'queued' and timestamps", () => {
    const beforeTime = new Date().toISOString();
    const job = createJob(tmp, AGENT, {
      id: "j2",
      cronJobId: "cron-2",
      sessionId: "sess-2",
      prompt: "more stuff",
    });
    const afterTime = new Date().toISOString();

    assert.equal(job.status, "queued");
    assert.ok(job.createdAt >= beforeTime && job.createdAt <= afterTime);
    assert.equal(job.createdAt, job.updatedAt);
  });

  it("file is valid JSON", () => {
    createJob(tmp, AGENT, {
      id: "j3",
      cronJobId: "cron-3",
      sessionId: "sess-3",
      prompt: "json check",
    });
    const raw = readFileSync(join(getBgJobsDir(tmp, AGENT), "j3.json"), "utf-8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.id, "j3");
  });
});

// ---------------------------------------------------------------------------
// getJob
// ---------------------------------------------------------------------------

describe("getJob", () => {
  let tmp;
  before(() => { tmp = mkdtempSync(join(tmpdir(), "jr-get-")); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("reads an existing job", () => {
    createJob(tmp, AGENT, { id: "g1", cronJobId: "c", sessionId: "s", prompt: "p" });
    const job = getJob(tmp, AGENT, "g1");
    assert.equal(job.id, "g1");
    assert.equal(job.status, "queued");
  });

  it("returns null for non-existent job", () => {
    assert.equal(getJob(tmp, AGENT, "nope"), null);
  });

  it("returns null for corrupt JSON", () => {
    const dir = getBgJobsDir(tmp, AGENT);
    writeFileSync(join(dir, "bad.json"), "NOT VALID JSON");
    assert.equal(getJob(tmp, AGENT, "bad"), null);
  });
});

// ---------------------------------------------------------------------------
// listJobs
// ---------------------------------------------------------------------------

describe("listJobs", () => {
  let tmp;
  before(() => { tmp = mkdtempSync(join(tmpdir(), "jr-list-")); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("returns empty array when no jobs", () => {
    const jobs = listJobs(tmp, AGENT);
    assert.deepEqual(jobs, []);
  });

  it("returns jobs sorted by createdAt descending", async () => {
    // Create 3 jobs with staggered timestamps
    createJob(tmp, AGENT, { id: "old", cronJobId: "c", sessionId: "s", prompt: "1" });
    await new Promise((r) => setTimeout(r, 50));
    createJob(tmp, AGENT, { id: "mid", cronJobId: "c", sessionId: "s", prompt: "2" });
    await new Promise((r) => setTimeout(r, 50));
    createJob(tmp, AGENT, { id: "new", cronJobId: "c", sessionId: "s", prompt: "3" });

    const jobs = listJobs(tmp, AGENT);
    assert.equal(jobs.length, 3);
    assert.equal(jobs[0].id, "new");
    assert.equal(jobs[1].id, "mid");
    assert.equal(jobs[2].id, "old");
  });

  it("skips corrupt files", () => {
    const dir = getBgJobsDir(tmp, AGENT);
    writeFileSync(join(dir, "corrupt.json"), "{{{{");
    const jobs = listJobs(tmp, AGENT);
    // Should still return the 3 valid jobs from previous test
    assert.ok(jobs.every((j) => j.id !== "corrupt"));
  });
});

// ---------------------------------------------------------------------------
// updateJobStatus
// ---------------------------------------------------------------------------

describe("updateJobStatus", () => {
  let tmp;
  before(() => { tmp = mkdtempSync(join(tmpdir(), "jr-update-")); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("updates status and updatedAt", async () => {
    const original = createJob(tmp, AGENT, { id: "u1", cronJobId: "c", sessionId: "s", prompt: "p" });
    await new Promise((r) => setTimeout(r, 50));
    const updated = updateJobStatus(tmp, AGENT, "u1", "running");
    assert.equal(updated.status, "running");
    assert.ok(updated.updatedAt > original.updatedAt);
  });

  it("returns null for non-existent job", () => {
    assert.equal(updateJobStatus(tmp, AGENT, "ghost", "running"), null);
  });

  it("preserves other fields", () => {
    createJob(tmp, AGENT, { id: "u2", cronJobId: "cron-x", sessionId: "sess-x", prompt: "keep me" });
    const updated = updateJobStatus(tmp, AGENT, "u2", "completed");
    assert.equal(updated.cronJobId, "cron-x");
    assert.equal(updated.sessionId, "sess-x");
    assert.equal(updated.prompt, "keep me");
  });
});

// ---------------------------------------------------------------------------
// removeJob
// ---------------------------------------------------------------------------

describe("removeJob", () => {
  let tmp;
  before(() => { tmp = mkdtempSync(join(tmpdir(), "jr-remove-")); });
  after(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("removes existing job, returns true", () => {
    createJob(tmp, AGENT, { id: "r1", cronJobId: "c", sessionId: "s", prompt: "p" });
    assert.equal(removeJob(tmp, AGENT, "r1"), true);
    assert.equal(getJob(tmp, AGENT, "r1"), null);
  });

  it("returns false for non-existent job", () => {
    assert.equal(removeJob(tmp, AGENT, "nope"), false);
  });
});
