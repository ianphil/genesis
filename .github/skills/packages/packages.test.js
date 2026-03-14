const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  parsePackageSource,
  detectConflicts,
  mergeIntoTopLevel,
  removeFromTopLevel,
  buildListOutput,
  findInstalledPackage,
  compareSemver,
  remove,
  list,
} = require("./packages.js");

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeTempRepo(registry, dirs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "packages-test-"));
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

function makeBaseRegistry(overrides = {}) {
  return {
    version: "0.14.0",
    source: "ianphil/genesis",
    channel: "main",
    extensions: {},
    skills: {},
    packages: [],
    ...overrides,
  };
}

// ── parsePackageSource ────────────────────────────────────────────────────────

describe("parsePackageSource", () => {
  it("parses owner/repo without ref", () => {
    const result = parsePackageSource("someuser/cool-extensions");
    assert.equal(result.owner, "someuser");
    assert.equal(result.repo, "cool-extensions");
    assert.equal(result.ref, null);
  });

  it("parses owner/repo@ref", () => {
    const result = parsePackageSource("someuser/cool-extensions@v1.0.0");
    assert.equal(result.owner, "someuser");
    assert.equal(result.repo, "cool-extensions");
    assert.equal(result.ref, "v1.0.0");
  });

  it("parses owner/repo@branch-name", () => {
    const result = parsePackageSource("org/repo@feature/my-branch");
    assert.equal(result.owner, "org");
    assert.equal(result.repo, "repo");
    assert.equal(result.ref, "feature/my-branch");
  });

  it("throws on missing slash", () => {
    assert.throws(
      () => parsePackageSource("nodash"),
      /Invalid package source/
    );
  });

  it("throws on leading slash", () => {
    assert.throws(
      () => parsePackageSource("/repo"),
      /Invalid package source/
    );
  });

  it("throws on trailing slash", () => {
    assert.throws(
      () => parsePackageSource("owner/"),
      /Invalid package source/
    );
  });

  it("handles org with hyphens and dots", () => {
    const result = parsePackageSource("my-org/my.repo@v2.3.4");
    assert.equal(result.owner, "my-org");
    assert.equal(result.repo, "my.repo");
    assert.equal(result.ref, "v2.3.4");
  });
});

