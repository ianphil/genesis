# Agent Namespaces

Agent namespaces isolate data, configuration, and runtime state so multiple agents can use the responses extension without conflicts.

## How the Name is Determined

The agent name is provided as a **required parameter** when calling `responses_restart`. There is no default — every agent must explicitly claim a namespace before the server starts.

```
responses_restart(agent: "fox")    →  namespace: "fox"
responses_restart(agent: "ender")  →  namespace: "ender"
```

The value is sanitized to filesystem-safe characters (`[a-zA-Z0-9_-]`). Anything else is stripped. If nothing valid remains, the tool returns an error.

## Startup Flow

1. Extension loads — server is created but **not started**
2. Agent calls `responses_restart(agent: "name")` on its first turn
3. Tool reads `data/{name}/config.json`, starts the server, writes lockfile
4. Server is now listening and ready for requests

## Directory Structure

Each agent gets its own directory under `data/`:

```
.github/extensions/responses/
├── data/
│   ├── fox/                   ← "fox" agent namespace
│   │   ├── config.json        ← per-agent configuration
│   │   └── responses.lock     ← PID lockfile
│   └── ender/                 ← "ender" namespace
│       ├── config.json
│       └── responses.lock
├── extension.mjs
├── lib/
└── ...
```

## What's Namespaced

| File | Purpose | Per-agent? |
|------|---------|-----------|
| `config.json` | Port, log level | ✅ Each agent can listen on a different port |
| `responses.lock` | PID + port of running process | ✅ Each agent has its own lockfile |

The extension code (`extension.mjs`, `lib/`, `tools/`) is shared — only runtime data is namespaced.

## Configuration

Each agent reads its own `config.json`:

```json
{
  "port": 15212,
  "logLevel": "info"
}
```

| Field | Default | Valid values |
|-------|---------|-------------|
| `port` | `15210` | `1024`–`65535` |
| `logLevel` | `"info"` | `"silent"`, `"error"`, `"info"`, `"debug"` |

If the config file is missing or invalid, defaults are used. Different agents should use different ports to avoid conflicts.

## Legacy Migration

Before agent namespaces, data files lived directly in `data/` (flat structure). On first `responses_restart`, `migrateLegacyData()` moves any `data/config.json` and `data/responses.lock` into `data/{agent}/`. This is idempotent — safe to run repeatedly.
