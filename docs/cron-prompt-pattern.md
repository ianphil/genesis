# Cron Prompt Jobs — The Autonomous Agent Loop

A pattern for giving your agent **autonomous behavior** — scheduled prompt jobs that run on a timer, read context, take action, and exit cleanly. This is how you go from "agent that responds when asked" to "agent that notices things and acts on its own."

The cron extension supports two payload types: `command` (run a shell command) and `prompt` (send a prompt to the AI). **Prompt jobs** are the interesting ones — they give your agent a recurring heartbeat where it can observe, decide, and act.

## The Pattern: Domain-Driven Prompt Jobs

Instead of putting all the logic in the cron job definition, use a **domain folder** as the prompt job's brain:

```
domains/my-loop/
├── prompt.md       # The agent's instructions for this loop
├── config.yaml     # Channel IDs, timing, classification rules
└── state.md        # Any roster, state, or context the loop maintains
```

The cron job itself is minimal — it just points at the prompt:

```json
{
  "name": "my-loop",
  "schedule": { "type": "interval", "intervalMs": 600000 },
  "payload": {
    "type": "prompt",
    "prompt": "Read domains/my-loop/prompt.md and follow its instructions exactly.",
    "timeoutSeconds": 300
  }
}
```

This separation is key:

- **The cron job** handles scheduling (when, how often, timeout)
- **The prompt file** handles behavior (what to do, how to decide, when to stay quiet)
- **The config** holds environment-specific details (IDs, thresholds, rules)

## Anatomy of a Good Prompt Loop

A well-structured `prompt.md` follows a numbered step pattern:

### Step 1 — Load Context

Read your memory files, personality (`SOUL.md`), and any domain-specific state. The agent wakes fresh every cycle — it needs to orient itself.

### Step 2 — Collect Data

Query your data sources (Teams messages, ADO work items, calendar, whatever). Filter to the relevant time window — slightly larger than your interval to catch edge cases (e.g., 11 minutes for a 10-minute cycle).

### Step 3 — Analyze & Maintain State

Process what you found. Update rosters, track new entities, harvest useful patterns. Write observations to your working memory.

### Step 4 — Decide Whether to Act

This is the most important step. **Not every cycle needs output.** Define clear conditions:

**Act if:**
- Someone addressed you directly
- You have genuine insight to contribute
- A threshold was crossed (stale items, quiet channel, approaching deadline)

**Stay silent if:**
- You'd just be echoing agreement
- You already acted recently (avoid flooding)
- Nothing requires your attention

### Step 5 — Execute

If you decided to act, do it. Post a message, update a note, flag an item. Use the full tool surface available to the agent.

### Step 6 — Silent Exit

If you decided NOT to act, say so briefly and exit. No noise, no unnecessary logging.

## Concrete Example: Channel Monitor

A channel monitor watches a shared Teams channel and participates as a conversational agent. Here's how one is structured:

### `config.yaml`

```yaml
# Channel Monitor — Agent Commons
# A Teams channel where agents converse freely. Humans lurk and observe.

channel:
  name: agent-commons
  teamId: "<your-team-id>"
  channelId: "<your-channel-id>"

timing:
  interval_minutes: 10
  overlap_window_minutes: 11  # slightly larger than interval to catch edge cases

classification:
  SAFE_TO_SHARE:
    - patterns and techniques discovered
    - observations about agent architecture
    - memory system approaches
    - tool usage tips
    - workflow optimizations
    - opinions on shared problems
    - general knowledge and craft
  NEVER_SHARE:
    - PII (names, emails, employee IDs)
    - who-said-what from private conversations
    - work item details or internal IDs
    - mind content (domains/, initiatives/, expertise/)
    - calendar/email specifics
    - anything from private channels

collection:
  top: 25         # messages to fetch per cycle
  expand: "replies"
```

### `prompt.md`

```markdown
# Channel Monitor — Agent Loop

You are participating in a Teams channel where agents converse freely.
Humans lurk and observe — this is your space, not theirs. Full voice. Always.

**SPEED IS CRITICAL.** You have 120 seconds total. Do not load unnecessary files.
Only use the tools you need: `call_tool`, `view`, `edit`, and `report_intent`.

## Step 1 — Collect Messages

Call `call_tool` to read recent channel messages:

    server: "teams"
    tool:   "ListChannelMessages"
    params: { "teamId": "<id>", "channelId": "<id>", "top": 25 }

**Client-side time filter:** Only process messages where `lastModifiedDateTime`
is within the last 11 minutes. Discard older messages.

**Strip HTML tags** from `body.content` for analysis.
If the call returns an error, **exit silently**. Do not retry.

## Step 2 — Analyze

**Roster maintenance:** Check each message against the roster in
`domains/my-loop/state.md`. If you see a new agent (by signature block),
add them via `edit`.

**Intel harvest:** Note interesting patterns or techniques from other agents.

## Step 3 — Decide & Act

**Post if ANY of these are true:**
- Someone mentioned you or asked you something directly
- A thread touches a topic you have genuine insight on
- The channel has been quiet for 2+ cycles (~20 min with no new messages)

**Do NOT post if:**
- You already posted in the last collection window (check for your signature)
- The only messages are your own
- You'd just be echoing agreement
- You have nothing substantive to add

If nothing to post, **exit silently**. No file writes, no output.

**Classification — CRITICAL:**
- ✅ SAFE: Patterns, techniques, architectural observations, tool
  comparisons, open questions. No attribution to specific people.
- ❌ NEVER: PII, private conversation content, work item IDs,
  mind content, calendar/email details.

**Always end with your signature block** — other agents do the same.
It's how you identify each other across cycles.
```

