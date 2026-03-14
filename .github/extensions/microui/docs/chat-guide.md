# MicroUI Chat Guide

Open a lightweight native chat window backed by the local responses extension — free-form conversation in a WebView, without building a C# bridge or opening a browser tab.

## Overview

Chat mode exists for the moments when a structured form is too rigid and a full browser tab is too heavy. It gives agents and humans a fast native conversation surface while keeping the architecture simple:

- MicroUI hosts the window
- `chat.html` owns the UI
- JavaScript talks directly to the local responses API
- streamed tokens update the DOM as they arrive

This design avoids the Windows/WebView2 string corruption issues that showed up when sending data from C# into JavaScript.

## How It Works

```
User
  │
  │ types a prompt
  ▼
Chat window (Photino + WebView)
  │
  ├── C# host
  │     ├── loads embedded chat.html
  │     ├── injects API port
  │     └── opens native window
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

Final data path:

`chat.html` (WebView JS) → `fetch()` POST → `http://127.0.0.1:15210/v1/responses` → SSE stream → DOM update

C# only hosts the window. All chat traffic is JavaScript ↔ HTTP.

## Prerequisites

- The responses extension must be running and listening on the port you plan to use
- The MicroUI binary must be available either in the standard `bin/{platform}/` location, via `MICROUI_BIN`, or on `PATH`

Default port: `15210`

## How to Use It

On Windows:

```bash
microui.exe --chat
microui.exe --chat --port 15210
```

On macOS/Linux, use `microui --chat`.

Use `--port N` when the responses extension is listening on a non-default port.

## Internals

### 1. `chat.html` is embedded into the binary

The chat UI lives at `src/MicroUI/chat.html` and is compiled into the .NET assembly as an embedded resource. At launch, MicroUI loads that resource from the assembly rather than reading it from disk.

Why this matters:

- the chat UI ships with the binary
- the tool does not depend on an external HTML file at runtime
- the C# host stays small and focused on window creation

### 2. The port is injected at launch

Chat mode accepts `--port N`, defaulting to `15210`.

At startup, MicroUI reads the embedded HTML and replaces the default port assignment before the page is loaded:

```js
var API_PORT = 15210;
```

That replacement lets the same embedded HTML target a different responses endpoint without rebuilding the binary.

### 3. JavaScript talks directly to the responses API

The WebView page sends requests straight to the local responses extension with `fetch()`:

```js
fetch('http://127.0.0.1:' + API_PORT + '/v1/responses', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'copilot',
    input: text,
    stream: true
  })
})
```

This is the key architectural choice in chat mode. There is no C# chat client, no SDK bridge, and no C# → JS data path for streamed tokens.

### 4. Streaming uses `ReadableStream` + SSE parsing

The page reads the streaming response with `response.body.getReader()` and a `TextDecoder`, then parses Server-Sent Events line by line.

The important event shape is:

```text
event: response.output_text.delta
data: {"delta":"text"}
```

When the current event is `response.output_text.delta`, the page parses the JSON payload and appends `delta` text into the active assistant message.

### 5. Response lifecycle

The chat flow is intentionally simple:

1. User submits a message
2. The UI shows a typing indicator / pending assistant response
3. SSE delta events stream tokens into the current message
4. The stream finishes and the response settles into its final DOM state

There is no conversation persistence layer behind this. Each launch starts fresh.

## Limitations and Known Issues

### `SendWebMessage()` is broken on Windows

On Windows/WebView2, Photino's `SendWebMessage()` can corrupt string encoding and produce garbled CJK characters. We saw this when sending text directly and when using `Invoke()` to marshal the call back onto the UI thread.

That is why chat mode does **not** use C# → JS messaging for response text. The WebView page fetches and streams responses directly.

### Streaming depends on responses extension event propagation

If the local responses extension delays, buffers, or fails to propagate streaming events, the UI will appear to pause or update in larger chunks. Chat mode assumes the endpoint provides an SSE stream that surfaces `response.output_text.delta` events in order.

### No conversation history persistence

Chat mode does not save transcripts or restore prior conversations. Closing the window ends the session state for that UI.

## Chat Mode vs `ask_user`

| | `ask_user` | MicroUI Chat |
|---|---|---|
| **Interaction style** | Structured prompt / form | Free-form conversation |
| **Input model** | Schema-driven | Natural language |
| **Return shape** | Typed values | Streaming text |
| **Best for** | Decisions, confirmations, field collection | Back-and-forth discussion |
| **UI control** | Built-in | Custom HTML/CSS/JS |
| **Persistence** | Per prompt | Fresh session each launch |

Use **`ask_user`** when you need structured inputs, validation, and predictable JSON.

Use **MicroUI chat** when you want a native conversational surface with live streaming output.

## Troubleshooting

### The window opens, but chat requests fail

- Make sure the responses extension is running
- Make sure it is listening on the expected port
- If it is using a non-default port, launch MicroUI with `--port N`

### Port `15210` is already in use

Use a different port for the responses extension, then start chat mode with the matching value:

```bash
microui.exe --chat --port 16000
```

### The UI stays on the typing indicator

This usually means the responses endpoint is not streaming events the page can consume. Check that the local endpoint is reachable and that it is emitting `response.output_text.delta` events.

### I need structured data, not chat

Use a MicroUI form or `ask_user` instead. See `docs/forms-guide.md` for form patterns, validation, and multi-field input flows.
