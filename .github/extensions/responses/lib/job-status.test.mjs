import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

import { resolveJobStatus } from "./job-status.mjs";

function writeJson(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Helpers to build paths matching the module's expectations
function jobRegistryPath(extDir, agent, jobId) {
  return join(extDir, "data", agent, "bg-jobs", `${jobId}.json`);
}
function cronJobPath(extDir, agent, cronJobId) {
  return join(extDir, "..", "cron", "data", agent, "jobs", `${cronJobId}.json`);
}
function cronHistoryPath(extDir, agent, cronJobId) {
  return join(extDir, "..", "cron", "data", agent, "history", `${cronJobId}.json`);
}

function makeJob(overrides = {}) {
  return {
    id: "job-1",
    cronJobId: "cron-1",
    sessionId: "sess-1",
    prompt: "do stuff",
    status: "queued",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const AGENT = "test-agent";

describe("resolveJobStatus", () => {
  let tmpBase;
  let extDir;

  before(() => {
    tmpBase = mkdtempSync(join(tmpdir(), "job-status-"));
    extDir = join(tmpBase, "responses");
    mkdirSync(extDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("returns null when job doesn't exist in registry", () => {
    const result = resolveJobStatus(extDir, AGENT, "nonexistent");
    assert.equal(result, null);
  });

  it('returns "queued" when job exists but cron hasn\'t fired', () => {
    const job = makeJob({ id: "q1", cronJobId: "cron-q1" });
    writeJson(jobRegistryPath(extDir, AGENT, "q1"), job);
    writeJson(cronJobPath(extDir, AGENT, "cron-q1"), {
      status: "enabled",
      schedule: { type: "oneShot" },
    });

    const result = resolveJobStatus(extDir, AGENT, "q1");
    assert.equal(result.status, "queued");
    assert.ok(result.statusItems.some((s) => s.title === "Job Created"));
  });

  it('returns "running" when cron job has fired but no history', () => {
    const job = makeJob({ id: "r1", cronJobId: "cron-r1" });
    writeJson(jobRegistryPath(extDir, AGENT, "r1"), job);
    writeJson(cronJobPath(extDir, AGENT, "cron-r1"), {
      status: "disabled",
      schedule: { type: "oneShot" },
    });
    // no history file

    const result = resolveJobStatus(extDir, AGENT, "r1");
    assert.equal(result.status, "running");
  });

  it('returns "completed" when history has success outcome', () => {
    const job = makeJob({ id: "c1", cronJobId: "cron-c1" });
    writeJson(jobRegistryPath(extDir, AGENT, "c1"), job);
    writeJson(cronHistoryPath(extDir, AGENT, "cron-c1"), [
      { outcome: "success", completedAtUtc: "2025-01-01T01:00:00.000Z" },
    ]);

    const result = resolveJobStatus(extDir, AGENT, "c1");
    assert.equal(result.status, "completed");
    assert.ok(result.statusItems.some((s) => s.title === "Completed"));
  });

  it('returns "failed" when history has failure outcome', () => {
    const job = makeJob({ id: "f1", cronJobId: "cron-f1" });
    writeJson(jobRegistryPath(extDir, AGENT, "f1"), job);
    writeJson(cronHistoryPath(extDir, AGENT, "cron-f1"), [
      { outcome: "failure", errorMessage: "timeout", completedAtUtc: "2025-01-01T01:00:00.000Z" },
    ]);

    const result = resolveJobStatus(extDir, AGENT, "f1");
    assert.equal(result.status, "failed");
    const failItem = result.statusItems.find((s) => s.title === "Failed");
    assert.ok(failItem);
    assert.ok(failItem.description.includes("timeout"));
  });

  it('preserves "cancelled" status even if cron completed', () => {
    const job = makeJob({ id: "x1", cronJobId: "cron-x1", status: "cancelled" });
    writeJson(jobRegistryPath(extDir, AGENT, "x1"), job);
    writeJson(cronHistoryPath(extDir, AGENT, "cron-x1"), [
      { outcome: "success", completedAtUtc: "2025-01-01T01:00:00.000Z" },
    ]);

    const result = resolveJobStatus(extDir, AGENT, "x1");
    assert.equal(result.status, "cancelled");
  });

  it("syncs registry status when it drifts (side effect)", () => {
    const job = makeJob({ id: "d1", cronJobId: "cron-d1", status: "queued" });
    writeJson(jobRegistryPath(extDir, AGENT, "d1"), job);
    writeJson(cronHistoryPath(extDir, AGENT, "cron-d1"), [
      { outcome: "success", completedAtUtc: "2025-01-01T01:00:00.000Z" },
    ]);

    const result = resolveJobStatus(extDir, AGENT, "d1");
    assert.equal(result.status, "completed");

    // Re-read the registry file to confirm it was updated
    const updated = JSON.parse(readFileSync(jobRegistryPath(extDir, AGENT, "d1"), "utf-8"));
    assert.equal(updated.status, "completed");
  });

  it('does NOT override "cancelled" in registry', () => {
    const job = makeJob({ id: "nc1", cronJobId: "cron-nc1", status: "cancelled" });
    writeJson(jobRegistryPath(extDir, AGENT, "nc1"), job);
    writeJson(cronHistoryPath(extDir, AGENT, "cron-nc1"), [
      { outcome: "success", completedAtUtc: "2025-01-01T01:00:00.000Z" },
    ]);

    resolveJobStatus(extDir, AGENT, "nc1");

    const persisted = JSON.parse(readFileSync(jobRegistryPath(extDir, AGENT, "nc1"), "utf-8"));
    assert.equal(persisted.status, "cancelled");
  });

  it("statusItems are sorted by timestamp", () => {
    const job = makeJob({
      id: "s1",
      cronJobId: "cron-s1",
      createdAt: "2025-01-01T02:00:00.000Z",
    });
    writeJson(jobRegistryPath(extDir, AGENT, "s1"), job);
    writeJson(cronHistoryPath(extDir, AGENT, "cron-s1"), [
      { outcome: "success", completedAtUtc: "2025-01-01T01:00:00.000Z" },
    ]);

    const result = resolveJobStatus(extDir, AGENT, "s1");
    for (let i = 1; i < result.statusItems.length; i++) {
      assert.ok(
        result.statusItems[i - 1].timestamp <= result.statusItems[i].timestamp,
        `statusItems[${i - 1}].timestamp (${result.statusItems[i - 1].timestamp}) should be <= statusItems[${i}].timestamp (${result.statusItems[i].timestamp})`
      );
    }
  });

  it("merges progress file events into statusItems", () => {
    const job = makeJob({ id: "p1", cronJobId: "cron-p1" });
    writeJson(jobRegistryPath(extDir, AGENT, "p1"), job);
    writeJson(cronJobPath(extDir, AGENT, "cron-p1"), {
      status: "disabled",
      schedule: { type: "oneShot" },
    });

    // Write a progress JSONL file
    const progressPath = join(extDir, "data", AGENT, "bg-jobs", "p1.progress.jsonl");
    const lines = [
      JSON.stringify({ type: "tool_start", title: "Tool: grep", description: "searching", timestamp: "2025-01-01T00:00:02.000Z" }),
      JSON.stringify({ type: "tool_complete", title: "✓ grep", description: "found 5 matches", timestamp: "2025-01-01T00:00:03.000Z" }),
    ];
    writeFileSync(progressPath, lines.join("\n") + "\n");

    const result = resolveJobStatus(extDir, AGENT, "p1");
    assert.ok(result.statusItems.some((s) => s.title === "Tool: grep"), "should include tool_start from progress file");
    assert.ok(result.statusItems.some((s) => s.title === "✓ grep"), "should include tool_complete from progress file");
  });

  it("handles missing progress file gracefully", () => {
    const job = makeJob({ id: "np1", cronJobId: "cron-np1" });
    writeJson(jobRegistryPath(extDir, AGENT, "np1"), job);

    const result = resolveJobStatus(extDir, AGENT, "np1");
    assert.ok(result);
    assert.ok(Array.isArray(result.statusItems));
  });
});
