# Upgrade Skill

Pull new extensions and skills from the genesis template registry.

## When to Use

- "Check for updates"
- "Upgrade from genesis"
- "Get latest extensions"
- "Sync from genesis"

## What It Does

Compares your local `.github/registry.json` against the genesis template's registry and shows what's new, updated, renamed, or removed. You choose what to install — nothing happens without confirmation.

## Quick Example

```
> check for updates
```

```
═══════════════════════════════════════════
  📦 REGISTRY UPDATE CHECK
  Source: ianphil/genesis (remote v0.19.0)
  Local: v0.18.0
═══════════════════════════════════════════

📦 Extensions:
  🆕 microui v0.1.0 — Lightweight native WebView windows

📄 Skills:
  ⬆️  daily-report v0.2.0 — update available (local: v0.1.0)
  ✅ commit v0.1.0 — up to date

Install all new/updated? Or pick specific ones.
```

## Commands

The skill runs `upgrade.js` under the hood:

| Command | What It Does |
|---------|-------------|
| `check` | Compare local vs remote registry, show diff |
| `install <items>` | Download and install selected items |
| `remove <items>` | Delete items removed from upstream |
| `pin <items>` | Keep local items that upstream removed |
| `channel <name>` | Switch release channel |
| `migrate --source <repo>` | Convert channel-based registry to package-based |

## Item States

| State | Meaning |
|-------|---------|
| 🆕 **new** | Exists upstream, not installed locally |
| ⬆️ **updated** | Newer version available |
| ✅ **current** | Up to date |
| 🔄 **renamed** | Name changed upstream (old directory removed) |
| 🗑️ **removed** | Deleted from upstream |
| 📌 **localOnly** | Pinned — local customization, never flagged |

## Channels

Genesis uses `main` as the stable channel. Experimental items are available as packages from [genesis-frontier](https://github.com/ianphil/genesis-frontier).

## Rules

- Always shows the diff before installing or removing — no auto-install
- Removals are destructive (deletes directories) — always confirmed
- Declined removals get pinned so they're never flagged again
- Requires `gh` CLI to be authenticated

## Reference

Full details: [skill definition](../.github/skills/upgrade/SKILL.md)
