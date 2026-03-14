# MicroUI Extension

A Genesis extension that lets agents spawn lightweight native WebView windows — cross-platform micro-UIs for dashboards, forms, confirmations, reports, and visualizations.

Inspired by [Glimpse](https://github.com/hazat/glimpse) (macOS-only, Swift), MicroUI brings the same idea to all platforms using the .NET ecosystem and [Photino.NET](https://github.com/tryphotino/photino.NET).

| Platform | WebView engine |
|----------|---------------|
| Windows  | WebView2 (Edge/Chromium) |
| macOS    | WKWebView (Safari/WebKit) |
| Linux    | WebKitGTK |

## Quick Start

### 1. Install the binary

Download the pre-built binary for your platform from the [releases page](https://github.com/ianphil/genesis/releases) and place it in the standard location under this extension (`bin/{platform}/`). The extension tools resolve that location automatically, so you don't need to manually add MicroUI to your PATH unless you want a global install. `MICROUI_BIN` still overrides discovery if you want to point at a custom build.

| Platform | Binary |
|----------|--------|
| Windows  | `bin/win-x64/microui.exe` |
| macOS (Apple Silicon) | `bin/osx-arm64/microui` |
| macOS (Intel) | `bin/osx-x64/microui` |
| Linux    | `bin/linux-x64/microui` |

### 2. Build from source (requires [.NET 10+ SDK](https://dotnet.microsoft.com/download))

**NativeAOT** (single binary, requires C++ build tools / Desktop Development workload in Visual Studio):

```bash
dotnet publish src/MicroUI/MicroUI.csproj -r win-x64   -c Release /p:PublishAot=true -o bin/win-x64
dotnet publish src/MicroUI/MicroUI.csproj -r osx-arm64  -c Release /p:PublishAot=true -o bin/osx-arm64
dotnet publish src/MicroUI/MicroUI.csproj -r linux-x64  -c Release /p:PublishAot=true -o bin/linux-x64
```

**Self-contained** (no AOT, no C++ tools needed, larger output):

```bash
dotnet publish src/MicroUI/MicroUI.csproj -r win-x64 -c Release /p:PublishAot=false --self-contained -o bin/win-x64
```

> **Linux prerequisite:** `sudo apt-get install libwebkit2gtk-4.1-dev` (or equivalent for your distro)
>
> **Why .NET 10?** The project targets `net10.0` because transitive dependencies pull .NET 10 assemblies, which cause `FileNotFoundException` at runtime on `net8.0` builds.

### 3. Use it

```
microui_show:
  name: pr-dashboard
  html: "<h1>Open PRs</h1><p>Loading...</p>"
  title: "PR Dashboard"
  width: 600
  height: 400
```

Update it (live, via SSE):

```
microui_update:
  name: pr-dashboard
  html: "<h1>3 Open PRs</h1><ul><li>#42 alice</li></ul>"
```

Run JavaScript in the window:

```
microui_update:
  name: pr-dashboard
  js: "document.getElementById('count').textContent = '5'"
```

Close it:

```
microui_close:
  name: pr-dashboard
```

## Architecture

MicroUI v2 uses an **HTTP/SSE content architecture**:

```
microui-tools.mjs (embedded HTTP server, auto-started)
  GET  /w/{name}         → serve HTML (SSE + bridge scripts auto-injected)
  GET  /events/{name}    → SSE stream (reload + eval events)
  POST /msg/{name}       → receive messages from page (JS → agent)

microui.exe (Photino native window — thin shell)
  --url http://127.0.0.1:{port}/w/{name}  → navigate to URL
  stdin JSON: { type: "close" } | { type: "show", title: "..." }
  stdout JSON: { type: "ready" } | { type: "closed" }
```

**Why HTTP?** Photino's `SendWebMessage()` and `LoadRawString()` corrupt string encoding on Windows/WebView2 (garbled CJK characters). By serving content over HTTP and pushing updates via SSE, we bypass the broken native interop entirely. The .NET binary is just a native window frame — all content management happens in the JS extension layer.

## Tools

| Tool | Description |
|------|-------------|
| `microui_show` | Open a new native window with HTML content |
| `microui_update` | Update content (`html`) or run JavaScript (`js`) in an open window |
| `microui_close` | Close a window (`all` to close every window) |
| `microui_list` | List all open windows |

## JavaScript Bridge

Every page gets a `window.genesis` object injected via the HTTP server:

```js
// Send a message to the agent (via fetch POST)
window.genesis.send({ action: "submit", value: 42 });

// Close the window
window.genesis.close();
```

## Use Cases

### Confirmation Dialog

```html
<body style="font-family: system-ui; padding: 1.5rem; text-align: center;">
  <h2>Delete this file?</h2>
  <button onclick="window.genesis.send({ ok: true })">Yes, delete</button>
  <button onclick="window.genesis.send({ ok: false })">Cancel</button>
</body>
```

```
microui_show:
  name: confirm-delete
  html: "<body>..."
  width: 320
  height: 160
  auto_close: true
```

### Live Dashboard (floating, auto-updating)

```
microui_show:
  name: deploy-status
  html: "<h3>Deploy Status</h3><progress id='bar' value='0' max='100'></progress>"
  floating: true
  width: 350
  height: 200
```

Update as work progresses — content is pushed via SSE, no encoding corruption:

```
microui_update:
  name: deploy-status
  js: "document.getElementById('bar').value = 75"
```

### Native Copilot Chat

A chat window backed by the local responses extension is available as a built-in page in `pages/chat.html`. Serve it via `microui_show` or launch with the binary's `--url` flag pointed at the HTTP server.

The chat page calls `http://127.0.0.1:{responsesPort}/v1/responses` directly via `fetch()` + SSE streaming. Requires the responses extension to be running.

See [`docs/chat-guide.md`](docs/chat-guide.md) for the full streaming architecture.

### Transparent HUD

```
microui_show:
  name: thinking
  html: "<body style='background:transparent;margin:0;display:flex;align-items:center;justify-content:center;'><div style='background:rgba(0,0,0,0.8);color:#0f0;padding:12px 24px;border-radius:20px;font-family:monospace;'>⏳ thinking...</div></body>"
  frameless: true
  floating: true
  width: 220
  height: 60
```

## Protocol (stdin/stdout)

MicroUI communicates over **JSON Lines** on stdin/stdout for window control. Content delivery uses HTTP/SSE (handled by the extension tools).

### Commands (stdin → MicroUI)

```json
{"type":"show","title":"New Title"}
{"type":"close"}
```

### Events (stdout → Host)

```json
{"type":"ready","screen":{"width":2560,"height":1440}}
{"type":"closed"}
```

### CLI Flags

```
--url URL          Load content from URL (used by extension tools)
--width N          Window width (default: 800)
--height N         Window height (default: 600)
--title STR        Window title (default: "Genesis")
--frameless        Remove title bar
--floating         Always on top
--hidden           Start hidden, reveal with "show" command
--auto-close       Exit after first message from page
```

> **Fallback mode:** If `--url` is not provided, the binary falls back to the legacy stdin-based HTML loading (reads base64-encoded HTML command on stdin). This is kept for backward compatibility and scripting.

## File Structure

```
.github/extensions/microui/
├── bin/
│   └── {platform}/microui(.exe)  # Pre-built binary
├── src/
│   └── MicroUI/
│       ├── MicroUI.csproj        # .NET 10 project with Photino.NET
│       ├── Program.cs            # Entry point — CLI args, --url mode, stdin control loop
│       ├── Protocol.cs           # JSON types (ShowCommand, ReadyEvent, ClosedEvent)
│       ├── BridgeScript.cs       # JS bridge for file-based fallback mode
│       ├── WindowManager.cs      # Photino window lifecycle
│       └── TrimmerRoots.xml      # NativeAOT trim preservation
├── pages/
│   └── chat.html                 # Built-in Copilot chat page
├── docs/
│   ├── forms-guide.md            # Guide for structured forms
│   └── chat-guide.md             # Guide for chat mode architecture
├── tools/
│   └── microui-tools.mjs         # HTTP/SSE server + extension tools
├── extension.mjs                 # Copilot CLI extension entry point
├── extension.json                # Extension manifest
├── package.json
└── README.md
```

## How It Works

1. Agent calls `microui_show` with HTML content
2. Extension's embedded HTTP server stores the HTML in memory
3. Tool spawns the `microui` binary with `--url http://127.0.0.1:{port}/w/{name}`
4. Photino opens a native window and navigates to the URL
5. HTTP server injects SSE auto-reload and bridge scripts into the served page
6. Agent calls `microui_update` → HTML updated in memory → SSE "reload" event pushed → WebView reloads
7. Agent calls `microui_update` with `js` → SSE "eval" event pushed → page evaluates JavaScript
8. Page can call `window.genesis.send(data)` → fetch POST to HTTP server → agent receives it

No browser tabs. No encoding corruption. Native windows with live updates.

## Platform Notes

### Windows — WebView2

- **`[STAThread]` is required.** WebView2 uses COM and must run on a Single-Threaded Apartment thread.
- **Content served via HTTP.** This avoids Photino's `LoadRawString()` and `SendWebMessage()` encoding bugs that garble strings into CJK characters.
- **NativeAOT requires the C++ Desktop Development workload** in Visual Studio. If unavailable, build with `/p:PublishAot=false --self-contained`.

### macOS — WKWebView

- Should work with HTTP-based content delivery.
- NativeAOT compiles without additional tooling.

### Linux — WebKitGTK

- Requires `libwebkit2gtk-4.1-dev` (Ubuntu/Debian) or equivalent.

## Comparison

| | **Canvas** | **MicroUI** |
|---|---|---|
| **Window type** | Browser tab | Native app window |
| **Content delivery** | HTTP + SSE | HTTP + SSE (via embedded server) |
| **Platforms** | Cross-platform | Cross-platform |
| **WebView** | System browser | WebView2 / WKWebView / WebKitGTK |
| **Frameless** | No | Yes |
| **Always on top** | No | Yes |
| **Binary required** | No | Yes (.NET 10+) |
| **Build tools** | None | .NET 10+ SDK (+ C++ tools for AOT) |
| **Startup** | Browser launch | ~100–300ms |

Use **Canvas** when you want a full browser tab experience.  
Use **MicroUI** when you want a native window — dialogs, HUDs, floating panels.
