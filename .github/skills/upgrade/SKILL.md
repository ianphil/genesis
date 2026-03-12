---
name: upgrade
description: Pull new extensions and skills from the genesis template registry. Use when user asks to "check for updates", "upgrade", "get latest extensions", or "sync from genesis".
---

# Upgrade from Genesis Registry

Check the genesis template for new or updated extensions and skills, then install them.

**This skill includes `upgrade.js`** — a script that handles all registry comparison, file downloading, and installation deterministically. Your job is to run it and handle UX.

## Prerequisites

- `gh` CLI must be authenticated (`gh auth status`)
- `.github/registry.json` must exist with a `source` field (e.g. `"source": "ianphil/genesis"`)
- If `registry.json` is missing or has no `source`, ask the user for the source repo (default: `ianphil/genesis`) and create it

## Phase 1: Check for Updates

Run the check command from the repo root:

```bash
node .github/skills/upgrade/upgrade.js check
```

This outputs JSON with the diff:

```json
{
  "source": "ianphil/genesis",
  "remoteVersion": "0.8.0",
  "localVersion": "0.7.2",
  "new": [{"name": "foo", "type": "skill", "version": "0.2.0", "description": "..."}],
  "updated": [{"name": "daily-report", "type": "skill", "version": "0.2.0", "localVersion": "0.1.0", "description": "..."}],
  "current": [{"name": "commit", "type": "skill", "version": "0.1.0", "description": "..."}],
  "renamed": [{"oldName": "code-exec", "newName": "bridge", "type": "extension", "version": "0.2.0", "localVersion": "0.1.2", "description": "..."}],
  "localOnly": []
}
```

## Phase 2: Present Results

Format the JSON into a human-readable summary:

```
═══════════════════════════════════════════
  📦 REGISTRY UPDATE CHECK
  Source: ianphil/genesis (remote v0.8.0)
  Local: v0.7.2
═══════════════════════════════════════════

📦 Extensions:
  🆕 cron v0.3.0 — Scheduled job execution
  🔄 code-exec → bridge v0.2.0 — renamed

📄 Skills:
  ✅ commit v0.3.0 — up to date
  ⬆️ daily-report v0.4.0 — update available (local: v0.3.0)
  🆕 copilot-extension v0.3.0 — SDK reference

Install all new/updated/renamed? Or pick specific ones.
```

Use the `ask_user` tool to let the user select what to install.

If everything is up to date (`new` and `updated` are both empty), say so and stop.

## Phase 3: Install Selected Items

Run the install command with a comma-separated list of selected item names:

```bash
node .github/skills/upgrade/upgrade.js install cron,daily-report,copilot-extension
```

This:
- Fetches the full file tree from the remote repo (single API call)
- Downloads and writes every file for each selected item
- Runs `npm install --production` if a `package.json` exists in the item's path
- Updates `.github/registry.json` with new versions

Output JSON:

```json
{
  "installed": [{"name": "cron", "type": "extension", "version": "0.3.0", "files": 14, "npmInstalled": true}],
  "updated": [{"name": "daily-report", "type": "skill", "version": "0.4.0", "files": 1, "from": "0.3.0"}],
  "errors": [],
  "registryUpdated": true
}
```

Items with `renamedFrom` indicate a rename was processed — the old directory was removed and the old registry entry deleted.

## Phase 4: Summary

Format the install results:

```
═══════════════════════════════════════════
  ✅ UPGRADE COMPLETE
═══════════════════════════════════════════

Installed:
  📦 cron v0.3.0 — 14 files, npm installed
  📄 copilot-extension v0.3.0 — 1 file

Updated:
  📄 daily-report v0.3.0 → v0.4.0 — 1 file

Renamed:
  🔄 code-exec → bridge v0.2.0 — 9 files, old directory removed

Local registry updated to v0.8.0.
```

If any extensions were installed or updated, remind the user:
> "New extensions installed. Restart your Copilot session to activate them, or I can reload extensions now."

If there are errors in the output, report them clearly and suggest retrying individual items.

## Rules

- **Never delete local-only items** — the script preserves them automatically
- **Never modify files outside of `.github/extensions/` and `.github/skills/`** — the script only touches these paths
- **Always show the diff before installing** — never auto-install without user confirmation
- **Renames are destructive** — they delete the old directory. Always confirm with the user before installing a renamed item
- **Old names auto-resolve** — if a user requests an old name (e.g. `code-exec`), the script resolves it to the new name via the `renames` map
- **Skip items the user doesn't select** — respect their choices
- **If `gh` CLI is not available**, report the error and stop — the script requires it
- **If the script fails**, show the error output and suggest checking `gh auth status`
