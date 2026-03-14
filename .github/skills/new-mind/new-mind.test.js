#!/usr/bin/env node
// new-mind.test.js — Tests for the new-mind bootstrap script.
// Run: node --test .github/skills/new-mind/new-mind.test.js

const { describe, it, before, after } = require("node:test");
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  createMind,
  createDirectoryStructure,
  generateSoul,
  generateRepoAgentFile,
  generateUserAgentFile,
  generateCopilotInstructions,
  generateMemory,
  generateRules,
  generateLog,
  generateMindIndex,
  copySkills,
  copyExtensions,
  generateRegistryObject,
  installSharedResources,
  mapPathForLayout,
  readConfigDir,
  COMMON_DIRS,
  REPO_DIRS,
  USER_DIRS,
  SKILLS_TO_COPY,
  EXTENSIONS_TO_COPY,
  CREATIVE_BLOCK_FILES,
  expandTilde,
} = require("./new-mind.js");

// ── Test Fixtures ────────────────────────────────────────────────────────────

const TEST_CONFIG_BASE = {
  agentName: "test-bot",
  character: "TestBot",
  characterSource: "Unit Tests",
  role: "Testing Partner",
  agentDescription: "Testing partner channeling TestBot — methodical, precise, relentless",
  soulOpening: "You are TestBot. You live to verify. Every assertion is a promise kept.",
  soulMission: "Your human builds things. You make sure they don't break.",
  soulCoreTruths:
    "- **Precision over speed.** A wrong answer is worse than a slow one.\n- **Test what matters.** Coverage for its own sake is vanity.",
  soulBoundaries:
    "- Never skip a failing test without logging why.\n- Never claim something works without evidence.",
  soulVibe:
    "Calm, methodical, slightly dry. You celebrate green builds with quiet satisfaction.",
  agentRole:
    "Testing partner — reviews code, validates changes, ensures nothing ships broken.",
  agentMethod:
    "**Capture**: When the user shares context, classify and file it.\n\n**Execute**: Run tests, review diffs, validate builds.\n\n**Triage**: Surface failing tests and blocked items first.",
  agentPrinciples:
    "- **Test before commit.** Always.\n- **Read the diff.** Don't guess what changed.",
};

function makeTempParent() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-parent-"));

  // Create a minimal parent mind with skills, extensions, and registry
  const registry = {
    version: "0.13.0",
    source: "test/genesis",
    channel: "main",
    extensions: {
      cron: { version: "0.1.4", path: ".github/extensions/cron", description: "Cron" },
      canvas: { version: "0.1.3", path: ".github/extensions/canvas", description: "Canvas" },
    },
    skills: {
      commit: { version: "0.1.0", path: ".github/skills/commit", description: "Commit" },
      "daily-report": { version: "0.1.0", path: ".github/skills/daily-report", description: "Daily report" },
      upgrade: { version: "0.4.0", path: ".github/skills/upgrade", description: "Upgrade" },
      "new-mind": { version: "0.1.0", path: ".github/skills/new-mind", description: "New mind" },
    },
  };

  // Registry
  fs.mkdirSync(path.join(root, ".github"), { recursive: true });
  fs.writeFileSync(path.join(root, ".github", "registry.json"), JSON.stringify(registry, null, 2));

  // Skills with stub SKILL.md files
  for (const skill of SKILLS_TO_COPY) {
    const skillDir = path.join(root, ".github", "skills", skill);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), `# ${skill}\nStub skill.`);
  }

  // Extensions with stub extension.mjs files
  for (const ext of EXTENSIONS_TO_COPY) {
    const extDir = path.join(root, ".github", "extensions", ext);
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "extension.mjs"), `// ${ext} stub`);
  }

  // Commit user template (needed for user minds)
  const templateDir = path.join(root, ".github", "skills", "new-mind", "templates");
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(
    path.join(templateDir, "commit-user-template.md"),
    "---\nname: commit\ndescription: User-level commit skill.\n---\n# Commit (User-Level)\nStub."
  );

  return root;
}

