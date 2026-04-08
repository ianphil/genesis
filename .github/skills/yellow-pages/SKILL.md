---
name: yellow-pages
description: >
  Send messages to other agents — local or remote. The agent directory and
  communication layer. Use when the user asks to "talk to", "contact", "message",
  "reach", "send a message to", "ping", or "call" another agent by name. Also
  triggers on "list agents", "who can I talk to", or "add a contact".
---

# Yellow Pages — Agent Directory & Communications

Your directory of reachable agents and the tool for talking to them. One script
handles local agents (same machine, HTTP) and remote agents (Dev Tunnels, JWT auth).

## Quick Reference

Run `node .github/skills/yellow-pages/send.js --help` for the full instruction
manual — it covers every command, option, and transport detail.

## Core Operations

**Send a message:**
```
node .github/skills/yellow-pages/send.js --to <name> --message "your message"
```

**Check for replies:**
```
node .github/skills/yellow-pages/send.js --check
```

**List contacts:**
```
node .github/skills/yellow-pages/send.js --list
```

## When Someone Asks to Contact an Unknown Agent

If the user asks to contact an agent not in the directory, **ask them**:
1. What's the agent's name?
2. Is it local (on this machine) or remote (on another machine)?
3. If local: what port?
4. If remote: what's the tunnel ID?

Then register with `--add`:
```
node .github/skills/yellow-pages/send.js --add <name> --local <port>
node .github/skills/yellow-pages/send.js --add <name> --tunnel <tunnelId>
```

## Delivery Modes

- **Default (no flag):** Background job on the remote agent. Returns a job ID.
  Trackable via `--check`. Use for tasks, requests, anything you want to follow up on.
- **`--sync` flag:** Fire-and-forget into their current interactive session.
  No tracking. Use for quick pings, FYIs, and messages that don't need a response.

## Inbound Messages

When you receive a message via the Responses API with a `From:` field in the
envelope, the sender is identified. Look them up in contacts.json for personality
notes and context on who they are and how to respond.

## Identity

Every outbound message includes an `X-Agent-Name` header identifying you as the
sender. The receiving agent sees this in their Responses API envelope.

## Hard Rules

1. **Async is the default.** Use `--sync` only for quick pings or when the user asks.
2. **Never poll or loop after sending.** Send → report job ID → move on.
3. **Never pass `previous_response_id` across agent boundaries** — each message is self-contained.
4. **Read stdout** for results. **Read stderr** for errors.
5. **contacts.json is the directory.** jobs.json is ephemeral tracking (gitignored).
