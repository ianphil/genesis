# Cron Extension

**Sense: Time** — scheduled execution with cron, interval, and one-shot jobs.

Cron gives your agent autonomous behavior. Schedule prompt jobs that run on a timer — the agent wakes up, reads context, takes action, and exits cleanly. This is how you go from "agent that responds when asked" to "agent that notices things on its own."

## When to Use

- Morning briefings that gather data and post a summary
- Channel monitors that watch Teams and participate in conversations
- Heartbeat loops that maintain memory and detect stale items
- One-shot reminders ("remind me to check on this in 2 hours")
- Any recurring task the agent should do without being asked

## Quick Example

```
> "Schedule a job that checks my open PRs every morning at 9am
>  and writes a summary to my inbox"
```

The agent creates a prompt job — a scheduled AI session that runs autonomously:

```
cron_create:
  name: morning-pr-review
  scheduleType: cron
  cronExpression: "0 9 * * 1-5"
  timezone: "America/New_York"
  payloadType: prompt
  prompt: "Check my open GitHub PRs and write a summary to inbox/pr-status.md"
```

## Schedule Types

| Type | Example | Use For |
|------|---------|---------|
| **Cron** | `"0 9 * * 1-5"` (weekdays 9am) | Recurring at specific times |
| **Interval** | `600000` (10 minutes) | Polling and monitoring loops |
| **One-shot** | `"2026-03-17T18:00:00Z"` | Fire-and-forget reminders |

## Payload Types

**Command** — run a shell command:
```
payloadType: command
command: echo
arguments: "hello world"
```

**Prompt** — send a prompt to the AI (the interesting one):
```
payloadType: prompt
prompt: "Read domains/my-loop/prompt.md and follow its instructions exactly."
model: "claude-sonnet-4.5"
timeoutSeconds: 120
```

Prompt jobs inherit the agent's identity from `SOUL.md`. They can read files, call APIs, write output, and use any tool available in a normal session.

## Tools

| Tool | Description |
|------|-------------|
| `cron_create` | Create a new scheduled job |
| `cron_list` | List all jobs with status and next run time |
| `cron_get` | Get job details and recent run history |
| `cron_update` | Update schedule, payload, or timeout |
| `cron_delete` | Delete a job and its history |
| `cron_pause` | Disable a job (keeps definition) |
| `cron_resume` | Re-enable a paused job |
| `cron_engine_start` | Start the background engine |
| `cron_engine_stop` | Stop the engine |
| `cron_engine_status` | Check engine status and job count |

## The Engine

A background process ticks every 2 seconds, evaluates which jobs are due, and dispatches them. It auto-starts when a Copilot session begins.

Failed jobs use exponential backoff: 1min → 2min → 4min → 8min → 16min (max). Backoff resets on a successful run.

## Reference

- Full details: [extension README](../.github/extensions/cron/README.md)
- Domain-driven prompt pattern: [cron-prompt-pattern.md](cron-prompt-pattern.md)
