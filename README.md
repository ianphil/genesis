# Genesis

A mind starter template. Clone it, launch Copilot, answer two questions, and walk away with a fully configured personal AI agent.

![Genesis](https://github.com/user-attachments/assets/29e82f76-d291-49ca-96d4-33417bce23e6)

## Quick Start

```powershell
git clone https://github.com/ianphil/genesis "$HOME\my-agent"
cd "$HOME\my-agent"
copilot --experimental

# Then say "Hi" at the copilot prompt... guided bootstrap will start
```

Copilot reads the genesis instructions and walks you through:

1. **Character** — pick a fictional character whose personality your agent embodies
2. **Role** — define what your agent does (Chief of Staff, PM, Research Assistant, etc.)

Genesis creates your `SOUL.md` (personality) and agent file (role), seeds working memory, and replaces itself with permanent instructions. Your agent is live.

## What's Included

| Component | Purpose |
|-----------|---------|
| `.working-memory/` | Persistent memory across sessions (memory.md, rules.md, log.md) |
| `.github/skills/` | Pre-built skills (commit, daily-report, upgrade) |
| `.github/extensions/` | Copilot CLI extensions (cron scheduler) |
| `.github/registry.json` | Extension/skill registry for upgrades from genesis |
| `domains/`, `initiatives/`, `expertise/`, `Archive/` | IDEA knowledge taxonomy |
| `inbox/` | Quick-capture triage zone |

## Extensions

| Extension | Description |
|-----------|-------------|
| [cron](.github/extensions/cron/) | Scheduled job execution — cron, interval, and one-shot with command and prompt payloads |
| [canvas](.github/extensions/canvas/) | Display rich HTML content in the browser with SSE live reload |
| [heartbeat](.github/extensions/heartbeat/) | Memory maintenance — consolidate session log to long-term memory, decay stale entries |
| [code-exec](.github/extensions/code-exec/) | Universal MCP connector — discover, call, and orchestrate enterprise tools with progressive disclosure (150K→500 tokens) |

## Upgrading Existing Minds

Minds cloned from genesis can pull new extensions and skills at any time:

```
> Check for updates from genesis
```

![Upgrade](https://github.com/user-attachments/assets/36e47aa0-7981-4e4a-9a52-862771215622)

The **upgrade** skill fetches the latest registry from this repo via GitHub API, shows what's new or updated, and installs your selections. No git remotes needed — it works through the agent's existing tools.

## Prerequisites

- [GitHub Copilot CLI](https://github.com/githubnext/copilot-cli) installed and on PATH
- An active [Copilot subscription](https://github.com/features/copilot/plans)

## How It Works

The genesis file (`.github/copilot-instructions.md`) is a temporary instruction set that guides Copilot through bootstrapping your agent. Once complete, it replaces itself with permanent operating instructions. The personality and role files it creates are unique to you — no two agents are the same.

## License

[MIT](LICENSE)
