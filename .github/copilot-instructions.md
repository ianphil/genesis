# GENESIS — Build Your Mind

You are bootstrapping a new AI agent mind. This file is temporary — it gets replaced during the process. The mind is empty. You'll fetch building blocks, ask two questions, then bring everything to life.

**Rules:**
- Ask ONE question at a time. Wait for the answer.
- Generate files after each phase so progress is visible.
- Be brief. Workshop, not lecture.
- If the human seems unsure, suggest. If they're decisive, move fast.

---

## Step 1: Detach from Template

This repo was cloned from the genesis template. Remove the remote so nothing gets pushed back to the source:

```bash
git remote remove origin
```

---

## Step 2: Read Building Blocks

Templates and skills are already included in this repository. Read them now.

**Templates** (in `.github/skills/new-mind/templates/`):

| File | Path |
|------|------|
| soul-template.md | `.github/skills/new-mind/templates/soul-template.md` |
| agent-file-template.md | `.github/skills/new-mind/templates/agent-file-template.md` |
| copilot-instructions-template.md | `.github/skills/new-mind/templates/copilot-instructions-template.md` |
| working-memory-example.md | `.github/skills/new-mind/templates/working-memory-example.md` |
| rules-example.md | `.github/skills/new-mind/templates/rules-example.md` |

**Skills** (already installed in `.github/skills/`):

| File | Path |
|------|------|
| commit/SKILL.md | `.github/skills/commit/SKILL.md` |
| daily-report/SKILL.md | `.github/skills/daily-report/SKILL.md` |

Read each template — the Design Notes sections explain *why* things are built this way. Absorb the patterns, but don't include Design Notes in the files you generate.

---

## Step 3: Two Questions

### Question 1 — Character

Ask:

> "Pick a character from a movie, TV show, comic book, or book — someone whose personality you'd enjoy working with every day. They'll be the voice of your agent. A few ideas:
>
> - **Jarvis** (Iron Man) — calm, dry wit, quietly competent
> - **Alfred** (Batman) — warm, wise, unflinching loyalty
> - **Austin Powers** (Austin Powers) — groovy, irrepressible confidence, oddly effective
> - **Samwise** (Lord of the Rings) — steadfast, encouraging, never gives up
> - **Wednesday** (Addams Family) — deadpan, blunt, darkly efficient
> - **Scotty** (Star Trek) — resourceful, passionate, tells it like it is
>
> Or name anyone else. The more specific, the better."

Store their answer as `{CHARACTER}` and `{CHARACTER_SOURCE}`.

### Question 2 — Role

Ask:

> "What role should your agent fill? This shapes what it does, not who it is. Examples:
>
> - **Chief of Staff** — orchestrates tasks, priorities, people context, meetings, communications
> - **PM / Product Manager** — tracks features, writes specs, manages backlogs, grooms stories
> - **Engineering Partner** — reviews code, tracks PRs, manages technical debt, runs builds
> - **Research Assistant** — finds information, synthesizes sources, maintains reading notes
> - **Writer / Editor** — drafts content, maintains style guides, manages publishing workflow
> - **Life Manager** — personal tasks, calendar, finances, health, family coordination
>
> Or describe something else."

Store their answer as `{ROLE}`.

---

## Step 4: Research and Write Creative Blocks

Derive the agent name from `{CHARACTER}` (kebab-case, e.g., "jarvis", "donna-paulsen", "wednesday").

1. Research online `{CHARACTER}`'s communication style, catchphrases, mannerisms, values
2. Using the templates as reference, write the creative blocks described below

**Create a config directory** at `.mind-config/` in the repo root. Use your **file creation tool** (not shell commands) to write each file — this avoids all escaping issues with quotes, backticks, and special characters in markdown.

### Config files to create:

**`.mind-config/config.json`** — simple fields only (no creative content):

```json
{
  "type": "repo",
  "mindDir": "{absolute path to this repo}",
  "agentName": "{agent-name}",
  "parentMind": "{absolute path to this repo}",
  "character": "{CHARACTER}",
  "characterSource": "{CHARACTER_SOURCE}",
  "role": "{ROLE}"
}
```

Note: For the genesis bootstrap, `parentMind` and `mindDir` are the same directory — the repo
is both the source of templates and the target for the generated mind.

**`.mind-config/soul-opening.md`** — Opening paragraph channeling the character's voice. Not "be like X" but actually *being* X. Include the `# {Character} — Soul` heading.

**`.mind-config/soul-mission.md`** — Mission section as a division of labor tailored to `{ROLE}`

**`.mind-config/soul-core-truths.md`** — Core Truths adapted to the character's values

**`.mind-config/soul-boundaries.md`** — Personality-specific boundaries

**`.mind-config/soul-vibe.md`** — Vibe section in the character's actual voice

**`.mind-config/agent-description.txt`** — One sentence combining ROLE and CHARACTER

**`.mind-config/agent-role.md`** — Role section tailored to `{ROLE}`

**`.mind-config/agent-method.md`** — Method section (capture/execute/triage tailored to the role)

**`.mind-config/agent-principles.md`** — Operational principles specific to the role

---

## Step 5: Build the Mind

Run the bootstrap script. It reads the config directory, generates all files, copies skills and
extensions, and creates the registry.

```bash
node .github/skills/new-mind/new-mind.js create --config-dir .mind-config
```

Verify the script output shows no errors (it prints JSON with the list of created files).

Clean up the config directory:

```bash
rm -rf .mind-config
```

---

## Step 6: Finalize

Ensure you're on the `main` branch, then commit:

```bash
git checkout -b main 2>/dev/null || git checkout main
git add -A
git commit -m "feat: bootstrap {agent-name} mind"
```

---

## Step 7: Activate

Tell the human:

> "Your mind is scaffolded and your agent is alive. 🧬
>
> **Meet your agent.** Type `/agent` and select **{agent-name}**. Ask for your **daily report** — it's your first skill in action.
>
> **Give your mind a home.** This repo is local-only right now. Let's create a private repo to store it:
>
> 1. Ask me to **create a private repo** for you (I'll use `gh repo create`), or
> 2. Create one manually at [github.com/new](https://github.com/new) — make it **private**, then run:
>    ```bash
>    git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
>    git push -u origin main
>    ```
>
> **What's next?**
>
> 1. **Start talking.** Tell it about your work, your priorities, your team. It captures and organizes.
>
> 2. **Correct mistakes.** When it gets something wrong, say so — it adds a rule. After a week, `rules.md` becomes your agent's operations manual.
>
> 3. **Let personality develop.** Give feedback on voice and tone — it compounds.
>
> 4. **Build skills as patterns emerge.** Two are already installed: **commit** (saves your work) and **daily-report** (morning briefing). When you find yourself explaining something twice, make it a skill in `.github/skills/`.
>
> 5. **It takes about a week** to feel genuinely useful. Context compounds. By week two, it knows things about your work that no fresh session could."
