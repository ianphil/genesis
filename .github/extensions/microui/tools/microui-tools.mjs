// MicroUI tools — microui_show, microui_update, microui_close
//
// Spawns a native WebView window (via the MicroUI .NET binary) and
// communicates with it over JSON Lines on stdin/stdout.
//
// The binary must be on PATH or the MICROUI_BIN environment variable must
// point to its full path. Pre-built binaries for win-x64, osx-arm64, and
// linux-x64 are published as GitHub release assets.

import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------- Binary resolution ----------

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveBinary() {
  if (process.env.MICROUI_BIN) return process.env.MICROUI_BIN;
  const name = process.platform === "win32" ? "microui.exe" : "microui";

  // Check for binary relative to extension root (../bin/{platform}/)
  const extRoot = resolve(__dirname, "..");
  const platDir = `${process.platform === "win32" ? "win" : process.platform === "darwin" ? "osx" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;
  const localBin = resolve(extRoot, "bin", platDir, name);
  if (existsSync(localBin)) return localBin;

  return name; // fallback to PATH
}

// ---------- Window state ----------

/** @type {Map<string, import('child_process').ChildProcess>} */
const windows = new Map();

// ---------- Spawn helpers ----------

/**
 * Spawn a microui window process and register it.
 * @param {string} name  Unique window name.
 * @param {object} params  CLI parameters.
 * @returns {import('child_process').ChildProcess}
 */
function spawnWindow(name, params) {
  const bin = resolveBinary();
  const cliArgs = buildArgs(params);

  const proc = spawn(bin, cliArgs, {
    stdio: ["pipe", "pipe", "inherit"],
    windowsHide: false,
  });

  proc.on("exit", () => {
    windows.delete(name);
  });

  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    for (const line of chunk.split("\n")) {
      if (line.trim()) {
        try {
          const evt = JSON.parse(line);
          handleEvent(name, evt);
        } catch { /* non-JSON output ignored */ }
      }
    }
  });

  windows.set(name, proc);
  return proc;
}

function buildArgs(params) {
  const args = [];
  if (params.width)     { args.push("--width",  String(params.width)); }
  if (params.height)    { args.push("--height", String(params.height)); }
  if (params.title)     { args.push("--title",  params.title); }
  if (params.frameless) { args.push("--frameless"); }
  if (params.floating)  { args.push("--floating"); }
  if (params.hidden)    { args.push("--hidden"); }
  if (params.autoClose) { args.push("--auto-close"); }
  return args;
}

function handleEvent(name, evt) {
  // Surface notable events to stderr for debugging
  if (evt.type === "ready") {
    console.error(`microui[${name}]: ready — screen ${evt.screen?.width}×${evt.screen?.height}`);
  } else if (evt.type === "closed") {
    console.error(`microui[${name}]: closed`);
  } else if (evt.type === "message") {
    console.error(`microui[${name}]: message — ${JSON.stringify(evt.data)}`);
  }
}

/**
 * Send a JSON Lines command to a running window.
 * @param {string} name  Window name.
 * @param {object} cmd  Command object.
 */
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
        },
        required: ["name", "html"],
      },
      handler: async (args) => {
        if (windows.has(args.name)) {
          return `Error: window '${args.name}' is already open. Use microui_update to change its content.`;
        }

        const html = wrapFragment(args.html, args.title || args.name);

        const proc = spawnWindow(args.name, {
          title:     args.title || args.name,
          width:     args.width,
          height:    args.height,
          frameless: args.frameless,
          floating:  args.floating,
          hidden:    args.hidden,
          autoClose: args.auto_close,
        });

        // Give the process a moment to start then send the initial HTML
        await delay(300);

        if (proc.exitCode !== null) {
          return `Error: microui process exited immediately (code ${proc.exitCode}). Is the microui binary installed and on PATH?`;
        }

        const b64 = Buffer.from(html, "utf8").toString("base64");
        sendCommand(args.name, { type: "html", html: b64 });

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
          const b64 = Buffer.from(html, "utf8").toString("base64");
          sendCommand(args.name, { type: "html", html: b64 });
          return `Window **${args.name}** content updated.`;
        }

        if (args.js) {
          sendCommand(args.name, { type: "eval", js: args.js });
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
          for (const [name] of windows) {
            sendCommand(name, { type: "close" });
          }
          await delay(300);
          // Force-kill any stragglers
          for (const [, proc] of windows) {
            try { proc.kill(); } catch { /* ok */ }
          }
          windows.clear();
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
    body { font-family: system-ui, sans-serif; margin: 1rem; }
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
