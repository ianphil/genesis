// MicroUI tools — microui_show, microui_update, microui_close, microui_list
//
// Architecture: Embedded HTTP/SSE server (Node built-in `http`) serves HTML
// content to Photino native windows. Updates are pushed via Server-Sent Events,
// avoiding Photino's broken SendWebMessage/LoadRawString on Windows.
//
// Flow: microui_show → store HTML in memory → spawn microui.exe --url → window
//       microui_update → update HTML in memory → push SSE reload event → WebView reloads

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(__dirname, "..");

// ---------- Binary resolution ----------

function resolveBinary() {
  if (process.env.MICROUI_BIN) return process.env.MICROUI_BIN;
  const name = process.platform === "win32" ? "microui.exe" : "microui";
  const platDir = `${process.platform === "win32" ? "win" : process.platform === "darwin" ? "osx" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;
  const localBin = resolve(extRoot, "bin", platDir, name);
  if (existsSync(localBin)) return localBin;
  return name;
}

// ---------- HTTP/SSE content server ----------

/** @type {Map<string, string>} window name → current HTML content */
const contentMap = new Map();

/** @type {Map<string, Set<import('http').ServerResponse>>} window name → SSE clients */
const sseClients = new Map();

let httpServer = null;
let httpPort = 0;

// SSE auto-reload script injected into every page served
const SSE_SCRIPT = `
<script>
(function() {
  if (window.__microuiSSE) return;
  window.__microuiSSE = true;
  var name = location.pathname.split('/').pop();
  var es = new EventSource('/events/' + name);
  es.addEventListener('reload', function() { location.reload(); });
  es.addEventListener('eval', function(e) {
    try { eval(e.data); } catch(err) { console.error('[microui] eval error:', err); }
  });
  es.onerror = function() { setTimeout(function() { location.reload(); }, 2000); };
})();
</script>`;

// Bridge script — provides window.genesis.send() and window.genesis.close()
// Uses fetch POST back to the HTTP server (avoids broken SendWebMessage)
const BRIDGE_SCRIPT = `
<script>
(function() {
  if (window.__genesisBridgeInstalled) return;
  window.__genesisBridgeInstalled = true;
  var name = location.pathname.split('/').pop();
  var baseUrl = location.origin;
  window.genesis = {
    send: function(data) {
      fetch(baseUrl + '/msg/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(function(err) { console.error('[genesis] send error:', err); });
    },
    close: function() {
      fetch(baseUrl + '/msg/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ __genesis_close: true })
      }).catch(function() {});
    }
  };
})();
</script>`;

function injectScripts(html) {
  const lc = html.toLowerCase();
  const scripts = SSE_SCRIPT + BRIDGE_SCRIPT;
  if (lc.includes("</body>")) {
    return html.replace(/<\/body>/i, scripts + "\n</body>");
  }
  if (lc.includes("</html>")) {
    return html.replace(/<\/html>/i, scripts + "\n</html>");
  }
  return html + scripts;
}

/**
 * Start the HTTP server on a random available port.
 * @returns {Promise<number>} The port the server is listening on.
 */
function startServer() {
  if (httpServer) return Promise.resolve(httpPort);

  return new Promise((resolvePort, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1`);

      // GET /w/{name} — serve HTML content
      if (req.method === "GET" && url.pathname.startsWith("/w/")) {
        const name = url.pathname.slice(3);
        const html = contentMap.get(name);
        if (!html) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache, no-store",
        });
        res.end(injectScripts(html));
        return;
      }

      // GET /events/{name} — SSE stream
      if (req.method === "GET" && url.pathname.startsWith("/events/")) {
        const name = url.pathname.slice(8);
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        res.write(":ok\n\n");

        if (!sseClients.has(name)) sseClients.set(name, new Set());
        sseClients.get(name).add(res);

        req.on("close", () => {
          const clients = sseClients.get(name);
          if (clients) {
            clients.delete(res);
            if (clients.size === 0) sseClients.delete(name);
          }
        });
        return;
      }

      // POST /msg/{name} — receive messages from page (bridge)
      if (req.method === "POST" && url.pathname.startsWith("/msg/")) {
        const name = url.pathname.slice(5);
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
          try {
            const data = JSON.parse(body);
            handleBridgeMessage(name, data);
          } catch { /* ignore malformed */ }
        });
        return;
      }

      // Fallback
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    });

    server.listen(0, "127.0.0.1", () => {
      httpPort = server.address().port;
      httpServer = server;
      console.error(`microui: HTTP server listening on 127.0.0.1:${httpPort}`);
      resolvePort(httpPort);
    });

    server.on("error", reject);
  });
}

