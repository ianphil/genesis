# Packages Skill

Install, remove, and manage extensions and skills from third-party genesis packages.

## When to Use

- "Install the frontier package"
- "What packages are installed?"
- "Check for updates from someuser/cool-extensions"
- "Remove the weather extension"
- Any time you want to add capabilities beyond the genesis template

## What Is a Genesis Package

A genesis package is any GitHub repository that contains a `.github/registry.json` declaring extensions and/or skills. Package authors add the `genesis-package` topic to their repo for discoverability.

Packages are referenced as `owner/repo` (e.g., `ianphil/genesis-frontier`). An optional `@ref` pins to a specific tag or branch.

## Quick Example

```
> install ianphil/genesis-frontier
```

```
═══════════════════════════════════════════
  ✅ PACKAGE INSTALLED
  Source: ianphil/genesis-frontier@main
═══════════════════════════════════════════

Installed:
  📦 heartbeat v0.1.0 — 8 files
  📦 code-exec v0.1.0 — 12 files, npm installed
  📦 tunnel v0.1.0 — 6 files

Registry updated.
```

## Commands

| Command | What It Does |
|---------|-------------|
| `search <owner/repo>` | Browse what a package offers |
| `install <owner/repo>` | Install all or selected items |
| `install <owner/repo> --items a,b` | Install specific items only |
| `remove <owner/repo>` | Uninstall all items from a package |
| `list` | Show all installed packages |
| `check <owner/repo>` | Compare installed vs remote versions |

## How It Works

1. Fetches the remote `.github/registry.json` from the package repo
2. Downloads files for each requested item
3. Runs `npm install` if a `package.json` exists in the item's directory
4. Updates local `.github/registry.json` — both `packages[]` and top-level entries

## Conflict Resolution

- Template items are authoritative — packages cannot overwrite genesis-owned extensions or skills
- Conflicts are skipped, not failed — one conflict doesn't block other items
- Skipped items are reported with a reason

## Rules

- Always shows search results before installing — lets you see and select
- Confirms before removing — removals delete directories
- Requires `gh` CLI to be authenticated

## Reference

Full details: [skill definition](../.github/skills/packages/SKILL.md)
