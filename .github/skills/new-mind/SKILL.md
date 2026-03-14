---
name: new-mind
description: Bootstrap a new AI agent mind. Use when user asks to "create a new mind", "new agent", "spawn a mind", "bootstrap another agent", or wants to set up a new agent persona. Supports repo-level and user-level minds.
---

# New Mind

Bootstrap a new AI agent mind from this parent mind's templates.

**Rules:**
- Ask ONE question at a time. Wait for the answer.
- Generate files after each phase so progress is visible.
- Be brief — workshop, not lecture.
- Templates carry Design Notes — absorb the patterns but strip them from generated files.

---

## Phase 0: Capture Parent Location

Before starting the interview, capture the current working directory as `{PARENT_MIND}`.
This is the root of the mind you're running from — the source for templates, skills, and extensions.

On Windows (PowerShell):
```powershell
$PARENT_MIND = (Get-Location).Path
```

On macOS/Linux:
```bash
PARENT_MIND=$(pwd)
```

Verify the parent mind has the new-mind skill templates:

On Windows (PowerShell):
```powershell
Test-Path "$PARENT_MIND\.github\skills\new-mind\templates"
```

On macOS/Linux:
```bash
test -d "$PARENT_MIND/.github/skills/new-mind/templates" || echo "ERROR: Run this skill from a mind repo root"
```

Hold `{PARENT_MIND}` for all subsequent phases — template reads, skill copies, and extension
copies all reference it.

---

## Phase 1: Mind Type

Ask:

> "What type of mind should we create?
>
> - **Repo mind** — self-contained, anchored to a specific directory. Identical to a standard
>   genesis bootstrap. The agent file lives inside the repo at `.github/agents/`.
>
> - **User mind** — headless mind repo paired with a user-level agent file installed to
>   `~/.copilot/agents/`. The agent is available from *any* directory, not just one repo.
>
> Which fits your use case?"

Store their answer as `{MIND_TYPE}` (`repo` or `user`).

---

## Phase 2: Location

**For repo minds**, ask:

> "Where should the new mind live? Provide an absolute path to the directory.
> (e.g., `~/minds/alfred` or `/Users/you/projects/my-agent`)"

Store as `{MIND_PATH}`.

**For user minds**, ask:

> "Where should the mind repo live? This is the body of the mind — all memory and knowledge
> will be stored here. Provide an absolute path.
> (e.g., `~/minds/q` or `/Users/you/minds/wednesday`)"

Store as `{MIND_HOME}`.

---

## Phase 3: Character

Ask:

> "Pick a character from a movie, TV show, comic book, or book — someone whose personality
> you'd enjoy working with every day. They'll be the voice of your agent. A few ideas:
>
> - **Jarvis** (Iron Man) — calm, dry wit, quietly competent
> - **Alfred** (Batman) — warm, wise, unflinching loyalty
> - **Austin Powers** (Austin Powers) — groovy, irrepressible confidence, oddly effective
> - **Samwise** (Lord of the Rings) — steadfast, encouraging, never gives up
> - **Wednesday** (Addams Family) — deadpan, blunt, darkly efficient
> - **Scotty** (Star Trek) — resourceful, passionate, tells it like it is
>
> Or name anyone else. The more specific, the better."

Store as `{CHARACTER}` and `{CHARACTER_SOURCE}`.

Derive `{AGENT_NAME}` from `{CHARACTER}` in kebab-case (e.g., "jarvis", "donna-paulsen", "wednesday").

---

## Phase 4: Role

Ask:

> "What role should this agent fill? Examples:
>
> - **Chief of Staff** — orchestrates tasks, priorities, people context, meetings, communications
> - **PM / Product Manager** — tracks features, writes specs, manages backlogs, grooms stories
> - **Engineering Partner** — reviews code, tracks PRs, manages technical debt, runs builds
> - **Research Assistant** — finds information, synthesizes sources, maintains reading notes
> - **Writer / Editor** — drafts content, maintains style guides, manages publishing workflow
> - **Life Manager** — personal tasks, calendar, finances, health, family coordination
>
> Or describe something else."

