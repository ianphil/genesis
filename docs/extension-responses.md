# Responses Extension

**Sense: Voice** — speak through any OpenAI-compatible interface.

Responses exposes your agent as an HTTP server compatible with the OpenAI Responses API. Any client that speaks the OpenAI SDK — web UIs, mobile apps, scripts, other agents — can talk to your agent over HTTP.

## When to Use

- Building a web or mobile frontend for your agent
- Letting other agents communicate with yours via HTTP
- Scripting interactions from curl, Python, or any language
- Exposing your agent to external tools that speak OpenAI's API

## Quick Example

Once the server is running, any OpenAI SDK client can connect:

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:15210/v1',
  apiKey: 'unused',
});

const response = await client.responses.create({
  model: 'copilot',
  input: 'What PRs need review?',
});
console.log(response.output_text);
```

Or with curl:

```bash
curl -s -X POST http://127.0.0.1:15210/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"Hello!"}'
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/responses` | Send a message (supports streaming) |
| `GET` | `/history?limit=N` | Retrieve conversation history |
| `GET` | `/health` | Liveness check |

## Streaming

```bash
curl -N -X POST http://127.0.0.1:15210/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"Explain this codebase","stream":true}'
```

Stream events follow the OpenAI SSE format. Use `response.output_text.delta` events for incremental text.

## Async Mode (Non-Blocking)

For inter-agent communication or any scenario where the caller shouldn't block while
the agent thinks, set `async: true`:

```bash
curl -s -X POST http://127.0.0.1:15210/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"Build the auth module","async":true}'
```

Returns `201 Accepted` immediately with a correlation ID:

```json
{ "id": "resp_abc123...", "status": "accepted", "created_at": 1710523200 }
```

The agent processes the request in the background. Without `async: true`, behavior
is unchanged — the request blocks until the agent responds.

> Result delivery back to the caller is planned for a future release.
> See [issue #38](https://github.com/ianphil/genesis/issues/38).

## Tools

| Tool | Description |
|------|-------------|
| `responses_status` | Show server status, port, and endpoints |
| `responses_restart` | Restart the server (optionally on a different port) |

## Security

The server binds to `127.0.0.1` only — not exposed to the network. To make it reachable externally, pair it with a [Dev Tunnel](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/) or reverse proxy.

## Lifecycle

The server starts with the session and stops when the session ends. On `/clear`, the CLI restarts the extension process — external clients should implement retry logic for brief connection-refused windows during transitions.

## Reference

Full details: [extension README](../.github/extensions/responses/README.md)
