const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { compareSemver, diffRegistries, remove, pin, resolveChannel } = require("./upgrade.js");

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeTempRepo(registry, dirs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "upgrade-test-"));
  const ghDir = path.join(root, ".github");
  fs.mkdirSync(ghDir, { recursive: true });
  fs.writeFileSync(
    path.join(ghDir, "registry.json"),
    JSON.stringify(registry, null, 2),
    "utf8"
  );
  for (const dir of dirs) {
    const full = path.join(root, dir);
    fs.mkdirSync(full, { recursive: true });
    fs.writeFileSync(path.join(full, "index.js"), "// stub", "utf8");
  }
  return root;
}

function readRegistry(root) {
  return JSON.parse(
    fs.readFileSync(path.join(root, ".github", "registry.json"), "utf8")
  );
}

// ── compareSemver ────────────────────────────────────────────────────────────

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  });

  it("returns 1 when a > b (major)", () => {
    assert.equal(compareSemver("2.0.0", "1.0.0"), 1);
  });

  it("returns -1 when a < b (minor)", () => {
    assert.equal(compareSemver("1.0.0", "1.1.0"), -1);
  });

  it("returns 1 when a > b (patch)", () => {
    assert.equal(compareSemver("1.0.2", "1.0.1"), 1);
  });

  it("handles missing patch as 0", () => {
    assert.equal(compareSemver("1.0", "1.0.0"), 0);
  });
});

// ── diffRegistries — helpers ─────────────────────────────────────────────────

function makeLocal(overrides = {}) {
  return {
    version: "0.1.0",
    source: "owner/repo",
    extensions: {},
    skills: {},
    ...overrides,
  };
}

function makeRemote(overrides = {}) {
  return {
    version: "0.2.0",
    extensions: {},
    skills: {},
    ...overrides,
  };
}

// ── diffRegistries — current ─────────────────────────────────────────────────

describe("diffRegistries — current items", () => {
  it("identifies items at same version as current", () => {
    const local = makeLocal({
      extensions: {
        cron: { version: "0.1.0", path: ".github/extensions/cron", description: "Cron" },
      },
    });
    const remote = makeRemote({
      extensions: {
        cron: { version: "0.1.0", path: ".github/extensions/cron", description: "Cron" },
      },
    });
    const result = diffRegistries(local, remote);
    assert.equal(result.current.length, 1);
    assert.equal(result.current[0].name, "cron");
  });
});

// ── diffRegistries — new ─────────────────────────────────────────────────────

describe("diffRegistries — new items", () => {
  it("identifies items in remote but not local as new", () => {
    const local = makeLocal();
    const remote = makeRemote({
      skills: {
        "daily-report": { version: "0.1.0", path: ".github/skills/daily-report", description: "DR" },
      },
    });
    const result = diffRegistries(local, remote);
    assert.equal(result.new.length, 1);
    assert.equal(result.new[0].name, "daily-report");
    assert.equal(result.new[0].type, "skill");
  });
});

// ── diffRegistries — updated ─────────────────────────────────────────────────

describe("diffRegistries — updated items", () => {
  it("identifies items with higher remote version as updated", () => {
    const local = makeLocal({
      extensions: {
        cron: { version: "0.1.0", path: ".github/extensions/cron", description: "Cron" },
      },
    });
    const remote = makeRemote({
      extensions: {
        cron: { version: "0.2.0", path: ".github/extensions/cron", description: "Cron" },
      },
    });
    const result = diffRegistries(local, remote);
    assert.equal(result.updated.length, 1);
    assert.equal(result.updated[0].name, "cron");
    assert.equal(result.updated[0].localVersion, "0.1.0");
  });
});

// ── diffRegistries — renamed ─────────────────────────────────────────────────

describe("diffRegistries — renamed items", () => {
  it("detects rename when old name exists locally and renames map points to new name", () => {
    const local = makeLocal({
      extensions: {
        "code-exec": { version: "0.1.0", path: ".github/extensions/code-exec", description: "Old" },
      },
    });
    const remote = makeRemote({
      extensions: {
        bridge: { version: "0.2.0", path: ".github/extensions/bridge", description: "New" },
      },
      renames: { "code-exec": "bridge" },
    });
    const result = diffRegistries(local, remote);
    assert.equal(result.renamed.length, 1);
    assert.equal(result.renamed[0].oldName, "code-exec");
    assert.equal(result.renamed[0].newName, "bridge");
    // Old name should NOT appear in removed
    assert.equal(result.removed.length, 0);
  });
});

// ── diffRegistries — removed ─────────────────────────────────────────────────

