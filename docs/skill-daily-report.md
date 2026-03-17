# Daily Report Skill

A comprehensive morning briefing that gathers data from multiple sources and presents a scannable summary.

## When to Use

- "Daily report"
- "Morning briefing"
- "What's on my plate today?"
- First thing each morning to orient your day

## What It Covers

| Section | Source | What You Get |
|---------|--------|-------------|
| Mentions & requests | Teams | Direct @mentions, tagged items |
| Open questions | Teams | Unresolved threads needing your input |
| Decisions made | Teams + meetings | Decisions from last 24 hours |
| Action items | Teams + meetings | Commitments by/to you |
| Today's meetings | Calendar | Time, title, attendees, prep notes |
| Yesterday's recaps | Calendar | Decisions and action items from yesterday |
| Urgent/VIP emails | Email | High-priority and VIP sender emails |
| Awaiting reply | Email | Threads waiting on you |
| Active work items | Azure DevOps | ID, type, title, state, priority, age |
| Recently completed | Azure DevOps | Closed in last 30 days |
| Aging items | Azure DevOps | Open >14 days (flagged) |
| State changes | Azure DevOps | Items that changed state in 24h |
| Next actions | Mind | Open items from initiative next-actions |
| Inbox notes | Mind | Untriaged items needing attention |
| Focus recommendations | All sources | Top 3 suggested priorities |

## Required Configuration

The skill reads from your global copilot instructions (`~/.copilot/copilot-instructions.md`):

```markdown
## Azure DevOps Defaults
- **Organization:** https://dev.azure.com/myorg
- **Project:** My Project
- **Area Path:** My Project\My Team

## Teams Channels
| Chat Name | Thread ID |
|-----------|-----------|
| Team Chat | 19:abc123@thread.v2 |

## VIP Contacts
- Alice Smith
- Bob Jones
```

If any section is missing, the agent will ask for the values and offer to add them.

## How It Works

1. **ADO first** — fetches active work items and recent state changes
2. **M365 in parallel** — Teams chats, mentions, calendar, email (all queries run simultaneously, enriched with ADO context)
3. **Local mind** — scans `next-actions.md` files and inbox
4. **Assemble** — combines everything into a formatted report with focus recommendations

The report is read-only — it never sends emails or modifies work items.

## Reference

Full details: [skill definition](../.github/skills/daily-report/SKILL.md)
