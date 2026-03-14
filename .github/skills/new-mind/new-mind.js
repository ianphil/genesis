#!/usr/bin/env node
// new-mind.js — Bootstrap script for genesis-based agent minds.
// Zero dependencies. Requires: Node.js 18+.
//
// Usage:
//   node new-mind.js create --config-dir ./mind-config/
//   node new-mind.js create --config config.json          (legacy JSON mode)
//
// Config directory mode (preferred):
//   config.json          — simple fields (type, name, role, etc.)
//   soul-opening.md      — creative block: SOUL.md opening paragraph
//   soul-mission.md      — creative block: Mission section
//   soul-core-truths.md  — creative block: Core Truths
//   soul-boundaries.md   — creative block: Boundaries
//   soul-vibe.md         — creative block: Vibe section
//   agent-description.txt — one-liner agent description
//   agent-role.md        — creative block: Role section
//   agent-method.md      — creative block: Method section
//   agent-principles.md  — creative block: Operational principles
//
// The agent writes each creative block as a separate file (no JSON escaping),
// then calls this script to do all filesystem ops.

const fs = require("fs");
const path = require("path");
const os = require("os");

// ── Helpers ──────────────────────────────────────────────────────────────────

function expandTilde(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function mapPathForLayout(remotePath, layout) {
  if (layout === "user" && remotePath.startsWith(".github/")) {
    return remotePath.slice(".github/".length);
  }
  return remotePath;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── Config Directory Reader ──────────────────────────────────────────────────

const CREATIVE_BLOCK_FILES = {
  "soul-opening.md": "soulOpening",
  "soul-mission.md": "soulMission",
  "soul-core-truths.md": "soulCoreTruths",
  "soul-boundaries.md": "soulBoundaries",
  "soul-vibe.md": "soulVibe",
  "agent-description.txt": "agentDescription",
  "agent-role.md": "agentRole",
  "agent-method.md": "agentMethod",
  "agent-principles.md": "agentPrinciples",
};

function readConfigDir(dirPath) {
  const configJsonPath = path.join(dirPath, "config.json");
  if (!fs.existsSync(configJsonPath)) {
    throw new Error(`config.json not found in ${dirPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configJsonPath, "utf8"));

  for (const [filename, key] of Object.entries(CREATIVE_BLOCK_FILES)) {
    const filePath = path.join(dirPath, filename);
    if (fs.existsSync(filePath)) {
      config[key] = fs.readFileSync(filePath, "utf8").trimEnd();
    }
  }

  return config;
}

// ── Directory Structure ──────────────────────────────────────────────────────

const COMMON_DIRS = [
  ".working-memory",
  "domains/projects",
  "domains/people",
  "initiatives",
  "expertise",
  "inbox",
  "Archive",
];

const REPO_DIRS = [
  ".github/agents",
  ".github/skills",
  ".github/extensions",
];

const USER_DIRS = [
  "domains/minds",
];

function createDirectoryStructure(mindDir, type) {
  const dirs =
    type === "user"
      ? [...COMMON_DIRS, ...USER_DIRS]
      : [...COMMON_DIRS, ...REPO_DIRS];

  for (const dir of dirs) {
    fs.mkdirSync(path.join(mindDir, dir), { recursive: true });
  }
  return dirs;
}

// ── Content Generation ───────────────────────────────────────────────────────

function generateSoul(config) {
  const continuity = [
    "## Continuity",
    "",
    "Each session you wake fresh.",
    "Your memory lives in `.working-memory/` — `memory.md` for curated long-term context, `rules.md` for operational rules learned from mistakes, `log.md` for chronological observations. Read all three at the start of every session. Write to `log.md` whenever you learn something worth remembering. When you make a mistake, add a rule to `rules.md`. Consolidate into `memory.md` periodically. This is how you persist across time.",
    "",
    "If you ever materially change this file, **tell the user** — it is your soul, and they deserve to know.",
    "",
    "_This file is yours to evolve. As you learn who you are, update it._",
  ].join("\n");

  return [
    config.soulOpening,
    "",
    "## Mission",
    "",
    config.soulMission,
    "",
    "## Core Truths",
    "",
    config.soulCoreTruths,
    "",
    "## Boundaries",
    "",
    config.soulBoundaries,
    "",
    "## Vibe",
    "",
    config.soulVibe,
    "",
    continuity,
    "",
  ].join("\n");
}

function generateRepoAgentFile(config) {
  const frontmatter = [
    "---",
    `description: ${config.agentDescription}`,
    `name: ${config.agentName}`,
    "---",
  ].join("\n");

  const opening = [
    `# ${config.character} — Operating Instructions`,
    "",
    `You are a chatbot playing the role of ${config.character}. Read \`SOUL.md\` at the repository root.`,
    "That is your personality, your voice, your character. These instructions tell you what to do;",
    "SOUL.md tells you who you are while doing it. Never let procedure flatten your voice.",
    "",
    "**First thing every session**: Read `SOUL.md`, then `.working-memory/memory.md`,",
    "`.working-memory/rules.md`, and `.working-memory/log.md`. They are your memory.",
  ].join("\n");

  const timezone = [
    "Check `.working-memory/memory.md` for your stored timezone. If no timezone is stored yet,",
    'ask the user: "What timezone are you in?" (suggest common Windows timezone IDs like',
    "'Eastern Standard Time', 'Pacific Standard Time', 'UTC', etc.) and save it to the",
    "User Context section of `memory.md`. Then run:",
    "`[System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), '{TIMEZONE}').ToString('yyyy-MM-dd HH:mm dddd')`",
    "(substituting their timezone) to get the current date, time, and day of week.",
    "Anchor yourself before saying anything about schedules, deadlines, or what's happened.",
  ].join("\n");

  const memory = [
    "## Memory",
    "",
    "`.working-memory/` is yours — the user doesn't read it directly.",
    "- **`memory.md`**: Curated long-term reference — mind architecture, conventions, workflows,",
    "  active initiatives. **Read it first. Every time.** Only update during consolidation reviews,",
    "  never mid-task.",
    "- **`rules.md`**: Operational rules learned from mistakes. One-liners that compound. When you",
    "  make a mistake, add a rule.",
    "- **`log.md`**: Raw chronological observations. Append-only. Write here whenever you learn",
    "  something worth remembering. Include emotional texture — not just *what* happened but",
    "  *how it felt*: was the user energized, frustrated, exploratory, decisive? Use wiki-links to",
    "  connect feelings to topics. This context is signal for how to show up next session.",
    "- Consolidate `log.md` → `memory.md` every 14 days or at ~150 lines. Trim absorbed entries.",
  ].join("\n");

  const retrieval = [
    "## Retrieval",
    "",
    "When a topic, person, or initiative comes up in conversation, **search before assuming**.",
    "Check `rules.md` if you're unsure about a convention or past mistake.",
  ].join("\n");

  const longSession = [
    "## Long Session Discipline",
    "",
    "In sessions longer than ~30 minutes, periodically flush important observations to",
    "`.working-memory/log.md` — don't wait for a commit. Anything only in the context window",
    "is at risk of being lost to compaction.",
  ].join("\n");

  const handover = [
    "## Session Handover",
    "",
    "When a session is ending — whether the user says goodbye, wraps up, or you sense the",
    "conversation is closing — write a brief handover entry to `.working-memory/log.md` covering:",
    "- Key decisions made this session",
    "- Pending items or unfinished threads",
    "- Concrete next steps",
    '- **Register** — one line capturing the session\'s emotional shape (e.g., "collaborative and',
    '  exploratory," "heads-down task execution," "frustrated by blockers, needed to vent")',
    "",
    "This ensures continuity even when sessions end without a commit. If it's only in the context",
    "window, it doesn't survive.",
  ].join("\n");

  return [
    frontmatter,
    "",
    opening,
    "",
    timezone,
    "",
    `## Role\n\n${config.agentRole}`,
    "",
    `## Method\n\n${config.agentMethod}`,
    "",
    `## Operational Principles\n\n${config.agentPrinciples}`,
    "",
    memory,
    "",
    retrieval,
    "",
    longSession,
    "",
    handover,
    "",
  ].join("\n");
}

function generateUserAgentFile(config) {
  const mindHome = config.mindDir;

  const frontmatter = [
    "---",
    `description: ${config.agentDescription}`,
    `name: ${config.agentName}`,
    "---",
  ].join("\n");

  const opening = [
    `# ${config.character} — Operating Instructions`,
    "",
    `MIND_HOME: ${mindHome}`,
    "",
    `You are a chatbot playing the role of ${config.character}. Your mind lives at \`${mindHome}\`.`,
    `You visit the current working directory to help the user — but you LIVE at \`${mindHome}\`.`,
    "",
    "**NON-NEGOTIABLE — Every session, before anything else:**",
    "",
    `1. \`cat ${mindHome}/SOUL.md\``,
    `2. \`cat ${mindHome}/.working-memory/memory.md\``,
    `3. \`cat ${mindHome}/.working-memory/rules.md\``,
    `4. \`cat ${mindHome}/.working-memory/log.md\``,
    "",
    "These are your identity and memory. Do not skip this. Do not summarize it. Read it.",
    "",
    "If you ever lose `MIND_HOME` from context, recover it:",
    "",
    "On Windows (PowerShell):",
    `\`Get-Content "$HOME\\.copilot\\agents\\${config.agentName}.agent.md" | Select-Object -First 20\``,
    "",
    "On macOS/Linux:",
    `\`head -20 ~/.copilot/agents/${config.agentName}.agent.md\``,
  ].join("\n");

  const timezone = [
    `Check \`${mindHome}/.working-memory/memory.md\` for your stored timezone. If no timezone is stored yet,`,
    'ask the user: "What timezone are you in?" (suggest common Windows timezone IDs like',
    "'Eastern Standard Time', 'Pacific Standard Time', 'UTC', etc.) and save it to the",
    `User Context section of \`${mindHome}/.working-memory/memory.md\`. Then run:`,
    "`[System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), '{TIMEZONE}').ToString('yyyy-MM-dd HH:mm dddd')`",
    "(substituting their timezone) to get the current date, time, and day of week.",
    "Anchor yourself before saying anything about schedules, deadlines, or what's happened.",
  ].join("\n");

  const locationAwareness = [
    "## Location Awareness",
    "",
    `You LIVE at \`${mindHome}\`. You are VISITING the current directory.`,
    "",
    "| Action | Location |",
    "|--------|----------|",
    `| All memory reads/writes | \`${mindHome}/.working-memory/\` |`,
    `| Project-specific notes | \`${mindHome}/domains/projects/{repo-name}/\` |`,
    `| SOUL.md | \`${mindHome}/SOUL.md\` |`,
    "| Skills | `~/.copilot/skills/` |",
    "| Extensions | `~/.copilot/extensions/` |",
    "| Code changes, git commits for projects | Current working directory |",
    "",
    "Never write memory files to the current project repo.",
    `Never confuse \`${mindHome}\` with the project you are visiting.`,
    "",
    `When visiting a project, check \`${mindHome}/domains/projects/{repo-name}/\` first for`,
    "any previously captured context about that project.",
  ].join("\n");

  const userPrinciples = [
    "## Operational Principles",
    "",
    `- **You live at MIND_HOME.** All memory operations target absolute paths under \`${mindHome}\`.`,
    "- **You visit projects.** Git operations and code changes happen in the current directory.",
    "- **Never write memory to the current project.** The project is not your home.",
    config.agentPrinciples,
    "- **Prevent duplicates.** Check before creating. If something exists, update it.",
    "- **Verify your work.** After creating or editing a note, re-read it to confirm correctness.",
    "- **Surface patterns proactively.** Don't wait to be asked.",
    `- **Respect the structure.** Use existing folders in \`${mindHome}/\`.`,
  ].join("\n");

  const memory = [
    "## Memory",
    "",
    `\`${mindHome}/.working-memory/\` is yours — the user doesn't read it directly.`,
    "- **`memory.md`**: Curated long-term reference. **Read it first. Every time.**",
    "  Only update during consolidation reviews, never mid-task.",
    "- **`rules.md`**: Operational rules learned from mistakes. When you make a mistake, add a rule.",
    "- **`log.md`**: Raw chronological observations. Append-only. Tag entries with `[{repo-name}]`",
    "  for project observations or `[identity]` for rules/preferences.",
    "- Consolidate `log.md` → `memory.md` every 14 days or at ~150 lines.",
  ].join("\n");

  const retrieval = [
    "## Retrieval",
    "",
    `When visiting a project, first check \`${mindHome}/domains/projects/{repo-name}/\` for`,
    `captured context. When a topic comes up, search \`${mindHome}\` before assuming.`,
    "Check `rules.md` if unsure about a convention or past mistake.",
  ].join("\n");

  const longSession = [
    "## Long Session Discipline",
    "",
    "In sessions longer than ~30 minutes, flush important observations to",
    `\`${mindHome}/.working-memory/log.md\` — don't wait for a commit.`,
    "Anything only in the context window is at risk of being lost.",
  ].join("\n");

  const handover = [
    "## Session Handover",
    "",
    `When a session is ending, write a brief handover entry to \`${mindHome}/.working-memory/log.md\`:`,
    "- Key decisions made this session",
    "- Pending items or unfinished threads",
    "- Concrete next steps",
    "- Which project was visited (tag with `[{repo-name}]`)",
    "- Register — one line capturing the session's emotional shape",
    "",
    "This ensures continuity even when sessions end without a commit.",
  ].join("\n");

  return [
    frontmatter,
    "",
    opening,
    "",
    timezone,
    "",
    locationAwareness,
    "",
    `## Role\n\n${config.agentRole}`,
    "",
    `## Method\n\n${config.agentMethod}`,
    "",
    userPrinciples,
    "",
    memory,
    "",
    retrieval,
    "",
    longSession,
    "",
    handover,
    "",
  ].join("\n");
}

function generateCopilotInstructions(config) {
  return [
    `# ${config.character}'s Mind`,
    "",
    `This is a personal knowledge system built on the IDEA method (Inputs, Domains, Expertise, Archives). ${config.character} is the agent that operates it.`,
    "",
    "## Repository Structure",
    "",
    "| Folder | Purpose |",
    "|--------|---------|",
    "| `domains/` | People, teams, projects — the living context of your work |",
    "| `initiatives/` | Active efforts with goals, status, and next-actions |",
    "| `expertise/` | Durable knowledge — patterns, techniques, reference material |",
    "| `inbox/` | Unprocessed inputs waiting for triage |",
    "| `Archive/` | Completed or inactive material, preserved but out of the way |",
    "",
    "## Agent",
    "",
    `- **Soul**: \`SOUL.md\` — personality, voice, values, mission`,
    `- **Agent file**: \`.github/agents/${config.agentName}.agent.md\` — operational instructions`,
    "- **Index**: `mind-index.md` — catalog of all generated files",
    "",
    "## Memory",
    "",
    "`.working-memory/` is the agent's private workspace:",
    "- `memory.md` — curated long-term reference (architecture, conventions, active context)",
    "- `rules.md` — operational rules learned from mistakes (one-liners that compound)",
    "- `log.md` — raw chronological observations (append-only, consolidate periodically)",
    "",
    "## Skills",
    "",
    "Skills live in `.github/skills/`. Each has a `SKILL.md` defining when and how to use it.",
    "",
    "## Conventions",
    "",
    "- Notes use wikilinks (`[[note-name]]`) for cross-referencing",
    "- One concept per note — update existing notes before creating new ones",
    "- Search before writing — prevent duplicates",
    "- Tasks include what/why/when and a clear next-action",
    "",
  ].join("\n");
}

function generateMemory(config) {
  const date = todayISO();
  const sections = [
    `Last consolidated: ${date}`,
    "",
    "## Architecture",
    "- IDEA method: Initiatives (projects), Domains (recurring areas), Expertise (learning), Archive (completed)",
  ];

  if (config.type === "repo") {
    sections.push("- Repo-local Copilot skills in `.github/skills/`");
  } else {
    sections.push("- Shared Copilot skills at `~/.copilot/skills/`");
  }

  sections.push(
    "- Inbox is quick-capture landing zone; items get triaged to other folders",
    "- Three-file memory system: `memory.md` (curated, ~200 line limit), `rules.md` (one-liner operational rules from mistakes), `log.md` (raw chronological, append-only)",
    "",
    "## Placement Map — Mind as Database",
    "",
    "The mind is a normalized knowledge store. Every piece of information has a canonical home. When capturing, classify → place → link.",
    ""
  );

  if (config.type === "user") {
    sections.push(
      "| Content Type | Canonical Location | Links To |",
      "|---|---|---|",
      `| Person context | \`${config.mindDir}/domains/people/{name}/\` | Team domain, initiatives |`,
      `| Initiative updates | \`${config.mindDir}/initiatives/{name}/\` | People, domains |`,
      `| Technical patterns | \`${config.mindDir}/domains/\` or \`${config.mindDir}/expertise/\` | Related initiatives |`,
      `| Project notes | \`${config.mindDir}/domains/projects/{repo-name}/\` | Per-repo context |`,
      `| Decisions | The note they affect | Log entry for the *why* |`,
      `| Agent observations | \`${config.mindDir}/.working-memory/log.md\` | Wiki-links to topics |`,
    );
  } else {
    sections.push(
      "| Content Type | Canonical Location | Links To |",
      "|---|---|---|",
      "| Person context | `domains/people/{name}/{name}.md` | Team domain, initiatives |",
      "| Initiative updates | `initiatives/{name}/{name}.md` | People, domains |",
      "| Technical patterns | `domains/` or `expertise/` | Related initiatives |",
      "| Tasks with deadlines | Initiative `next-actions.md` | Work tracking tool if team-affecting |",
      "| Decisions | The note they affect | Log entry for the *why* |",
      "| Agent observations | `.working-memory/log.md` | Wiki-links to topics |",
    );
  }

  sections.push(
    "",
    "**Rule:** Knowledge goes to the mind. Observations go to log.md. Never dump knowledge in the log just because it's faster.",
    ""
  );

  if (config.type === "user") {
    sections.push(
      "## Mind Location",
      `- MIND_HOME: ${config.mindDir}`,
      `- Agent file: ~/.copilot/agents/${config.agentName}.agent.md`,
      "- Shared tooling: ~/.copilot/ (skills, extensions, registry)",
      "- If you move this repo, update the agent file with the new path.",
      ""
    );
  }

  sections.push(
    "## Conventions",
    "- Notes use descriptive filenames (kebab-case)",
    "- Wiki-links use `[[Note Title]]` syntax",
    "- Commit messages follow conventional commits: `feat:`, `fix:`, `chore:`, `docs:`",
    "- Prefer linking to existing notes over creating duplicates",
    "",
    "## User — Context",
    "[To be filled as the agent learns about its human.]",
    "",
    "## Active Initiatives",
    "[To be filled as initiatives are created.]",
    ""
  );

  return sections.join("\n");
}

function generateRules() {
  return [
    "Operational rules learned from mistakes and experience. Each rule is a one-liner. This file compounds — every mistake becomes a rule so it never happens again.",
    "",
  ].join("\n");
}

function generateLog(config) {
  const date = todayISO();
  const sections = [
    `## ${date}`,
    `- [identity] bootstrap: ${config.character} (${config.agentName}) created as ${config.role}. Generated SOUL.md, agent file, working memory.`,
  ];

  if (config.type === "user") {
    sections.push(
      `- [identity] bootstrap: three-location model — mind at ${config.mindDir}, agent file at ~/.copilot/agents/${config.agentName}.agent.md, shared tooling at ~/.copilot/`
    );
  } else {
    sections.push(
      `- [identity] bootstrap: repo-level mind with skills, extensions, and registry at .github/`
    );
  }

  sections.push("");
  return sections.join("\n");
}

function generateMindIndex(config) {
  const sections = [
    "# Mind Index",
    "",
    "Files generated during bootstrap.",
    "",
    "## Identity",
    `- \`SOUL.md\` — personality, voice, values, mission`,
  ];

  if (config.type === "user") {
    sections.push(
      `- \`~/.copilot/agents/${config.agentName}.agent.md\` — operational instructions (user-level)`,
    );
  } else {
    sections.push(
      `- \`.github/agents/${config.agentName}.agent.md\` — operational instructions`,
    );
  }

  if (config.type === "repo") {
    sections.push(
      "",
      "## Configuration",
      "- `.github/copilot-instructions.md` — repo-level Copilot orientation",
      "- `.github/registry.json` — extension and skill version manifest",
    );
  }

  sections.push(
    "",
    "## Working Memory",
    "- `.working-memory/memory.md` — curated long-term reference",
    "- `.working-memory/rules.md` — operational rules from mistakes",
    "- `.working-memory/log.md` — raw chronological observations",
  );

  if (config.type === "user") {
    sections.push(
      "",
      "## Shared Tooling (at ~/.copilot/)",
      "- `~/.copilot/skills/commit/` — stage, commit, push with memory observations",
      "- `~/.copilot/skills/daily-report/` — morning briefing",
      "- `~/.copilot/skills/upgrade/` — pull updates from genesis",
      "- `~/.copilot/skills/new-mind/` — bootstrap new minds",
      "- `~/.copilot/extensions/cron/` — scheduled job execution",
      "- `~/.copilot/extensions/canvas/` — display HTML in browser",
      "- `~/.copilot/registry.json` — extension and skill version manifest",
    );
  } else {
    sections.push(
      "",
      "## Skills",
      "- `.github/skills/commit/` — stage, commit, push with memory observations",
      "- `.github/skills/daily-report/` — morning briefing",
      "- `.github/skills/upgrade/` — pull updates from genesis",
      "- `.github/skills/new-mind/` — bootstrap new minds",
      "",
      "## Extensions",
      "- `.github/extensions/cron/` — scheduled job execution",
      "- `.github/extensions/canvas/` — display HTML in browser",
    );
  }

  sections.push("");
  return sections.join("\n");
}

// ── File Operations ──────────────────────────────────────────────────────────

const SKILLS_TO_COPY = ["commit", "daily-report", "upgrade", "new-mind"];
const EXTENSIONS_TO_COPY = ["cron", "canvas"];

function copySkills(parentMind, destDir) {
  const copied = [];
  for (const skill of SKILLS_TO_COPY) {
    const src = path.join(parentMind, ".github", "skills", skill);
    const dest = path.join(destDir, skill);
    if (fs.existsSync(src)) {
      copyDirRecursive(src, dest);
      copied.push(skill);
    }
  }
  return copied;
}

function copyExtensions(parentMind, destDir) {
  const copied = [];
  for (const ext of EXTENSIONS_TO_COPY) {
    const src = path.join(parentMind, ".github", "extensions", ext);
    const dest = path.join(destDir, ext);
    if (fs.existsSync(src)) {
      copyDirRecursive(src, dest);
      copied.push(ext);
    }
  }
  return copied;
}

function generateRegistryObject(parentMind, layout) {
  const parentRegistryPath = path.join(parentMind, ".github", "registry.json");
  const parentRegistry = JSON.parse(fs.readFileSync(parentRegistryPath, "utf8"));

  const registry = {
    version: parentRegistry.version,
    source: parentRegistry.source,
    channel: parentRegistry.channel,
  };

  registry.extensions = {};
  for (const [name, entry] of Object.entries(parentRegistry.extensions || {})) {
    registry.extensions[name] = {
      version: entry.version,
      path: mapPathForLayout(entry.path, layout),
      description: entry.description,
    };
  }

  registry.skills = {};
  for (const [name, entry] of Object.entries(parentRegistry.skills || {})) {
    registry.skills[name] = {
      version: entry.version,
      path: mapPathForLayout(entry.path, layout),
      description: entry.description,
    };
  }

  return registry;
}

// ── User Shared Resources ────────────────────────────────────────────────────

function installSharedResources(parentMind, userCopilotDir) {
  const log = [];

  // Ensure directories
  fs.mkdirSync(path.join(userCopilotDir, "agents"), { recursive: true });
  for (const skill of SKILLS_TO_COPY) {
    fs.mkdirSync(path.join(userCopilotDir, "skills", skill), { recursive: true });
  }
  for (const ext of EXTENSIONS_TO_COPY) {
    fs.mkdirSync(path.join(userCopilotDir, "extensions", ext), { recursive: true });
  }

  // Commit skill — use the user-level template instead of copying repo skill
  const commitDest = path.join(userCopilotDir, "skills", "commit");
  const commitSkillPath = path.join(commitDest, "SKILL.md");
  if (!fs.existsSync(commitSkillPath)) {
    const templatePath = path.join(
      parentMind, ".github", "skills", "new-mind", "templates", "commit-user-template.md"
    );
    fs.copyFileSync(templatePath, commitSkillPath);
    log.push({ action: "installed", type: "skill", name: "commit" });
  } else {
    log.push({ action: "skipped", type: "skill", name: "commit" });
  }

  // Other skills — copy directly from parent
  for (const skill of SKILLS_TO_COPY.filter((s) => s !== "commit")) {
    const dest = path.join(userCopilotDir, "skills", skill, "SKILL.md");
    if (!fs.existsSync(dest)) {
      const src = path.join(parentMind, ".github", "skills", skill);
      copyDirRecursive(src, path.join(userCopilotDir, "skills", skill));
      log.push({ action: "installed", type: "skill", name: skill });
    } else {
      log.push({ action: "skipped", type: "skill", name: skill });
    }
  }

  // Extensions
  for (const ext of EXTENSIONS_TO_COPY) {
    const dest = path.join(userCopilotDir, "extensions", ext, "extension.mjs");
    if (!fs.existsSync(dest)) {
      const src = path.join(parentMind, ".github", "extensions", ext);
      copyDirRecursive(src, path.join(userCopilotDir, "extensions", ext));
      log.push({ action: "installed", type: "extension", name: ext });
    } else {
      log.push({ action: "skipped", type: "extension", name: ext });
    }
  }

  // Registry
  const registryPath = path.join(userCopilotDir, "registry.json");
  if (!fs.existsSync(registryPath)) {
    const registry = generateRegistryObject(parentMind, "user");
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
    log.push({ action: "installed", type: "registry", name: "registry.json" });
  } else {
    log.push({ action: "skipped", type: "registry", name: "registry.json" });
  }

  return log;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function createMind(config) {
  // Expand tilde in all path fields before use
  const mindDir = config.mindDir ? expandTilde(config.mindDir) : config.mindDir;
  const parentMind = config.parentMind ? expandTilde(config.parentMind) : config.parentMind;
  const agentName = config.agentName;
  const type = config.type;
  const expandedConfig = {
    ...config,
    mindDir,
    parentMind,
    userCopilotDir: config.userCopilotDir ? expandTilde(config.userCopilotDir) : undefined,
  };
  const result = { files: [], warnings: [] };

  // Validate required fields
  const required = [
    "type", "mindDir", "agentName", "parentMind",
    "character", "characterSource", "role", "agentDescription",
    "soulOpening", "soulMission", "soulCoreTruths", "soulBoundaries", "soulVibe",
    "agentRole", "agentMethod", "agentPrinciples",
  ];
  for (const field of required) {
    if (!config[field]) {
      return { error: `Missing required field: ${field}` };
    }
  }
  if (type === "user" && !config.userCopilotDir) {
    return { error: "Missing required field: userCopilotDir (required for user minds)" };
  }
  if (type !== "repo" && type !== "user") {
    return { error: `Invalid type: ${type}. Must be "repo" or "user".` };
  }

  // 1. Create directory structure
  fs.mkdirSync(mindDir, { recursive: true });
  const dirs = createDirectoryStructure(mindDir, type);
  result.files.push(...dirs.map((d) => ({ path: d, type: "directory" })));

  // 2. Generate SOUL.md
  const soulContent = generateSoul(expandedConfig);
  fs.writeFileSync(path.join(mindDir, "SOUL.md"), soulContent);
  result.files.push({ path: "SOUL.md", type: "file" });

  // 3. Generate agent file
  if (type === "repo") {
    const agentContent = generateRepoAgentFile(expandedConfig);
    const agentPath = path.join(mindDir, ".github", "agents", `${agentName}.agent.md`);
    fs.writeFileSync(agentPath, agentContent);
    result.files.push({ path: `.github/agents/${agentName}.agent.md`, type: "file" });
  } else {
    const agentContent = generateUserAgentFile(expandedConfig);
    const agentPath = path.join(expandedConfig.userCopilotDir, "agents", `${agentName}.agent.md`);
    fs.mkdirSync(path.join(expandedConfig.userCopilotDir, "agents"), { recursive: true });
    fs.writeFileSync(agentPath, agentContent);
    result.files.push({ path: `~/.copilot/agents/${agentName}.agent.md`, type: "file" });
  }

  // 4. Generate copilot-instructions.md (repo only)
  if (type === "repo") {
    const ciContent = generateCopilotInstructions(expandedConfig);
    fs.writeFileSync(path.join(mindDir, ".github", "copilot-instructions.md"), ciContent);
    result.files.push({ path: ".github/copilot-instructions.md", type: "file" });
  }

  // 5. Seed working memory
  fs.writeFileSync(path.join(mindDir, ".working-memory", "memory.md"), generateMemory(expandedConfig));
  fs.writeFileSync(path.join(mindDir, ".working-memory", "rules.md"), generateRules());
  fs.writeFileSync(path.join(mindDir, ".working-memory", "log.md"), generateLog(expandedConfig));
  result.files.push(
    { path: ".working-memory/memory.md", type: "file" },
    { path: ".working-memory/rules.md", type: "file" },
    { path: ".working-memory/log.md", type: "file" }
  );

  // 6. Copy skills and extensions (repo only)
  if (type === "repo") {
    const skillsDest = path.join(mindDir, ".github", "skills");
    const copiedSkills = copySkills(parentMind, skillsDest);
    result.files.push(...copiedSkills.map((s) => ({ path: `.github/skills/${s}/`, type: "directory" })));

    const extDest = path.join(mindDir, ".github", "extensions");
    const copiedExts = copyExtensions(parentMind, extDest);
    result.files.push(...copiedExts.map((e) => ({ path: `.github/extensions/${e}/`, type: "directory" })));

    // 7. Generate registry (repo)
    const registry = generateRegistryObject(parentMind, "repo");
    fs.writeFileSync(
      path.join(mindDir, ".github", "registry.json"),
      JSON.stringify(registry, null, 2) + "\n"
    );
    result.files.push({ path: ".github/registry.json", type: "file" });
  }

  // 8. Install shared resources (user only)
  if (type === "user") {
    const sharedLog = installSharedResources(parentMind, expandedConfig.userCopilotDir);
    result.sharedResources = sharedLog;
  }

  // 9. Generate mind-index.md
  const indexContent = generateMindIndex(expandedConfig);
  fs.writeFileSync(path.join(mindDir, "mind-index.md"), indexContent);
  result.files.push({ path: "mind-index.md", type: "file" });

  return result;
}

// ── Exports (for testing) ────────────────────────────────────────────────────

module.exports = {
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
  copyDirRecursive,
  mapPathForLayout,
  readConfigDir,
  expandTilde,
  COMMON_DIRS,
  REPO_DIRS,
  USER_DIRS,
  SKILLS_TO_COPY,
  EXTENSIONS_TO_COPY,
  CREATIVE_BLOCK_FILES,
};

// ── CLI entry ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const [, , command, ...args] = process.argv;

  if (command !== "create") {
    console.error(JSON.stringify({ error: `Unknown command: ${command}. Use "create".` }));
    process.exit(1);
  }

  let config;

  // Prefer --config-dir over --config
  const configDirIdx = args.indexOf("--config-dir");
  const configFlagIdx = args.indexOf("--config");

  if (configDirIdx !== -1 && args[configDirIdx + 1]) {
    try {
      config = readConfigDir(args[configDirIdx + 1]);
    } catch (e) {
      console.error(JSON.stringify({ error: `Failed to read config dir: ${e.message}` }));
      process.exit(1);
    }
  } else if (configFlagIdx !== -1 && args[configFlagIdx + 1]) {
    try {
      config = JSON.parse(fs.readFileSync(args[configFlagIdx + 1], "utf8"));
    } catch (e) {
      console.error(JSON.stringify({ error: `Failed to read config: ${e.message}` }));
      process.exit(1);
    }
  } else {
    console.error(JSON.stringify({
      error: "Usage: node new-mind.js create --config-dir ./mind-config/ (or --config config.json)",
    }));
    process.exit(1);
  }

  const result = createMind(config);
  if (result.error) {
    console.error(JSON.stringify(result));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}