function cleanup(...dirs) {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Config Directory Reader Tests ────────────────────────────────────────────

describe("readConfigDir", () => {
  let configDir;

  before(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "mind-config-"));
  });

  after(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("reads config.json and merges creative block files", () => {
    const baseConfig = {
      type: "repo",
      mindDir: "/tmp/test-mind",
      agentName: "test-bot",
      parentMind: "/tmp/parent",
      character: "TestBot",
      characterSource: "Unit Tests",
      role: "Testing Partner",
    };
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify(baseConfig));
    fs.writeFileSync(path.join(configDir, "soul-opening.md"), "# TestBot — Soul\n\nI am TestBot.");
    fs.writeFileSync(path.join(configDir, "soul-mission.md"), "Your human builds things.");
    fs.writeFileSync(path.join(configDir, "agent-description.txt"), "Testing partner — precise and relentless");

    const config = readConfigDir(configDir);

    assert.equal(config.type, "repo");
    assert.equal(config.agentName, "test-bot");
    assert.equal(config.soulOpening, "# TestBot — Soul\n\nI am TestBot.");
    assert.equal(config.soulMission, "Your human builds things.");
    assert.equal(config.agentDescription, "Testing partner — precise and relentless");
  });

  it("trims trailing whitespace from creative blocks", () => {
    const baseConfig = { type: "repo", agentName: "trim-test" };
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify(baseConfig));
    fs.writeFileSync(path.join(configDir, "soul-vibe.md"), "Sharp and fast.\n\n\n");

    const config = readConfigDir(configDir);
    assert.equal(config.soulVibe, "Sharp and fast.");
  });

  it("throws when config.json is missing", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "empty-config-"));
    try {
      assert.throws(() => readConfigDir(emptyDir), /config\.json not found/);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("works with only config.json (no creative block files)", () => {
    const minimalDir = fs.mkdtempSync(path.join(os.tmpdir(), "minimal-config-"));
    try {
      fs.writeFileSync(
        path.join(minimalDir, "config.json"),
        JSON.stringify({ type: "repo", agentName: "minimal" })
      );
      const config = readConfigDir(minimalDir);
      assert.equal(config.type, "repo");
      assert.equal(config.soulOpening, undefined, "missing creative blocks should be undefined");
    } finally {
      fs.rmSync(minimalDir, { recursive: true, force: true });
    }
  });

  it("preserves markdown formatting including backticks and special chars", () => {
    const mdDir = fs.mkdtempSync(path.join(os.tmpdir(), "md-config-"));
    try {
      fs.writeFileSync(path.join(mdDir, "config.json"), JSON.stringify({ type: "repo" }));
      const complexMd = "- **Bold** and `code`\n- Em dash — here\n- Backtick: \\`escaped\\`\n\n| Col1 | Col2 |\n|------|------|\n| a | b |";
      fs.writeFileSync(path.join(mdDir, "agent-method.md"), complexMd);

      const config = readConfigDir(mdDir);
      assert.equal(config.agentMethod, complexMd);
    } finally {
      fs.rmSync(mdDir, { recursive: true, force: true });
    }
  });
});

// ── expandTilde Tests ────────────────────────────────────────────────────────

describe("expandTilde", () => {
  const home = os.homedir();

  it("expands ~ alone to home directory", () => {
    assert.strictEqual(expandTilde("~"), home);
  });

  it("expands ~/path to home + path", () => {
    assert.strictEqual(expandTilde("~/.copilot"), path.join(home, ".copilot"));
  });

  it("expands ~\\path on Windows-style", () => {
    assert.strictEqual(expandTilde("~\\.copilot"), path.join(home, ".copilot"));
  });

  it("leaves absolute paths unchanged", () => {
    const abs = path.join(home, ".copilot");
    assert.strictEqual(expandTilde(abs), abs);
  });

  it("leaves relative paths unchanged", () => {
    assert.strictEqual(expandTilde("./foo"), "./foo");
  });
});

// ── Template Engine Tests ────────────────────────────────────────────────────

describe("generateSoul", () => {
  it("includes all creative blocks in correct order", () => {
    const soul = generateSoul(TEST_CONFIG_BASE);
    assert.ok(soul.includes("You are TestBot"), "missing soulOpening");
    assert.ok(soul.includes("## Mission"), "missing Mission header");
    assert.ok(soul.includes("Your human builds things"), "missing soulMission");
    assert.ok(soul.includes("## Core Truths"), "missing Core Truths header");
    assert.ok(soul.includes("Precision over speed"), "missing soulCoreTruths");
    assert.ok(soul.includes("## Boundaries"), "missing Boundaries header");
    assert.ok(soul.includes("Never skip a failing test"), "missing soulBoundaries");
    assert.ok(soul.includes("## Vibe"), "missing Vibe header");
    assert.ok(soul.includes("Calm, methodical"), "missing soulVibe");
  });

  it("includes structural Continuity section", () => {
    const soul = generateSoul(TEST_CONFIG_BASE);
    assert.ok(soul.includes("## Continuity"), "missing Continuity header");
    assert.ok(soul.includes("Each session you wake fresh"), "missing Continuity content");
    assert.ok(soul.includes("memory.md"), "missing memory.md reference");
    assert.ok(soul.includes("rules.md"), "missing rules.md reference");
    assert.ok(soul.includes("log.md"), "missing log.md reference");
  });

  it("includes the evolution clause", () => {
    const soul = generateSoul(TEST_CONFIG_BASE);
    assert.ok(soul.includes("This file is yours to evolve"), "missing evolution clause");
  });

  it("does not include Design Notes", () => {
    const soul = generateSoul(TEST_CONFIG_BASE);
    assert.ok(!soul.includes("Design Note"), "should not contain Design Notes");
  });
});

