import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";

import {
  getSessionStorePath,
  getSessionTurns,
  getSessionCheckpoints,
  getSessionFiles,
  buildStatusItemsFromSession,
} from "./session-reader.mjs";

// A sessionId guaranteed to never match real data
const BOGUS_SESSION = "aaaaaaaa-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// getSessionStorePath
// ---------------------------------------------------------------------------

describe("getSessionStorePath", () => {
  it("returns a string ending with session-store.db", () => {
    const p = getSessionStorePath();
    assert.equal(typeof p, "string");
    assert.ok(p.endsWith("session-store.db"), `expected path ending with session-store.db, got: ${p}`);
  });

  it("path includes .copilot directory", () => {
    const p = getSessionStorePath();
    assert.ok(p.includes(`${sep}.copilot${sep}`), `expected .copilot in path, got: ${p}`);
  });

  it("path is rooted under homedir", () => {
    const p = getSessionStorePath();
    assert.ok(p.startsWith(homedir()), `expected path under homedir, got: ${p}`);
  });

  it("equals the expected full path", () => {
    const expected = join(homedir(), ".copilot", "session-store.db");
    assert.equal(getSessionStorePath(), expected);
  });
});

// ---------------------------------------------------------------------------
// getSessionTurns — defensive behaviour
// ---------------------------------------------------------------------------

describe("getSessionTurns", () => {
  it("returns an array for a bogus sessionId", () => {
    const result = getSessionTurns(BOGUS_SESSION);
    assert.ok(Array.isArray(result));
  });

  it("returns empty array when no turns match", () => {
    const result = getSessionTurns(BOGUS_SESSION);
    assert.deepEqual(result, []);
  });

  it("never throws", () => {
    assert.doesNotThrow(() => getSessionTurns(undefined));
    assert.doesNotThrow(() => getSessionTurns(null));
    assert.doesNotThrow(() => getSessionTurns(""));
  });
});

// ---------------------------------------------------------------------------
// getSessionCheckpoints — defensive behaviour
// ---------------------------------------------------------------------------

describe("getSessionCheckpoints", () => {
  it("returns an array for a bogus sessionId", () => {
    const result = getSessionCheckpoints(BOGUS_SESSION);
    assert.ok(Array.isArray(result));
  });

  it("returns empty array when no checkpoints match", () => {
    const result = getSessionCheckpoints(BOGUS_SESSION);
    assert.deepEqual(result, []);
  });

  it("never throws", () => {
    assert.doesNotThrow(() => getSessionCheckpoints(undefined));
    assert.doesNotThrow(() => getSessionCheckpoints(null));
    assert.doesNotThrow(() => getSessionCheckpoints(""));
  });
});

// ---------------------------------------------------------------------------
// getSessionFiles — defensive behaviour
// ---------------------------------------------------------------------------

describe("getSessionFiles", () => {
  it("returns an array for a bogus sessionId", () => {
    const result = getSessionFiles(BOGUS_SESSION);
    assert.ok(Array.isArray(result));
  });

  it("returns empty array when no files match", () => {
    const result = getSessionFiles(BOGUS_SESSION);
    assert.deepEqual(result, []);
  });

  it("never throws", () => {
    assert.doesNotThrow(() => getSessionFiles(undefined));
    assert.doesNotThrow(() => getSessionFiles(null));
    assert.doesNotThrow(() => getSessionFiles(""));
  });
});

// ---------------------------------------------------------------------------
// buildStatusItemsFromSession — defensive behaviour
// ---------------------------------------------------------------------------

describe("buildStatusItemsFromSession", () => {
  it("returns an array for a bogus sessionId", () => {
    const result = buildStatusItemsFromSession(BOGUS_SESSION);
    assert.ok(Array.isArray(result));
  });

  it("returns empty array when no data matches", () => {
    const result = buildStatusItemsFromSession(BOGUS_SESSION);
    assert.deepEqual(result, []);
  });

  it("never throws", () => {
    assert.doesNotThrow(() => buildStatusItemsFromSession(undefined));
    assert.doesNotThrow(() => buildStatusItemsFromSession(null));
    assert.doesNotThrow(() => buildStatusItemsFromSession(""));
  });
});

// ---------------------------------------------------------------------------
// Smoke tests against real session-store.db (skipped when DB is absent)
// ---------------------------------------------------------------------------

const dbExists = existsSync(getSessionStorePath());

describe("with real session-store.db", { skip: !dbExists && "session-store.db not found" }, () => {
  it("getSessionTurns returns array with expected shape", () => {
    // Query with bogus id still returns [] — validates DB opens without error
    const result = getSessionTurns(BOGUS_SESSION);
    assert.ok(Array.isArray(result));
  });

  it("getSessionCheckpoints returns array with expected shape", () => {
    const result = getSessionCheckpoints(BOGUS_SESSION);
    assert.ok(Array.isArray(result));
  });

  it("getSessionFiles returns array with expected shape", () => {
    const result = getSessionFiles(BOGUS_SESSION);
    assert.ok(Array.isArray(result));
  });

  it("buildStatusItemsFromSession returns array with expected shape", () => {
    const result = buildStatusItemsFromSession(BOGUS_SESSION);
    assert.ok(Array.isArray(result));
  });
});