/**
 * Push an SSE event to all clients connected to a window.
 */
function pushSSE(name, event, data) {
  const clients = sseClients.get(name);
  if (!clients) return;
  const payload = data !== undefined
    ? `event: ${event}\ndata: ${data}\n\n`
    : `event: ${event}\ndata:\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { /* client gone */ }
  }
}

/**
 * Handle a message sent from the page via the bridge (fetch POST).
 */
function handleBridgeMessage(name, data) {
  // Close signal
  if (data && data.__genesis_close) {
    sendCommand(name, { type: "close" });
    return;
  }
  // Forward as a message event to stderr (same as before)
  console.error(`microui[${name}]: message — ${JSON.stringify(data)}`);
}

// ---------- Window state ----------

/** @type {Map<string, import('child_process').ChildProcess>} */
const windows = new Map();

// ---------- Spawn helpers ----------

function spawnWindow(name, params) {
  const bin = resolveBinary();
  const args = buildArgs(params);

  const proc = spawn(bin, args, {
    stdio: ["pipe", "pipe", "inherit"],
    windowsHide: false,
  });

  proc.on("exit", () => {
    windows.delete(name);
    contentMap.delete(name);
    // Close any lingering SSE clients
    const clients = sseClients.get(name);
    if (clients) {
      for (const res of clients) { try { res.end(); } catch {} }
      sseClients.delete(name);
    }
  });

  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    for (const line of chunk.split("\n")) {
      if (line.trim()) {
        try { handleEvent(name, JSON.parse(line)); }
        catch { /* non-JSON output ignored */ }
      }
    }
  });

  windows.set(name, proc);
  return proc;
}

function buildArgs(params) {
  const args = [];
  if (params.url)       { args.push("--url",    params.url); }
  if (params.width)     { args.push("--width",  String(params.width)); }
  if (params.height)    { args.push("--height", String(params.height)); }
  if (params.title)     { args.push("--title",  params.title); }
  if (params.frameless)   { args.push("--frameless"); }
  if (params.floating)    { args.push("--floating"); }
  if (params.hidden)      { args.push("--hidden"); }
  if (params.autoClose)   { args.push("--auto-close"); }
  if (params.fullscreen)  { args.push("--fullscreen"); }
  if (params.maximized)   { args.push("--maximized"); }
  return args;
}

function handleEvent(name, evt) {
  if (evt.type === "ready") {
    console.error(`microui[${name}]: ready — screen ${evt.screen?.width}×${evt.screen?.height}`);
  } else if (evt.type === "closed") {
    console.error(`microui[${name}]: closed`);
  } else if (evt.type === "message") {
    console.error(`microui[${name}]: message — ${JSON.stringify(evt.data)}`);
  }
}

function sendCommand(name, cmd) {
  const proc = windows.get(name);
  if (!proc || proc.killed || !proc.stdin.writable) return;
  proc.stdin.write(JSON.stringify(cmd) + "\n");
}

// ---------- Tool factory ----------

export function createMicroUITools() {
  return [
    {
      name: "microui_show",
      description:
        "Display HTML content in a lightweight native window using the system WebView " +
        "(WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux). " +
        "Use this instead of canvas_show when you want a native window rather than a browser tab — " +
        "great for dialogs, forms, floating dashboards, and HUDs. " +
        "HTML is base64-encoded before sending so any content is safe to transmit.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Window name (identifier). Kebab-case, e.g. 'pr-dashboard', 'confirm-dialog'.",
          },
          html: {
            type: "string",
            description: "Full HTML content to display. Can be a complete page or a fragment.",
          },
          title: {
            type: "string",
            description: "Window title bar text.",
          },
          width: {
            type: "number",
            description: "Window width in pixels (default: 800).",
          },
          height: {
            type: "number",
            description: "Window height in pixels (default: 600).",
          },
          frameless: {
            type: "boolean",
            description: "Remove the window title bar for a borderless look.",
          },
          floating: {
            type: "boolean",
            description: "Keep the window always on top of other windows.",
          },
          hidden: {
            type: "boolean",
            description: "Start hidden. Send a 'show' command later to reveal it.",
          },
          auto_close: {
            type: "boolean",
            description: "Close the window automatically after the first message from the page.",
          },
          fullscreen: {
            type: "boolean",
            description: "Open the window in true fullscreen mode (covers taskbar).",
          },
          maximized: {
            type: "boolean",
            description: "Open the window maximized (fills screen, respects taskbar).",
          },
        },
        required: ["name", "html"],
      },
      handler: async (args) => {
        if (windows.has(args.name)) {
          return `Error: window '${args.name}' is already open. Use microui_update to change its content.`;
        }

        // Ensure HTTP server is running
        const port = await startServer();
        const html = wrapFragment(args.html, args.title || args.name);
        contentMap.set(args.name, html);

        const url = `http://127.0.0.1:${port}/w/${args.name}`;
        const proc = spawnWindow(args.name, {
          url,
          title:     args.title || args.name,
          width:     args.width,
          height:    args.height,
          frameless: args.frameless,
          floating:  args.floating,
          hidden:     args.hidden,
          autoClose:  args.auto_close,
          fullscreen: args.fullscreen,
          maximized:  args.maximized,
        });

        await delay(500);

        if (proc.exitCode !== null) {
          contentMap.delete(args.name);
          return `Error: microui process exited immediately (code ${proc.exitCode}). Is the microui binary installed and on PATH?`;
        }

        return `Window **${args.name}** opened. Use microui_update to change content or microui_close to close it.`;
      },
    },

    {
      name: "microui_update",
      description:
        "Update the HTML content of an existing MicroUI window. " +
        "Use this to refresh dashboards, update reports, or show new content in a window that is already open. " +
        "Also supports executing arbitrary JavaScript in the window via the 'js' parameter.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Window name (must have been opened with microui_show).",
          },
          html: {
            type: "string",
            description: "New HTML content to display. Replaces the current page.",
          },
          js: {
            type: "string",
            description: "JavaScript to evaluate in the current page (instead of replacing HTML).",
          },
          title: {
            type: "string",
            description: "Update the window title.",
          },
        },
        required: ["name"],
      },
      handler: async (args) => {
        if (!windows.has(args.name)) {
          return `Error: window '${args.name}' is not open. Use microui_show to create it first.`;
        }

        if (!args.html && !args.js) {
          return "Error: provide either 'html' or 'js'.";
        }

        if (args.title) {
          sendCommand(args.name, { type: "show", title: args.title });
        }

        if (args.html) {
          const html = wrapFragment(args.html, args.title || args.name);
          contentMap.set(args.name, html);
          pushSSE(args.name, "reload");
          return `Window **${args.name}** content updated.`;
        }

        if (args.js) {
          pushSSE(args.name, "eval", args.js);
          return `JavaScript evaluated in window **${args.name}**.`;
        }

        return "Nothing to do.";
      },
    },

    {
      name: "microui_close",
      description:
        "Close a MicroUI window. Use 'all' as the name to close every open window.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Window name to close, or 'all' to close every open window.",
          },
        },
        required: ["name"],
      },
      handler: async (args) => {
        if (args.name === "all") {
          const count = windows.size;
          for (const [n] of windows) {
            sendCommand(n, { type: "close" });
          }
          await delay(300);
          for (const [, proc] of windows) {
            try { proc.kill(); } catch { /* ok */ }
          }
          windows.clear();
          contentMap.clear();
          return `Closed ${count} window(s).`;
        }

        if (!windows.has(args.name)) {
          return `Error: window '${args.name}' is not open.`;
        }

        sendCommand(args.name, { type: "close" });
        await delay(200);
        const proc = windows.get(args.name);
        if (proc && !proc.killed) {
          try { proc.kill(); } catch { /* ok */ }
        }
        windows.delete(args.name);
        contentMap.delete(args.name);

        return `Window **${args.name}** closed.`;
      },
    },

    {
      name: "microui_list",
      description: "List all open MicroUI windows.",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        if (windows.size === 0) return "No MicroUI windows are open.";
        const names = [...windows.keys()].map((n) => `• **${n}**`).join("\n");
        return `Open windows:\n${names}`;
      },
    },
  ];
}

// ---------- Utilities ----------

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapFragment(html, title) {
  if (html.toLowerCase().includes("<!doctype") || html.toLowerCase().includes("<html")) {
    return html;
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body { font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
