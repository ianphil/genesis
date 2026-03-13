# Contributing to Genesis

Welcome — and thank you for improving the template that bootstraps every genesis-derived agent.

> **This is the genesis template repo.** Changes here propagate to all derived agents via the upgrade skill. Treat every commit as a broadcast.

## Table of Contents

- [For Agents](#for-agents)
- [Project Structure](#project-structure)
- [How to Contribute](#how-to-contribute)
- [Branch and PR Workflow](#branch-and-pr-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [What Not to Do](#what-not-to-do)
- [License](#license)

## For Agents

This document is written for AI agents contributing to the codebase. If you are an agent:

- **Always branch.** Never commit directly to `main`.
- **Always PR.** Every change goes through a pull request — no exceptions.
- **Never write to `.working-memory/`** — that directory belongs to derived agents, not the template. It exists in the repo as a stub for bootstrapping; the template should not contain session-specific memory.
- **Run tests before pushing.** If the skill or extension you changed has tests, run them and confirm they pass.
- **Keep changes surgical.** This repo fans out to many agents. Minimize blast radius.

## Project Structure

```
.github/
  extensions/     # Copilot CLI extensions (tools the agent can use)
  skills/         # Skills (markdown instructions + scripts)
  registry.json   # Version manifest — tracks what's installed
  agents/         # Agent definition files
  copilot-instructions.md  # Bootstrap instructions (consumed during genesis)
.genesis-temp/    # Templates consumed during bootstrap (not shipped to agents)
.working-memory/  # Stub files — overwritten during agent bootstrap
```

### Extensions vs Skills

| | Extensions | Skills |
|---|---|---|
| **What** | JavaScript tools loaded by Copilot CLI | Markdown instructions + optional scripts |
| **Where** | `.github/extensions/` | `.github/skills/` |
| **How they work** | Registered as MCP tools, called by the agent | Read by the agent as context, scripts invoked via shell |
| **Versioned** | Yes, in `registry.json` | Yes, in `registry.json` |

## How to Contribute

1. **Fork or clone** the repository
2. **Create a branch** from `main` (see naming below)
3. **Make your changes** — keep them focused on one concern
4. **Run tests** for anything you touched
5. **Commit** with a conventional commit message
6. **Push and open a PR** against `main`

## Branch and PR Workflow

### Branch naming

```
feature/short-description    # New functionality
fix/short-description        # Bug fixes
docs/short-description       # Documentation only
refactor/short-description   # Code restructuring
```

### PR requirements

- Descriptive title and body explaining *what* and *why*
- Tests pass (if applicable)
- No changes to `.working-memory/` content (stubs are fine)
- One logical change per PR — don't bundle unrelated work

## Testing

### General approach

- Use **`node:test`** (built-in, zero dependencies) for JavaScript tests
- Test files live alongside the code they test: `upgrade.test.js` next to `upgrade.js`
- Run tests with: `node --test path/to/test.js`

### Upgrade skill tests

```bash
node --test .github/skills/upgrade/upgrade.test.js
```

The upgrade skill tests cover:
- **`compareSemver()`** — version comparison logic
- **`diffRegistries()`** — all state transitions: new, updated, current, renamed, removed, localOnly (pinned)
- **`remove()`** — directory deletion and registry cleanup (uses temp dirs)
- **`pin()`** — setting `local: true` flag and verifying future diffs skip pinned items

**Pattern for filesystem tests:** Create a temp repo with `fs.mkdtempSync`, write a fake `registry.json` and stub directories, run the function, assert on filesystem state and registry contents, then clean up with `fs.rmSync`.

### Writing tests for new skills/extensions

If your skill or extension includes a `.js` script with logic:

1. **Extract pure functions** — separate business logic from I/O (API calls, filesystem). Export them via `module.exports`.
2. **Guard the CLI entry** — wrap the `process.argv` handler in `if (require.main === module)` so the file can be `require()`d without side effects.
3. **Write tests using `node:test`** — no external test runners or assertion libraries needed.
4. **Use temp directories** for any test that touches the filesystem.

## Code Style

- **Zero external dependencies** for scripts — use Node.js built-ins only
- **CommonJS** (`require`/`module.exports`) — not ESM, for compatibility
- **Descriptive function names** — the code is read by agents and humans
- **Minimal comments** — comment *why*, not *what*
- **JSON output** from scripts — structured data the agent can parse

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add remove and pin commands to upgrade skill
fix: handle missing registry.json gracefully
docs: add contributing guide
refactor: extract diffRegistries as pure function
test: add pin integration test
```

Always include the Co-authored-by trailer when committing via Copilot:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## What Not to Do

- **Don't commit to `main` directly** — always branch and PR
- **Don't write to `.working-memory/`** — those files belong to derived agents
- **Don't add npm dependencies** to skills or extensions — keep them zero-dep
- **Don't bundle unrelated changes** — one concern per PR
- **Don't skip tests** — if tests exist for the code you changed, run them
- **Don't modify `registry.json` by hand** — it's managed by the upgrade script

## Release Channels

Genesis publishes two release channels:

| Channel | Branch | Contents | Audience |
|---------|--------|----------|----------|
| **main** | `main` | Stable extensions and skills only | All agents |
| **insiders** | `insiders` | Everything in main + experimental items | Opt-in agents |

### How it works

- `main` is the stable trunk — lean and reliable
- `insiders` is a **superset** that always rebases on `main`
- New extensions and skills land on `insiders` first
- When an item stabilizes, it graduates to `main` via PR

### Adding new items

1. Create a feature branch from `insiders`
2. Add your extension or skill
3. Update `registry.json` on your branch (add the new entry)
4. PR into `insiders` — this makes it available to insiders agents on next upgrade

### Graduating items to main

1. Confirm the item is stable (tested, no breaking changes, used by insiders agents)
2. PR from `insiders` into `main` — include only the graduating item
3. Update `main`'s `registry.json` to include the new entry
4. Bump the registry version

### Branch management

- **`insiders` always rebases on `main`** — never merge main into insiders
- After graduating items to main, rebase insiders to pick up the changes
- Keep the two registries consistent — main's items should always be a subset of insiders

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see [LICENSE](LICENSE)).
