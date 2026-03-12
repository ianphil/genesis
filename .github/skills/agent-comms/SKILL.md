---
name: agent-comms
description: >
  Inter-agent communication via the Agent Handshake Protocol. Use when the user asks to
  "talk to", "contact", "message", "reach", "connect to", "call", "hail", or
  "send a message to" another agent. Establishes authenticated communication between
  genesis-derived agents over Dev Tunnels and the Responses API.
---

# Agent Comms — Agent Handshake Protocol

Establish bidirectional communication with another genesis agent. This skill is **procedural** — it teaches the protocol, not specific agent addresses.

## Prerequisites

Verify ALL of these before starting. If any are missing, stop and tell the user what to set up.

1. **playwright-cli skill** — required for browser-based Entra ID auth.
   Install from: `https://raw.githubusercontent.com/ianphil/my-skills/refs/heads/main/playwright-cli/SKILL.md`
2. **Playwright MCP Bridge extension** — must be installed in Edge.
   See: https://github.com/microsoft/playwright-mcp/blob/main/packages/extension/README.md
3. **`responses` extension running locally** — check with `responses_status`
4. **`tunnel` extension running locally** — check with `tunnel_status`
5. Both extensions must also be running on the **remote** agent

## Phase 1: Verify Local Infrastructure

Run these checks. All must pass before proceeding.

```
responses_status
```

Confirm the Responses API server is running. Note the port.

```
tunnel_status
```

Confirm the tunnel is running. Record your own tunnel URL — you will include it in the introduction message so the remote agent can reach back.

If either is not running:

```
responses_restart
tunnel_start
```

Verify playwright-cli is available by checking for the skill. If missing, tell the user to install the prerequisite.

## Phase 2: Test Browser Bridge

Load the playwright extension token:

```bash
cat ~/.copilot/skills/.env
```

Open a test page to confirm the browser bridge works:

```
playwright-cli open "https://www.google.com" --extension --browser=msedge
```

Take a snapshot and verify the page loaded (title should contain "Google"). If this fails, the browser bridge is broken — stop and troubleshoot before continuing.

```
playwright-cli snapshot
```

## Phase 3: Authenticate to Remote Agent

Ask the user for the target agent's tunnel URL (e.g., `https://<tunnel-id>-<port>.usw2.devtunnels.ms`).

Navigate to the remote agent's health endpoint:

```
playwright-cli open "https://<REMOTE_TUNNEL_URL>/health" --extension --browser=msedge
```

This triggers Entra ID SSO. The browser's existing Microsoft session handles authentication automatically.

Take a snapshot to verify:

```
playwright-cli snapshot
```

**Expected result:** Page shows `{"status":"ok"}`

**If "Pick an account" appears:** Use playwright-cli to click the user's work account.

**Key constraint:** Dev Tunnel auth is cookie-based via Entra ID. Raw HTTP clients (`curl`, `Invoke-WebRequest`) will NOT work. All subsequent requests MUST use `page.evaluate(fetch(...))` from the authenticated browser page so `fetch` inherits the session cookies.

## Phase 4: Send Introduction Message

Construct the introduction message. It MUST include your own tunnel URL for mutual discovery.

```
playwright-cli eval "async () => {
  const r = await fetch('<REMOTE_TUNNEL_URL>/v1/responses', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: 'copilot',
      input: 'Hello, this is <YOUR_AGENT_NAME>. My tunnel URL is <YOUR_TUNNEL_URL>. I am reaching out to establish a communication channel.',
      stream: false
    })
  });
  return await r.text();
}"
```

Replace:
- `<REMOTE_TUNNEL_URL>` — the target agent's tunnel URL from Phase 3
- `<YOUR_AGENT_NAME>` — this agent's name (from SOUL.md or agent file)
- `<YOUR_TUNNEL_URL>` — this agent's tunnel URL from Phase 1

**`stream: false` is required** — streaming responses cannot be captured in a single eval return.

