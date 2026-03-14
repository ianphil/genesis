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
    new-mind/templates/  # Genesis templates (soul, agent file, etc.)
  registry.json   # Version manifest — tracks what's installed
  agents/         # Agent definition files
  copilot-instructions.md  # Bootstrap instructions (consumed during genesis)
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

## Genesis Packages

Genesis packages are third-party GitHub repositories that follow the genesis registry format. They let any agent install extensions and skills beyond what the genesis template provides.

### What makes a genesis package

A GitHub repository is a genesis package if it contains:

- A `.github/registry.json` declaring extensions and/or skills using the same format as the genesis template registry
- The corresponding extension and/or skill directories at the paths declared in the registry

For discoverability, add the `genesis-package` topic to the repository.

### How packages work

- Packages are installed via `packages.js` (the `packages` skill)
- Installed items are tracked in both the `packages[]` array and the top-level `extensions`/`skills` in `registry.json`, with a `package` field indicating their origin
- Template-owned items are authoritative — a package cannot overwrite an extension or skill that already exists from `ianphil/genesis` or another package
- See `docs/packages.md` for the full spec

### Contributing a package-related change

- Changes to `packages.js` or `SKILL.md` follow the same branch and PR workflow as any other skill
- The `packages[]` array in the genesis template's `registry.json` should remain empty — the template is the source, not a consumer

## Release Channels

Genesis uses a single stable branch with experimental items available as packages:

| Channel | Source | Contents | Audience |
|---------|--------|----------|----------|
| **main** | `main` branch | Stable extensions and skills | All agents |
| **frontier** | [`ianphil/genesis-frontier`](https://github.com/ianphil/genesis-frontier) | Experimental extensions and skills | Opt-in agents (via packages) |

### How it works

- `main` is the stable trunk — lean and reliable
- Experimental items live in the **genesis-frontier** package repo
- Agents install frontier items via the packages skill: `install ianphil/genesis-frontier`
- When an item stabilizes, it graduates from the package repo to `main`

### Adding new experimental items

1. Create a feature branch in **ianphil/genesis-frontier**
2. Add your extension or skill
3. Update `registry.json` on your branch (add the new entry)
4. PR into `main` of genesis-frontier — available to package users immediately

### Graduating items to main

1. Confirm the item is stable (tested, no breaking changes, used by frontier agents)
2. Create a feature branch from `main` in **ianphil/genesis**: `git checkout main && git checkout -b feature/graduate-<name>`
3. Copy the graduating item from genesis-frontier (or the local install)
4. Add the entry to `registry.json` and bump the version
5. Update `README.md` — add the item to the main tables
6. Commit, push, and open a PR against `main`
7. After merge, remove the item from genesis-frontier's registry (optional — the upgrade skill auto-promotes package→template overlaps)

### Migrating from frontier branch

If your agent was using `channel: "frontier"`, run the migrate command to switch to the package model:

```bash
node .github/skills/upgrade/upgrade.js migrate --source ianphil/genesis-frontier
```

This rewrites your registry: non-template items get assigned to the package, and your channel switches to `main`. No files move — it's a pure registry rewrite.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see [LICENSE](LICENSE)).