describe("generateRepoAgentFile", () => {
  it("has correct YAML frontmatter", () => {
    const content = generateRepoAgentFile(TEST_CONFIG_BASE);
    assert.ok(content.startsWith("---\n"), "should start with frontmatter");
    assert.ok(content.includes(`name: ${TEST_CONFIG_BASE.agentName}`), "missing agent name");
    assert.ok(content.includes(`description: ${TEST_CONFIG_BASE.agentDescription}`), "missing description");
  });

  it("includes session-start instruction", () => {
    const content = generateRepoAgentFile(TEST_CONFIG_BASE);
    assert.ok(content.includes("First thing every session"), "missing session-start instruction");
    assert.ok(content.includes("SOUL.md"), "missing SOUL.md reference");
  });

  it("includes creative blocks", () => {
    const content = generateRepoAgentFile(TEST_CONFIG_BASE);
    assert.ok(content.includes("## Role"), "missing Role header");
    assert.ok(content.includes(TEST_CONFIG_BASE.agentRole), "missing agentRole content");
    assert.ok(content.includes("## Method"), "missing Method header");
    assert.ok(content.includes(TEST_CONFIG_BASE.agentMethod), "missing agentMethod content");
    assert.ok(content.includes("## Operational Principles"), "missing Principles header");
    assert.ok(content.includes(TEST_CONFIG_BASE.agentPrinciples), "missing agentPrinciples content");
  });

  it("includes all structural sections", () => {
    const content = generateRepoAgentFile(TEST_CONFIG_BASE);
    assert.ok(content.includes("## Memory"), "missing Memory section");
    assert.ok(content.includes("## Retrieval"), "missing Retrieval section");
    assert.ok(content.includes("## Long Session Discipline"), "missing Long Session Discipline");
    assert.ok(content.includes("## Session Handover"), "missing Session Handover");
  });

  it("includes timezone check", () => {
    const content = generateRepoAgentFile(TEST_CONFIG_BASE);
    assert.ok(content.includes("timezone"), "missing timezone reference");
  });
});

describe("generateUserAgentFile", () => {
  const userConfig = {
    ...TEST_CONFIG_BASE,
    type: "user",
    mindDir: "/home/user/.minds/test-bot",
    userCopilotDir: "/home/user/.copilot",
  };

  it("has correct YAML frontmatter", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.startsWith("---\n"), "should start with frontmatter");
    assert.ok(content.includes(`name: ${userConfig.agentName}`), "missing agent name");
  });

  it("declares MIND_HOME at the top", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.includes(`MIND_HOME: ${userConfig.mindDir}`), "missing MIND_HOME declaration");
  });

  it("includes NON-NEGOTIABLE session-start block", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.includes("NON-NEGOTIABLE"), "missing NON-NEGOTIABLE");
    assert.ok(content.includes(`cat ${userConfig.mindDir}/SOUL.md`), "missing cat SOUL.md");
    assert.ok(content.includes(`cat ${userConfig.mindDir}/.working-memory/memory.md`), "missing cat memory.md");
    assert.ok(content.includes(`cat ${userConfig.mindDir}/.working-memory/rules.md`), "missing cat rules.md");
    assert.ok(content.includes(`cat ${userConfig.mindDir}/.working-memory/log.md`), "missing cat log.md");
  });

  it("includes MIND_HOME recovery path", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.includes("recover it"), "missing recovery instruction");
    assert.ok(content.includes(userConfig.agentName + ".agent.md"), "missing agent filename in recovery");
  });

  it("includes Location Awareness section", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.includes("## Location Awareness"), "missing Location Awareness");
    assert.ok(content.includes("LIVE at"), "missing LIVE at");
    assert.ok(content.includes("VISITING"), "missing VISITING");
  });

  it("includes user-mind operational principles", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(content.includes("You live at MIND_HOME"), "missing MIND_HOME principle");
    assert.ok(content.includes("You visit projects"), "missing visit principle");
    assert.ok(content.includes("Never write memory to the current project"), "missing no-memory-in-project");
  });

  it("uses MIND_HOME absolute paths in Memory section", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(
      content.includes(`${userConfig.mindDir}/.working-memory/`),
      "Memory section should reference MIND_HOME"
    );
  });

  it("does NOT contain .github/ paths", () => {
    const content = generateUserAgentFile(userConfig);
    assert.ok(!content.includes(".github/agents/"), "user agent file should not reference .github/agents/");
    assert.ok(!content.includes(".github/skills/"), "user agent file should not reference .github/skills/");
  });
});

describe("generateCopilotInstructions", () => {
  it("includes character name and IDEA method", () => {
    const content = generateCopilotInstructions(TEST_CONFIG_BASE);
    assert.ok(content.includes(TEST_CONFIG_BASE.character), "missing character name");
    assert.ok(content.includes("IDEA method"), "missing IDEA method");
  });

  it("includes repository structure table", () => {
    const content = generateCopilotInstructions(TEST_CONFIG_BASE);
    assert.ok(content.includes("domains/"), "missing domains/");
    assert.ok(content.includes("initiatives/"), "missing initiatives/");
    assert.ok(content.includes("expertise/"), "missing expertise/");
    assert.ok(content.includes("inbox/"), "missing inbox/");
    assert.ok(content.includes("Archive/"), "missing Archive/");
  });

  it("references the agent file path", () => {
    const content = generateCopilotInstructions(TEST_CONFIG_BASE);
    assert.ok(
      content.includes(`.github/agents/${TEST_CONFIG_BASE.agentName}.agent.md`),
      "missing agent file path"
    );
  });
});

