# Genesis Package Spec v1.0

## Overview

Genesis Packages is a distributed package system for Copilot CLI agent capabilities. It has two sides:

| Role | Requirement | Purpose |
|------|-------------|---------|
| **User** | `packages` skill in `~/.copilot/skills/` | Install packages from any repo |
| **Maintainer** | `.github/registry.json` in their repo | Declare what the repo offers |

GitHub is the infrastructure. The `gh` CLI is the transport. There is no central server.

---

## For Users

### Installation

Copy the `packages` skill into your global Copilot skills directory:

```
~/.copilot/
└── skills/
    └── packages/
        ├── SKILL.md
        └── packages.js
```

This makes the skill available to **every** agent on the machine — project-level and user-level.

### Usage

Tell any agent:

```
> install owner/repo
```

That's it. The skill fetches the remote registry, downloads the declared files, and updates your local registry to track what's installed.

#### All commands

| Command | What it does |
|---------|-------------|
| `install owner/repo` | Install all items from a package |
| `install owner/repo@v1.0.0` | Install from a pinned ref (tag, branch, SHA) |
| `install owner/repo --items foo,bar` | Install specific items only |
| `search owner/repo` | Browse what a package offers before installing |
| `remove owner/repo` | Remove all items from a package |
| `remove owner/repo --items foo` | Remove specific items |
| `list` | List all installed packages |
| `check owner/repo` | Compare installed version against remote |

### Prerequisites

- **Node.js** >= 18
- **`gh` CLI** authenticated (`gh auth status`)
- A local `registry.json` to track installed packages (created automatically on first install)

### Local registry

The packages skill maintains a local `registry.json` that tracks what's installed and where it came from. Two layouts are supported:

| Layout | Registry location | Item paths |
|--------|------------------|------------|
| **Repo-level** | `.github/registry.json` | `.github/extensions/`, `.github/skills/` |
| **User-level** | `~/.copilot/registry.json` | `~/.copilot/extensions/`, `~/.copilot/skills/` |

The skill auto-detects which layout is in use.

---

## For Package Maintainers

To make your repo installable as a Genesis package, you need one file: `.github/registry.json`.

### Registry format

```json
{
  "version": "<semver>",
  "source": "<owner/repo>",
  "extensions": {
    "<name>": {
      "version": "<semver>",
      "path": ".github/extensions/<name>",
      "description": "<one-line description>"
    }
  },
  "skills": {
    "<name>": {
      "version": "<semver>",
      "path": ".github/skills/<name>",
      "description": "<one-line description>"
    }
  },
  "packages": []
}
```

### Field reference

#### Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | **yes** | Semver version of the package as a whole |
| `source` | string | **yes** | `owner/repo` — identifies this package |
| `extensions` | object | no | Map of extension name → extension descriptor |
| `skills` | object | no | Map of skill name → skill descriptor |
| `packages` | array | no | Tracks installed third-party packages (empty for source repos) |

#### Item descriptor (extension or skill)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | **yes** | Semver version of this individual item |
| `path` | string | **yes** | Relative path from repo root to the item's directory |
| `description` | string | **yes** | One-line human-readable description |

### Directory structure

Items declared in the registry must exist at their declared `path`. The convention is:

```
your-repo/
└── .github/
    ├── registry.json
    ├── extensions/
    │   └── your-extension/
    │       ├── extension.mjs      # entry point (Copilot SDK)
    │       ├── package.json       # if runtime deps are needed
    │       └── ...
    └── skills/
        └── your-skill/
            ├── SKILL.md           # skill definition (frontmatter + instructions)
            └── ...                # supporting files (scripts, etc.)
```

### How install works

When a user runs `install owner/repo`:

1. The packages skill calls `gh api /repos/owner/repo/git/trees/<ref>?recursive=1` to get the file tree
2. It reads `.github/registry.json` from the remote repo
3. For each declared item, it downloads all files under the item's `path` via the git blob API
4. If a `package.json` exists in the item directory, it runs `npm install --production`
5. The user's local `registry.json` is updated:
   - The item is added to `extensions` or `skills` with a `package: "owner/repo"` field
   - An entry is added to the `packages[]` array tracking source, ref, version, and installed items

### Rules

1. **`version` must be valid semver** — `MAJOR.MINOR.PATCH`. The packages skill uses semver comparison for update detection.

2. **`path` must be accurate** — the skill downloads everything under that path recursively. If the path is wrong, install fails silently (no files).

3. **`source` must match `owner/repo`** — this is how the skill identifies the package for updates and removal.

4. **One registry per repo** — always at `.github/registry.json`. No nested or alternate locations.

5. **Extensions that need npm dependencies** — include a `package.json` in the extension directory. The skill runs `npm install --production` automatically. Do NOT rely on global npm installs.

6. **Skills are just files** — a skill is a directory with a `SKILL.md` and optional supporting scripts. No build step needed.

### Discoverability (optional)

Add the `genesis-package` topic to your GitHub repo. This allows users to discover packages via:

```bash
gh api /search/repositories?q=topic:genesis-package
```

### Version pinning

Users can pin to a specific ref:

```
> install owner/repo@v1.0.0
> install owner/repo@main
> install owner/repo@abc123f
```

When no ref is specified, the repo's default branch is used.

---

## Examples

### Minimal registry (one skill)

```json
{
  "version": "0.1.0",
  "source": "alice/helpful-skills",
  "extensions": {},
  "skills": {
    "summarize": {
      "version": "0.1.0",
      "path": ".github/skills/summarize",
      "description": "Summarize long documents into bullet points"
    }
  },
  "packages": []
}
```

### Registry with extension + skill (Myelin)

```json
{
  "version": "0.7.1",
  "source": "shsolomo/myelin",
  "extensions": {
    "myelin": {
      "version": "0.7.1",
      "path": ".github/extensions/myelin",
      "description": "Knowledge graph memory — semantic search, NER extraction, brain-inspired consolidation"
    }
  },
  "skills": {
    "myelin-setup": {
      "version": "0.1.0",
      "path": ".github/skills/myelin-setup",
      "description": "Interactive setup wizard for myelin memory system"
    }
  },
  "packages": []
}
```

### User's local registry after installing Myelin

```json
{
  "version": "0.16.0",
  "source": "ianphil/genesis",
  "channel": "main",
  "extensions": {
    "cron": {
      "version": "0.1.4",
      "path": ".github/extensions/cron",
      "description": "Scheduled job execution"
    },
    "myelin": {
      "version": "0.7.1",
      "path": ".github/extensions/myelin",
      "description": "Knowledge graph memory",
      "package": "shsolomo/myelin"
    }
  },
  "skills": {},
  "packages": [
    {
      "source": "shsolomo/myelin",
      "ref": "main",
      "version": "0.7.1",
      "installedAt": "2026-03-15T12:00:00.000Z",
      "items": [
        { "name": "myelin", "type": "extension", "version": "0.7.1" }
      ]
    }
  ]
}
```

Note the `"package": "shsolomo/myelin"` field on the extension — this is how the skill distinguishes locally-owned items from installed packages.

---

## Design Principles

1. **GitHub is the registry.** No central server, no auth beyond `gh`, no new accounts.
2. **Two pieces, clear contract.** User needs a skill. Repo needs a registry. That's it.
3. **Repos are self-describing.** The registry declares what's available. The skill reads it.
4. **Install is download, not build.** Files are fetched via git blob API. The only build step is optional `npm install --production` for native deps.
5. **Provenance is tracked.** The local registry records where every package came from, when it was installed, and at what version.