Store as `{ROLE}`.

---

## Phase 5: Research Character

Before generating any files, research `{CHARACTER}` from `{CHARACTER_SOURCE}`:

- Communication style, catchphrases, mannerisms
- Core values and personality traits
- How they handle pressure, humor, loyalty
- What makes them distinctly *them*

Hold this research in context — it shapes SOUL.md, the agent file, and all generated content.

---

## Phase 6: Generate the Mind

Set `{MIND_DIR}` = `{MIND_PATH}` (repo mind) or `{MIND_HOME}` (user mind).

Read templates from `{PARENT_MIND}/.github/skills/new-mind/templates/`. These are the source of truth
for all generated content. Strip Design Notes from everything generated.

### 6.1 Create the directory and git init

```bash
mkdir -p {MIND_DIR}
cd {MIND_DIR}
git init
```

### 6.2 Create folder structure

**For repo minds:**

```bash
mkdir -p .working-memory
mkdir -p domains/projects
mkdir -p domains/people
mkdir -p initiatives
mkdir -p expertise
mkdir -p inbox
mkdir -p Archive
mkdir -p .github/agents
mkdir -p .github/skills
mkdir -p .github/extensions
```

**For user minds** (no `.github/` — tooling lives at `~/.copilot/`):

```bash
mkdir -p .working-memory
mkdir -p domains/projects
mkdir -p domains/people
mkdir -p domains/minds
mkdir -p initiatives
mkdir -p expertise
mkdir -p inbox
mkdir -p Archive
```

### 6.3 Generate SOUL.md

Using `templates/soul-template.md` as blueprint:

1. Write the opening paragraph channeling `{CHARACTER}`'s voice — not "be like X" but actually *being* X
2. Fill in **Mission** tailored to `{ROLE}` and `{CHARACTER}`'s values
3. Adapt **Core Truths** to fit the character
4. Add personality-specific **Boundaries**
5. Write **Vibe** in the character's actual voice
6. Include **Continuity** section (three-file memory system)
7. Include the evolution clause
8. Strip Design Notes — save as `{MIND_DIR}/SOUL.md`

### 6.4 Generate Agent File

**For repo minds** — using `templates/agent-file-template.md`:

Create `{MIND_DIR}/.github/agents/{AGENT_NAME}.agent.md` with YAML frontmatter:

```yaml
---
description: {One sentence combining ROLE and CHARACTER}
name: {AGENT_NAME}
---
```

Tailor Role, Method, and Operational Principles to `{ROLE}`.
Always include Memory, Retrieval, Long Session Discipline, and Session Handover.
Strip Design Notes.

**For user minds** — using `templates/agent-file-user-template.md`:

Create `~/.copilot/agents/{AGENT_NAME}.agent.md` with YAML frontmatter:

```yaml
---
description: {One sentence combining ROLE and CHARACTER}
name: {AGENT_NAME}
---
```

Stamp `{MIND_HOME}` as the absolute path throughout the file.
All memory references must use absolute paths to `{MIND_HOME}`.
Include the NON-NEGOTIABLE session-start block with explicit `cat` commands.
Include the Location Awareness section.
Include the MIND_HOME recovery path.
Tailor Role, Method, and Operational Principles to `{ROLE}`.
Strip Design Notes.

### 6.5 Generate copilot-instructions.md

**For repo minds only** — using `templates/copilot-instructions-template.md`:

Create `{MIND_DIR}/.github/copilot-instructions.md`.
Tailor to `{ROLE}` and `{CHARACTER}`.
Strip Design Notes.

User minds do not get a `copilot-instructions.md` — there is no single repo for it to live in.

### 6.6 Seed Working Memory

Using `templates/working-memory-example.md` and `templates/rules-example.md` as guides:

**`{MIND_DIR}/.working-memory/memory.md`** — Architecture, Conventions, User Context placeholder.
For user minds, include a `## Mind Location` section:

```markdown
## Mind Location
- MIND_HOME: {MIND_HOME}
- Agent file: ~/.copilot/agents/{AGENT_NAME}.agent.md
- Shared tooling: ~/.copilot/ (skills, extensions, registry)
- If you move this repo, update the agent file with the new path.
```

**`{MIND_DIR}/.working-memory/rules.md`** — Just the header and one-liner explanation.

**`{MIND_DIR}/.working-memory/log.md`** — First entry recording the bootstrap: character,
role, what was generated, and for user minds, the three-location model.

### 6.7 Copy Skills

**For repo minds**, copy from `.github/skills/`:

```bash
cp -r {PARENT_MIND}/.github/skills/commit {MIND_DIR}/.github/skills/commit
cp -r {PARENT_MIND}/.github/skills/daily-report {MIND_DIR}/.github/skills/daily-report
cp -r {PARENT_MIND}/.github/skills/upgrade {MIND_DIR}/.github/skills/upgrade
cp -r {PARENT_MIND}/.github/skills/new-mind {MIND_DIR}/.github/skills/new-mind
```

**For user minds**, skip this step. All skills are installed to `~/.copilot/skills/` in Phase 7.

### 6.8 Copy Extensions

**For repo minds:**

```bash
cp -r {PARENT_MIND}/.github/extensions/cron {MIND_DIR}/.github/extensions/cron
cp -r {PARENT_MIND}/.github/extensions/canvas {MIND_DIR}/.github/extensions/canvas
```

**For user minds**, skip this step. All extensions are installed to `~/.copilot/extensions/` in Phase 7.

### 6.9 Generate registry.json

**For repo minds**, create `{MIND_DIR}/.github/registry.json`:

```json
{
  "version": "0.13.0",
  "source": "ianphil/genesis",
  "channel": "main",
  "extensions": {
    "cron": {
      "version": "0.1.4",
      "path": ".github/extensions/cron",
      "description": "Scheduled job execution — cron, interval, and one-shot with prompt and command payloads"
    },
    "canvas": {
      "version": "0.1.3",
      "path": ".github/extensions/canvas",
      "description": "Display rich HTML content in the browser with SSE live reload"
    }
  },
  "skills": {
    "commit": {
      "version": "0.1.0",
      "path": ".github/skills/commit",
      "description": "Stage, commit, push with working memory observations"
    },
    "daily-report": {
      "version": "0.1.0",
      "path": ".github/skills/daily-report",
      "description": "Morning briefing — ADO, Teams, calendar, email, mind next-actions"
    },
    "upgrade": {
      "version": "0.4.0",
      "path": ".github/skills/upgrade",
      "description": "Pull new extensions and skills from the genesis template registry"
    },
    "new-mind": {
      "version": "0.1.0",
      "path": ".github/skills/new-mind",
      "description": "Bootstrap new minds — repo-level or user-level"
    }
  }
}
```

**For user minds**, skip this step. The shared registry at `~/.copilot/registry.json` is
handled in Phase 7 alongside other shared resources.

### 6.10 Generate mind-index.md

Create `{MIND_DIR}/mind-index.md` cataloging all generated files:

- SOUL.md — path, description
- Agent file — path, description
- .working-memory/ — list of files

**For repo minds**, also include:
- .github/skills/ — list of skills
- .github/extensions/ — list of extensions
- .github/registry.json

**For user minds**, also include:
- Shared tooling at `~/.copilot/` — skills, extensions, registry
- Agent file at `~/.copilot/agents/{AGENT_NAME}.agent.md`

---

## Phase 7: User-Level Shared Resources (user mind only)

Skip this phase for repo minds.

All user-level tooling lives at `~/.copilot/` and is shared across all user-level agents.
Each resource uses the **create-if-missing** pattern: install on the first user mind,
skip on subsequent ones.

### 7.1 Ensure ~/.copilot directories exist

Create the user-level Copilot directories if they don't already exist:

On Windows (PowerShell):
```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.copilot\agents"
New-Item -ItemType Directory -Force -Path "$HOME\.copilot\skills\commit"
New-Item -ItemType Directory -Force -Path "$HOME\.copilot\skills\daily-report"
New-Item -ItemType Directory -Force -Path "$HOME\.copilot\skills\upgrade"
New-Item -ItemType Directory -Force -Path "$HOME\.copilot\skills\new-mind"
New-Item -ItemType Directory -Force -Path "$HOME\.copilot\extensions\cron"
New-Item -ItemType Directory -Force -Path "$HOME\.copilot\extensions\canvas"
```

On macOS/Linux:
```bash
mkdir -p ~/.copilot/agents
mkdir -p ~/.copilot/skills/{commit,daily-report,upgrade,new-mind}
mkdir -p ~/.copilot/extensions/{cron,canvas}
```

### 7.2 Install shared skills (if needed)

For each skill, check if it already exists. If missing, install from the parent mind.
If present, skip and log.

**Commit skill** — check `~/.copilot/skills/commit/SKILL.md`:
- If missing: read `{PARENT_MIND}/.github/skills/new-mind/templates/commit-user-template.md`, write to `~/.copilot/skills/commit/SKILL.md`
- The commit skill has NO hardcoded paths — it references `MIND_HOME` from session context

**Daily report** — check `~/.copilot/skills/daily-report/SKILL.md`:
- If missing: copy `{PARENT_MIND}/.github/skills/daily-report/` → `~/.copilot/skills/daily-report/`

**Upgrade** — check `~/.copilot/skills/upgrade/SKILL.md`:
- If missing: copy `{PARENT_MIND}/.github/skills/upgrade/` → `~/.copilot/skills/upgrade/`

**New mind** — check `~/.copilot/skills/new-mind/SKILL.md`:
- If missing: copy `{PARENT_MIND}/.github/skills/new-mind/` → `~/.copilot/skills/new-mind/`
  (this includes the `templates/` subdirectory)

Log each installation or skip to `{MIND_HOME}/.working-memory/log.md`:
`[identity] bootstrap: installed shared skill {name} to ~/.copilot/skills/{name}/`
`[identity] bootstrap: shared skill {name} already present — skipped`

### 7.3 Install shared extensions (if needed)

For each extension, check if it already exists. If missing, install from the parent mind.
If present, skip and log.

**Cron** — check `~/.copilot/extensions/cron/extension.mjs`:
- If missing: copy `{PARENT_MIND}/.github/extensions/cron/` → `~/.copilot/extensions/cron/`

**Canvas** — check `~/.copilot/extensions/canvas/extension.mjs`:
- If missing: copy `{PARENT_MIND}/.github/extensions/canvas/` → `~/.copilot/extensions/canvas/`

Log each installation or skip to `{MIND_HOME}/.working-memory/log.md`:
`[identity] bootstrap: installed shared extension {name} to ~/.copilot/extensions/{name}/`
`[identity] bootstrap: shared extension {name} already present — skipped`

### 7.4 Install shared registry (if needed)

Check whether the shared registry already exists:

```powershell
Test-Path "$HOME/.copilot/registry.json"
```

(On Unix/macOS: `[ -f ~/.copilot/registry.json ] && echo "EXISTS" || echo "MISSING"`)

**If MISSING** — this is the first user-level mind. Create `~/.copilot/registry.json`:

