const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { compareSemver, diffRegistries, remove, pin, resolveChannel, migrateRegistry } = require("./upgrade.js");

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
    assert.equal(resolveChannel({ channel: "frontier" }), "frontier");
  });

  it("falls back to branch when channel is not set", () => {
    assert.equal(resolveChannel({ branch: "develop" }), "develop");
  });

  it("channel takes precedence over branch", () => {
    assert.equal(resolveChannel({ channel: "frontier", branch: "develop" }), "frontier");
  });
});

// ── diffRegistries — channel switching scenarios ─────────────────────────────

describe("diffRegistries — channel switching", () => {
  it("switching from main to frontier shows new items", () => {
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
    const frontierRemote = makeRemote({
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

    const result = diffRegistries(local, frontierRemote);

    // Everything from main should be current
    assert.equal(result.current.length, 4);
    // Insiders-only items should be new
    assert.equal(result.new.length, 3);
    const newNames = result.new.map((i) => i.name).sort();
    assert.deepEqual(newNames, ["agent-comms", "code-exec", "heartbeat"]);
    // Nothing removed
    assert.equal(result.removed.length, 0);
  });

  it("switching from frontier to main shows removable items", () => {
    const local = makeLocal({
      channel: "frontier",
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

// ── detectLayout ─────────────────────────────────────────────────────────────

const { detectLayout, mapPathToLocal } = require("./upgrade.js");

describe("detectLayout", () => {
  it("returns repo when .github/registry.json exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-test-"));
    const ghDir = path.join(root, ".github");
    fs.mkdirSync(ghDir, { recursive: true });
    fs.writeFileSync(path.join(ghDir, "registry.json"), "{}", "utf8");

    assert.equal(detectLayout(root), "repo");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns user when only registry.json exists at root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-test-"));
    fs.writeFileSync(path.join(root, "registry.json"), "{}", "utf8");

    assert.equal(detectLayout(root), "user");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("defaults to repo when no registry exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-test-"));

    assert.equal(detectLayout(root), "repo");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("prefers repo layout when both exist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-test-"));
    const ghDir = path.join(root, ".github");
    fs.mkdirSync(ghDir, { recursive: true });
    fs.writeFileSync(path.join(ghDir, "registry.json"), "{}", "utf8");
    fs.writeFileSync(path.join(root, "registry.json"), "{}", "utf8");

    assert.equal(detectLayout(root), "repo");
    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ── mapPathToLocal ───────────────────────────────────────────────────────────

describe("mapPathToLocal", () => {
  it("strips .github/ prefix for user layout", () => {
    assert.equal(mapPathToLocal(".github/extensions/cron", "user"), "extensions/cron");
  });

  it("strips .github/ prefix from nested paths for user layout", () => {
    assert.equal(mapPathToLocal(".github/skills/commit/SKILL.md", "user"), "skills/commit/SKILL.md");
  });

  it("passes through paths unchanged for repo layout", () => {
    assert.equal(mapPathToLocal(".github/extensions/cron", "repo"), ".github/extensions/cron");
  });

  it("handles paths without .github/ prefix in user layout", () => {
    assert.equal(mapPathToLocal("extensions/cron", "user"), "extensions/cron");
  });
});

// ── remove (user-level layout) ───────────────────────────────────────────────

function makeTempUserDir(registry, dirs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "user-upgrade-test-"));
  fs.writeFileSync(
    path.join(root, "registry.json"),
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

function readUserRegistry(root) {
  return JSON.parse(
    fs.readFileSync(path.join(root, "registry.json"), "utf8")
  );
}

describe("remove (user layout)", () => {
  it("deletes directory and removes from user-level registry", () => {
    const registry = {
      version: "0.1.0",
      source: "owner/repo",
      extensions: {
        cron: { version: "0.1.4", path: "extensions/cron", description: "Cron" },
        canvas: { version: "0.1.3", path: "extensions/canvas", description: "Canvas" },
      },
      skills: {},
    };
    const root = makeTempUserDir(registry, ["extensions/cron", "extensions/canvas"]);

    const result = remove(["cron"], root);

    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].name, "cron");
    assert.equal(result.errors.length, 0);
    assert.equal(result.registryUpdated, true);

    // Directory should be gone
    assert.equal(fs.existsSync(path.join(root, "extensions/cron")), false);
    // Canvas should still be there
    assert.equal(fs.existsSync(path.join(root, "extensions/canvas")), true);

    // Registry should be updated at root level (not .github/)
    const updated = readUserRegistry(root);
    assert.equal("cron" in (updated.extensions || {}), false);
    assert.equal("canvas" in (updated.extensions || {}), true);

    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ── pin (user-level layout) ─────────────────────────────────────────────────

describe("pin (user layout)", () => {
  it("sets local:true on item in user-level registry", () => {
    const registry = {
      version: "0.1.0",
      source: "owner/repo",
      extensions: {
        cron: { version: "0.1.4", path: "extensions/cron", description: "Cron" },
      },
      skills: {},
    };
    const root = makeTempUserDir(registry, ["extensions/cron"]);

    const result = pin(["cron"], root);

    assert.equal(result.pinned.length, 1);
    assert.equal(result.pinned[0].name, "cron");

    const updated = readUserRegistry(root);
    assert.equal(updated.extensions.cron.local, true);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("pinned user-level item shows as localOnly in diff", () => {
    const registry = {
      version: "0.1.0",
      source: "owner/repo",
      extensions: {
        cron: { version: "0.1.4", path: "extensions/cron", description: "Cron" },
      },
      skills: {},
    };
    const root = makeTempUserDir(registry, ["extensions/cron"]);

    pin(["cron"], root);

    const local = readUserRegistry(root);
    const remote = { version: "0.2.0", extensions: {}, skills: {} };
    const diff = diffRegistries(local, remote);

    assert.equal(diff.removed.length, 0);
    assert.equal(diff.localOnly.length, 1);
    assert.equal(diff.localOnly[0].name, "cron");

    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ── diffRegistries — promotion (package → template) ──────────────────────────

describe("diffRegistries — promotion", () => {
  it("detects promotion when local item has package field and remote has same name", () => {
    const local = makeLocal({
      extensions: {
        weather: {
          version: "0.1.0",
          path: ".github/extensions/weather",
          description: "Weather data",
          package: "acme/tools",
        },
      },
    });
    const remote = makeRemote({
      extensions: {
        weather: {
          version: "0.2.0",
          path: ".github/extensions/weather",
          description: "Weather data",
        },
      },
    });

    const diff = diffRegistries(local, remote);

    assert.equal(diff.promoted.length, 1);
    assert.equal(diff.promoted[0].name, "weather");
    assert.equal(diff.promoted[0].package, "acme/tools");
    assert.equal(diff.promoted[0].version, "0.2.0");
    assert.equal(diff.promoted[0].localVersion, "0.1.0");
    assert.equal(diff.new.length, 0);
    assert.equal(diff.updated.length, 0);
  });

  it("does not flag non-package items as promoted", () => {
    const local = makeLocal({
      extensions: {
        cron: {
          version: "0.1.0",
          path: ".github/extensions/cron",
          description: "Cron",
        },
      },
    });
    const remote = makeRemote({
      extensions: {
        cron: {
          version: "0.2.0",
          path: ".github/extensions/cron",
          description: "Cron",
        },
      },
    });

    const diff = diffRegistries(local, remote);

    assert.equal(diff.promoted.length, 0);
    assert.equal(diff.updated.length, 1);
  });

  it("treats package-installed items not in template as localOnly (not removed)", () => {
    const local = makeLocal({
      extensions: {
        weather: {
          version: "0.1.0",
          path: ".github/extensions/weather",
          description: "Weather",
          package: "acme/tools",
        },
      },
    });
    const remote = makeRemote({ extensions: {} });

    const diff = diffRegistries(local, remote);

    assert.equal(diff.removed.length, 0);
    assert.equal(diff.localOnly.length, 1);
    assert.equal(diff.localOnly[0].name, "weather");
  });
});

// ── promotion — registry cleanup ─────────────────────────────────────────────

describe("promotion — registry cleanup", () => {
  it("removes package field and cleans packages array on promotion", () => {
    const registry = {
      version: "0.14.0",
      source: "owner/repo",
      extensions: {
        weather: {
          version: "0.1.0",
          path: ".github/extensions/weather",
          description: "Weather",
          package: "acme/tools",
        },
        cron: {
          version: "0.1.0",
          path: ".github/extensions/cron",
          description: "Cron",
        },
      },
      skills: {},
      packages: [
        {
          source: "acme/tools",
          ref: "main",
          installed: {
            extensions: {
              weather: {
                version: "0.1.0",
                path: ".github/extensions/weather",
                description: "Weather",
              },
            },
            skills: {},
          },
        },
      ],
    };

    const root = makeTempRepo(registry, [".github/extensions/weather", ".github/extensions/cron"]);
    const local = readRegistry(root);
    const name = "weather";
    const type = "extensions";
    const pkgSource = local[type][name].package;

    // Simulate promotion: update entry without package field
    local[type][name] = {
      version: "0.2.0",
      path: ".github/extensions/weather",
      description: "Weather",
    };

    // Clean packages array (same logic as install)
    for (const pkg of local.packages) {
      if (pkg.source === pkgSource && pkg.installed) {
        const pkgType = pkg.installed[type];
        if (pkgType && pkgType[name]) {
          delete pkgType[name];
        }
      }
    }
    local.packages = local.packages.filter((pkg) => {
      if (!pkg.installed) return false;
      const exts = Object.keys(pkg.installed.extensions || {});
      const skills = Object.keys(pkg.installed.skills || {});
      return exts.length > 0 || skills.length > 0;
    });

    assert.equal(local.extensions.weather.package, undefined);
    assert.equal(local.extensions.weather.version, "0.2.0");
    assert.equal(local.packages.length, 0);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps package entry when other items remain after promotion", () => {
    const registry = {
      version: "0.14.0",
      source: "owner/repo",
      extensions: {
        weather: {
          version: "0.1.0",
          path: ".github/extensions/weather",
          description: "Weather",
          package: "acme/tools",
        },
        forecast: {
          version: "0.1.0",
          path: ".github/extensions/forecast",
          description: "Forecast",
          package: "acme/tools",
        },
      },
      skills: {},
      packages: [
        {
          source: "acme/tools",
          ref: "main",
          installed: {
            extensions: {
              weather: { version: "0.1.0", path: ".github/extensions/weather", description: "Weather" },
              forecast: { version: "0.1.0", path: ".github/extensions/forecast", description: "Forecast" },
            },
            skills: {},
          },
        },
      ],
    };

    const root = makeTempRepo(registry, [".github/extensions/weather", ".github/extensions/forecast"]);
    const local = readRegistry(root);

    const pkgSource = local.extensions.weather.package;
    local.extensions.weather = { version: "0.2.0", path: ".github/extensions/weather", description: "Weather" };

    for (const pkg of local.packages) {
      if (pkg.source === pkgSource && pkg.installed) {
        delete pkg.installed.extensions.weather;
      }
    }
    local.packages = local.packages.filter((pkg) => {
      if (!pkg.installed) return false;
      const exts = Object.keys(pkg.installed.extensions || {});
      const skills = Object.keys(pkg.installed.skills || {});
      return exts.length > 0 || skills.length > 0;
    });

    assert.equal(local.packages.length, 1);
    assert.equal(local.packages[0].installed.extensions.forecast.version, "0.1.0");
    assert.equal(local.packages[0].installed.extensions.weather, undefined);

    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ── migrateRegistry ──────────────────────────────────────────────────────────

describe("migrateRegistry", () => {
  it("assigns non-template items to package source", () => {
    const local = {
      version: "0.15.0",
      source: "ianphil/genesis",
      channel: "frontier",
      extensions: {
        cron: { version: "0.1.4", path: ".github/extensions/cron", description: "Cron" },
        heartbeat: { version: "0.1.2", path: ".github/extensions/heartbeat", description: "Heartbeat" },
        microui: { version: "0.1.0", path: ".github/extensions/microui", description: "MicroUI" },
      },
      skills: {
        commit: { version: "0.1.0", path: ".github/skills/commit", description: "Commit" },
        "agent-comms": { version: "0.1.0", path: ".github/skills/agent-comms", description: "Agent comms" },
      },
      packages: [],
    };
    const remote = {
      version: "0.15.0",
      source: "ianphil/genesis",
      extensions: {
        cron: { version: "0.1.4", path: ".github/extensions/cron", description: "Cron" },
      },
      skills: {
        commit: { version: "0.1.0", path: ".github/skills/commit", description: "Commit" },
      },
    };

    const { migrated, skipped } = migrateRegistry(local, remote, "ianphil/genesis-frontier");

    assert.equal(migrated.length, 3);
    const names = migrated.map((m) => m.name).sort();
    assert.deepEqual(names, ["agent-comms", "heartbeat", "microui"]);

    assert.equal(skipped.length, 2);
    assert.ok(skipped.every((s) => s.reason === "in_template"));

    // Verify package field was added
    assert.equal(local.extensions.heartbeat.package, "ianphil/genesis-frontier");
    assert.equal(local.extensions.microui.package, "ianphil/genesis-frontier");
    assert.equal(local.skills["agent-comms"].package, "ianphil/genesis-frontier");

    // Template items should NOT have package field
    assert.equal(local.extensions.cron.package, undefined);
    assert.equal(local.skills.commit.package, undefined);

    // Verify packages[] array was populated
    assert.equal(local.packages.length, 1);
    assert.equal(local.packages[0].source, "ianphil/genesis-frontier");
    assert.equal(local.packages[0].installed.extensions.heartbeat.version, "0.1.2");
    assert.equal(local.packages[0].installed.extensions.microui.version, "0.1.0");
    assert.equal(local.packages[0].installed.skills["agent-comms"].version, "0.1.0");
    assert.equal(local.packages[0].installed.extensions.cron, undefined);
  });

  it("skips pinned items", () => {
    const local = {
      version: "0.15.0",
      source: "ianphil/genesis",
      extensions: {
        custom: { version: "0.1.0", path: ".github/extensions/custom", description: "Custom", local: true },
      },
      skills: {},
      packages: [],
    };
    const remote = { version: "0.15.0", source: "ianphil/genesis", extensions: {}, skills: {} };

    const { migrated, skipped } = migrateRegistry(local, remote, "acme/pkg");

    assert.equal(migrated.length, 0);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].reason, "pinned");
    assert.equal(local.extensions.custom.package, undefined);
    assert.equal(local.extensions.custom.local, true);
  });

  it("skips items already owned by a package", () => {
    const local = {
      version: "0.15.0",
      source: "ianphil/genesis",
      extensions: {
        weather: { version: "0.1.0", path: ".github/extensions/weather", description: "Weather", package: "acme/tools" },
      },
      skills: {},
      packages: [{ source: "acme/tools", ref: "main", installed: { extensions: { weather: { version: "0.1.0" } }, skills: {} } }],
    };
    const remote = { version: "0.15.0", source: "ianphil/genesis", extensions: {}, skills: {} };

    const { migrated, skipped } = migrateRegistry(local, remote, "ianphil/genesis-frontier");

    assert.equal(migrated.length, 0);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].reason, "already_package");
    assert.equal(local.extensions.weather.package, "acme/tools");
  });

  it("returns empty when all items are in template", () => {
    const local = {
      version: "0.15.0",
      source: "ianphil/genesis",
      extensions: {
        cron: { version: "0.1.4", path: ".github/extensions/cron", description: "Cron" },
      },
      skills: {},
      packages: [],
    };
    const remote = {
      version: "0.15.0",
      source: "ianphil/genesis",
      extensions: {
        cron: { version: "0.1.4", path: ".github/extensions/cron", description: "Cron" },
      },
      skills: {},
    };

    const { migrated, skipped } = migrateRegistry(local, remote, "acme/pkg");

    assert.equal(migrated.length, 0);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].reason, "in_template");
    assert.equal(local.packages.length, 0);
  });

  it("appends to existing packages[] entry for same source", () => {
    const local = {
      version: "0.15.0",
      source: "ianphil/genesis",
      extensions: {
        heartbeat: { version: "0.1.2", path: ".github/extensions/heartbeat", description: "Heartbeat" },
      },
      skills: {
        "new-mind": { version: "0.1.0", path: ".github/skills/new-mind", description: "Bootstrap" },
      },
      packages: [
        {
          source: "ianphil/genesis-frontier",
          ref: "main",
          installed: {
            extensions: { tunnel: { version: "0.1.0", path: ".github/extensions/tunnel", description: "Tunnel" } },
            skills: {},
          },
        },
      ],
    };
    const remote = { version: "0.15.0", source: "ianphil/genesis", extensions: {}, skills: {} };

    const { migrated } = migrateRegistry(local, remote, "ianphil/genesis-frontier");

    assert.equal(migrated.length, 2);
    assert.equal(local.packages.length, 1);
    assert.equal(local.packages[0].installed.extensions.tunnel.version, "0.1.0");
    assert.equal(local.packages[0].installed.extensions.heartbeat.version, "0.1.2");
    assert.equal(local.packages[0].installed.skills["new-mind"].version, "0.1.0");
  });
});
