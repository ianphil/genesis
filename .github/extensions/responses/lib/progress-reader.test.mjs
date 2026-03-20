import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readProgressEvents } from "./progress-reader.mjs";

describe("readProgressEvents", () => {
  let tmpDir;
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pr-test-"));
  });
  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for missing file", () => {
    assert.deepEqual(readProgressEvents(join(tmpDir, "nope.jsonl")), []);
  });

  it("returns empty array for null/undefined path", () => {
    assert.deepEqual(readProgressEvents(null), []);
    assert.deepEqual(readProgressEvents(undefined), []);
    assert.deepEqual(readProgressEvents(""), []);
  });

  it("returns empty array for empty file", () => {
    const p = join(tmpDir, "empty.jsonl");
    writeFileSync(p, "", "utf-8");
    assert.deepEqual(readProgressEvents(p), []);
  });

  it("parses a single event line", () => {
    const p = join(tmpDir, "single.jsonl");
    writeFileSync(p, JSON.stringify({
      type: "tool_start",
      title: "Tool: grep",
      description: "searching src/",
      timestamp: "2025-01-15T12:00:00Z",
    }) + "\n", "utf-8");

    const items = readProgressEvents(p);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Tool: grep");
    assert.equal(items[0].description, "searching src/");
    assert.equal(items[0].timestamp, "2025-01-15T12:00:00Z");
  });

  it("parses multiple event lines", () => {
    const p = join(tmpDir, "multi.jsonl");
    const lines = [
      { type: "tool_start", title: "Tool: grep", description: "a", timestamp: "2025-01-15T12:00:01Z" },
      { type: "tool_complete", title: "✓ grep", description: "b", timestamp: "2025-01-15T12:00:02Z" },
      { type: "turn_end", title: "Agent turn completed", description: "", timestamp: "2025-01-15T12:00:03Z" },
    ];
    writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf-8");

    const items = readProgressEvents(p);
    assert.equal(items.length, 3);
    assert.equal(items[0].title, "Tool: grep");
    assert.equal(items[2].title, "Agent turn completed");
  });

  it("skips malformed lines gracefully", () => {
    const p = join(tmpDir, "malformed.jsonl");
    const content = [
      JSON.stringify({ type: "a", title: "good", timestamp: "2025-01-15T12:00:00Z" }),
      "this is not json",
      JSON.stringify({ type: "b", title: "also good", timestamp: "2025-01-15T12:00:01Z" }),
      "{incomplete json",
    ].join("\n") + "\n";
    writeFileSync(p, content, "utf-8");

    const items = readProgressEvents(p);
    assert.equal(items.length, 2);
    assert.equal(items[0].title, "good");
    assert.equal(items[1].title, "also good");
  });

  it("skips blank lines", () => {
    const p = join(tmpDir, "blanks.jsonl");
    const content = "\n" + JSON.stringify({ type: "a", title: "test", timestamp: "t" }) + "\n\n\n";
    writeFileSync(p, content, "utf-8");

    const items = readProgressEvents(p);
    assert.equal(items.length, 1);
  });

  it("defaults missing title to 'Progress'", () => {
    const p = join(tmpDir, "no-title.jsonl");
    writeFileSync(p, JSON.stringify({ type: "x", timestamp: "t" }) + "\n", "utf-8");

    const items = readProgressEvents(p);
    assert.equal(items[0].title, "Progress");
  });

  it("includes fullText when present in event", () => {
    const p = join(tmpDir, "fulltext.jsonl");
    writeFileSync(p, JSON.stringify({
      type: "tool_complete",
      title: "✓ grep",
      description: "short",
      timestamp: "t",
      fullText: "very long detailed output here",
    }) + "\n", "utf-8");

    const items = readProgressEvents(p);
    assert.equal(items[0].fullText, "very long detailed output here");
  });

  it("omits fullText key when not in event", () => {
    const p = join(tmpDir, "no-fulltext.jsonl");
    writeFileSync(p, JSON.stringify({
      type: "tool_start",
      title: "Tool: edit",
      timestamp: "t",
    }) + "\n", "utf-8");

    const items = readProgressEvents(p);
    assert.ok(!("fullText" in items[0]));
  });
});
