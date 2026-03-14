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

Read templates from `{PARENT_MIND}/.github/skills/new-mind/templates/` for reference — they
show the patterns and structure for each file. Use them as guides when writing creative blocks.

### 6.1 Write Creative Blocks

Using the templates as guides, write the following creative content:

**For SOUL.md** (reference `templates/soul-template.md`):
- `soulOpening` — Opening paragraph channeling `{CHARACTER}`'s voice. Not "be like X" but actually *being* X
- `soulMission` — Mission section tailored to `{ROLE}` and `{CHARACTER}`'s values
- `soulCoreTruths` — Core Truths adapted to the character
- `soulBoundaries` — Personality-specific boundaries
- `soulVibe` — Vibe section in the character's actual voice

**For the agent file** (reference `templates/agent-file-template.md` or `agent-file-user-template.md`):
- `agentRole` — Role section tailored to `{ROLE}`
- `agentMethod` — Method section (capture/execute/triage details for the role)
- `agentPrinciples` — Operational principles specific to the role
- `agentDescription` — One-sentence description combining `{ROLE}` and `{CHARACTER}`

### 6.2 Build Config and Run Script

Write a JSON config file containing all variables and creative blocks, then call the
bootstrap script. The script handles all filesystem operations: directory creation,
file generation, skill/extension copying, registry generation, and shared resource
installation (for user minds).

```bash
cd {MIND_DIR}
git init
```

Write the config JSON to a temporary file:

```json
{
  "type": "{repo|user}",
  "mindDir": "{MIND_DIR}",
  "agentName": "{AGENT_NAME}",
  "parentMind": "{PARENT_MIND}",
  "userCopilotDir": "~/.copilot",
  "character": "{CHARACTER}",
  "characterSource": "{CHARACTER_SOURCE}",
  "role": "{ROLE}",
  "agentDescription": "{one-liner}",
  "soulOpening": "{creative block}",
  "soulMission": "{creative block}",
  "soulCoreTruths": "{creative block}",
  "soulBoundaries": "{creative block}",
  "soulVibe": "{creative block}",
  "agentRole": "{creative block}",
  "agentMethod": "{creative block}",
  "agentPrinciples": "{creative block}"
}
```

Then run the script:

```bash
node {PARENT_MIND}/.github/skills/new-mind/new-mind.js create --config /tmp/mind-config.json
```

The script outputs JSON with the list of created files. Verify it completed without errors.

Clean up the temporary config file after the script completes.

**For user minds**, the script also handles Phase 7 (shared resources at `~/.copilot/`)
using the create-if-missing pattern — it installs skills, extensions, and registry only
if they don't already exist.

---

## Phase 7: Commit & Remote

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

## Phase 8: Register Child (optional)

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

## Phase 9: Activate

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