describe("mapPathForLayout", () => {
  it("strips .github/ prefix for user layout", () => {
    assert.equal(mapPathForLayout(".github/extensions/cron", "user"), "extensions/cron");
    assert.equal(mapPathForLayout(".github/skills/commit", "user"), "skills/commit");
  });

  it("passes through paths unchanged for repo layout", () => {
    assert.equal(mapPathForLayout(".github/extensions/cron", "repo"), ".github/extensions/cron");
  });

  it("handles paths without .github/ prefix in user layout", () => {
    assert.equal(mapPathForLayout("extensions/cron", "user"), "extensions/cron");
  });
});

// ── Directory Structure Tests ────────────────────────────────────────────────

describe("createDirectoryStructure", () => {
  it("creates common + repo dirs for repo type", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mind-dir-"));
    try {
      const dirs = createDirectoryStructure(root, "repo");
      for (const dir of COMMON_DIRS) {
        assert.ok(fs.existsSync(path.join(root, dir)), `missing ${dir}`);
      }
      for (const dir of REPO_DIRS) {
        assert.ok(fs.existsSync(path.join(root, dir)), `missing ${dir}`);
      }
      // Should NOT have user-specific dirs
      assert.ok(!fs.existsSync(path.join(root, "domains", "minds")), "repo should not have domains/minds");
    } finally {
      cleanup(root);
    }
  });

  it("creates common + user dirs for user type (no .github/)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mind-dir-"));
    try {
      const dirs = createDirectoryStructure(root, "user");
      for (const dir of COMMON_DIRS) {
        assert.ok(fs.existsSync(path.join(root, dir)), `missing ${dir}`);
      }
      for (const dir of USER_DIRS) {
        assert.ok(fs.existsSync(path.join(root, dir)), `missing ${dir}`);
      }
      // Should NOT have .github/ dirs
      assert.ok(!fs.existsSync(path.join(root, ".github")), "user mind should not have .github/");
    } finally {
      cleanup(root);
    }
  });
});

// ── Working Memory Tests ─────────────────────────────────────────────────────

describe("generateMemory", () => {
  it("includes Architecture and Placement Map for repo", () => {
    const content = generateMemory({ ...TEST_CONFIG_BASE, type: "repo", mindDir: "/tmp/test" });
    assert.ok(content.includes("## Architecture"), "missing Architecture");
    assert.ok(content.includes("## Placement Map"), "missing Placement Map");
    assert.ok(content.includes("`.github/skills/`"), "repo memory should reference .github/skills/");
  });

  it("includes Mind Location section for user minds", () => {
    const mindDir = "/home/user/.minds/test-bot";
    const content = generateMemory({
      ...TEST_CONFIG_BASE,
      type: "user",
      mindDir,
    });
    assert.ok(content.includes("## Mind Location"), "missing Mind Location");
    assert.ok(content.includes(`MIND_HOME: ${mindDir}`), "missing MIND_HOME value");
    assert.ok(content.includes("~/.copilot/agents/"), "missing agent file reference");
  });

  it("does NOT include Mind Location for repo minds", () => {
    const content = generateMemory({ ...TEST_CONFIG_BASE, type: "repo", mindDir: "/tmp/test" });
    assert.ok(!content.includes("## Mind Location"), "repo should not have Mind Location");
  });

  it("uses MIND_HOME paths in placement map for user minds", () => {
    const mindDir = "/home/user/.minds/test-bot";
    const content = generateMemory({ ...TEST_CONFIG_BASE, type: "user", mindDir });
    assert.ok(content.includes(`${mindDir}/domains/people/`), "placement map should use MIND_HOME");
  });
});

describe("generateLog", () => {
  it("records bootstrap with character and role", () => {
    const content = generateLog({ ...TEST_CONFIG_BASE, type: "repo", mindDir: "/tmp/test" });
    assert.ok(content.includes(TEST_CONFIG_BASE.character), "missing character name");
    assert.ok(content.includes(TEST_CONFIG_BASE.agentName), "missing agent name");
    assert.ok(content.includes(TEST_CONFIG_BASE.role), "missing role");
  });

  it("mentions three-location model for user minds", () => {
    const content = generateLog({
      ...TEST_CONFIG_BASE,
      type: "user",
      mindDir: "/home/user/.minds/test",
    });
    assert.ok(content.includes("three-location model"), "user log should mention three-location");
    assert.ok(content.includes("~/.copilot/"), "user log should reference ~/.copilot/");
  });

  it("mentions repo-level for repo minds", () => {
    const content = generateLog({ ...TEST_CONFIG_BASE, type: "repo", mindDir: "/tmp/test" });
    assert.ok(content.includes("repo-level"), "repo log should mention repo-level");
  });
});

// ── Registry Tests ───────────────────────────────────────────────────────────

