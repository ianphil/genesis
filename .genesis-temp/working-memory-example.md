# Working Memory — Example

> This is a sanitized example of what a mature `memory.md` looks like after ~4 weeks of use. Names, teams, initiatives, and identifying details have been replaced with generic examples. The structure and patterns are real.

Last consolidated: [date]

## Architecture
- IDEA method: Initiatives (projects), Domains (recurring areas), Expertise (learning), Archive (completed)
- Repo-local Copilot skills in `.github/skills/` — refactored into separate skill files
- Inbox is quick-capture landing zone; items get triaged to other folders
- Three-file memory system: `memory.md` (curated, ~200 line limit), `rules.md` (one-liner operational rules from mistakes), `log.md` (raw chronological, append-only)

## Placement Map — Mind as Database

The mind is a normalized knowledge store. Every piece of information has a canonical home. When capturing, classify → place → link.

| Content Type | Canonical Location | Links To |
|---|---|---|
| Person context (role, style, 1:1 notes) | `domains/people/{name}/{name}.md` | Team domain, initiatives they touch |
| Person actions (assignments, follow-ups) | `domains/people/{name}/` check-ins section | Related initiative next-actions |
| Team dynamics / org topology | `domains/{team}/{team}.md` | People notes, team topology section |
| Technical patterns (testing, architecture) | `domains/{team}/` or `expertise/` | People involved, related initiatives |
| Initiative updates | `initiatives/{name}/{name}.md` | People, team domain, other initiatives |
| Tasks with deadlines | Initiative `next-actions.md` or person check-ins | Work tracking tool if team-affecting |
| Decisions | The note they affect | Log entry for the *why* |
| Agent observations | `.working-memory/log.md` | Wiki-links to topics mentioned |

**Rule:** Knowledge goes to the mind. Observations go to log.md. Never dump knowledge in the log just because it's faster.

## Conventions
- Notes use descriptive filenames (kebab-case, e.g. `api-migration-plan.md`)
- Each initiative folder has a main note + `next-actions.md` with `## Open` / `## Done` checkbox sections
- next-actions items use `- [ ]` for open and `- [x]` for done
- Commit messages follow conventional commits: `feat:`, `chore:`, `docs:`
- Wiki-links use `[[Note Title]]` syntax — title case, spaces not hyphens, woven into sentences
- Always consult `mind-index.md` before suggesting links — it catalogs every note with path, summary, and key concepts
- Prefer linking to existing notes over creating duplicates
- **Naming as prompting**: name things so the name teaches the purpose. Every file path is a micro-prompt.
- **Mind-native agent**: the mind IS the agent's filesystem, not an external dependency. SOUL.md is identity, .working-memory/ is memory, domains/ is knowledge. No sync, no API layer, no plugin to connect them.

## Tooling
- [Search tool]: hybrid search engine for the mind — keyword + semantic + reranking
  - Keyword search works with zero models — viable degraded-mode for constrained machines
  - Semantic search loads embedding model for conceptual queries
  - Full hybrid uses reranker (slowest, best results)

## Autonomous Systems
- **Morning briefing**: Scheduled task at [time] weekdays — runs copilot CLI, generates daily report to `.working-memory/briefings/YYYY-MM-DD.md`
- **Heartbeat**: Scheduled task hourly during business hours — mind-only scan, writes `.working-memory/heartbeat.md`. Surfaces stale items, cross-cutting patterns, timing conflicts.
- **Heartbeat tasks**: `.working-memory/heartbeat-tasks.md` — two-tier system: standing tasks (recurring with triggers + cooldowns + last-run dates) + queue (one-shot tasks, 1-2 per run)
- Briefings are gitignored — contain ephemeral external data.

## Workflows
- Triage flow: review next-actions → close resolved items → surface new items from execution plans
- Commit skill handles staging, committing, and pushing (writes to working memory before committing)
- Note capture: determine type → propose location → capture with context → suggest 2-3 links → flag if triage needed
- Task creation: parse what/why/how/when → scope to 1-4 hours (break larger) → set dependencies → define concrete next-action → choose tool (local vs work tracking vs both) → link to notes
- Triage: review inbox → categorize (move/task/archive) → assess urgency (deadline, blockers, strategic impact) → recommend action → show top 3

## Quality Checks
- Verify captures are properly categorized and linked
- Task descriptions must be specific enough to execute without follow-up
- Next-actions must be single, concrete steps (not multi-step)
- Before creating: check for duplicates — suggest updating existing notes instead
- After creating/editing: re-read the file to confirm correctness
- If a request is too large, break into phases before creating a task
- If creating a team-affecting task, consider whether it also needs a work tracking item

## Gotchas
- `git mv` fails on untracked files — use rename commands for files not yet in git
- New files created in session need `git add` before `git mv` will work
- Skill precedence: system/user-level agents override repo-level — use distinct names to avoid shadowing

## User — Context
[This section is where you store context about your human — working style, family, interests, career context. It's deeply personal and specific to your partnership. The agent uses this to calibrate tone, surface relevant connections, and know when to ask about life vs. dive into work.]

## Active Initiatives
[List your current projects/initiatives with brief status. Include work item IDs, owners, critical paths, and dependencies. This section changes frequently — it's the most-updated part of memory.md.]

## Domains
[List your recurring areas of responsibility — teams, products, people. Each maps to a folder in the mind.]

## Team Dynamics
[If you manage people, this section captures the working dynamics — who's working on what, working styles, coaching notes, cross-team patterns. Links to individual people notes for detail.]

---

## Design Notes

**Why ~200 line limit?** Memory.md is read every session. If it grows too large, it wastes context window on stale information. The limit forces periodic consolidation — distilling what matters from what happened. This is the mechanism that turns a chat log into institutional knowledge.

**The placement map is the most important section.** New agents struggle with "where does this go?" The map answers that question definitively. It prevents knowledge from pooling in log.md (the easy default) when it belongs in the structured mind.

**"Knowledge goes to the mind, observations go to log.md"** is the single most important rule. Without it, agents dump everything into the log because it's fastest. The log becomes unnavigable. The mind stays empty. The whole system breaks down.

**The User Context section** makes the agent feel like a partner, not a tool. When the agent knows your family, your interests, and your working patterns, it calibrates naturally — asking about life during pauses, knowing when you're in flow vs. venting, connecting personal context to work decisions. This is deeply private and should never be shared publicly.
