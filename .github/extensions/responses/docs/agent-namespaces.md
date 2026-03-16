# Agent Namespaces

Agent namespaces isolate data, configuration, and runtime state so multiple agents can use the responses extension without conflicts.

## How the Name is Determined

The agent name comes from the `COPILOT_AGENT` environment variable, set by the CLI when it forks the extension process.

```
COPILOT_AGENT="my-agent"  →  agent name: "my-agent"
COPILOT_AGENT=""           →  agent name: "default"
(not set)                  →  agent name: "default"
```

The raw value is sanitized to filesystem-safe characters (`[a-zA-Z0-9_-]`). Anything else is stripped. If nothing remains, it falls back to `"default"`.

## Directory Structure

Each agent gets its own directory under `data/`:

```
.github/extensions/responses/
├── data/
│   ├── default/              ← "default" agent namespace
│   │   ├── config.json       ← per-agent configuration
│   │   ├── responses.lock    ← PID lockfile
│   │   ├── startup.json      ← startup breadcrumb
│   │   └── responses.db      ← conversation history
│   └── my-agent/             ← "my-agent" namespace
│       ├── config.json
│       ├── responses.lock
│       ├── startup.json
│       └── responses.db
├── extension.mjs
├── lib/
└── ...
```

## What's Namespaced

| File | Purpose | Per-agent? |
|------|---------|-----------|
| `config.json` | Port, log level | ✅ Each agent can listen on a different port |
| `responses.lock` | PID + port of running process | ✅ Each agent has its own lockfile |
| `startup.json` | Diagnostic breadcrumb | ✅ Each agent tracks its own startup |
| `responses.db` | Conversation history | ✅ Each agent has isolated history |

The extension code (`extension.mjs`, `lib/`, `tools/`) is shared — only runtime data is namespaced.

## Configuration

Each agent reads its own `config.json`:

```json
{
  "port": 15210,
  "logLevel": "info"
}
```

| Field | Default | Valid values |
|-------|---------|-------------|
| `port` | `15210` | `1024`–`65535` |
| `logLevel` | `"info"` | `"silent"`, `"error"`, `"info"`, `"debug"` |

If the config file is missing or invalid, defaults are used. Different agents should use different ports to avoid conflicts.

## Legacy Migration

Before agent namespaces, data files lived directly in `data/` (flat structure). On startup, `migrateLegacyData()` moves any `data/config.json` and `data/responses.lock` into `data/{agent}/`. This runs every startup and is idempotent — safe to run repeatedly.
