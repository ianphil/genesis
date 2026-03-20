import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { initProgress, appendEvent } from "./progress-writer.mjs";

describe("progress-writer", () => {
  let tmpDir;
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pw-test-"));
  });
  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("initProgress", () => {
    it("creates an empty file", () => {
      const p = join(tmpDir, "init-test.jsonl");
      initProgress(p);
      assert.ok(existsSync(p));
      assert.equal(readFileSync(p, "utf-8"), "");
    });

    it("creates parent directories", () => {
      const p = join(tmpDir, "nested", "deep", "test.jsonl");
      initProgress(p);
      assert.ok(existsSync(p));
    });

    it("truncates an existing file", () => {
      const p = join(tmpDir, "trunc.jsonl");
      initProgress(p);
      appendEvent(p, { type: "test", title: "data" });
      assert.ok(readFileSync(p, "utf-8").length > 0);
      initProgress(p);
      assert.equal(readFileSync(p, "utf-8"), "");
    });
  });

  describe("appendEvent", () => {
    it("writes one JSON line", () => {
      const p = join(tmpDir, "single.jsonl");
      initProgress(p);
      appendEvent(p, { type: "tool_start", title: "Tool: grep", description: "searching" });
      const lines = readFileSync(p, "utf-8").trim().split("\n");
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.type, "tool_start");
      assert.equal(parsed.title, "Tool: grep");
      assert.equal(parsed.description, "searching");
      assert.ok(parsed.timestamp);
    });

    it("appends multiple lines", () => {
      const p = join(tmpDir, "multi.jsonl");
      initProgress(p);
      appendEvent(p, { type: "a", title: "first" });
      appendEvent(p, { type: "b", title: "second" });
      appendEvent(p, { type: "c", title: "third" });
      const lines = readFileSync(p, "utf-8").trim().split("\n");
      assert.equal(lines.length, 3);
      assert.equal(JSON.parse(lines[0]).title, "first");
      assert.equal(JSON.parse(lines[2]).title, "third");
    });

    it("includes detail when provided", () => {
      const p = join(tmpDir, "detail.jsonl");
      initProgress(p);
      appendEvent(p, {
        type: "tool_start",
        title: "Tool: grep",
        detail: { toolCallId: "tc_123", toolName: "grep" },
      });
      const parsed = JSON.parse(readFileSync(p, "utf-8").trim());
      assert.deepEqual(parsed.detail, { toolCallId: "tc_123", toolName: "grep" });
    });

    it("omits detail key when not provided", () => {
      const p = join(tmpDir, "no-detail.jsonl");
      initProgress(p);
      appendEvent(p, { type: "test", title: "no detail" });
      const parsed = JSON.parse(readFileSync(p, "utf-8").trim());
      assert.ok(!("detail" in parsed));
    });

    it("uses current time when timestamp not provided", () => {
      const p = join(tmpDir, "ts.jsonl");
      initProgress(p);
      const before = new Date().toISOString();
      appendEvent(p, { type: "test", title: "auto-ts" });
      const after = new Date().toISOString();
      const parsed = JSON.parse(readFileSync(p, "utf-8").trim());
      assert.ok(parsed.timestamp >= before && parsed.timestamp <= after);
    });

    it("uses provided timestamp when given", () => {
      const p = join(tmpDir, "custom-ts.jsonl");
      initProgress(p);
      appendEvent(p, { type: "test", title: "custom", timestamp: "2025-06-01T00:00:00Z" });
      const parsed = JSON.parse(readFileSync(p, "utf-8").trim());
      assert.equal(parsed.timestamp, "2025-06-01T00:00:00Z");
    });

    it("does not throw on invalid path", () => {
      assert.doesNotThrow(() => {
        appendEvent(join(tmpDir, "nonexistent", "dir", "file.jsonl"), {
          type: "test",
          title: "fail",
        });
      });
    });

    it("defaults description to empty string", () => {
      const p = join(tmpDir, "no-desc.jsonl");
      initProgress(p);
      appendEvent(p, { type: "test", title: "no desc" });
      const parsed = JSON.parse(readFileSync(p, "utf-8").trim());
      assert.equal(parsed.description, "");
    });
  });
});
