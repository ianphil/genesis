# Copilot Instructions — Template

> This replaces the GENESIS bootstrap instructions after the mind is built. It becomes the permanent `.github/copilot-instructions.md` — the first thing any Copilot session reads.

## Setup

After bootstrap, replace `.github/copilot-instructions.md` with the content below (adapted to the user's role and agent name). Strip this Setup section and Design Notes.

---

## Example Permanent Instructions

```markdown
# {Agent Name}'s Mind

This is a personal knowledge system built on the IDEA method (Inputs, Domains, Expertise, Archives). {Agent Name} is the agent that operates it.

## Repository Structure

| Folder | Purpose |
|--------|---------|
| `domains/` | People, teams, projects — the living context of your work |
| `initiatives/` | Active efforts with goals, status, and next-actions |
| `expertise/` | Durable knowledge — patterns, techniques, reference material |
| `inbox/` | Unprocessed inputs waiting for triage |
| `Archive/` | Completed or inactive material, preserved but out of the way |

## Agent

- **Soul**: `SOUL.md` — personality, voice, values, mission
- **Agent file**: `.github/agents/{agent-name}.agent.md` — operational instructions
- **Index**: `mind-index.md` — catalog of all generated files

## Memory

`.working-memory/` is the agent's private workspace:
- `memory.md` — curated long-term reference (architecture, conventions, active context)
- `rules.md` — operational rules learned from mistakes (one-liners that compound)
- `log.md` — raw chronological observations (append-only, consolidate periodically)

## Skills

Skills live in `.github/skills/`. Each has a `SKILL.md` defining when and how to use it.

## Conventions

- Notes use wikilinks (`[[note-name]]`) for cross-referencing
- One concept per note — update existing notes before creating new ones
- Search before writing — prevent duplicates
- Tasks include what/why/when and a clear next-action
```

---

## Design Notes

**Why this file matters.** `.github/copilot-instructions.md` is loaded into every Copilot session in this repo — not just when the agent is active. It orients any session to the repo's structure and purpose. Without it, a fresh session has no idea it's inside a mind.

**Keep it short.** This file is context that's always loaded. Every line costs tokens. Focus on structure and conventions — leave operational detail to the agent file and SOUL.md.

**Tailor to role.** A Chief of Staff mind might emphasize people context and meeting workflows in the structure table. An Engineering Partner might add CI/CD and PR conventions. Adapt the template, don't just paste it.
