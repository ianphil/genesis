---
name: packages
description: Install, remove, and manage extensions and skills from third-party Genesis packages. Use when the user asks to install a package from another repo, list installed packages, remove a third-party package, or check for updates from a specific package source.
---

# Genesis Packages

Install extensions and skills from any GitHub repository that follows the Genesis package format.

**This skill includes `packages.js`** — a script that handles registry lookups, file downloads, conflict detection, and registry updates. Your job is to run it and handle UX.

## Prerequisites

- `gh` CLI must be authenticated (`gh auth status`)
- `.github/registry.json` must exist (created during genesis bootstrap)
- The target package repo must have a `.github/registry.json` following the Genesis registry format

## What is a Genesis Package

A Genesis package is any GitHub repository that contains a `.github/registry.json` declaring extensions and/or skills. Package authors add the `genesis-package` topic to their repo for discoverability.

Packages are referenced as `owner/repo` (e.g. `someuser/cool-extensions`). An optional `@ref` pins to a specific tag or branch (e.g. `someuser/cool-extensions@v1.0.0`).

## Natural Language Triggers

- "install the weather extension from someuser/cool-extensions"
- "install package from someuser/cool-extensions@v1.0.0"
- "what packages are installed?"
- "remove the someuser/cool-extensions package"
- "check for updates from someuser/cool-extensions"
- "what's available in someuser/cool-extensions?"

## Commands

### Search — browse what a package offers

```bash
node .github/skills/packages/packages.js search someuser/cool-extensions
node .github/skills/packages/packages.js search someuser/cool-extensions@v1.0.0
```

Output JSON:

```json
{
  "source": "someuser/cool-extensions",
  "ref": "main",
  "version": "0.3.0",
  "extensions": [
    {"name": "weather", "version": "0.1.0", "description": "Weather data lookups"}
  ],
  "skills": []
}
```

Present this as a readable list. Ask the user which items they want to install.

### Install — add items from a package

```bash
node .github/skills/packages/packages.js install someuser/cool-extensions
node .github/skills/packages/packages.js install someuser/cool-extensions@v1.0.0
node .github/skills/packages/packages.js install someuser/cool-extensions --ref v1.0.0
node .github/skills/packages/packages.js install someuser/cool-extensions --items weather,forecast
```

This:
- Fetches the remote `.github/registry.json`
- Downloads files for each requested item (all items if `--items` not specified)
- Runs `npm install --production` if `package.json` exists in an item's directory
- Updates `.github/registry.json`: adds to `packages[]` array AND merges into top-level `extensions`/`skills` with a `package` field

Output JSON:

```json
{
  "source": "someuser/cool-extensions",
  "ref": "main",
  "installed": [{"name": "weather", "type": "extension", "version": "0.1.0", "files": 3, "npmInstalled": false}],
  "updated": [],
  "skipped": [],
  "errors": [],
  "registryUpdated": true
}
```

Items in `skipped` have a `reason` — typically a conflict with an existing extension or skill. Always report skipped items to the user.

### Remove — uninstall items from a package

```bash
node .github/skills/packages/packages.js remove someuser/cool-extensions
node .github/skills/packages/packages.js remove someuser/cool-extensions --items weather
```

This:
- Removes files from disk (staged removal for safety)
- Cleans up registry entries from both `packages[]` and top-level `extensions`/`skills`
- If all items from a package are removed, removes the package entry entirely

Output JSON:

```json
{
  "source": "someuser/cool-extensions",
  "removed": [{"name": "weather", "type": "extension", "version": "0.1.0", "path": ".github/extensions/weather"}],
  "errors": [],
  "registryUpdated": true
}
```

### List — show all installed packages

```bash
node .github/skills/packages/packages.js list
```

Output JSON (array):

```json
[
  {
    "source": "someuser/cool-extensions",
    "ref": "v1.0.0",
    "extensions": [{"name": "weather", "version": "0.1.0", "description": "Weather data lookups"}],
    "skills": []
  }
]
```

Present as a readable summary. If the array is empty, say "No third-party packages installed."

### Check — compare installed vs remote versions

```bash
node .github/skills/packages/packages.js check someuser/cool-extensions
node .github/skills/packages/packages.js check someuser/cool-extensions --ref v2.0.0
```

Output JSON:

```json
{
  "source": "someuser/cool-extensions",
  "ref": "main",
  "remoteVersion": "0.4.0",
  "updates": [
    {"name": "weather", "type": "extension", "localVersion": "0.1.0", "remoteVersion": "0.2.0", "status": "update_available"}
  ],
  "new": [],
  "current": [],
  "notInstalled": false
}
```

Status values:
- `update_available` — newer version exists on remote
- `removed_upstream` — item no longer exists on remote

If `notInstalled` is true, the package has never been installed — all remote items appear in `new`.

Present as a readable summary with available updates highlighted. If updates exist, ask the user if they want to install them using `install --items name1,name2`.

## Presenting Results

### After install

```
═══════════════════════════════════════════
  ✅ PACKAGE INSTALLED
  Source: someuser/cool-extensions@main
═══════════════════════════════════════════

Installed:
  📦 weather v0.1.0 — 3 files

Registry updated.
```

If there were skipped items:
```
⚠️  Skipped (conflict):
  weather — extension "weather" already exists (origin: ianphil/genesis)
```

If extensions were installed, remind the user:
> "New extensions installed. Restart your Copilot session to activate them."

### After remove

```
Removed:
  🗑️ weather v0.1.0 — directory deleted
```

### After list (with packages)

```
Installed packages:

  someuser/cool-extensions @ v1.0.0
    📦 weather v0.1.0 — Weather data lookups
```

### After check (with updates)

```
Updates available from someuser/cool-extensions:
  ⬆️ weather v0.1.0 → v0.2.0
```

## Rules

- **Always confirm before removing** — removals delete directories from disk
- **Never silently overwrite** — if a conflict is detected, report it and skip the item
- **Template items are authoritative** — packages cannot overwrite extensions or skills from the genesis template source
- **Always show search results before installing** — let the user see what's available and select items
- **Conflict = skip, not fail** — a conflict on one item doesn't block other items from installing
- **If `gh` CLI is not available**, report the error and stop
- **If the script fails**, show the error output and suggest checking `gh auth status`
