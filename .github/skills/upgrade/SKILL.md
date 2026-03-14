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
- Optional `"branch"` field in `registry.json` to track a non-main branch (defaults to `"main"`)
- Optional `"channel"` field in `registry.json` to select a release channel (e.g. `"main"`, `"frontier"`). Takes precedence over `"branch"`. Defaults to `"main"`.
- If `registry.json` is missing or has no `source`, ask the user for the source repo (default: `ianphil/genesis`) and create it

## Channels

Genesis supports release channels for repos that publish multiple branches. The channel determines which branch's registry is used for `check` and `install`.

### Switch channels

```bash
node .github/skills/upgrade/upgrade.js channel <name>
```

This:
- Sets `"channel": "<name>"` in the local registry
- Fetches the remote registry from the `<name>` branch
- Returns a diff showing what items would be added or removed

### Already on target channel

If the agent is already on the requested channel, the output includes `"changed": false` — no action needed.

## Migrate (Channel → Package)

When a release channel is being retired in favor of a package repo, use `migrate` to rewrite the registry:

```bash
node .github/skills/upgrade/upgrade.js migrate --source ianphil/genesis-frontier
```

This:
- Diffs local registry against the target channel's remote (default: `main`)
- Items not in the template get a `package` field assigned to the `--source`
- Populates the `packages[]` array with an installed manifest
- Switches channel to the target (default: `main`)
- No files move, no downloads — pure registry rewrite

Options:
- `--source <owner/repo>` (required) — the package repo to assign non-template items to
- `--channel <name>` (optional, default: `main`) — the target channel to switch to

After migration, `upgrade` pulls from the target channel and non-template items are managed by the packages skill.

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
  "removed": [{"name": "tunnel", "type": "extension", "version": "0.1.0", "description": "..."}],
  "localOnly": [{"name": "custom-tool", "type": "extension", "version": "0.1.0", "description": "..."}]
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
  🗑️ tunnel v0.1.0 — removed from upstream

📄 Skills:
  ✅ commit v0.3.0 — up to date
  ⬆️ daily-report v0.4.0 — update available (local: v0.3.0)
  🆕 copilot-extension v0.3.0 — SDK reference

📌 Pinned (local only):
  📌 custom-tool v0.1.0 — kept locally

Install all new/updated/renamed? Remove items deleted upstream? Or pick specific ones.
```

Use the `ask_user` tool to let the user select what to install and what to remove.

If there are `removed` items, present them separately and explain they were deleted upstream. For each removed item, the user can either:
- **Accept** — the item will be deleted locally
- **Decline** — the item will be pinned (`local: true`) and never flagged again

If everything is up to date (`new`, `updated`, and `removed` are all empty), say so and stop.

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

## Phase 3b: Remove Selected Items

For items the user accepted for removal, run:

```bash
node .github/skills/upgrade/upgrade.js remove tunnel,old-skill
```

This:
- Looks up each name in the local registry (extensions and skills)
- Deletes the directory from disk
- Removes the entry from `.github/registry.json`

Output JSON:

```json
{
  "removed": [{"name": "tunnel", "type": "extension", "version": "0.1.0", "path": ".github/extensions/tunnel"}],
  "errors": [],
  "registryUpdated": true
}
```

## Phase 3c: Pin Declined Removals

For removed items the user chose to **keep**, pin them so they won't be flagged again:

```bash
node .github/skills/upgrade/upgrade.js pin tunnel
```

This sets `"local": true` on the item in `.github/registry.json`. Future `check` runs will list it under `localOnly` instead of `removed`.

Output JSON:

```json
{
  "pinned": [{"name": "tunnel", "type": "extension", "version": "0.1.0"}],
  "errors": []
}
```

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

If any items were removed:
```
Removed:
  🗑️ tunnel v0.1.0 — directory deleted

Pinned (kept locally):
  📌 old-tool v0.1.0 — will not be flagged again
```

If any extensions were installed or updated, remind the user:
> "New extensions installed. Restart your Copilot session to activate them, or I can reload extensions now."

If there are errors in the output, report them clearly and suggest retrying individual items.

## Rules

- **Never delete pinned (local-only) items** — items with `local: true` are preserved and skipped during removal checks
- **Never modify files outside of `.github/extensions/` and `.github/skills/`** — the script only touches these paths
- **Always show the diff before installing or removing** — never auto-install or auto-remove without user confirmation
- **Removals are destructive** — they delete the directory from disk. Always confirm with the user before removing
- **Declined removals get pinned** — if the user declines a removal, pin it with `upgrade.js pin` so it won't be flagged again
- **Renames are destructive** — they delete the old directory. Always confirm with the user before installing a renamed item
- **Old names auto-resolve** — if a user requests an old name (e.g. `code-exec`), the script resolves it to the new name via the `renames` map
- **Channel is sticky** — once set via `channel` command, all future `check` and `install` calls use it. The `channel` field takes precedence over `branch`.
- **Channel switching is non-destructive** — it updates the registry and shows a diff. The user must explicitly `install` or `remove` items.
- **Skip items the user doesn't select** — respect their choices
- **If `gh` CLI is not available**, report the error and stop — the script requires it
- **If the script fails**, show the error output and suggest checking `gh auth status`