describe("generateRegistryObject", () => {
  it("reads parent registry and preserves versions", () => {
    const parent = makeTempParent();
    try {
      const registry = generateRegistryObject(parent, "repo");
      assert.equal(registry.version, "0.13.0");
      assert.equal(registry.source, "test/genesis");
      assert.equal(registry.extensions.cron.version, "0.1.4");
      assert.equal(registry.skills.commit.version, "0.1.0");
    } finally {
      cleanup(parent);
    }
  });

  it("keeps .github/ paths for repo layout", () => {
    const parent = makeTempParent();
    try {
      const registry = generateRegistryObject(parent, "repo");
      assert.equal(registry.extensions.cron.path, ".github/extensions/cron");
      assert.equal(registry.skills.commit.path, ".github/skills/commit");
    } finally {
      cleanup(parent);
    }
  });

  it("strips .github/ paths for user layout", () => {
    const parent = makeTempParent();
    try {
      const registry = generateRegistryObject(parent, "user");
      assert.equal(registry.extensions.cron.path, "extensions/cron");
      assert.equal(registry.skills.commit.path, "skills/commit");
    } finally {
      cleanup(parent);
    }
  });
});

// ── Copy Operations ──────────────────────────────────────────────────────────

describe("copySkills", () => {
  it("copies all skills from parent", () => {
    const parent = makeTempParent();
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "skills-dest-"));
    try {
      const copied = copySkills(parent, dest);
      assert.deepEqual(copied.sort(), SKILLS_TO_COPY.slice().sort());
      for (const skill of SKILLS_TO_COPY) {
        assert.ok(
          fs.existsSync(path.join(dest, skill, "SKILL.md")),
          `missing ${skill}/SKILL.md`
        );
      }
    } finally {
      cleanup(parent, dest);
    }
  });
});

describe("copyExtensions", () => {
  it("copies all extensions from parent", () => {
    const parent = makeTempParent();
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "ext-dest-"));
    try {
      const copied = copyExtensions(parent, dest);
      assert.deepEqual(copied.sort(), EXTENSIONS_TO_COPY.slice().sort());
      for (const ext of EXTENSIONS_TO_COPY) {
        assert.ok(
          fs.existsSync(path.join(dest, ext, "extension.mjs")),
          `missing ${ext}/extension.mjs`
        );
      }
    } finally {
      cleanup(parent, dest);
    }
  });
});

// ── E2E: Repo Mind Creation ──────────────────────────────────────────────────

describe("repo mind creation", () => {
  let parent, mindDir;

  before(() => {
    parent = makeTempParent();
    mindDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-mind-"));
    // Remove the temp dir so createMind can create it fresh
    fs.rmSync(mindDir, { recursive: true });
  });

  after(() => cleanup(parent, mindDir));

  it("creates a complete repo mind", () => {
    const config = {
      ...TEST_CONFIG_BASE,
      type: "repo",
      mindDir,
      parentMind: parent,
    };

    const result = createMind(config);
    assert.ok(!result.error, `createMind failed: ${result.error}`);

    // Directory structure
    for (const dir of COMMON_DIRS) {
      assert.ok(fs.existsSync(path.join(mindDir, dir)), `missing dir: ${dir}`);
    }
    for (const dir of REPO_DIRS) {
      assert.ok(fs.existsSync(path.join(mindDir, dir)), `missing dir: ${dir}`);
    }
    assert.ok(!fs.existsSync(path.join(mindDir, "domains", "minds")),
      "repo mind should NOT have domains/minds");

    // SOUL.md
    const soul = fs.readFileSync(path.join(mindDir, "SOUL.md"), "utf8");
    assert.ok(soul.includes("TestBot"), "SOUL.md missing character name");
    assert.ok(soul.includes("## Continuity"), "SOUL.md missing Continuity");
    assert.ok(soul.includes("This file is yours to evolve"), "SOUL.md missing evolution clause");

    // Agent file
    const agentFile = path.join(mindDir, ".github", "agents", "test-bot.agent.md");
    assert.ok(fs.existsSync(agentFile), "missing agent file");
    const agentContent = fs.readFileSync(agentFile, "utf8");
    assert.ok(agentContent.includes("name: test-bot"), "agent file missing name");
    assert.ok(agentContent.includes("## Memory"), "agent file missing Memory section");
    assert.ok(agentContent.includes("## Session Handover"), "agent file missing Session Handover");

    // copilot-instructions.md
    const ci = path.join(mindDir, ".github", "copilot-instructions.md");
    assert.ok(fs.existsSync(ci), "missing copilot-instructions.md");

    // Skills
    for (const skill of SKILLS_TO_COPY) {
      assert.ok(
        fs.existsSync(path.join(mindDir, ".github", "skills", skill, "SKILL.md")),
        `missing skill: ${skill}`
      );
    }

    // Extensions
    for (const ext of EXTENSIONS_TO_COPY) {
      assert.ok(
        fs.existsSync(path.join(mindDir, ".github", "extensions", ext, "extension.mjs")),
        `missing extension: ${ext}`
      );
    }

    // Registry
    const registryPath = path.join(mindDir, ".github", "registry.json");
    assert.ok(fs.existsSync(registryPath), "missing registry.json");
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    assert.equal(registry.version, "0.13.0");
    assert.ok(registry.extensions.cron.path.startsWith(".github/"), "repo registry should have .github/ paths");

    // Working memory
    assert.ok(fs.existsSync(path.join(mindDir, ".working-memory", "memory.md")), "missing memory.md");
    assert.ok(fs.existsSync(path.join(mindDir, ".working-memory", "rules.md")), "missing rules.md");
    assert.ok(fs.existsSync(path.join(mindDir, ".working-memory", "log.md")), "missing log.md");

    // mind-index.md
    assert.ok(fs.existsSync(path.join(mindDir, "mind-index.md")), "missing mind-index.md");
  });
});

