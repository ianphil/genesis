---
name: copilot-extension
description: Reference for building and debugging Copilot CLI extensions. Use when working on anything in .github/extensions/, troubleshooting SDK imports, or creating new extension tools.
---

# Copilot Extension Development

SDK patterns, API surface, and gotchas for building Copilot CLI extensions.

## SDK Location

The Copilot SDK is installed at `~/.copilot/pkg/`. It is **not** an npm package — resolve it by scanning the filesystem.

**Search order** (check platform-specific first, then universal):
1. `~/.copilot/pkg/{platform}-{arch}/{version}/copilot-sdk/index.js`
2. `~/.copilot/pkg/universal/{version}/copilot-sdk/index.js`

Platform values: `win32-x64`, `darwin-arm64`, `darwin-x64`, `linux-x64`, etc. Built from `process.platform` + `process.arch`.

**Version resolution** — always resolve dynamically (never hardcode a version):
```js
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

async function resolveSdk() {
  const pkgRoot = join(homedir(), ".copilot", "pkg");
  const platformDir = `${process.platform}-${process.arch}`;
  const searchDirs = [join(pkgRoot, platformDir), join(pkgRoot, "universal")];

  for (const sdkBase of searchDirs) {
    let versions;
    try {
      versions = readdirSync(sdkBase)
        .filter((d) => !d.startsWith("."))
        .sort();
    } catch {
      continue;
    }
    if (versions.length === 0) continue;

    const latest = versions[versions.length - 1];
    const sdkPath = join(sdkBase, latest, "copilot-sdk", "index.js");

    try {
      // Must use file:// URL with forward slashes
      return await import(`file://${sdkPath.replace(/\\/g, "/")}`);
    } catch {
      continue;
    }
  }
  throw new Error(`Cannot find Copilot SDK in: ${searchDirs.join(", ")}`);
}
```

## SDK Exports

```js
import { CopilotClient, CopilotSession, approveAll, defineTool } from "copilot-sdk";
```

## CopilotClient API

All methods are **camelCase** — not PascalCase.

```js
const client = new CopilotClient({
  cwd: "/path/to/workspace",
  autoStart: true,
});
```

Key methods:
- `client.start()` — connect to the Copilot backend
- `client.stop()` — clean shutdown
- `client.forceStop()` — hard kill
- `client.createSession(config)` — create a new session (see below)
- `client.ping()` — health check
- `client.listModels()` — available models
- `client.getStatus()` — connection status

## Creating Sessions

`createSession` **requires** an `onPermissionRequest` handler:

```js
const session = await client.createSession({
  onPermissionRequest: approveAll,  // required
  model: "claude-sonnet-4",       // optional
  systemMessage: {                  // optional
    mode: "append",
    content: "Extra system instructions",
  },
});
```

## Sending Prompts

Use `sendAndWait` — it handles event wiring, timeout, and idle detection internally:

```js
const response = await session.sendAndWait(
  { prompt: "Your prompt here" },
  timeoutMs,  // default 60000
);
// response is the last assistant.message event
const output = response?.data?.content || "";
```

Lower-level alternative with `send` + event listeners:

```js
session.on((event) => {
  // event.type values: "assistant.message", "session.idle", "session.error"
  if (event.type === "assistant.message") { /* event.data.content */ }
});
await session.send({ prompt: "..." });
```

**Event types use dot notation** (`"session.idle"`), not PascalCase (`"SessionIdleEvent"`).

## Command Execution (child_process)

When spawning commands from extensions, always use `shell: true`:

```js
import { spawn } from "node:child_process";

const fullCommand = args ? `${command} ${args}` : command;
const child = spawn(fullCommand, [], { shell: true });
```

**Why:** Without `shell: true`, shell built-ins (`echo`, `set`, `cd`) fail with `ENOENT` on Windows. Quoted arguments also break when naively split by whitespace — the shell handles quoting correctly.

## Extension Entry Point

Extensions use `@github/copilot-sdk/extension` (provided in-process, not from filesystem):

```js
import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";

const session = await joinSession({
  onPermissionRequest: approveAll,
  hooks: { onSessionStart: async () => { /* ... */ } },
  tools: [ /* tool definitions */ ],
});
```

**Note:** The `@github/copilot-sdk` import path only works inside the extension process managed by the CLI. Out-of-process code (like a detached cron engine) must resolve the SDK from the filesystem.

## Documentation & Type Definitions

Official docs and examples ship with the SDK. To find them, resolve the latest installed version:

```bash
# Find the latest SDK docs directory
ls ~/.copilot/pkg/universal/ | sort | tail -1
# Then read from: ~/.copilot/pkg/universal/{latest}/copilot-sdk/
```

Key files inside `copilot-sdk/`:
```
├── docs/
│   ├── agent-author.md      — Step-by-step guide for agents writing extensions
│   ├── examples.md           — Practical extension examples (skeleton, tools, hooks)
│   └── extensions.md         — How extensions work (lifecycle, JSON-RPC, registration)
├── generated/
│   ├── session-events.d.ts   — All session event types (generated from schema)
│   └── rpc.d.ts              — Full JSON-RPC API type definitions
├── index.d.ts                — Main SDK type exports
├── client.d.ts               — CopilotClient types
├── session.d.ts              — CopilotSession types
├── extension.d.ts            — Extension API types (joinSession, hooks)
└── types.d.ts                — Shared types
```

**Read these first** when building or debugging extensions — they are the authoritative source for the SDK API surface, event schemas, and RPC protocol.
