# MicroUI Chat Guide

Open a lightweight native chat window backed by the local responses extension — free-form conversation in a WebView, without opening a browser tab.

## Overview

Chat mode is a built-in page (`pages/chat.html`) that gives agents and humans a fast native conversation surface:

- MicroUI hosts the Photino native window
- `chat.html` owns the UI
- JavaScript talks directly to the local responses API via `fetch()` + SSE
- Streamed tokens update the DOM as they arrive

In MicroUI v2, chat is just another page served via the HTTP/SSE content server — no special `--chat` flag needed.

## How It Works

```
User types a prompt
  │
  ▼
Chat window (Photino native frame, content via HTTP)
  │
  └── chat.html (JavaScript)
          │
          ├── fetch() POST
          ▼
    http://127.0.0.1:15210/v1/responses
          │
          ├── SSE stream
          │     event: response.output_text.delta
          │     data: {"delta":"text"}
          ▼
      DOM update
```

Data path: `chat.html` → `fetch()` POST → responses API → SSE stream → DOM update

The .NET binary only hosts the native window. All chat traffic is JavaScript ↔ HTTP.

## Prerequisites

- The responses extension must be running (`responses_restart` if needed)
- The MicroUI binary must be available in `bin/{platform}/`, via `MICROUI_BIN`, or on `PATH`
- Default responses port: `15210`

## How to Use It

The simplest way is to read `pages/chat.html` and pass it to `microui_show`:

```
microui_show:
  name: chat
  html: <contents of pages/chat.html>
  title: "Copilot Agent Chat"
  width: 500
  height: 650
  floating: true
```

Or launch the binary directly with `--url` pointed at the HTTP server's chat page endpoint.

## Internals

### JavaScript talks directly to the responses API

The WebView page sends requests straight to the local responses extension:

```js
fetch('http://127.0.0.1:' + API_PORT + '/v1/responses', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'copilot', input: text, stream: true })
})
```

No C# chat client, no SDK bridge, no C# → JS data path for streamed tokens.

### Streaming uses `ReadableStream` + SSE parsing

The page reads the response with `response.body.getReader()` and a `TextDecoder`, parsing SSE events line by line:

```text
event: response.output_text.delta
data: {"delta":"text"}
```

### Response lifecycle

1. User submits a message
2. Typing indicator appears
3. SSE delta events stream tokens into the message
4. Stream finishes, response settles into final DOM state

No conversation persistence — each launch starts fresh.

## Limitations

- **No history persistence** — closing the window ends the session
- **Streaming depends on responses extension** — if it delays or buffers, the UI pauses
- **Port must match** — `API_PORT` in chat.html must match the responses extension port

## Chat Mode vs `ask_user`

| | `ask_user` | MicroUI Chat |
|---|---|---|
| **Style** | Structured form | Free-form conversation |
| **Input** | Schema-driven | Natural language |
| **Return** | Typed values | Streaming text |
| **Best for** | Decisions, field collection | Back-and-forth discussion |

## Troubleshooting

- **Chat requests fail:** Ensure responses extension is running (`responses_restart`)
- **Typing indicator stuck:** Check that the responses endpoint is emitting SSE events
- **Need structured data:** Use a MicroUI form or `ask_user` instead (see `forms-guide.md`)