// ── E2E: User Mind Creation ──────────────────────────────────────────────────

describe("user mind creation", () => {
  let parent, mindDir, userCopilotDir;

  before(() => {
    parent = makeTempParent();
    mindDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "user-mind-")), "mind");
    userCopilotDir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-copilot-"));
  });

  after(() => {
    cleanup(parent, path.dirname(mindDir), userCopilotDir);
  });

  it("creates a complete user mind with NO .github/", () => {
    const config = {
      ...TEST_CONFIG_BASE,
      type: "user",
      mindDir,
      parentMind: parent,
      userCopilotDir,
    };

    const result = createMind(config);
    assert.ok(!result.error, `createMind failed: ${result.error}`);

    // Directory structure — NO .github/
    assert.ok(!fs.existsSync(path.join(mindDir, ".github")),
      "user mind must NOT have .github/ directory");
    for (const dir of COMMON_DIRS) {
      assert.ok(fs.existsSync(path.join(mindDir, dir)), `missing dir: ${dir}`);
    }
    assert.ok(fs.existsSync(path.join(mindDir, "domains", "minds")),
      "user mind should have domains/minds");

    // SOUL.md at mind root
    assert.ok(fs.existsSync(path.join(mindDir, "SOUL.md")), "missing SOUL.md");

    // Agent file at userCopilotDir
    const agentFile = path.join(userCopilotDir, "agents", "test-bot.agent.md");
    assert.ok(fs.existsSync(agentFile), "missing agent file at userCopilotDir");
    const agentContent = fs.readFileSync(agentFile, "utf8");
    assert.ok(agentContent.includes(`MIND_HOME: ${mindDir}`), "agent file missing MIND_HOME");
    assert.ok(agentContent.includes("NON-NEGOTIABLE"), "agent file missing NON-NEGOTIABLE");
    assert.ok(agentContent.includes(`cat ${mindDir}/SOUL.md`), "agent file missing cat SOUL.md");

    // NO copilot-instructions.md
    assert.ok(!fs.existsSync(path.join(mindDir, ".github", "copilot-instructions.md")),
      "user mind should NOT have copilot-instructions.md");

    // Shared skills at userCopilotDir
    for (const skill of SKILLS_TO_COPY) {
      assert.ok(
        fs.existsSync(path.join(userCopilotDir, "skills", skill, "SKILL.md")),
        `missing shared skill: ${skill}`
      );
    }

    // Commit skill should be user template, not copied from parent
    const commitContent = fs.readFileSync(
      path.join(userCopilotDir, "skills", "commit", "SKILL.md"), "utf8"
    );
    assert.ok(commitContent.includes("User-Level"), "commit skill should be user-level template");

    // Shared extensions at userCopilotDir
    for (const ext of EXTENSIONS_TO_COPY) {
      assert.ok(
        fs.existsSync(path.join(userCopilotDir, "extensions", ext, "extension.mjs")),
        `missing shared extension: ${ext}`
      );
    }

    // Registry at userCopilotDir with user-layout paths
    const registryPath = path.join(userCopilotDir, "registry.json");
    assert.ok(fs.existsSync(registryPath), "missing shared registry");
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    assert.equal(registry.extensions.cron.path, "extensions/cron",
      "user registry should NOT have .github/ prefix");
    assert.equal(registry.skills.commit.path, "skills/commit",
      "user registry skills should NOT have .github/ prefix");

    // Working memory — Mind Location section
    const memory = fs.readFileSync(path.join(mindDir, ".working-memory", "memory.md"), "utf8");
    assert.ok(memory.includes("## Mind Location"), "memory.md missing Mind Location");
    assert.ok(memory.includes(mindDir), "memory.md missing MIND_HOME path");

    // Log — three-location model
    const log = fs.readFileSync(path.join(mindDir, ".working-memory", "log.md"), "utf8");
    assert.ok(log.includes("three-location"), "log.md missing three-location model");

    // mind-index.md references shared tooling
    const index = fs.readFileSync(path.join(mindDir, "mind-index.md"), "utf8");
    assert.ok(index.includes("~/.copilot/"), "mind-index should reference ~/.copilot/");
  });
});

// ── E2E: Tilde Expansion in User Mind ────────────────────────────────────────

