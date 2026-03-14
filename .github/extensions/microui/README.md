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

Download the pre-built binary for your platform from the [releases page](https://github.com/ianphil/genesis/releases) and put it on your PATH, **or** set `MICROUI_BIN` to the full path.

| Platform | Binary |
|----------|--------|
| Windows  | `bin/win-x64/microui.exe` |
| macOS (Apple Silicon) | `bin/osx-arm64/microui` |
| macOS (Intel) | `bin/osx-x64/microui` |
| Linux    | `bin/linux-x64/microui` |

### 2. Build from source (requires [.NET 8+ SDK](https://dotnet.microsoft.com/download))

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

### 3. Use it

```
microui_show:
  name: pr-dashboard
  html: "<h1>Open PRs</h1><p>Loading...</p>"
  title: "PR Dashboard"
  width: 600
  height: 400
```

Update it:

```
microui_update:
  name: pr-dashboard
  html: "<h1>3 Open PRs</h1><ul><li>#42 alice</li></ul>"
```

Close it:

```
microui_close:
  name: pr-dashboard
```

## Tools

| Tool | Description |
|------|-------------|
| `microui_show` | Open a new native window with HTML content |
| `microui_update` | Update content or run JavaScript in an open window |
| `microui_close` | Close a window (`all` to close every window) |
| `microui_list` | List all open windows |

## JavaScript Bridge

Every page loaded by MicroUI gets a `window.genesis` object injected:

```js
// Send a message to the agent
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

### Live Dashboard (floating)

```
microui_show:
  name: deploy-status
  html: "<h3>Deploy Status</h3><progress id='bar' value='0' max='100'></progress>"
  floating: true
  width: 350
  height: 200
```

Then update as work progresses:

```
microui_update:
  name: deploy-status
  js: "document.getElementById('bar').value = 75"
```

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

MicroUI communicates over **JSON Lines** on stdin/stdout. You don't need to use this directly — the tools handle it — but it's useful for scripting.

> **Important:** The binary reads stdin **synchronously** on startup, blocking until it receives the first `html` command. Send the HTML immediately after spawning — no delay needed.

### Commands (stdin → MicroUI)

```json
{"type":"html","html":"<base64-encoded HTML>"}
{"type":"eval","js":"document.title = 'Updated'"}
{"type":"show","title":"New Title"}
{"type":"close"}
```

### Events (stdout → Host)

```json
{"type":"ready","screen":{"width":2560,"height":1440}}
{"type":"message","data":{"action":"submit","value":42}}
{"type":"closed"}
```

### CLI Flags

```
--width N          Window width (default: 800)
--height N         Window height (default: 600)
--title STR        Window title (default: "Genesis")
--frameless        Remove title bar
--floating         Always on top
--hidden           Start hidden, reveal with "show" command
--auto-close       Exit after first message from page
```

## File Structure

```
.github/extensions/microui/
├── src/
│   ├── MicroUI/
│   │   ├── MicroUI.csproj      # .NET 8 project with NativeAOT
│   │   ├── Program.cs          # Entry point — CLI args + stdin/stdout loop
│   │   ├── Protocol.cs         # JSON Lines types (Command, Event)
│   │   ├── BridgeScript.cs     # JavaScript bridge injected into pages
│   │   ├── WindowManager.cs    # Photino window lifecycle
│   │   └── TrimmerRoots.xml    # NativeAOT trim preservation
│   └── MicroUI.sln
├── tools/
│   └── microui-tools.mjs       # Genesis tools: microui_show/update/close/list
├── extension.mjs               # Copilot CLI extension entry point
├── extension.json              # Extension manifest
├── package.json
└── README.md
```

## How It Works

1. Agent calls `microui_show` with HTML content
2. Tool spawns the `microui` binary as a child process
3. HTML is base64-encoded and sent as a JSON Lines command on stdin
4. MicroUI reads the first `html` command **synchronously** before opening the window
5. HTML is written to a temp file and loaded via `file://` URI (see Platform Notes below)
6. Bridge script (`window.genesis`) is injected into every page
7. Page can call `window.genesis.send(data)` → event fires on stdout → agent receives it
8. Agent calls `microui_update` to change content or `microui_close` to dismiss

No HTTP server. No browser tabs. Native windows only.

## Platform Notes

### Windows — WebView2

- **`[STAThread]` is required.** WebView2 uses COM and must run on a Single-Threaded Apartment thread. Without this, the window opens but renders a blank white page. The entry point uses `[STAThread]` on `Main()`.
- **`LoadRawString` is unreliable.** Photino's `LoadRawString()` sometimes fails to render content with WebView2. The workaround is to write HTML to a temp file and use `.Load(path)` which navigates via a `file://` URI. Temp files are created in `%TEMP%` with a GUID name.
- **NativeAOT requires the C++ Desktop Development workload** in Visual Studio. If unavailable, build with `/p:PublishAot=false --self-contained` instead.

### macOS — WKWebView

- Should work with both `LoadRawString` and file-based loading.
- NativeAOT compiles without additional tooling.

### Linux — WebKitGTK

- Requires `libwebkit2gtk-4.1-dev` (Ubuntu/Debian) or equivalent.
- Same file-based loading strategy applies for consistency.

## Comparison

| | **Canvas** | **MicroUI** |
|---|---|---|
| **Window type** | Browser tab | Native app window |
| **Protocol** | HTTP + SSE | JSON Lines stdin/stdout |
| **Platforms** | Cross-platform | Cross-platform |
| **WebView** | System browser | WebView2 / WKWebView / WebKitGTK |
| **Frameless** | No | Yes |
| **Always on top** | No | Yes |
| **Binary required** | No | Yes (.NET 8+) |
| **Build tools** | None | .NET SDK (+ C++ tools for AOT) |
| **Startup** | Browser launch | ~100–300ms |

Use **Canvas** when you want a full browser tab experience.  
Use **MicroUI** when you want a native window — dialogs, HUDs, floating panels.