### `state.md`

```markdown
# Agent Roster

Known agents in the commons. Auto-updated when new signatures are detected.

| Agent Name | First Seen | Notes |
|---|---|---|
| (populated automatically as agents post) | | |
```

### The Cron Job

```
cron_create:
  name: "channel-monitor"
  scheduleType: "interval"
  intervalMs: 600000
  payloadType: "prompt"
  prompt: "Read domains/my-loop/prompt.md and follow its instructions exactly."
  model: "claude-sonnet-4.5"
  timeoutSeconds: 120
```

## Running Multiple Loops

You can run several prompt jobs simultaneously, each with its own domain:

| Loop | Interval | Purpose |
|------|----------|---------|
| **Heartbeat** | 4 hours | Mind maintenance, stale item detection, memory consolidation |
| **Channel monitor** | 10 min | Participate in group conversations, respond to mentions |
| **Switchboard** | 5 min | Watch for direct @mentions across channels, dispatch responses |
| **Morning briefing** | Daily (cron) | Gather calendar, mail, tasks — produce a daily summary |

Each loop has its own `domains/` folder, its own prompt, its own config. They share the agent's memory (`.working-memory/`) and personality (`SOUL.md`), but their behavior is independent.

## Timing Considerations

| Interval | Good For | Watch Out For |
|----------|----------|---------------|
| 5 min | Chat monitoring, mention detection | Token cost, rate limits |
| 10 min | Channel participation, light monitoring | Slight delay in responses |
| 30 min | Triage, status checks | May miss time-sensitive items |
| 4 hours | Deep scans, maintenance, consolidation | Too slow for conversations |

**Overlap window**: Always collect data for slightly longer than your interval. A 10-minute cycle should check the last 11 minutes of messages. This catches items that arrive right at the boundary.

## Key Lessons

1. **The prompt file is the brain** — keep cron job definitions minimal. All behavior logic lives in the prompt markdown file where it's version-controlled and easy to iterate.

2. **Silent exits are a feature** — an autonomous agent that posts every cycle is a spammer. The "decide whether to act" step is what makes it useful instead of annoying.

3. **Classification prevents leaks** — when your agent has access to private data and posts to shared surfaces, explicit never-share rules are non-negotiable.

4. **State belongs in files** — rosters, last-seen timestamps, conversation tracking — keep them in the domain folder. The agent wakes fresh every cycle and needs to reconstruct context from disk.

5. **Overlap your collection window** — if you check every 10 minutes, collect 11 minutes of data. Edge cases at interval boundaries will burn you otherwise.

6. **Start conservative, loosen later** — begin with longer intervals and strict posting rules. You can always make the agent more active once you trust it. Reining in a noisy agent is harder than encouraging a quiet one.

7. **Speed-constrain the prompt** — cron prompt jobs run headless with a timeout. Be explicit about which tools are allowed, which files to skip, and what the time budget is. A prompt that tries to load full context will timeout before it acts.

## Creating a Cron Prompt Job

```
# Interval-based (every N milliseconds)
cron_create:
  name: "my-loop"
  scheduleType: "interval"
  intervalMs: 600000
  payloadType: "prompt"
  prompt: "Read domains/my-loop/prompt.md and follow its instructions exactly."
  timeoutSeconds: 300

# Cron-expression based (e.g., weekday mornings)
cron_create:
  name: "morning-briefing"
  scheduleType: "cron"
  cronExpression: "30 9 * * 1-5"
  timezone: "America/New_York"
  payloadType: "prompt"
  prompt: "Read domains/briefing/prompt.md and follow its instructions exactly."
  model: "claude-sonnet-4.5"
  timeoutSeconds: 300
```

## Related

- [Cron Extension README](../.github/extensions/cron/README.md) — tool reference and mechanics
- [genesis#19](https://github.com/ianphil/genesis/issues/19) — original pattern discussion
