---
name: upgrade
description: Pull new extensions and skills from the genesis template registry. Use when user asks to "check for updates", "upgrade", "get latest extensions", or "sync from genesis".
---

# Upgrade from Genesis Registry

Check the genesis template for new or updated extensions and skills, then install them.

## Configuration

The upgrade skill needs to know the source registry. It reads from the local `.github/registry.json`:

```json
{
  "source": "ianphil/genesis"
}
```

If `.github/registry.json` does not exist locally, ask the user for the source repo (default: `ianphil/genesis`), then create the file with `source` set and empty `extensions`/`skills` objects.

## Phase 1: Fetch Remote Registry

Use the GitHub MCP tool to fetch the remote registry:

```
github-mcp-server-get_file_contents:
  owner: {source_owner}
  repo: {source_repo}
  path: .github/registry.json
```

Parse the JSON response. This is the **remote registry**.

Read the local `.github/registry.json`. This is the **local registry**.

## Phase 2: Diff and Present

Compare remote vs local. For each item in remote `extensions` and `skills`:

- **🆕 New** — exists in remote but not in local
- **⬆️ Update available** — exists in both, remote version > local version
- **✅ Up to date** — exists in both, same version
- **⚠️ Local-only** — exists in local but not in remote (user-created, leave alone)

Present results to the user:

```
═══════════════════════════════════════════
  📦 REGISTRY UPDATE CHECK
  Source: ianphil/genesis (remote v{version})
  Local: v{version}
═══════════════════════════════════════════

📦 Extensions:
  🆕 cron v0.3.0 — Scheduled job execution
  
📄 Skills:
  ✅ commit v0.3.0 — up to date
  ⬆️ daily-report v0.4.0 — update available (local: v0.3.0)
  🆕 copilot-extension v0.3.0 — SDK reference

Install all new/updated? Or pick specific ones.
```

Use the `ask_user` tool to let the user select what to install. Provide a multi-select with all new/updated items, defaulting to all selected.

## Phase 3: Install Selected Items

For each selected item, perform these steps **in order**:

### 3a. Fetch the directory tree

Use GitHub API to get the directory listing:

```
github-mcp-server-get_file_contents:
  owner: {source_owner}
  repo: {source_repo}
  path: {item.path}
```

This returns the directory listing. For each file in the tree, recursively fetch contents.

### 3b. Write files locally

For each file fetched:
- If the file exists locally, overwrite it using the `edit` tool (replace full content) or write via shell
- If the file does not exist, create parent directories and use the `create` tool
- Preserve the directory structure exactly as it appears in the remote

**Use shell for reliability:**

```powershell
# Create directory structure
New-Item -ItemType Directory -Path "{item.path}" -Force

# Write each file (base64 decode from GitHub API response)
```

For fetching file trees recursively, use multiple parallel `get_file_contents` calls for efficiency.

### 3c. Post-install

After writing files:

1. **If `package.json` exists** in the installed path (extensions typically have one):
   ```powershell
   cd {item.path} && npm install --production
   ```

2. **If it's an extension**, reload extensions:
   ```
   extensions_reload
   ```

### 3d. Update local registry

After all items are installed, update `.github/registry.json`:
- Set the item's version to match the remote version
- Add new items to the appropriate section (`extensions` or `skills`)
- Update the top-level `version` to match remote
- Preserve any local-only items

## Phase 4: Summary

```
═══════════════════════════════════════════
  ✅ UPGRADE COMPLETE
═══════════════════════════════════════════

Installed:
  📦 cron v0.3.0 — extension
  📄 copilot-extension v0.3.0 — skill

Updated:
  📄 daily-report v0.3.0 → v0.4.0

Local registry updated to v{version}.
```

If any extensions were installed or updated, remind the user:
> "New extensions are loaded. Restart your Copilot session to activate them, or I can reload extensions now."

## Rules

- **Never delete local-only items** — if something exists locally but not in the remote registry, leave it alone
- **Never modify files outside of `.github/extensions/` and `.github/skills/`** — the upgrade skill only touches these paths
- **Always show the diff before installing** — never auto-install without user confirmation
- **Preserve `.github/registry.json` local-only entries** — only update/add items from remote
- **Skip items the user doesn't select** — respect their choices
- **If GitHub API fails**, report the error and continue with other items
- **If `source` is not set**, ask the user and default to `ianphil/genesis`
- **Version comparison** — use semver: split on `.`, compare major, minor, patch numerically
