# Chat API Extension

Exposes the Copilot CLI agent as an HTTP API, allowing external chat interfaces
(web UIs, mobile apps, scripts, other agents) to interact with it.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/responses` | **OpenAI Responses API** — drop-in compatible |
| `POST` | `/chat` | Simple: send a message, receive the agent's response |
| `GET` | `/chat/stream?prompt=...` | SSE stream with token-by-token deltas |
| `GET` | `/history` | Retrieve conversation history |
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
  model: 'copilot',           // ignored — agent picks its own model
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

The extension starts automatically when the Copilot CLI session begins. The
port is logged to stderr and available via the `chat_api_status` tool.

### Send a message

```bash
curl -X POST http://127.0.0.1:<port>/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What files are in this repo?"}'
```

### Stream a response (SSE)

```bash
curl -N "http://127.0.0.1:<port>/chat/stream?prompt=Explain%20this%20codebase"
```

SSE event types:
- `start` — stream opened, includes request ID
- `delta` — incremental token from the agent
- `complete` — final full response
- `error` — something went wrong
- `[DONE]` — stream finished

### Health check

```bash
curl http://127.0.0.1:<port>/health
```

## Agent Tools

| Tool | Description |
|------|-------------|
| `chat_api_status` | Show server status, port, and endpoints |
| `chat_api_restart` | Restart the server (optionally on a specific port) |

## Architecture

```
External Client ──POST /chat──▶ HTTP Server (Node.js)
                                     │
                               session.sendAndWait()
                                     │
                               Copilot Agent ──▶ tools, files, etc.
                                     │
                               response.data.content
                                     │
External Client ◀──JSON──────── HTTP Server
```

## Security

The server binds to `127.0.0.1` (localhost only). It is **not** exposed to the
network. CORS headers allow all origins for local development convenience.

For production use, consider adding:
- Authentication (API key header)
- Rate limiting
- Request size limits
- TLS termination via a reverse proxy