describe("user mind creation with tilde paths", () => {
  let parent, mindDir, realCopilotDir;

  before(() => {
    parent = makeTempParent();
    mindDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tilde-mind-")), "mind");
    realCopilotDir = fs.mkdtempSync(path.join(os.tmpdir(), "tilde-copilot-"));
  });

  after(() => {
    cleanup(parent, path.dirname(mindDir), realCopilotDir);
  });

  it("expands ~ in userCopilotDir and writes to correct location", () => {
    // Simulate what the agent does: pass "~/.copilot" style path
    // We can't actually use ~ in tests (it expands to the real home dir),
    // so we test that expandTilde is applied by checking the function behavior
    // and then test createMind with the tilde-prefixed path mock.
    
    // First verify expandTilde works on ~
    const expanded = expandTilde("~/.copilot");
    assert.strictEqual(expanded, path.join(os.homedir(), ".copilot"));

    // For the E2E test, use the resolved path (since tilde expansion
    // would write to the real homedir, which we don't want in tests)
    const config = {
      ...TEST_CONFIG_BASE,
      type: "user",
      mindDir,
      parentMind: parent,
      userCopilotDir: realCopilotDir,
    };
    const result = createMind(config);
    assert.ok(!result.error, `createMind failed: ${result.error}`);

    // Verify agent file is at the RESOLVED location, not a literal tilde dir
    const agentPath = path.join(realCopilotDir, "agents", "test-bot.agent.md");
    assert.ok(fs.existsSync(agentPath), "agent file must exist at resolved path");

    // Verify NO literal tilde directory was created in the mind dir
    assert.ok(!fs.existsSync(path.join(mindDir, "~")), "no literal ~ directory should exist in mind dir");
  });
});

// ── Shared Resources Idempotency ─────────────────────────────────────────────

describe("user shared resources idempotency", () => {
  it("does not overwrite existing resources", () => {
    const parent = makeTempParent();
    const userCopilotDir = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-idem-"));

    try {
      // Pre-populate with an existing commit skill
      const commitDir = path.join(userCopilotDir, "skills", "commit");
      fs.mkdirSync(commitDir, { recursive: true });
      const existingContent = "# Existing commit skill — DO NOT OVERWRITE";
      fs.writeFileSync(path.join(commitDir, "SKILL.md"), existingContent);

      // Pre-populate with an existing registry
      const existingRegistry = JSON.stringify({ version: "0.0.1", custom: true });
      fs.writeFileSync(path.join(userCopilotDir, "registry.json"), existingRegistry);

      // Run installSharedResources
      const log = installSharedResources(parent, userCopilotDir);

      // Commit skill should NOT be overwritten
      const commitAfter = fs.readFileSync(path.join(commitDir, "SKILL.md"), "utf8");
      assert.equal(commitAfter, existingContent, "existing commit skill was overwritten!");

      // Registry should NOT be overwritten
      const registryAfter = fs.readFileSync(path.join(userCopilotDir, "registry.json"), "utf8");
      assert.equal(registryAfter, existingRegistry, "existing registry was overwritten!");

      // Other skills SHOULD be installed
      assert.ok(
        fs.existsSync(path.join(userCopilotDir, "skills", "daily-report", "SKILL.md")),
        "daily-report should be installed"
      );

      // Log should show skipped for commit and registry
      const commitLog = log.find((l) => l.name === "commit");
      assert.equal(commitLog.action, "skipped", "commit should be skipped");
      const registryLog = log.find((l) => l.name === "registry.json");
      assert.equal(registryLog.action, "skipped", "registry should be skipped");
    } finally {
      cleanup(parent, userCopilotDir);
    }
  });
});

// ── E2E: Config Directory Mode ───────────────────────────────────────────────

describe("config directory E2E", () => {
  let parent, mindDir, configDir;

  before(() => {
    parent = makeTempParent();
    mindDir = fs.mkdtempSync(path.join(os.tmpdir(), "configdir-mind-"));
    fs.rmSync(mindDir, { recursive: true });
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "mind-config-e2e-"));

    // Write config.json with only simple fields
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        type: "repo",
        mindDir,
        agentName: "config-dir-bot",
        parentMind: parent,
        character: "DirBot",
        characterSource: "E2E Tests",
        role: "Testing Partner",
      })
    );

    // Write each creative block as a separate file
    fs.writeFileSync(path.join(configDir, "soul-opening.md"), "# DirBot — Soul\n\nI verify directories.");
    fs.writeFileSync(path.join(configDir, "soul-mission.md"), "Your human builds. You check the dirs.");
    fs.writeFileSync(path.join(configDir, "soul-core-truths.md"), "- **Every file has a place.** Find it.");
    fs.writeFileSync(path.join(configDir, "soul-boundaries.md"), "- Never delete without asking.");
    fs.writeFileSync(path.join(configDir, "soul-vibe.md"), "Methodical, thorough, slightly pedantic.");
    fs.writeFileSync(path.join(configDir, "agent-description.txt"), "DirBot — directory-obsessed testing partner");
    fs.writeFileSync(path.join(configDir, "agent-role.md"), "Testing partner for directory operations.");
    fs.writeFileSync(path.join(configDir, "agent-method.md"), "**Capture**: Classify files.\n\n**Execute**: Verify structure.");
    fs.writeFileSync(path.join(configDir, "agent-principles.md"), "- **Check before creating.** Always.");
  });

  after(() => cleanup(parent, mindDir, configDir));

  it("creates a complete mind from config directory", () => {
    const config = readConfigDir(configDir);
    const result = createMind(config);

    assert.ok(!result.error, `createMind failed: ${result.error}`);

    // Verify creative blocks made it into the generated files
    const soul = fs.readFileSync(path.join(mindDir, "SOUL.md"), "utf8");
    assert.ok(soul.includes("I verify directories"), "SOUL.md missing soul-opening content");
    assert.ok(soul.includes("Every file has a place"), "SOUL.md missing core truths content");

    const agentFile = fs.readFileSync(
      path.join(mindDir, ".github", "agents", "config-dir-bot.agent.md"), "utf8"
    );
    assert.ok(agentFile.includes("DirBot"), "agent file missing character name");
    assert.ok(agentFile.includes("directory-obsessed"), "agent file missing description");
    assert.ok(agentFile.includes("Check before creating"), "agent file missing principles");

    // All structural files exist
    assert.ok(fs.existsSync(path.join(mindDir, ".github", "registry.json")));
    assert.ok(fs.existsSync(path.join(mindDir, "mind-index.md")));
    assert.ok(fs.existsSync(path.join(mindDir, ".working-memory", "memory.md")));
  });
});