describe("diffRegistries — removed items", () => {
  it("identifies items in local but not remote as removed", () => {
    const local = makeLocal({
      extensions: {
        tunnel: { version: "0.1.0", path: ".github/extensions/tunnel", description: "Tunnel" },
      },
    });
    const remote = makeRemote();
    const result = diffRegistries(local, remote);
    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].name, "tunnel");
    assert.equal(result.localOnly.length, 0);
  });

  it("does NOT flag pinned items as removed", () => {
    const local = makeLocal({
      extensions: {
        tunnel: { version: "0.1.0", path: ".github/extensions/tunnel", description: "Tunnel", local: true },
      },
    });
    const remote = makeRemote();
    const result = diffRegistries(local, remote);
    assert.equal(result.removed.length, 0);
    assert.equal(result.localOnly.length, 1);
    assert.equal(result.localOnly[0].name, "tunnel");
  });

  it("does NOT flag old rename names as removed", () => {
    const local = makeLocal({
      extensions: {
        "code-exec": { version: "0.1.0", path: ".github/extensions/code-exec", description: "Old" },
      },
    });
    const remote = makeRemote({
      extensions: {
        bridge: { version: "0.2.0", path: ".github/extensions/bridge", description: "New" },
      },
      renames: { "code-exec": "bridge" },
    });
    const result = diffRegistries(local, remote);
    assert.equal(result.removed.length, 0);
  });
});

// ── diffRegistries — mixed scenario ──────────────────────────────────────────

describe("diffRegistries — mixed scenario", () => {
  it("correctly categorizes a complex registry diff", () => {
    const local = makeLocal({
      version: "0.5.0",
      extensions: {
        cron: { version: "0.1.0", path: ".github/extensions/cron", description: "Cron" },
        tunnel: { version: "0.1.0", path: ".github/extensions/tunnel", description: "Tunnel" },
        canvas: { version: "0.1.0", path: ".github/extensions/canvas", description: "Canvas" },
        "code-exec": { version: "0.1.0", path: ".github/extensions/code-exec", description: "Old" },
        custom: { version: "0.1.0", path: ".github/extensions/custom", description: "Custom", local: true },
      },
      skills: {},
    });
    const remote = makeRemote({
      version: "0.6.0",
      extensions: {
        cron: { version: "0.1.0", path: ".github/extensions/cron", description: "Cron" },
        canvas: { version: "0.2.0", path: ".github/extensions/canvas", description: "Canvas v2" },
        bridge: { version: "0.2.0", path: ".github/extensions/bridge", description: "Bridge" },
        newext: { version: "0.1.0", path: ".github/extensions/newext", description: "New Extension" },
      },
      skills: {},
      renames: { "code-exec": "bridge" },
    });

    const result = diffRegistries(local, remote);

    // cron 0.1.0 == 0.1.0 → current
    assert.equal(result.current.length, 1);
    assert.equal(result.current[0].name, "cron");

    // canvas 0.1.0 < 0.2.0 → updated
    assert.equal(result.updated.length, 1);
    assert.equal(result.updated[0].name, "canvas");

    // code-exec → bridge → renamed
    assert.equal(result.renamed.length, 1);
    assert.equal(result.renamed[0].oldName, "code-exec");
    assert.equal(result.renamed[0].newName, "bridge");

    // newext not in local → new
    assert.equal(result.new.length, 1);
    assert.equal(result.new[0].name, "newext");

    // tunnel in local, not in remote, not pinned → removed
    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].name, "tunnel");

    // custom is pinned (local: true) → localOnly
    assert.equal(result.localOnly.length, 1);
    assert.equal(result.localOnly[0].name, "custom");
  });
});

// ── remove ───────────────────────────────────────────────────────────────────

