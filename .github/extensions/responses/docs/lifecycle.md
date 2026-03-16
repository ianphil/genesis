# Process Lifecycle

The responses extension runs as a child process managed by the Copilot CLI. The process **is** the lifecycle unit — there is no separate server start/stop within a running process.

## State Machine

Two states:

```
         ┌─────────┐
         │ STOPPED  │
         └────┬─────┘
    process spawns,
    server.listen() OK
              │
         ┌────▼──────┐
         │ CONNECTED  │
         └────┬──────┘
              │
    SIGTERM / SIGKILL / exit
              │
         ┌────▼─────┐
         │ STOPPED   │
         └──────────┘
```

If the server is reachable, the process is alive and connected. If not, the process doesn't exist. There is no intermediate state visible to clients.

## Startup Sequence

Every process follows one path:

```
migrate legacy data
  → clean stale lockfile
    → start HTTP server
      → write lockfile
        → joinSession()
          → bind session to server
```

Top-level `await` in `extension.mjs` means the process blocks until each step completes. By the time external clients can reach the server, everything is wired up.

### Startup Breadcrumb

A `startup.json` file is written at three milestones during startup so that crashes leave a diagnostic trace:

| Stage | Written after | Crash here means |
|-------|--------------|------------------|
| `init` | Process entry | Import error, config error, or migration failure |
| `server_up` | `server.start()` returns | `joinSession()` failed or session binding crashed |
| `ready` | Session fully bound | Everything worked — process is operational |

If `startup.json` is missing entirely, the CLI never forked the process.

Read it with:
```bash
cat .github/extensions/responses/data/{agent}/startup.json
```

## /clear — Process Recycle

When the user runs `/clear`, the CLI:

1. Sends `SIGTERM` to the running extension process
2. The process handles the signal: stops the server, removes the lockfile, exits
3. The CLI forks a new process
4. The new process runs the full startup sequence

```
CLI ──SIGTERM──► Old Process ──cleanup──► exit
CLI ──fork────► New Process ──startup──► CONNECTED
```

The old and new processes never overlap. The lockfile is removed before the old process exits and written after the new server is listening.

## Graceful Shutdown (Ctrl+C / CLI Exit)

Same as `/clear` cleanup — the process receives `SIGTERM`, stops the server, removes the lockfile, and exits. The CLI escalates to `SIGKILL` after 5 seconds if the process hasn't exited.

## Crash Recovery (SIGKILL / Unhandled Error)

If a process dies without cleanup (SIGKILL, segfault, unhandled exception), the lockfile is left behind with a stale PID. The next process to start detects this:

1. Reads the lockfile
2. Checks if the recorded PID is still alive (`kill -0`)
3. If dead → removes the stale lockfile and proceeds normally
4. If alive → another instance is running; logs a warning

## Extension Crash

A crashed extension stays dead. There is no auto-respawn. The process restarts on the next `/clear` or `extensions_reload()`.

## HTTP Behavior

| Process state | `GET /health` | `POST /v1/responses` | `GET /history` |
|--------------|--------------|---------------------|---------------|
| Not running | Connection refused | Connection refused | Connection refused |
| Running | `200` | `200` (normal) | `200` (history) |

No `503`. No "degraded" mode. Binary: reachable or not.
