# Genesis

A mind starter template. Clone it, launch Copilot, answer two questions, and walk away with a fully configured personal AI agent.

## Quick Start

```bash
git clone https://github.com/ianphil/genesis ~/src/my-agent
cd ~/src/my-agent
copilot
```

Copilot reads the genesis instructions and walks you through:

1. **Character** — pick a fictional character whose personality your agent embodies
2. **Role** — define what your agent does (Chief of Staff, PM, Research Assistant, etc.)

Genesis creates your `SOUL.md` (personality) and agent file (role), seeds working memory, and replaces itself with permanent instructions. Your agent is live.

## What's Included

| Component | Purpose |
|-----------|---------|
| `.working-memory/` | Persistent memory across sessions (memory.md, rules.md, log.md) |
| `.github/skills/` | Pre-built skills (commit, capture, daily-report) |
| `domains/`, `initiatives/`, `expertise/`, `Archive/` | IDEA knowledge taxonomy |
| `inbox/` | Quick-capture triage zone |

## Prerequisites

- [GitHub Copilot CLI](https://github.com/githubnext/copilot-cli) installed and on PATH
- An active [Copilot subscription](https://github.com/features/copilot/plans)

## How It Works

The genesis file (`.github/copilot-instructions.md`) is a temporary instruction set that guides Copilot through bootstrapping your agent. Once complete, it replaces itself with permanent operating instructions. The personality and role files it creates are unique to you — no two agents are the same.

## License

[MIT](LICENSE)
