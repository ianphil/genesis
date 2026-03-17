# Commit Skill

Stage changes, write observations to working memory, commit, and push.

## When to Use

- "Commit and push"
- "Save my work"
- "Push my code"
- Any time you want to persist changes to the remote

## What It Does

The commit skill is more than `git add && git commit && git push`. It enforces a discipline:

1. **Review** — scans `git status` and `git diff` to understand what changed
2. **Observe** — reflects on the session and appends observations to `.working-memory/log.md` (architecture patterns, gotchas, surprising behavior, conventions discovered)
3. **Commit** — stages files explicitly (not `git add -A`), writes a conventional commit message matching the repo's existing style
4. **Push** — pushes to remote, handling rebase if needed
5. **Refresh** — checks if `.working-memory/briefing.md` needs updating

## Commit Message Format

```
<type>: <short description>

<optional body explaining why>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

## Rules

- No `Co-Authored-By`, `Signed-off-by`, or any trailer attributions
- No `git add -A` — files are staged explicitly
- Working memory observations are mandatory unless genuinely nothing was learned
- Warns before pushing to `main` or `master`

## Reference

Full details: [skill definition](../.github/skills/commit/SKILL.md)