describe("remove", () => {
  it("deletes directory and removes from registry", () => {
    const registry = {
      version: "0.1.0",
      source: "owner/repo",
      extensions: {
        tunnel: { version: "0.1.0", path: ".github/extensions/tunnel", description: "Tunnel" },
        cron: { version: "0.1.0", path: ".github/extensions/cron", description: "Cron" },
      },
      skills: {},
    };
    const root = makeTempRepo(registry, [".github/extensions/tunnel", ".github/extensions/cron"]);

    const result = remove(["tunnel"], root);

    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].name, "tunnel");
    assert.equal(result.errors.length, 0);
    assert.equal(result.registryUpdated, true);

    // Directory should be gone
    assert.equal(fs.existsSync(path.join(root, ".github/extensions/tunnel")), false);
    // Cron should still be there
    assert.equal(fs.existsSync(path.join(root, ".github/extensions/cron")), true);

    // Registry should be updated
    const updated = readRegistry(root);
    assert.equal("tunnel" in (updated.extensions || {}), false);
    assert.equal("cron" in (updated.extensions || {}), true);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("removes a skill", () => {
    const registry = {
      version: "0.1.0",
      source: "owner/repo",
      extensions: {},
      skills: {
        commit: { version: "0.1.0", path: ".github/skills/commit", description: "Commit" },
      },
    };
    const root = makeTempRepo(registry, [".github/skills/commit"]);

    const result = remove(["commit"], root);

    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].type, "skill");
    assert.equal(fs.existsSync(path.join(root, ".github/skills/commit")), false);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns error for unknown item", () => {
    const registry = { version: "0.1.0", source: "owner/repo", extensions: {}, skills: {} };
    const root = makeTempRepo(registry);

    const result = remove(["nonexistent"], root);

    assert.equal(result.removed.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.registryUpdated, false);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("handles multiple removals at once", () => {
    const registry = {
      version: "0.1.0",
      source: "owner/repo",
      extensions: {
        a: { version: "0.1.0", path: ".github/extensions/a", description: "A" },
        b: { version: "0.1.0", path: ".github/extensions/b", description: "B" },
      },
      skills: {},
    };
    const root = makeTempRepo(registry, [".github/extensions/a", ".github/extensions/b"]);

    const result = remove(["a", "b"], root);

    assert.equal(result.removed.length, 2);
    assert.equal(fs.existsSync(path.join(root, ".github/extensions/a")), false);
    assert.equal(fs.existsSync(path.join(root, ".github/extensions/b")), false);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rolls back staged directory removals if registry write fails", () => {
    const registry = {
      version: "0.1.0",
      source: "owner/repo",
      extensions: {
        tunnel: { version: "0.1.0", path: ".github/extensions/tunnel", description: "Tunnel" },
      },
      skills: {},
    };
    const root = makeTempRepo(registry, [".github/extensions/tunnel"]);
    const registryPath = path.join(root, ".github", "registry.json");
    const originalWriteFileSync = fs.writeFileSync;

    fs.writeFileSync = function (...args) {
      if (args[0] === registryPath) {
        throw new Error("disk full");
      }
      return originalWriteFileSync.apply(this, args);
    };

    try {
      const result = remove(["tunnel"], root);

      assert.equal(result.removed.length, 0);
      assert.equal(result.registryUpdated, false);
      assert.equal(result.errors.length, 1);
      assert.match(result.errors[0].error, /Failed to update registry: disk full/);
      assert.equal(fs.existsSync(path.join(root, ".github/extensions/tunnel")), true);

      const updated = readRegistry(root);
      assert.equal("tunnel" in (updated.extensions || {}), true);
    } finally {
      fs.writeFileSync = originalWriteFileSync;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── pin ──────────────────────────────────────────────────────────────────────

describe("pin", () => {
  it("sets local:true on the item in registry", () => {
    const registry = {
      version: "0.1.0",
      source: "owner/repo",
      extensions: {
        tunnel: { version: "0.1.0", path: ".github/extensions/tunnel", description: "Tunnel" },
      },
      skills: {},
    };
    const root = makeTempRepo(registry, [".github/extensions/tunnel"]);

    const result = pin(["tunnel"], root);

    assert.equal(result.pinned.length, 1);
    assert.equal(result.pinned[0].name, "tunnel");
    assert.equal(result.errors.length, 0);

    // Registry should have local: true
    const updated = readRegistry(root);
    assert.equal(updated.extensions.tunnel.local, true);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns error for unknown item", () => {
    const registry = { version: "0.1.0", source: "owner/repo", extensions: {}, skills: {} };
    const root = makeTempRepo(registry);

    const result = pin(["nonexistent"], root);

    assert.equal(result.pinned.length, 0);
    assert.equal(result.errors.length, 1);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("pinned item is then skipped by diffRegistries as localOnly", () => {
    const registry = {
      version: "0.1.0",
      source: "owner/repo",
      extensions: {
        tunnel: { version: "0.1.0", path: ".github/extensions/tunnel", description: "Tunnel" },
      },
      skills: {},
    };
    const root = makeTempRepo(registry, [".github/extensions/tunnel"]);

    // Pin it
    pin(["tunnel"], root);

    // Now diff — tunnel should be localOnly, not removed
    const local = readRegistry(root);
    const remote = { version: "0.2.0", extensions: {}, skills: {} };
    const diff = diffRegistries(local, remote);

    assert.equal(diff.removed.length, 0);
    assert.equal(diff.localOnly.length, 1);
    assert.equal(diff.localOnly[0].name, "tunnel");

    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ── resolveChannel ───────────────────────────────────────────────────────────

describe("resolveChannel", () => {
  it("defaults to main when no channel or branch set", () => {
    assert.equal(resolveChannel({ version: "0.1.0", source: "o/r" }), "main");
  });

  it("returns channel when set", () => {
    assert.equal(resolveChannel({ channel: "insiders" }), "insiders");
  });

  it("falls back to branch when channel is not set", () => {
    assert.equal(resolveChannel({ branch: "develop" }), "develop");
  });

  it("channel takes precedence over branch", () => {
    assert.equal(resolveChannel({ channel: "insiders", branch: "develop" }), "insiders");
  });
});

// ── diffRegistries — channel switching scenarios ─────────────────────────────

describe("diffRegistries — channel switching", () => {
  it("switching from main to insiders shows new items", () => {
    const local = makeLocal({
      channel: "main",
      extensions: {
        cron: { version: "0.1.4", path: ".github/extensions/cron", description: "Cron" },
        canvas: { version: "0.1.3", path: ".github/extensions/canvas", description: "Canvas" },
      },
      skills: {
        commit: { version: "0.1.0", path: ".github/skills/commit", description: "Commit" },
        upgrade: { version: "0.4.0", path: ".github/skills/upgrade", description: "Upgrade" },
      },
    });
    const insidersRemote = makeRemote({
      extensions: {
        cron: { version: "0.1.4", path: ".github/extensions/cron", description: "Cron" },
        canvas: { version: "0.1.3", path: ".github/extensions/canvas", description: "Canvas" },
        heartbeat: { version: "0.1.2", path: ".github/extensions/heartbeat", description: "Heartbeat" },
        "code-exec": { version: "0.1.2", path: ".github/extensions/code-exec", description: "Code Exec" },
      },
      skills: {
        commit: { version: "0.1.0", path: ".github/skills/commit", description: "Commit" },
        upgrade: { version: "0.4.0", path: ".github/skills/upgrade", description: "Upgrade" },
        "agent-comms": { version: "0.1.0", path: ".github/skills/agent-comms", description: "Agent Comms" },
      },
    });

    const result = diffRegistries(local, insidersRemote);

    // Everything from main should be current
    assert.equal(result.current.length, 4);
    // Insiders-only items should be new
    assert.equal(result.new.length, 3);
    const newNames = result.new.map((i) => i.name).sort();
    assert.deepEqual(newNames, ["agent-comms", "code-exec", "heartbeat"]);
    // Nothing removed
    assert.equal(result.removed.length, 0);
  });

  it("switching from insiders to main shows removable items", () => {
    const local = makeLocal({
      channel: "insiders",
      extensions: {
        cron: { version: "0.1.4", path: ".github/extensions/cron", description: "Cron" },
        canvas: { version: "0.1.3", path: ".github/extensions/canvas", description: "Canvas" },
        heartbeat: { version: "0.1.2", path: ".github/extensions/heartbeat", description: "Heartbeat" },
        "code-exec": { version: "0.1.2", path: ".github/extensions/code-exec", description: "Code Exec" },
      },
      skills: {
        commit: { version: "0.1.0", path: ".github/skills/commit", description: "Commit" },
        upgrade: { version: "0.4.0", path: ".github/skills/upgrade", description: "Upgrade" },
        "agent-comms": { version: "0.1.0", path: ".github/skills/agent-comms", description: "Agent Comms" },
      },
    });
    const mainRemote = makeRemote({
      extensions: {
        cron: { version: "0.1.4", path: ".github/extensions/cron", description: "Cron" },
        canvas: { version: "0.1.3", path: ".github/extensions/canvas", description: "Canvas" },
      },
      skills: {
        commit: { version: "0.1.0", path: ".github/skills/commit", description: "Commit" },
        upgrade: { version: "0.4.0", path: ".github/skills/upgrade", description: "Upgrade" },
      },
    });

    const result = diffRegistries(local, mainRemote);

    // Main items should be current
    assert.equal(result.current.length, 4);
    // Insiders-only items should be flagged as removed
    assert.equal(result.removed.length, 3);
    const removedNames = result.removed.map((i) => i.name).sort();
    assert.deepEqual(removedNames, ["agent-comms", "code-exec", "heartbeat"]);
    // Nothing new
    assert.equal(result.new.length, 0);
  });
});
