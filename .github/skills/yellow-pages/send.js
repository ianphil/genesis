#!/usr/bin/env node
// Yellow Pages — send.js
// Unified inter-agent messaging: local (HTTP) and remote (Dev Tunnel + JWT).
// contacts.json is the registry. jobs.json tracks async responses.
// Auth cache for remote agents stored in .cache/auth-state.json.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const DIR = __dirname;
const CONTACTS_PATH = path.join(DIR, "contacts.json");
const JOBS_PATH = path.join(DIR, "jobs.json");
const CACHE_DIR = path.join(DIR, ".cache");
const AUTH_STATE_PATH = path.join(CACHE_DIR, "auth-state.json");

const TOKEN_MAX_AGE_MS = 20 * 60 * 60 * 1000; // 20 hours
const JOB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const REQUEST_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fatal(code, message) {
  process.stderr.write(`${code}: ${message}\n`);
  process.exit(1);
}

function info(msg) {
  process.stderr.write(`${msg}\n`);
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      fatal("TIMEOUT", `Request to ${url} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    fatal("NETWORK_ERROR", `Request to ${url} failed: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

// Atomic write: temp file + rename
function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${crypto.randomBytes(4).toString("hex")}`);
  fs.writeFileSync(tmp, data, "utf-8");
  fs.renameSync(tmp, filePath);
}

// ---------------------------------------------------------------------------
// Contacts registry
// ---------------------------------------------------------------------------

function readContacts() {
  if (!fs.existsSync(CONTACTS_PATH)) {
    return { self: "moneypenny", contacts: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(CONTACTS_PATH, "utf-8"));
  } catch {
    fatal("BAD_CONTACTS", "contacts.json is malformed.");
  }
}

function writeContacts(data) {
  atomicWrite(CONTACTS_PATH, JSON.stringify(data, null, 2) + "\n");
}

function findContact(name) {
  const reg = readContacts();
  return reg.contacts.find((c) => c.name === name) || null;
}

function getSelfName() {
  return readContacts().self || "unknown";
}

// ---------------------------------------------------------------------------
// Auth-state cache (remote agents)
// ---------------------------------------------------------------------------

function readAuthState() {
  if (!fs.existsSync(AUTH_STATE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(AUTH_STATE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeAuthState(state) {
  atomicWrite(AUTH_STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

function getCachedAuth(tunnelId) {
  const state = readAuthState();
  return state[tunnelId] || null;
}

function setCachedAuth(tunnelId, tunnelUrl, token) {
  const state = readAuthState();
  state[tunnelId] = {
    tunnelUrl,
    token,
    mintedAt: new Date().toISOString(),
  };
  writeAuthState(state);
}

function isTokenFresh(cached) {
  if (!cached || !cached.token || !cached.mintedAt) return false;
  const minted = new Date(cached.mintedAt).getTime();
  if (isNaN(minted)) return false;
  return Date.now() - minted < TOKEN_MAX_AGE_MS;
}

// ---------------------------------------------------------------------------
// Jobs tracking
// ---------------------------------------------------------------------------

function readJobs() {
  if (!fs.existsSync(JOBS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(JOBS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeJobs(jobs) {
  // Auto-prune entries older than 7 days
  const cutoff = Date.now() - JOB_MAX_AGE_MS;
  const fresh = jobs.filter((j) => new Date(j.sent_at).getTime() > cutoff);
  atomicWrite(JOBS_PATH, JSON.stringify(fresh, null, 2) + "\n");
}

function appendJob(id, contact, feedUrl, prompt) {
  const jobs = readJobs();
  jobs.push({
    id,
    contact,
    feed_url: feedUrl || null,
    prompt: prompt.length > 200 ? prompt.slice(0, 200) + "..." : prompt,
    sent_at: new Date().toISOString(),
  });
  writeJobs(jobs);
}

// ---------------------------------------------------------------------------
// Tunnel resolution & token minting
// ---------------------------------------------------------------------------

function resolveTunnelUrl(tunnelId) {
  try {
    const output = execSync(`devtunnel show ${tunnelId}`, {
      encoding: "utf-8",
      timeout: 15_000,
    });
    const match = output.match(/Connect via browser:\s*(https:\/\/[^\s]+)/);
    if (match) return match[1].replace(/\/$/, "");
    const urlMatch = output.match(/(https:\/\/[^\s]+devtunnels\.ms[^\s]*)/);
    if (urlMatch) return urlMatch[1].replace(/\/$/, "");
    fatal("URL_RESOLVE_FAILED", `Could not find tunnel URL in devtunnel show output:\n${output}`);
  } catch (err) {
    if (err.status !== undefined) {
      fatal("URL_RESOLVE_FAILED", `devtunnel show failed: ${err.message}`);
    }
    throw err;
  }
}

function mintToken(tunnelId) {
  try {
    info(`Minting fresh connect token for ${tunnelId}...`);
    const output = execSync(`devtunnel token ${tunnelId} --scope connect`, {
      encoding: "utf-8",
      timeout: 30_000,
    });
    const match = output.match(/^Token:\s*(.+)$/m);
    if (!match) {
      fatal("TOKEN_MINT_FAILED", `Could not parse token from devtunnel output:\n${output}`);
    }
    return match[1].trim();
  } catch (err) {
    fatal("TOKEN_MINT_FAILED", `devtunnel token failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Transport — ensure auth for a contact
// ---------------------------------------------------------------------------

function ensureRemoteAuth(contact, forceRefresh = false) {
  const { tunnelId } = contact;
  if (!tunnelId) fatal("BAD_CONTACT", `Remote contact "${contact.name}" has no tunnelId.`);

  let cached = getCachedAuth(tunnelId);

  // Resolve tunnel URL if not cached
  let tunnelUrl = cached?.tunnelUrl;
  if (!tunnelUrl) {
    tunnelUrl = resolveTunnelUrl(tunnelId);
  }

  // Mint token if needed
  let token = cached?.token;
  if (forceRefresh || !isTokenFresh(cached)) {
    token = mintToken(tunnelId);
  }

  setCachedAuth(tunnelId, tunnelUrl, token);
  return { tunnelUrl, token };
}

function buildBaseUrl(contact) {
  if (contact.type === "local") {
    const host = contact.host || "127.0.0.1";
    return `http://${host}:${contact.port}`;
  }
  // remote — resolved during auth
  return null;
}

function buildHeaders(contact, auth) {
  const selfName = getSelfName();
  const headers = {
    "X-Agent-Name": selfName,
  };
  if (contact.type === "remote" && auth?.token) {
    headers["X-Tunnel-Authorization"] = `tunnel ${auth.token}`;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

async function healthCheck(baseUrl, headers) {
  const url = `${baseUrl}/health`;
  let resp;
  try {
    resp = await fetchWithTimeout(url, { method: "GET", headers });
  } catch {
    // fatal already called by fetchWithTimeout
    return;
  }
  if (!resp.ok) {
    fatal("AGENT_UNREACHABLE", `Health check returned ${resp.status}: ${await resp.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Send message
// ---------------------------------------------------------------------------

async function sendMessage(baseUrl, headers, message, isAsync) {
  const url = `${baseUrl}/v1/responses`;
  const body = JSON.stringify({
    model: "copilot",
    input: message,
    stream: false,
    async: isAsync,
  });

  const resp = await fetchWithTimeout(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body,
  });

  if (resp.status === 401 || resp.status === 403) {
    return { authFailed: true };
  }

  // Both async:true and async:false return 202
  if (!resp.ok && resp.status !== 202) {
    const text = await resp.text();
    fatal("API_ERROR", `Responses API returned ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return { authFailed: false, data };
}

// ---------------------------------------------------------------------------
// Check job status
// ---------------------------------------------------------------------------

async function checkJob(baseUrl, headers, jobId) {
  const url = `${baseUrl}/jobs/${encodeURIComponent(jobId)}`;
  const resp = await fetchWithTimeout(url, { method: "GET", headers });
  if (!resp.ok) {
    return { id: jobId, status: "unknown", error: `HTTP ${resp.status}` };
  }
  return await resp.json();
}

// ---------------------------------------------------------------------------
// CLI: --list
// ---------------------------------------------------------------------------

async function cmdList() {
  const reg = readContacts();
  if (reg.contacts.length === 0) {
    process.stdout.write("No contacts registered.\n");
    return;
  }
  const jobs = readJobs();
  for (const c of reg.contacts) {
    const pending = jobs.filter((j) => j.contact === c.name).length;
    const tag = c.type === "local"
      ? `local ${c.host || "127.0.0.1"}:${c.port}`
      : `remote tunnel:${c.tunnelId}`;
    const pendingTag = pending > 0 ? ` [${pending} pending]` : "";
    const notesTag = c.notes ? ` — ${c.notes}` : "";
    process.stdout.write(`  ${c.name}  (${tag})${pendingTag}${notesTag}\n`);
  }
}

// ---------------------------------------------------------------------------
// CLI: --add
// ---------------------------------------------------------------------------

function cmdAdd(name, opts) {
  const reg = readContacts();
  if (reg.contacts.find((c) => c.name === name)) {
    fatal("DUPLICATE", `Contact "${name}" already exists. Remove it first.`);
  }

  if (opts.local !== undefined) {
    const port = parseInt(opts.local, 10);
    if (!port || port < 1 || port > 65535) {
      fatal("BAD_PORT", `Invalid port: ${opts.local}`);
    }
    const entry = { name, type: "local", host: opts.host || "127.0.0.1", port };
    reg.contacts.push(entry);
    writeContacts(reg);
    process.stdout.write(`Added local contact: ${name} at ${entry.host}:${port}\n`);
    return;
  }

  if (opts.tunnel) {
    // Validate devtunnel CLI exists
    try {
      execSync("devtunnel --version", { encoding: "utf-8", timeout: 10_000, stdio: "pipe" });
    } catch {
      fatal("NO_DEVTUNNEL", "devtunnel CLI not found on PATH. Install it first.");
    }
    // Validate tunnel ID resolves
    info(`Validating tunnel ${opts.tunnel}...`);
    const tunnelUrl = resolveTunnelUrl(opts.tunnel);
    info(`Resolved: ${tunnelUrl}`);

    // Cache the resolved URL
    setCachedAuth(opts.tunnel, tunnelUrl, null);

    const entry = { name, type: "remote", tunnelId: opts.tunnel };
    reg.contacts.push(entry);
    writeContacts(reg);
    process.stdout.write(`Added remote contact: ${name} via tunnel ${opts.tunnel}\n`);
    return;
  }

  fatal("USAGE", "Specify --local <port> or --tunnel <tunnelId>");
}

// ---------------------------------------------------------------------------
// CLI: --remove
// ---------------------------------------------------------------------------

function cmdRemove(name) {
  const reg = readContacts();
  const idx = reg.contacts.findIndex((c) => c.name === name);
  if (idx === -1) {
    fatal("NOT_FOUND", `Contact "${name}" not found.`);
  }
  reg.contacts.splice(idx, 1);
  writeContacts(reg);
  process.stdout.write(`Removed contact: ${name}\n`);
}

// ---------------------------------------------------------------------------
// CLI: --check
// ---------------------------------------------------------------------------

async function cmdCheck(contactName) {
  const jobs = readJobs();
  const toCheck = contactName
    ? jobs.filter((j) => j.contact === contactName)
    : jobs;

  if (toCheck.length === 0) {
    process.stdout.write(contactName
      ? `No pending jobs for ${contactName}.\n`
      : "No pending jobs.\n");
    return;
  }

  // Group jobs by contact to minimize auth overhead
  const byContact = new Map();
  for (const job of toCheck) {
    if (!byContact.has(job.contact)) byContact.set(job.contact, []);
    byContact.get(job.contact).push(job);
  }

  const terminal = new Set(["completed", "failed", "cancelled"]);
  const remaining = [...jobs];

  for (const [cName, cJobs] of byContact) {
    const contact = findContact(cName);
    if (!contact) {
      info(`WARN: Contact "${cName}" not found — skipping ${cJobs.length} job(s).`);
      continue;
    }

    let baseUrl, headers;
    if (contact.type === "local") {
      baseUrl = buildBaseUrl(contact);
      headers = buildHeaders(contact, null);
    } else {
      const auth = ensureRemoteAuth(contact);
      baseUrl = auth.tunnelUrl;
      headers = buildHeaders(contact, auth);
    }

    for (const job of cJobs) {
      const result = await checkJob(baseUrl, headers, job.id);
      const status = result.status || "unknown";

      if (terminal.has(status)) {
        const responseText = result.response
          || (result.statusItems || [])
              .filter((i) => i.title === "Response")
              .pop()?.description
          || null;
        if (responseText) {
          process.stdout.write(`[${status.toUpperCase()}] ${job.id} (${cName}): ${responseText}\n`);
        } else {
          process.stdout.write(`[${status.toUpperCase()}] ${job.id} (${cName}): (no response body)\n`);
        }
        const idx = remaining.findIndex((j) => j.id === job.id);
        if (idx !== -1) remaining.splice(idx, 1);
      } else {
        process.stdout.write(`[${status.toUpperCase()}] ${job.id} (${cName}): still processing (sent ${job.sent_at})\n`);
      }
    }
  }

  writeJobs(remaining);
}

// ---------------------------------------------------------------------------
// CLI: --send (--to + --message)
// ---------------------------------------------------------------------------

async function cmdSend(contactName, message, sync) {
  const contact = findContact(contactName);
  if (!contact) {
    fatal("NOT_FOUND", `Contact "${contactName}" not found. Use --list to see contacts.`);
  }

  const isAsync = !sync;
  let baseUrl, headers, auth;

  if (contact.type === "local") {
    baseUrl = buildBaseUrl(contact);
    headers = buildHeaders(contact, null);
  } else {
    auth = ensureRemoteAuth(contact);
    baseUrl = auth.tunnelUrl;
    headers = buildHeaders(contact, auth);
  }

  // Health check
  await healthCheck(baseUrl, headers);

  // Send
  let result = await sendMessage(baseUrl, headers, message, isAsync);

  // Auth retry for remote agents
  if (result.authFailed && contact.type === "remote") {
    info("Token rejected. Refreshing and retrying...");
    auth = ensureRemoteAuth(contact, true);
    headers = buildHeaders(contact, auth);
    baseUrl = auth.tunnelUrl;

    result = await sendMessage(baseUrl, headers, message, isAsync);
    if (result.authFailed) {
      fatal("AUTH_FAILED", "Authentication failed even with a fresh token. Check tenant identity and tunnel ownership.");
    }
  } else if (result.authFailed) {
    fatal("AUTH_FAILED", `Unexpected 401/403 from local agent "${contactName}".`);
  }

  // Output
  if (isAsync) {
    // async:true — background job with tracking
    const jobId = result.data.id || "unknown";
    const feedUrl = result.data.feed_url || "";
    // Rewrite loopback feed URL for remote agents
    const resolvedFeedUrl = contact.type === "remote" && feedUrl
      ? feedUrl.replace(/^https?:\/\/127\.0\.0\.1:\d+/, baseUrl)
      : feedUrl;
    appendJob(jobId, contactName, resolvedFeedUrl, message);
    process.stdout.write(`ACCEPTED: ${jobId}\n`);
  } else {
    // async:false — fire-and-forget into their current session
    process.stdout.write("Sent.\n");
  }
}

// ---------------------------------------------------------------------------
// --help
// ---------------------------------------------------------------------------

function cmdHelp() {
  process.stdout.write(`Yellow Pages — send messages to other agents on the local network or via Dev Tunnels.

SENDING MESSAGES
  send.js --to q --message "Hello"              Background job (default) — returns job ID
  send.js --to q --message "Hello" --sync       Fire-and-forget into their current session
  send.js --to skippy --message "Deploy now"    Remote agent (auto-detected from contact type)

  Default (no flag): sends async:true — creates a background job on the remote
  agent. Returns a job ID you can check later with --check. Use for tasks.

  --sync: sends async:false — injects the message into the agent's current
  interactive session. No job ID, no tracking. Just prints "Sent."
  Use for quick pings and conversational messages.

  Both modes return immediately. The difference is tracking, not blocking.

CHECKING REPLIES
  send.js --check                               Check all pending background jobs
  send.js --check --to q                        Check jobs for a specific agent

  Completed jobs print their response and are removed from tracking.
  Still-processing jobs show their sent timestamp.

MANAGING CONTACTS
  send.js --list                                Show all contacts
  send.js --add q --local 15211                 Register local agent on port 15211
  send.js --add q --local 15211 --host 10.0.0.5  Custom host (default: 127.0.0.1)
  send.js --add skippy --tunnel swift-horse-9fq Register remote agent via Dev Tunnel
  send.js --remove skippy                       Remove a contact

  Local agents: direct HTTP, no auth needed.
  Remote agents: Dev Tunnel + JWT auth, auto-managed.

CONTACT TYPES
  local    Direct HTTP to host:port. For agents on this machine or local network.
  remote   Dev Tunnel with Entra JWT auth. For agents on other machines.

NOTES
  - Every message includes X-Agent-Name header identifying the sender.
  - Remote tokens are cached for 20 hours and auto-refresh.
  - Jobs older than 7 days are automatically cleaned up.
  - contacts.json is the directory. jobs.json is ephemeral tracking.
`);
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    to: null,
    message: null,
    sync: false,
    list: false,
    add: null,
    remove: null,
    check: false,
    help: false,
    local: undefined,
    tunnel: null,
    host: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = () => {
      if (i + 1 >= args.length) fatal("USAGE", `Missing value for ${arg}`);
      return args[++i];
    };
    switch (arg) {
      case "--to":       parsed.to = next(); break;
      case "--message":  parsed.message = next(); break;
      case "--sync":     parsed.sync = true; break;
      case "--list":     parsed.list = true; break;
      case "--add":      parsed.add = next(); break;
      case "--remove":   parsed.remove = next(); break;
      case "--check":    parsed.check = true; break;
      case "--help":
      case "-h":         parsed.help = true; break;
      case "--local":    parsed.local = next(); break;
      case "--tunnel":   parsed.tunnel = next(); break;
      case "--host":     parsed.host = next(); break;
      default:
        fatal("USAGE", `Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  if (opts.help || process.argv.length <= 2) {
    cmdHelp();
    return;
  }

  if (opts.list)   { await cmdList(); return; }
  if (opts.add)    { cmdAdd(opts.add, opts); return; }
  if (opts.remove) { cmdRemove(opts.remove); return; }
  if (opts.check)  { await cmdCheck(opts.to); return; }

  // Send mode
  if (!opts.to)      fatal("USAGE", "Missing --to <name>");
  if (!opts.message)  fatal("USAGE", "Missing --message <text>");
  await cmdSend(opts.to, opts.message, opts.sync);
}

main().catch((err) => {
  fatal("UNEXPECTED", err.message);
});