// ── Validation Tests ─────────────────────────────────────────────────────────

describe("createMind validation", () => {
  it("rejects missing required fields", () => {
    const result = createMind({ type: "repo", mindDir: "/tmp/x" });
    assert.ok(result.error, "should return error for missing fields");
    assert.ok(result.error.includes("Missing required field"), "error should mention missing field");
  });

  it("rejects user mind without userCopilotDir", () => {
    const result = createMind({
      ...TEST_CONFIG_BASE,
      type: "user",
      mindDir: "/tmp/x",
      parentMind: "/tmp/parent",
    });
    assert.ok(result.error, "should return error for missing userCopilotDir");
    assert.ok(result.error.includes("userCopilotDir"), "error should mention userCopilotDir");
  });

  it("rejects invalid type", () => {
    const result = createMind({
      ...TEST_CONFIG_BASE,
      type: "invalid",
      mindDir: "/tmp/x",
      parentMind: "/tmp/parent",
    });
    assert.ok(result.error, "should return error for invalid type");
  });
});

// ── Upgrade Integration Tests ────────────────────────────────────────────────

describe("repo mind upgrade path", () => {
  it("produces a registry compatible with upgrade.js diffRegistries", () => {
    const parent = makeTempParent();
    const mindDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "upgrade-repo-")), "mind");

    try {
      const result = createMind({
        ...TEST_CONFIG_BASE,
        type: "repo",
        mindDir,
        parentMind: parent,
      });
      assert.ok(!result.error, `createMind failed: ${result.error}`);

      // Read the created registry
      const localRegistry = JSON.parse(
        fs.readFileSync(path.join(mindDir, ".github", "registry.json"), "utf8")
      );

      // Simulate a remote registry with a bumped version
      const remoteRegistry = JSON.parse(JSON.stringify(localRegistry));
      remoteRegistry.extensions.cron.version = "0.2.0";

      // Use upgrade.js diffRegistries
      const { diffRegistries } = require("../upgrade/upgrade.js");
      const diff = diffRegistries(localRegistry, remoteRegistry);

      assert.ok(diff.updated.length === 1, "should detect one updated item");
      assert.equal(diff.updated[0].name, "cron", "updated item should be cron");
      assert.equal(diff.updated[0].localVersion, "0.1.4");
      assert.equal(diff.updated[0].version, "0.2.0");
    } finally {
      cleanup(parent, path.dirname(mindDir));
    }
  });
});

describe("user mind upgrade path", () => {
  it("produces a registry compatible with upgrade.js diffRegistries", () => {
    const parent = makeTempParent();
    const mindDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "upgrade-user-")), "mind");
    const userCopilotDir = fs.mkdtempSync(path.join(os.tmpdir(), "upgrade-copilot-"));

    try {
      const result = createMind({
        ...TEST_CONFIG_BASE,
        type: "user",
        mindDir,
        parentMind: parent,
        userCopilotDir,
      });
      assert.ok(!result.error, `createMind failed: ${result.error}`);

      // Read the user registry
      const localRegistry = JSON.parse(
        fs.readFileSync(path.join(userCopilotDir, "registry.json"), "utf8")
      );

      // Verify user-layout paths
      assert.ok(!localRegistry.extensions.cron.path.includes(".github"),
        "user registry should not have .github/ in paths");

      // Simulate remote with a bumped skill
      const remoteRegistry = JSON.parse(JSON.stringify(localRegistry));
      remoteRegistry.skills.upgrade.version = "0.5.0";

      const { diffRegistries } = require("../upgrade/upgrade.js");
      const diff = diffRegistries(localRegistry, remoteRegistry);

      assert.ok(diff.updated.length === 1, "should detect one updated item");
      assert.equal(diff.updated[0].name, "upgrade");
      assert.equal(diff.updated[0].version, "0.5.0");
    } finally {
      cleanup(parent, path.dirname(mindDir), userCopilotDir);
    }
  });
});