// ── compareSemver ─────────────────────────────────────────────────────────────

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  });

  it("returns 1 when a > b (major)", () => {
    assert.equal(compareSemver("2.0.0", "1.9.9"), 1);
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

// ── findInstalledPackage ──────────────────────────────────────────────────────

describe("findInstalledPackage", () => {
  it("returns null when packages array is empty", () => {
    const registry = makeBaseRegistry();
    assert.equal(findInstalledPackage(registry, "someuser/pkg"), null);
  });

  it("returns null when package is not found", () => {
    const registry = makeBaseRegistry({
      packages: [{ source: "other/pkg", ref: null, installed: { extensions: {}, skills: {} } }],
    });
    assert.equal(findInstalledPackage(registry, "someuser/pkg"), null);
  });

  it("returns the matching package entry", () => {
    const pkg = { source: "someuser/pkg", ref: "v1.0.0", installed: { extensions: {}, skills: {} } };
    const registry = makeBaseRegistry({ packages: [pkg] });
    assert.deepEqual(findInstalledPackage(registry, "someuser/pkg"), pkg);
  });

  it("matches by source only, ignoring ref", () => {
    const pkg = { source: "someuser/pkg", ref: "v1.0.0", installed: { extensions: {}, skills: {} } };
    const registry = makeBaseRegistry({ packages: [pkg] });
    // Same source regardless of ref
    assert.deepEqual(findInstalledPackage(registry, "someuser/pkg"), pkg);
  });
});

// ── detectConflicts ───────────────────────────────────────────────────────────

describe("detectConflicts", () => {
  it("returns empty array when no conflicts", () => {
    const registry = makeBaseRegistry({
      extensions: { cron: { version: "0.1.0", path: ".github/extensions/cron" } },
    });
    const incoming = { extensions: { weather: { version: "0.1.0" } }, skills: {} };
    const conflicts = detectConflicts(registry, incoming, "someuser/pkg");
    assert.equal(conflicts.length, 0);
  });

  it("detects conflict when template extension already exists", () => {
    const registry = makeBaseRegistry({
      extensions: { cron: { version: "0.1.0", path: ".github/extensions/cron" } },
    });
    const incoming = { extensions: { cron: { version: "0.2.0" } }, skills: {} };
    const conflicts = detectConflicts(registry, incoming, "someuser/pkg");
    assert.equal(conflicts.length, 1);
    assert.ok(conflicts[0].includes('"cron"'));
    assert.ok(conflicts[0].includes("ianphil/genesis"));
  });

  it("detects conflict when another package already installed the same item", () => {
    const registry = makeBaseRegistry({
      extensions: {
        weather: { version: "0.1.0", path: ".github/extensions/weather", package: "firstuser/pkg" },
      },
    });
    const incoming = { extensions: { weather: { version: "0.2.0" } }, skills: {} };
    const conflicts = detectConflicts(registry, incoming, "seconduser/other-pkg");
    assert.equal(conflicts.length, 1);
    assert.ok(conflicts[0].includes("firstuser/pkg"));
  });

  it("no conflict when updating an item from the same package", () => {
    const registry = makeBaseRegistry({
      extensions: {
        weather: { version: "0.1.0", path: ".github/extensions/weather", package: "someuser/pkg" },
      },
    });
    const incoming = { extensions: { weather: { version: "0.2.0" } }, skills: {} };
    const conflicts = detectConflicts(registry, incoming, "someuser/pkg");
    assert.equal(conflicts.length, 0);
  });

  it("detects conflicts in skills too", () => {
    const registry = makeBaseRegistry({
      skills: { "daily-report": { version: "0.1.0", path: ".github/skills/daily-report" } },
    });
    const incoming = {
      extensions: {},
      skills: { "daily-report": { version: "0.2.0" } },
    };
    const conflicts = detectConflicts(registry, incoming, "someuser/pkg");
    assert.equal(conflicts.length, 1);
    assert.ok(conflicts[0].includes('"daily-report"'));
  });

  it("detects multiple conflicts across types", () => {
    const registry = makeBaseRegistry({
      extensions: { cron: { version: "0.1.0", path: ".github/extensions/cron" } },
      skills: { commit: { version: "0.1.0", path: ".github/skills/commit" } },
    });
    const incoming = {
      extensions: { cron: { version: "0.2.0" } },
      skills: { commit: { version: "0.2.0" } },
    };
    const conflicts = detectConflicts(registry, incoming, "someuser/pkg");
    assert.equal(conflicts.length, 2);
  });
});

// ── mergeIntoTopLevel ─────────────────────────────────────────────────────────

describe("mergeIntoTopLevel", () => {
  it("adds extensions with package field", () => {
    const registry = makeBaseRegistry();
    const installed = {
      extensions: {
        weather: { version: "0.1.0", path: ".github/extensions/weather", description: "Weather" },
      },
      skills: {},
    };
    mergeIntoTopLevel(registry, "someuser/pkg", installed);
    assert.ok("weather" in registry.extensions);
    assert.equal(registry.extensions.weather.package, "someuser/pkg");
    assert.equal(registry.extensions.weather.version, "0.1.0");
  });

  it("adds skills with package field", () => {
    const registry = makeBaseRegistry();
    const installed = {
      extensions: {},
      skills: {
        "my-skill": { version: "0.2.0", path: ".github/skills/my-skill", description: "Skill" },
      },
    };
    mergeIntoTopLevel(registry, "someuser/pkg", installed);
    assert.ok("my-skill" in registry.skills);
    assert.equal(registry.skills["my-skill"].package, "someuser/pkg");
  });

  it("does not touch existing template items", () => {
    const registry = makeBaseRegistry({
      extensions: { cron: { version: "0.1.4", path: ".github/extensions/cron" } },
    });
    const installed = {
      extensions: {
        weather: { version: "0.1.0", path: ".github/extensions/weather", description: "Weather" },
      },
      skills: {},
    };
    mergeIntoTopLevel(registry, "someuser/pkg", installed);
    assert.ok(!registry.extensions.cron.package);
    assert.equal(registry.extensions.cron.version, "0.1.4");
  });
});

// ── removeFromTopLevel ────────────────────────────────────────────────────────

describe("removeFromTopLevel", () => {
  it("removes extension owned by the package", () => {
    const registry = makeBaseRegistry({
      extensions: {
        weather: { version: "0.1.0", package: "someuser/pkg" },
        cron: { version: "0.1.4" },
      },
    });
    removeFromTopLevel(registry, "someuser/pkg", ["weather"]);
    assert.ok(!("weather" in registry.extensions));
    assert.ok("cron" in registry.extensions);
  });

  it("does not remove items owned by other packages or template", () => {
    const registry = makeBaseRegistry({
      extensions: {
        weather: { version: "0.1.0", package: "someuser/pkg" },
        snow: { version: "0.1.0", package: "other/pkg" },
        cron: { version: "0.1.4" },
      },
    });
    removeFromTopLevel(registry, "someuser/pkg", ["weather", "snow", "cron"]);
    assert.ok(!("weather" in registry.extensions));
    assert.ok("snow" in registry.extensions);
    assert.ok("cron" in registry.extensions);
  });

  it("removes skill owned by the package", () => {
    const registry = makeBaseRegistry({
      skills: {
        "my-skill": { version: "0.1.0", package: "someuser/pkg" },
      },
    });
    removeFromTopLevel(registry, "someuser/pkg", ["my-skill"]);
    assert.ok(!("my-skill" in registry.skills));
  });
});

// ── buildListOutput ───────────────────────────────────────────────────────────

describe("buildListOutput", () => {
  it("returns empty array when no packages", () => {
    const registry = makeBaseRegistry();
    assert.deepEqual(buildListOutput(registry), []);
  });

  it("returns empty array when packages key is missing", () => {
    const registry = { version: "0.13.0", source: "ianphil/genesis", extensions: {}, skills: {} };
    assert.deepEqual(buildListOutput(registry), []);
  });

  it("formats a package with extensions and skills", () => {
    const registry = makeBaseRegistry({
      packages: [
        {
          source: "someuser/pkg",
          ref: "v1.0.0",
          installed: {
            extensions: {
              weather: { version: "0.1.0", description: "Weather lookups" },
            },
            skills: {
              "weather-query": { version: "0.1.0", description: "Ask about weather" },
            },
          },
        },
      ],
    });
    const result = buildListOutput(registry);
    assert.equal(result.length, 1);
    assert.equal(result[0].source, "someuser/pkg");
    assert.equal(result[0].ref, "v1.0.0");
    assert.equal(result[0].extensions.length, 1);
    assert.equal(result[0].extensions[0].name, "weather");
    assert.equal(result[0].skills.length, 1);
    assert.equal(result[0].skills[0].name, "weather-query");
  });

  it("sets ref to null when not present", () => {
    const registry = makeBaseRegistry({
      packages: [
        {
          source: "someuser/pkg",
          installed: { extensions: {}, skills: {} },
        },
      ],
    });
    const result = buildListOutput(registry);
    assert.equal(result[0].ref, null);
  });

  it("lists multiple packages", () => {
    const registry = makeBaseRegistry({
      packages: [
        { source: "user/pkg1", ref: null, installed: { extensions: {}, skills: {} } },
        { source: "user/pkg2", ref: "v2.0.0", installed: { extensions: {}, skills: {} } },
      ],
    });
    const result = buildListOutput(registry);
    assert.equal(result.length, 2);
    assert.equal(result[0].source, "user/pkg1");
    assert.equal(result[1].source, "user/pkg2");
  });
});

// ── remove (filesystem) ───────────────────────────────────────────────────────

describe("remove — filesystem", () => {
  let root;

  afterEach(() => {
    if (root && fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns error when package is not installed", () => {
    root = makeTempRepo(makeBaseRegistry());
    const result = remove("someuser/pkg", { root });
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].error.includes("not found"));
    assert.equal(result.removed.length, 0);
    assert.equal(result.registryUpdated, false);
  });

  it("removes an installed extension and updates registry", () => {
    const registry = makeBaseRegistry({
      extensions: {
        weather: { version: "0.1.0", path: ".github/extensions/weather", package: "someuser/pkg" },
      },
      packages: [
        {
          source: "someuser/pkg",
          ref: null,
          installed: {
            extensions: {
              weather: { version: "0.1.0", path: ".github/extensions/weather", description: "Weather" },
            },
            skills: {},
          },
        },
      ],
    });
    root = makeTempRepo(registry, [".github/extensions/weather"]);

    const result = remove("someuser/pkg", { root });

    assert.equal(result.errors.length, 0);
    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].name, "weather");
    assert.equal(result.registryUpdated, true);

    // Directory should be gone
    assert.ok(!fs.existsSync(path.join(root, ".github/extensions/weather")));

    // Registry should be cleaned up
    const updated = readRegistry(root);
    assert.ok(!("weather" in updated.extensions));
    assert.equal(updated.packages.length, 0);
  });

  it("removes a specific item when --items is specified", () => {
    const registry = makeBaseRegistry({
      extensions: {
        weather: { version: "0.1.0", path: ".github/extensions/weather", package: "someuser/pkg" },
        forecast: { version: "0.1.0", path: ".github/extensions/forecast", package: "someuser/pkg" },
      },
      packages: [
        {
          source: "someuser/pkg",
          ref: null,
          installed: {
            extensions: {
              weather: { version: "0.1.0", path: ".github/extensions/weather", description: "Weather" },
              forecast: { version: "0.1.0", path: ".github/extensions/forecast", description: "Forecast" },
            },
            skills: {},
          },
        },
      ],
    });
    root = makeTempRepo(registry, [
      ".github/extensions/weather",
      ".github/extensions/forecast",
    ]);

    const result = remove("someuser/pkg", { root, items: ["weather"] });

    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].name, "weather");

    // forecast should still be there
    assert.ok(fs.existsSync(path.join(root, ".github/extensions/forecast")));

    // Package entry should remain (still has forecast)
    const updated = readRegistry(root);
    assert.equal(updated.packages.length, 1);
    assert.ok("forecast" in updated.packages[0].installed.extensions);
    assert.ok(!("weather" in updated.extensions));
  });

  it("removes package entry entirely when all items are removed", () => {
    const registry = makeBaseRegistry({
      extensions: {
        weather: { version: "0.1.0", path: ".github/extensions/weather", package: "someuser/pkg" },
      },
      packages: [
        {
          source: "someuser/pkg",
          ref: null,
          installed: {
            extensions: {
              weather: { version: "0.1.0", path: ".github/extensions/weather", description: "Weather" },
            },
            skills: {},
          },
        },
      ],
    });
    root = makeTempRepo(registry, [".github/extensions/weather"]);

    remove("someuser/pkg", { root, items: ["weather"] });

    const updated = readRegistry(root);
    assert.equal(updated.packages.length, 0);
  });
});

// ── list (filesystem) ─────────────────────────────────────────────────────────

describe("list — filesystem", () => {
  let root;

  afterEach(() => {
    if (root && fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns empty array when no packages installed", () => {
    root = makeTempRepo(makeBaseRegistry());
    const result = list({ root });
    assert.deepEqual(result, []);
  });

  it("returns list of installed packages", () => {
    const registry = makeBaseRegistry({
      packages: [
        {
          source: "someuser/pkg",
          ref: "v1.0.0",
          installed: {
            extensions: {
              weather: { version: "0.1.0", description: "Weather" },
            },
            skills: {},
          },
        },
      ],
    });
    root = makeTempRepo(registry);
    const result = list({ root });
    assert.equal(result.length, 1);
    assert.equal(result[0].source, "someuser/pkg");
    assert.equal(result[0].extensions[0].name, "weather");
  });

  it("handles registry without packages key gracefully", () => {
    const registry = {
      version: "0.13.0",
      source: "ianphil/genesis",
      extensions: {},
      skills: {},
    };
    root = makeTempRepo(registry);
    const result = list({ root });
    assert.deepEqual(result, []);
  });
});
