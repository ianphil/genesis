# Heartbeat Extension

A Copilot CLI extension that provides memory maintenance ...  consolidating session learnings into long-term memory and decaying stale entries over time.

## How It Works

The agent accumulates observations in `.working-memory/log.md` during normal sessions. The heartbeat periodically reviews that log, promotes durable learnings to `.working-memory/memory.md`, and removes memories that haven't been reinforced within a decay window.

**Scheduling is automatic.** On first session start, the extension creates a cron job (via the [cron extension](../cron/)) that fires every 4 hours. The cron job sends a prompt to the AI that calls the heartbeat tools in sequence.

## Memory Model

**Log** (`.working-memory/log.md`) ...  short-term, append-only session notes:
```markdown
## 2026-03-11
- Ian prefers structured tools over freehand LLM edits
- Deploy pipeline uses staging → canary → prod
```

**Memory** (`.working-memory/memory.md`) ...  curated long-term memory with timestamps:
```markdown
## Corrected
- Prefer tabs over spaces in JS ...  *corrected: 2026-03-11*

## Learned
- Deploy pipeline: staging → canary → prod ...  *learned: 2026-03-04, reinforced: 2026-03-11*
```

**Rules:**
- **Corrected** = explicit human corrections → never decays
- **Learned** = agent observations → decays after 90 days without reinforcement
- **Reinforcement** bumps the `reinforced` date when the agent re-encounters a memory during normal sessions, preventing decay

## Tools

| Tool | Description |
|------|-------------|
| `heartbeat_consolidate` | Reads log.md and returns entries for evaluation |
| `heartbeat_promote` | Writes selected entries to memory.md with timestamps, removes them from log |
| `heartbeat_decay` | Removes learned entries >90 days without reinforcement. Supports `dryRun` |
| `heartbeat_reinforce` | Bumps reinforced date on a memory entry by substring match |
| `heartbeat_status` | Shows memory stats: counts, oldest entries, decay candidates |

## Cron Integration

The heartbeat creates a cron prompt job on first session start:

- **Schedule:** `0 */4 * * *` (every 4 hours, America/New_York)
- **Model:** `claude-haiku-4.5` (fast and cheap for maintenance)
- **Behavior:** The prompt instructs the AI to consolidate → judge → promote → decay

The job file is written directly to the cron extension's `data/jobs/` directory. No manual setup required.

## Manual Usage

You can also use the tools interactively at any time:

```
> Consolidate my session log into memory
> What's in my memory? Run heartbeat_status
> Decay stale memories (dry run first)
```

Reinforcement happens naturally ...  when you or the agent reference a memory during a session, call `heartbeat_reinforce` to bump its date.

## File Structure

```
.github/extensions/heartbeat/
├── extension.mjs              # Entry point ...  tools + onSessionStart hook
├── lib/
│   ├── consolidate.mjs        # Read log entries for evaluation
│   ├── decay.mjs              # Scan and remove stale memories
│   ├── ensure-job.mjs         # Auto-create heartbeat cron job
│   ├── parser.mjs             # Parse/serialize memory.md and log.md
│   ├── paths.mjs              # Working memory path resolution
│   ├── promote.mjs            # Write entries to memory with timestamps
│   └── reinforce.mjs          # Bump reinforced dates
└── tools/
    └── memory-tools.mjs       # Tool definitions and handlers
```

## Dependencies

- **[Cron extension](../cron/)** ...  provides the scheduling engine
- No npm dependencies ...  pure Node.js
