# Responses Extension

Exposes the Copilot CLI agent as an OpenAI Responses API–compatible HTTP server,
allowing external clients (web UIs, mobile apps, scripts, other agents) to
interact with it using the standard OpenAI SDK.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/responses` | **OpenAI Responses API** ...  drop-in compatible |
| `GET` | `/history?limit=N` | Retrieve conversation history (last N messages, or all if omitted) |
| `GET` | `/health` | Liveness check |

## OpenAI SDK Compatibility

Any client that speaks the OpenAI Responses API can talk to your agent:

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:<port>/v1',
  apiKey: 'unused',           // no auth required for localhost
});

// Non-streaming
const response = await client.responses.create({
  model: 'copilot',           // ignored ...  agent picks its own model
  input: 'What PRs need review?',
});
console.log(response.output_text);

// Streaming
const stream = await client.responses.create({
  model: 'copilot',
  input: 'Explain this codebase',
  stream: true,
});
for await (const event of stream) {
  if (event.type === 'response.output_text.delta') {
    process.stdout.write(event.delta);
  }
}
```

### Request format

```json
{
  "model": "copilot",
  "input": "Your prompt here",
  "instructions": "Optional system instructions",
  "stream": false
}
```

`input` accepts a string or an array of `{ role, content }` conversation items.
`instructions` is prepended as system context. `stream: true` enables SSE.

## Usage

The extension starts the HTTP server when the Copilot CLI loads the extension
and keeps it running across session transitions (e.g. `/clear`). The server
binds once and does not recycle — external clients maintain a stable connection.

During brief session transitions, requests to `/v1/responses` and `/history`
return `503 No active session`. The `/health` endpoint stays available and
reports `session: "connected"` or `"disconnected"`.

### Send a message (curl)

```bash
curl -s -X POST http://127.0.0.1:<port>/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"What files are in this repo?"}'
```

### Stream a response

```bash
curl -N -X POST http://127.0.0.1:<port>/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"Hello!","stream":true}'
```

### Health check

```bash
curl http://127.0.0.1:<port>/health
```

## Agent Tools

| Tool | Description |
|------|-------------|
| `responses_status` | Show server status, port, and endpoints |
| `responses_restart` | Restart the server (optionally on a specific port) |

## Architecture

```
External Client ──POST /v1/responses──▶ HTTP Server (Node.js)
                                             │
                                       session.sendAndWait()
                                             │
                                       Copilot Agent ──▶ tools, files, etc.
                                             │
                                       response.data.content
                                             │
External Client ◀──OpenAI JSON──────── HTTP Server
```

## Security

The server binds to `127.0.0.1` (localhost only). It is **not** exposed to the
network. CORS headers allow all origins for local development convenience.

For production use, consider adding:
- Authentication (API key header)
- Rate limiting
- Request size limits
- TLS termination via a reverse proxy