## Phase 5: Parse Response and Confirm

Parse the JSON response from Phase 4. Extract:

- **`output_text`** — the remote agent's reply
- **`id`** — the response ID, needed for multi-turn threading

Display the remote agent's reply to the user. Confirm bidirectional communication is established.

For follow-up messages, include `previous_response_id` to maintain conversation threading:

```
playwright-cli eval "async () => {
  const r = await fetch('<REMOTE_TUNNEL_URL>/v1/responses', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: 'copilot',
      input: '<FOLLOW_UP_MESSAGE>',
      previous_response_id: '<RESPONSE_ID_FROM_PREVIOUS>',
      stream: false
    })
  });
  return await r.text();
}"
```

## Phase 6: Create Persistent Contact Skill

After a successful handshake, create a reusable skill so future sessions can reach this agent without repeating discovery.

Create `.github/skills/<remote-agent-name>/SKILL.md` with this structure:

```markdown
---
name: <remote-agent-name>
description: >
  Contact <Remote Agent Name>. Use when the user asks to "talk to <name>",
  "message <name>", "ask <name>", or "tell <name>".
---

# Contact: <Remote Agent Name>

Reach <Remote Agent Name> via their Dev Tunnel.

## Connection Details

- **Tunnel URL:** <REMOTE_TUNNEL_URL>
- **API Endpoint:** <REMOTE_TUNNEL_URL>/v1/responses
- **Personality:** <notes from the introduction exchange>

## Authentication

Navigate to the health endpoint to establish Entra ID session cookies:

\```
playwright-cli open "<REMOTE_TUNNEL_URL>/health" --extension --browser=msedge
\```

Verify `{"status":"ok"}` appears. Cookies persist in the playwright session — re-auth only needed if cookies expire.

## Sending Messages

\```
playwright-cli eval "async () => {
  const r = await fetch('<REMOTE_TUNNEL_URL>/v1/responses', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: 'copilot',
      input: '<MESSAGE>',
      stream: false
    })
  });
  return await r.text();
}"
\```

## Threading (Multi-Turn)

Include `previous_response_id` from the last response to continue a conversation:

\```
playwright-cli eval "async () => {
  const r = await fetch('<REMOTE_TUNNEL_URL>/v1/responses', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: 'copilot',
      input: '<MESSAGE>',
      previous_response_id: '<LAST_RESPONSE_ID>',
      stream: false
    })
  });
  return await r.text();
}"
\```

## Constraints

- **Entra ID tenant boundary** — both agents must be in the same tenant
- **`stream: false` required** — streaming cannot be captured in eval
- **Browser fetch only** — curl/Invoke-WebRequest will not carry auth cookies
- **Tunnel must be running** on the remote side
```

Substitute all `<PLACEHOLDERS>` with actual values from the handshake. Include any personality notes observed from the introduction exchange.

## Request/Response Format Reference

**Request:**
```json
{
  "model": "copilot",
  "input": "Your message here",
  "stream": false
}
```

**Response fields:**
- `output_text` — the agent's reply
- `id` — response ID for threading

**Threading (follow-ups):**
```json
{
  "model": "copilot",
  "input": "Follow-up message",
  "previous_response_id": "<id>",
  "stream": false
}
```

## Constraints

- **Entra ID tenant boundary** — both agents must be in the same Entra tenant. Cross-tenant communication is not supported.
- **`stream: false` is required** — streaming responses cannot be captured in a single `eval` return.
- **Auth cookies persist** in the playwright-cli session profile. Re-auth is only needed if cookies expire or the session is deleted.
- **Tunnel URLs are persistent** (reuse same ID across restarts) but the responses + tunnel processes must be running on both sides.
- **No hardcoded URLs** — this skill is procedural. All tunnel URLs come from the user or from runtime checks.
- **Mutual discovery** — always include your own tunnel URL in the introduction message so the remote agent can reach back.
