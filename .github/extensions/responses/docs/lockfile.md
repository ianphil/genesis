# PID Lockfile

The lockfile prevents port conflicts and enables stale process detection across restarts.

## Location

```
.github/extensions/responses/data/{agent}/responses.lock
```

Where `{agent}` is the agent namespace (see [agent-namespaces.md](agent-namespaces.md)). Default: `default`.

## Format

```json
{"pid":78047,"port":15210}
```

Two fields, both required:
- **`pid`** — OS process ID of the running extension
- **`port`** — TCP port the HTTP server is listening on

## Lifecycle

| Event | Lockfile action |
|-------|----------------|
| Server starts listening | Written (`writeLockfile`) |
| Graceful shutdown (SIGTERM/SIGINT) | Removed (`removeLockfile`) |
| Process crash (SIGKILL) | Left behind (stale) |
| Next process starts | Stale lockfile detected and cleaned |

The lockfile is written **after** `server.start()` succeeds and **before** `joinSession()`. This means: if a lockfile exists, the server was listening at that port when it was written.

## Stale Detection

On startup, `cleanStaleLockfile()` runs before the server starts:

1. Read the lockfile — if missing or unparseable, nothing to do
2. Send signal 0 to the recorded PID (`process.kill(pid, 0)`)
3. If the process is alive → another instance is running, log and skip
4. If the process is dead → remove the stale lockfile and proceed

This handles the SIGKILL case where the process died without running its cleanup handler.

## Reading the Lockfile

```bash
cat .github/extensions/responses/data/default/responses.lock
```

If the file exists and the PID is alive, the server should be reachable at the listed port. If the file is missing, either no process is running or a clean shutdown occurred.
