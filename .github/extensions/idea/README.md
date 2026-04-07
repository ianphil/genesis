# IDEA extension

IDEA is the method: **Initiatives, Domains, Expertise, Archive**.

This extension searches across all four, which makes the name do the work twice:

- You are searching your **IDEA** structure
- You are searching for **ideas**

So "Search your IDEA" just works.

The tool names stay provider-agnostic on purpose. QMD is the engine today. It does not need to be forever.

## Setup

The extension installs QMD as a local dependency. After cloning or bootstrapping your mind:

```bash
cd .github/extensions/idea
npm install
```

Then configure at least one collection so QMD knows what to index:

```bash
npx qmd collection add domains ./domains
npx qmd collection add initiatives ./initiatives
npx qmd collection add expertise ./expertise
npx qmd collection add inbox ./inbox
npx qmd collection add working-memory ./.working-memory
npx qmd update
```

Semantic search requires vector embeddings. The extension uses the Copilot embeddings API (no local GPU needed). After the initial index:

```bash
# From a Copilot CLI session, use the idea_reindex tool
# Or manually: npx qmd embed
```

## Tools

| Tool | What it does |
| --- | --- |
| `idea_search` | BM25 keyword search — exact names, IDs, phrases |
| `idea_recall` | Semantic search via Copilot embeddings — concepts, questions |
| `idea_reindex` | Re-scan collections from the filesystem and refresh embeddings |
| `idea_status` | Index health: document count, staleness, and collections |

## Architecture

```text
Copilot CLI
  ← JSON-RPC →  extension.mjs (joinSession)
                   ├── lib/qmd.mjs    → QMD SDK (local node_modules)
                   ├── lib/embed.mjs  → Copilot /embeddings API
                   ├── lib/token.mjs  → Windows Credential Manager
                   └── ~/.cache/qmd/index.sqlite
```

## Authentication

The extension retrieves the Copilot token from Windows Credential Manager (`copilot-cli/*` entries). This is the same token the Copilot CLI uses — no additional configuration needed.

**Platform support:** Windows only for now (Credential Manager). Non-Windows support will require a different token retrieval mechanism.

## Design notes

- **Provider-agnostic naming**: the tools expose IDEA behavior, not QMD implementation details
- **No global install required**: QMD ships as a local npm dependency in the extension's `package.json`
- **Custom embedding path**: semantic search uses Copilot-backed embeddings instead of local GPU inference, making it work on any machine
