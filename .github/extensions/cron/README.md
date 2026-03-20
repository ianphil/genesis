# Cron Extension

A Copilot CLI extension that adds scheduled job execution. Create jobs that run on a cron schedule, at fixed intervals, or fire once at a specific time. Jobs can execute shell commands or send prompts to the AI.

## Setup

After cloning or installing this extension, install npm dependencies:

```bash
cd .github/extensions/cron && npm install --no-fund --no-audit
```

> **Note:** The Copilot CLI does not auto-install npm dependencies for extensions. If the extension fails to load, this is almost always the fix.

## Quick Example

> "Schedule a job that checks my open PRs every morning at 9am and writes a summary to my inbox"

That's it. The agent creates a **prompt job** ...  a scheduled AI session that runs autonomously:

```
cron_create:
  name: morning-pr-review
  scheduleType: cron
  cronExpression: "0 9 * * 1-5"
  timezone: "America/New_York"
  payloadType: prompt
  prompt: "Check my open GitHub PRs. For each one, note the age, review status, and any failing checks. Write a summary to inbox/pr-status.md."
```

Every weekday at 9am, the cron engine wakes up, spawns a Copilot session with your mind's identity, and runs that prompt. The AI does the work ...  you read the results.

Prompt jobs aren't just reminders. They're **scheduled agents** ...  they can read files, call APIs, write output, and use any tool available to a normal Copilot session.

## How It Works

The extension registers tools with the Copilot CLI session. A background **engine** process ticks every 2 seconds, evaluates which jobs are due, and dispatches them. Jobs and run history are stored as JSON files in `data/`.

The engine auto-starts when a Copilot session begins and runs independently as a detached process.

## Tools

### Job Management

| Tool | Description |
|------|-------------|
| `cron_create` | Create a new scheduled job |
| `cron_list` | List all jobs with status |
| `cron_get` | Get job details and recent run history |
| `cron_update` | Update a job's schedule, payload, or timeout |
| `cron_delete` | Delete a job and its history |

### Lifecycle

| Tool | Description |
|------|-------------|
| `cron_pause` | Disable a job (keeps definition, stops execution) |
| `cron_resume` | Re-enable a paused job |

### Engine Control

| Tool | Description |
|------|-------------|
| `cron_engine_start` | Start the background engine |
| `cron_engine_stop` | Stop the engine gracefully |
| `cron_engine_status` | Check if engine is running and job count |

## Schedule Types

**Cron** ...  Standard 5 or 6 field cron expressions with optional timezone.
```
Schedule every weekday at 9am Eastern:
  scheduleType: cron
  cronExpression: "0 9 * * 1-5"
  timezone: "America/New_York"
```

**Interval** ...  Fixed millisecond interval between runs.
```
Run every 30 seconds:
  scheduleType: interval
  intervalMs: 30000
```

**One-shot** ...  Fire once at a specific UTC time, then disable.
```
Fire in 10 minutes:
  scheduleType: oneShot
  fireAtUtc: "2026-03-11T12:00:00.000Z"
```

## Payload Types

**Command** ...  Run a shell command. Uses `shell: true` so built-ins and quoted arguments work.
```
payloadType: command
command: echo
arguments: "hello world"
workingDirectory: C:\src\myproject
timeoutSeconds: 300
```

**Prompt** ...  Send a prompt to the Copilot AI. Spawns a separate CopilotClient session.
```
payloadType: prompt
prompt: "Summarize my open PRs"
model: "claude-sonnet-4"
sessionId: null
timeoutSeconds: 120
```

Prompt jobs inherit the mind's identity (from `SOUL.md`) as a system message when available.

`sessionId` (string, optional) — Custom session ID for prompt payloads. If provided, the Copilot session is created with this ID, enabling external tracking and correlation (e.g., by the Responses extension for background jobs).

## Examples

```
"Create a job that says good morning every day at 8am"
"Schedule a reminder to check PRs every hour"
"Run my build script in 5 minutes"
"Pause the morning-greeting job"
"What jobs are running?"
"Stop the cron engine"
```

## File Structure

```
.github/extensions/cron/
├── extension.mjs          # Entry point ...  registers tools and hooks
├── engine/
│   └── main.mjs           # Detached engine process (tick loop)
├── tools/
│   ├── crud.mjs            # create, list, get, update, delete
│   ├── lifecycle.mjs       # pause, resume
│   └── engine-control.mjs  # start, stop, status
├── lib/
│   ├── scheduler.mjs       # Schedule evaluation and next-run calculation
│   ├── executor.mjs        # Command execution (child_process)
│   ├── prompt-executor.mjs # Prompt execution (Copilot SDK)
│   ├── store.mjs           # Job persistence (JSON files)
│   ├── history.mjs         # Run history tracking
│   ├── lifecycle.mjs       # State transitions and backoff
│   ├── identity.mjs        # Mind identity for prompt jobs
│   ├── engine-autostart.mjs# Auto-start engine on session begin
│   ├── paths.mjs           # Shared path helpers
│   ├── stagger.mjs         # Startup stagger for interval jobs
│   └── errors.mjs          # Error formatting
├── data/
│   ├── jobs/               # Job definitions (*.json)
│   ├── history/            # Run history (*.json)
│   ├── engine.lock         # Engine PID lockfile
│   └── engine.log          # Engine log output
└── package.json            # Dependencies (croner)
```

## Backoff

Failed jobs use exponential backoff: 1min → 2min → 4min → 8min → 16min (max). The backoff resets on a successful run or when the job is resumed.

## Limits

- Max 3 concurrent job executions
- Engine tick interval: 2 seconds
- Command timeout default: 300 seconds
- Prompt timeout default: 120 seconds
