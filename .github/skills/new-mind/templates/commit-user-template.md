---
name: commit
description: This skill should be used when the user asks to "commit changes", "push my code", "commit and push", "save my work", or wants to stage all changes and push to remote. For user-level agents with a mind at MIND_HOME.
---

# Commit (User-Level Mind)

Stage changes, record observations, commit the project, and commit the mind.

This skill is shared across all user-level agents. It has NO hardcoded paths.
Your `MIND_HOME` was established at session start from your agent file — use it here.

## Phase 0: Locate Your Mind

You loaded `MIND_HOME` at session start from your agent file.

If you don't have `MIND_HOME` in context, recover it now:

On Windows (PowerShell):
```powershell
Get-Content "$HOME\.copilot\agents\{your-agent-name}.agent.md" | Select-Object -First 20
```

On macOS/Linux:
```bash
head -20 ~/.copilot/agents/{your-agent-name}.agent.md
```

The first lines after the frontmatter declare `MIND_HOME`. Read it and hold it for all
subsequent phases.

Do NOT proceed without knowing `MIND_HOME`.

## Phase 1: Review Changes

Note the current directory — this is `PROJECT_DIR`.

```bash
git status
git diff --stat
git diff
```

Understand what changed and why. This context feeds Phase 2.

## Phase 2: Write Working Memory

**This phase is mandatory.** Every commit must evaluate whether observations belong in
`{MIND_HOME}/.working-memory/log.md`.

Identify the project name from `PROJECT_DIR` (use the repo folder name as `{repo-name}`).

Reflect on the **entire session** — not just the diff. Consider:

- Architecture patterns or gotchas discovered
- Build/test commands that aren't documented
- Surprising behavior, race conditions, edge cases
- File relationships or conventions not obvious from code
- Dependency quirks or version constraints
- Anything the user told you about their preferences or working style

**Append** to `{MIND_HOME}/.working-memory/log.md` using this exact format:

```markdown
## YYYY-MM-DD
- [{repo-name}] <area>: <one-line observation>
- [identity] <area>: <one-line observation>
```

Tagging rules:
- `[{repo-name}]` — for observations specific to the project being committed
- `[identity]` — for rules, preferences, or meta-observations about the user

If significant project context was learned, update or create:
`{MIND_HOME}/domains/projects/{repo-name}/context.md`

Do NOT write memory files into `PROJECT_DIR`. All memory goes to `{MIND_HOME}`.

### When to skip

Only skip if **genuinely nothing new was learned** in this session. This should be rare.

## Phase 3: Commit the Project

```bash
git log -3 --oneline
```

Match the existing commit style. Stage files explicitly — do NOT include memory files:

```bash
git add <changed project files>
git commit -m "<type>: <short description>"
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

## Phase 4: Push the Project

```bash
git push
```

If push is rejected (behind remote):

```bash
git pull --rebase
git push
```

## Phase 5: Commit the Mind

```bash
cd {MIND_HOME}
git add .working-memory/log.md
git add .working-memory/memory.md
git add .working-memory/rules.md
```

If project context was updated:

```bash
git add domains/projects/{repo-name}/
```

```bash
git commit -m "memory: session in {repo-name} — <brief summary of what was learned>"
```

Skip this phase only if nothing was written to the mind this session.

## Phase 6: Push the Mind

```bash
git push
```

If push is rejected:

```bash
git pull --rebase
git push
```

## Phase 7: Return to Project

```bash
cd {PROJECT_DIR}
```

Always return to `PROJECT_DIR` after committing the mind. Do not leave the user's
shell anchored to `{MIND_HOME}`.

## Rules

- Do NOT write memory files to `PROJECT_DIR` — all memory goes to `{MIND_HOME}`
- Do NOT skip Phase 2 without explicitly stating why nothing was learned
- Do NOT skip Phase 5 if memory was written — committed memory is durable; uncommitted memory is lost
- Do NOT add Co-Authored-By, Signed-off-by, or any trailer attributions
- If on `main` or `master` in the project repo, warn the user before pushing
- Always return to `PROJECT_DIR` at the end — Phase 7 is not optional