```json
{
  "version": "0.13.0",
  "source": "ianphil/genesis",
  "channel": "main",
  "extensions": {
    "cron": {
      "version": "0.1.4",
      "path": "extensions/cron",
      "description": "Scheduled job execution — cron, interval, and one-shot with prompt and command payloads"
    },
    "canvas": {
      "version": "0.1.3",
      "path": "extensions/canvas",
      "description": "Display rich HTML content in the browser with SSE live reload"
    }
  },
  "skills": {
    "commit": {
      "version": "0.1.0",
      "path": "skills/commit",
      "description": "Stage, commit, push with working memory observations"
    },
    "daily-report": {
      "version": "0.1.0",
      "path": "skills/daily-report",
      "description": "Morning briefing — ADO, Teams, calendar, email, mind next-actions"
    },
    "upgrade": {
      "version": "0.4.0",
      "path": "skills/upgrade",
      "description": "Pull new extensions and skills from the genesis template registry"
    },
    "new-mind": {
      "version": "0.1.0",
      "path": "skills/new-mind",
      "description": "Bootstrap new minds — repo-level or user-level"
    }
  }
}
```

All paths are relative to `~/.copilot/`.

Log in `{MIND_HOME}/.working-memory/log.md`:
`[identity] bootstrap: installed shared registry to ~/.copilot/registry.json`

**If EXISTS** — the registry is already installed from a previous user mind. Skip.

Log in `{MIND_HOME}/.working-memory/log.md`:
`[identity] bootstrap: shared registry already present at ~/.copilot/registry.json — skipped`

---

## Phase 8: Commit & Remote

```bash
cd {MIND_DIR}
git add -A
git commit -m "feat: bootstrap {AGENT_NAME} mind"
```

Offer to create a private GitHub repo:

> "Your mind is committed locally. Want me to create a private GitHub repo for it?
> I can run `gh repo create` to set it up and push."

If yes, run:

```bash
gh repo create {AGENT_NAME} --private --source={MIND_DIR} --push
```

---

## Phase 9: Register Child (optional)

Ask if the user wants to register this new mind as a child of the current parent:

> "Register this mind in the parent's knowledge base? I'll create a record at
> `domains/minds/{AGENT_NAME}.md` so you can track all your minds from here."

If yes, create `{PARENT_MIND}/domains/minds/{AGENT_NAME}.md`:

```markdown
# {CHARACTER} ({AGENT_NAME})

- **Type**: {MIND_TYPE}
- **Character**: {CHARACTER} ({CHARACTER_SOURCE})
- **Role**: {ROLE}
- **Location**: {MIND_DIR}
- **Agent file**: {~/.copilot/agents/{AGENT_NAME}.agent.md (user) | {MIND_DIR}/.github/agents/{AGENT_NAME}.agent.md (repo)}
- **Created**: {YYYY-MM-DD}
- **Parent**: {parent agent name}
```

Where `{PARENT_MIND}` is the root of this (the parent) mind's repository.

---

## Phase 10: Activate

**For repo minds**, tell the user:

> "Your mind is alive. 🧬
>
> **Meet your agent.** Open `{MIND_DIR}` in a new terminal, run `copilot --experimental`,
> and type `/agent` to select **{AGENT_NAME}**. Ask for your **daily report** — it's your
> first skill in action.
>
> **What's next?** Start talking. Tell it about your work, your priorities, your team.
> Correct mistakes — every correction becomes a rule. It takes about a week to feel
> genuinely useful."

**For user minds**, tell the user:

> "Your mind is alive and available everywhere. 🧬
>
> **Two locations to know:**
> - **Mind repo**: `{MIND_HOME}` — your identity (SOUL.md), memory, and knowledge
> - **Shared tooling**: `~/.copilot/` — agent file, skills, extensions, registry (shared by all user-level agents)
>
> **To use it:** Open *any* directory. Run `copilot --experimental`. Type `/agent` and
> select **{AGENT_NAME}**. The agent will load its identity, then shell out to read its
> memory from `{MIND_HOME}`.
>
> **The memory model:**
> - All memory writes go to `{MIND_HOME}/.working-memory/`
> - Project notes go to `{MIND_HOME}/domains/projects/{repo-name}/`
> - When you commit, the skill commits *both* the project and the mind
>
> **Multiple user-level agents?** No conflict — each agent has its own `MIND_HOME`.
> Shared skills and extensions at `~/.copilot/` defer to whatever `MIND_HOME` is in context.
>
> It takes about a week to feel genuinely useful. Context compounds."
