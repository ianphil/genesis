import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve as pathResolve, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import {
  normalizeInput,
  build202Response,
  createStreamWriter,
} from "./responses.mjs";
import { createJob, getJob, listJobs, updateJobStatus, removeJob, removeProgressFile, getBgJobsDir } from "./job-registry.mjs";
import { isCronEngineRunning, createOneShotCronJob, findRunningEngines } from "./cron-bridge.mjs";
import { resolveJobStatus } from "./job-status.mjs";
import { buildRssFeed } from "./rss-builder.mjs";
// Session RSS (#49) — reads SDK's native events.jsonl
import { readEvents, readSession } from "./events-reader.mjs";
import { buildSessionRSS } from "./session-rss.mjs";

const require = createRequire(import.meta.url);

/**
 * Creates an HTTP server that bridges external clients to the Copilot session
 * via an OpenAI Responses API–compatible interface.
 *
 * Endpoints:
 *   POST   /v1/responses  — OpenAI Responses API (async-default, 202 + RSS)
 *   GET    /jobs           — list background jobs with RSS feed URLs
 *   GET    /jobs/:id       — single job detail with status items
 *   GET    /feed/:jobId    — RSS 2.0 XML feed for job progress
 *   DELETE /jobs/:id       — cancel a background job
 *   GET    /health         — liveness check
 *   GET    /history        — recent conversation history
 *
 * Session methods are bound once via bindSession() after joinSession() resolves.
 * The server only exists while a session is active (process = lifecycle unit).
 */
export function createChatApiServer(log, extDir, state) {
  let server = null;
  let port = null;
  let session = null;
  const sseClients = [];

  function corsHeaders() {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
  }

  function jsonResponse(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  function xmlResponse(res, status, xml) {
    res.writeHead(status, {
      ...corsHeaders(),
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Content-Length": Buffer.byteLength(xml),
    });
    res.end(xml);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch {
          reject(new Error("invalid json"));
        }
      });
      req.on("error", reject);
    });
  }

  function feedUrl(jobId) {
    return `http://127.0.0.1:${port}/feed/${jobId}`;
  }

  function sessionUrl(sessionId) {
    return `http://127.0.0.1:${port}/sessions/${encodeURIComponent(sessionId)}`;
  }

  /**
   * Build an XML message envelope wrapping the prompt. The receiving agent sees
   * structured metadata (who sent it, how it arrived) and the actual message
   * content in clean, parseable sections.
   */
  function buildEnvelope(mode, prompt, opts = {}) {
    const fromAttr = opts.from ? ` from="${opts.from}"` : "";
    const lines = [`<message${fromAttr}>`];

    if (opts.from) {
      lines.push(`  <from agent="${opts.from}">`);
      lines.push(`    Check your Yellow Pages (contacts.json) for context on this agent.`);
      lines.push(`  </from>`);
    }

    if (mode === "fire-and-forget") {
      lines.push(`  <delivery mode="fire-and-forget">`);
      lines.push(`    The caller is not waiting for a response. Use your judgment —`);
      lines.push(`    the content determines whether action or a reply is appropriate.`);
      lines.push(`    To reply, use your Yellow Pages to reach the sender.`);
      lines.push(`  </delivery>`);
    } else if (mode === "streaming") {
      lines.push(`  <delivery mode="streaming">`);
      lines.push(`    The caller is connected via SSE and receiving your output in`);
      lines.push(`    real time. Respond normally.`);
      lines.push(`  </delivery>`);
    } else if (mode === "background") {
      const attrs = [];
      if (opts.jobId) attrs.push(`job-id="${opts.jobId}"`);
      if (opts.feedUrl) attrs.push(`feed-url="${opts.feedUrl}"`);
      const attrStr = attrs.length ? " " + attrs.join(" ") : "";
      lines.push(`  <delivery mode="background"${attrStr}>`);
      lines.push(`    This is a tracked background job. Your work and response are`);
      lines.push(`    captured in the feed. Complete the task described in the content.`);
      lines.push(`  </delivery>`);
    }

    lines.push(`  <content>`);
    lines.push(prompt);
    lines.push(`  </content>`);
    lines.push(`</message>`);

    return lines.join("\n");
  }

  /** Query session-store.db synchronously. Returns [] on any error. */
  function querySessionStore(sql, params = []) {
    try {
      const dbPath = join(homedir(), ".copilot", "session-store.db");
      const Database = require("better-sqlite3");
      const db = new Database(dbPath, { readonly: true });
      const rows = db.prepare(sql).all(...params);
      db.close();
      return rows;
    } catch (e) {
      log.debug(`session-store query failed: ${e.message}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // GET /history
  // ---------------------------------------------------------------------------

  async function handleHistory(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const limit = parseInt(url.searchParams.get("limit"), 10) || 0;
      let messages = await session.getMessages();
      if (limit > 0) {
        messages = messages.slice(-limit);
      }
      jsonResponse(res, 200, { messages });
    } catch (err) {
      jsonResponse(res, 500, { error: err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // GET /health
  // ---------------------------------------------------------------------------

  function handleHealth(_req, res) {
    const agentName = state.agentName;
    let jobCount = 0;
    if (agentName) {
      try { jobCount = listJobs(extDir, agentName).length; } catch { /* best effort */ }
    }
    jsonResponse(res, 200, {
      status: "ok",
      session: "connected",
      port,
      jobs: jobCount,
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  }

  // ---------------------------------------------------------------------------
  // POST /v1/responses — async-default with background jobs
  // ---------------------------------------------------------------------------

  async function handleResponses(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return jsonResponse(res, 400, {
        error: { type: "invalid_request_error", message: "Invalid JSON body" },
      });
    }

    const input = body.input;
    if (input === undefined || input === null) {
      return jsonResponse(res, 400, {
        error: {
          type: "invalid_request_error",
          message: "Missing required field: input",
        },
      });
    }

    const prompt = normalizeInput(input, body.instructions);
    const fromAgent = req.headers["x-agent-name"] || null;
    const opts = {
      model: body.model,
      previousResponseId: body.previous_response_id,
      temperature: body.temperature,
      metadata: body.metadata,
    };

    const timeout = typeof body.timeout === "number" ? body.timeout : 120_000;

    // --- Streaming (explicit opt-in) ---
    if (body.stream === true) {
      const writer = createStreamWriter(res, opts);
      const unsubs = [];

      const offDelta = session.onEvent("assistant.streaming_delta", (event) => {
        const chunk = event?.data?.content || event?.data?.delta || "";
        if (chunk) writer.writeDelta(chunk);
      });
      unsubs.push(offDelta);

      let finalContent = "";
      const done = new Promise((resolve) => {
        const offMessage = session.onEvent("assistant.message", (event) => {
          finalContent = event?.data?.content ?? "";
          resolve();
        });
        unsubs.push(offMessage);
      });

      try {
        await session.send({ prompt: buildEnvelope("streaming", prompt, { from: fromAgent }) });
      } catch (err) {
        unsubs.forEach((fn) => fn());
        return writer.error(err.message);
      }

      const timeout = setTimeout(() => {
        unsubs.forEach((fn) => fn());
        writer.error("Request timed out");
      }, 300_000);

      req.on("close", () => {
        clearTimeout(timeout);
        unsubs.forEach((fn) => fn());
      });

      await done;
      clearTimeout(timeout);
      unsubs.forEach((fn) => fn());

      if (!writer.getText() && finalContent) {
        writer.writeDelta(finalContent);
      }

      writer.complete();
      return;
    }

    // --- Fire-and-forget on current session (async: false) ---
    if (body.async === false) {
      try {
        await session.send({ prompt: buildEnvelope("fire-and-forget", prompt, { from: fromAgent }) });
        jsonResponse(res, 202, {
          object: "response",
          created_at: Math.floor(Date.now() / 1000),
          status: "accepted",
          message: "Prompt sent to current session",
        });
      } catch (err) {
        jsonResponse(res, 502, {
          error: {
            type: "server_error",
            message: "Failed to send prompt to session",
            detail: err.message,
          },
        });
      }
      return;
    }

    // --- Async / Background job (default) ---
    const agentName = state.agentName;
    if (!agentName) {
      return jsonResponse(res, 503, {
        error: {
          type: "server_error",
          message: "No agent namespace configured. Call responses_restart first.",
        },
      });
    }

    const engine = isCronEngineRunning(extDir, agentName);
    if (!engine.running) {
      const others = findRunningEngines(extDir);
      if (others.length > 0) {
        const names = others.map((e) => `"${e.agentName}"`).join(", ");
        return jsonResponse(res, 409, {
          error: {
            type: "configuration_error",
            message: `No cron engine running for agent "${agentName}", but found engine(s) running as: ${names}. `
              + `Call responses_restart(agent: ${others.length === 1 ? others[0].agentName : "NAME"}) to align, `
              + `or set COPILOT_AGENT="${agentName}" and restart the cron engine.`,
          },
        });
      }
      return jsonResponse(res, 503, {
        error: {
          type: "server_error",
          message: "Cron engine is not running. Background jobs require the cron engine.",
        },
      });
    }

    const jobId = body.id || `job_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const cronJobId = `bg-${jobId}`;
    const sessionId = `${agentName}-${jobId}`;
    const envelopedPrompt = buildEnvelope("background", prompt, { jobId, feedUrl: feedUrl(jobId), from: fromAgent });

    try {
      createOneShotCronJob(extDir, agentName, {
        cronJobId,
        prompt: envelopedPrompt,
        sessionId,
        model: body.model || null,
        timeoutSeconds: Math.ceil(timeout / 1000),
      });

      createJob(extDir, agentName, { id: jobId, cronJobId, sessionId, prompt });

      log.info(`background job created: ${jobId} (cron=${cronJobId}, session=${sessionId})`);

      // Return both legacy feed_url and new session URLs
      const response202 = build202Response(jobId, feedUrl(jobId));
      response202.session_id = sessionId;
      response202.session_url = sessionUrl(sessionId);
      response202.session_json_url = `${sessionUrl(sessionId)}/json`;
      jsonResponse(res, 202, response202);
    } catch (err) {
      log.error(`failed to create background job: ${err.message}`);
      jsonResponse(res, 500, {
        error: {
          type: "server_error",
          message: "Failed to create background job",
          detail: err.message,
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // GET /jobs — list background jobs
  // ---------------------------------------------------------------------------

  function handleListJobs(req, res) {
    const agentName = state.agentName;
    if (!agentName) {
      return jsonResponse(res, 200, { jobs: [] });
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const statusFilter = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit"), 10) || 0;

    let jobs = listJobs(extDir, agentName);

    // Resolve each job's status lazily
    jobs = jobs.map((job) => {
      const resolved = resolveJobStatus(extDir, agentName, job.id);
      return {
        id: job.id,
        status: resolved?.status || job.status,
        prompt: job.prompt.length > 100 ? job.prompt.slice(0, 100) + "..." : job.prompt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        feed_url: feedUrl(job.id),
      };
    });

    if (statusFilter) {
      jobs = jobs.filter((j) => j.status === statusFilter);
    }
    if (limit > 0) {
      jobs = jobs.slice(0, limit);
    }

    jsonResponse(res, 200, { jobs });
  }

  // ---------------------------------------------------------------------------
  // GET /jobs/:id — single job detail
  // ---------------------------------------------------------------------------

  function handleGetJob(_req, res, jobId) {
    const agentName = state.agentName;
    if (!agentName) {
      return jsonResponse(res, 404, { error: "Job not found", id: jobId });
    }

    const job = getJob(extDir, agentName, jobId);
    if (!job) {
      return jsonResponse(res, 404, { error: "Job not found", id: jobId });
    }

    const resolved = resolveJobStatus(extDir, agentName, jobId);
    jsonResponse(res, 200, {
      id: job.id,
      status: resolved?.status || job.status,
      prompt: job.prompt,
      sessionId: job.sessionId,
      cronJobId: job.cronJobId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      feed_url: feedUrl(job.id),
      response: resolved?.response || null,
      statusItems: resolved?.statusItems || [],
    });
  }

  // ---------------------------------------------------------------------------
  // GET /feed/:jobId — RSS 2.0 XML feed
  // ---------------------------------------------------------------------------

  function handleFeed(_req, res, jobId) {
    const agentName = state.agentName;
    if (!agentName) {
      return jsonResponse(res, 404, { error: "Job not found", id: jobId });
    }

    const job = getJob(extDir, agentName, jobId);
    if (!job) {
      return jsonResponse(res, 404, { error: "Job not found", id: jobId });
    }

    const resolved = resolveJobStatus(extDir, agentName, jobId);
    const xml = buildRssFeed(
      { ...job, status: resolved?.status || job.status },
      resolved?.statusItems || [],
      port,
    );
    xmlResponse(res, 200, xml);
  }

  // ---------------------------------------------------------------------------
  // DELETE /jobs/:id — cancel or delete a job
  // ---------------------------------------------------------------------------

  function handleDeleteJob(_req, res, jobId) {
    const agentName = state.agentName;
    if (!agentName) {
      return jsonResponse(res, 404, { error: "Job not found", id: jobId });
    }

    const job = getJob(extDir, agentName, jobId);
    if (!job) {
      return jsonResponse(res, 404, { error: "Job not found", id: jobId });
    }

    const resolved = resolveJobStatus(extDir, agentName, jobId);
    const currentStatus = resolved?.status || job.status;
    const terminalStates = new Set(["completed", "failed", "cancelled"]);

    if (!terminalStates.has(currentStatus)) {
      // Running or queued — cancel the cron job first
      try {
        const cronJobPath = pathResolve(extDir, "..", "cron", "data", agentName, "jobs", `${job.cronJobId}.json`);
        const cronJob = JSON.parse(readFileSync(cronJobPath, "utf-8"));
        if (cronJob.status === "enabled") {
          cronJob.status = "disabled";
          cronJob.nextRunAtUtc = null;
          writeFileSync(cronJobPath, JSON.stringify(cronJob, null, 2), "utf-8");
        }
      } catch {
        // Cron job may have already fired or been cleaned up
      }
    }

    // Delete the job registry file and progress file
    removeJob(extDir, agentName, jobId);
    removeProgressFile(extDir, agentName, jobId);

    const message = terminalStates.has(currentStatus)
      ? `Job deleted (was ${currentStatus}).`
      : currentStatus === "queued"
        ? "Job cancelled and deleted before execution."
        : "Job cancelled and deleted. Running execution may continue to completion.";

    jsonResponse(res, 200, { id: jobId, status: "deleted", previousStatus: currentStatus, message });
  }

  // ---------------------------------------------------------------------------
  // DELETE /jobs — bulk-delete all terminal jobs
  // ---------------------------------------------------------------------------

  function handleDeleteAllJobs(_req, res) {
    const agentName = state.agentName;
    if (!agentName) {
      return jsonResponse(res, 200, { deleted: 0, kept: 0 });
    }

    const terminalStates = new Set(["completed", "failed", "cancelled"]);
    const jobs = listJobs(extDir, agentName);
    let deleted = 0;
    let kept = 0;

    for (const job of jobs) {
      const resolved = resolveJobStatus(extDir, agentName, job.id);
      const status = resolved?.status || job.status;
      if (terminalStates.has(status)) {
        removeJob(extDir, agentName, job.id);
        removeProgressFile(extDir, agentName, job.id);
        deleted++;
      } else {
        kept++;
      }
    }

    jsonResponse(res, 200, { deleted, kept });
  }

  // ---------------------------------------------------------------------------
  // GET /sessions — list sessions from session-store.db
  // ---------------------------------------------------------------------------

  function handleListSessions(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const prefix = url.searchParams.get("prefix") || "";
    const since = url.searchParams.get("since") || "";
    const limit = parseInt(url.searchParams.get("limit"), 10) || 50;

    let sql = "SELECT id, cwd, repository, branch, summary, created_at, updated_at FROM sessions WHERE 1=1";
    const params = [];

    if (prefix) {
      sql += " AND id LIKE ?";
      params.push(`${prefix}%`);
    }
    if (since) {
      sql += " AND created_at >= ?";
      params.push(since);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = querySessionStore(sql, params);
    const sessions = rows.map((r) => ({
      id: r.id,
      summary: r.summary || null,
      repository: r.repository || null,
      branch: r.branch || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      feed_url: sessionUrl(r.id),
    }));

    jsonResponse(res, 200, { sessions });
  }

  // ---------------------------------------------------------------------------
  // GET /sessions/:id — RSS 2.0 feed from events.jsonl
  // ---------------------------------------------------------------------------

  function handleGetSessionRSS(_req, res, sessionId) {
    const info = readSession(sessionId);
    if (!info) {
      return jsonResponse(res, 404, { error: "Session not found", id: sessionId });
    }

    const baseUrl = `http://127.0.0.1:${port}`;
    const xml = buildSessionRSS(sessionId, info.prompt || sessionId, baseUrl, info.timeline);
    xmlResponse(res, 200, xml);
  }

  // ---------------------------------------------------------------------------
  // GET /sessions/:id/json — JSON status + response + timeline
  // ---------------------------------------------------------------------------

  function handleGetSessionJSON(_req, res, sessionId) {
    const info = readSession(sessionId);
    if (!info) {
      return jsonResponse(res, 404, { error: "Session not found", id: sessionId });
    }

    jsonResponse(res, 200, {
      id: sessionId,
      status: info.status,
      response: info.response,
      fullText: info.fullText || null,
      prompt: info.prompt || null,
      timeline: info.timeline || [],
      feed_url: sessionUrl(sessionId),
    });
  }

  // ---------------------------------------------------------------------------
  // Request router
  // ---------------------------------------------------------------------------

  function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    log.debug(`${req.method} ${path}`);

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      return res.end();
    }

    if (path === "/health" && req.method === "GET") return handleHealth(req, res);
    if (path === "/history" && req.method === "GET") return handleHistory(req, res);
    if (path === "/v1/responses" && req.method === "POST") return handleResponses(req, res);
    if (path === "/jobs" && req.method === "GET") return handleListJobs(req, res);
    if (path === "/jobs" && req.method === "DELETE") return handleDeleteAllJobs(req, res);

    // /jobs/:id
    const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
    if (jobMatch && req.method === "GET") return handleGetJob(req, res, decodeURIComponent(jobMatch[1]));
    if (jobMatch && req.method === "DELETE") return handleDeleteJob(req, res, decodeURIComponent(jobMatch[1]));

    // /feed/:jobId (legacy)
    const feedMatch = path.match(/^\/feed\/([^/]+)$/);
    if (feedMatch && req.method === "GET") return handleFeed(req, res, decodeURIComponent(feedMatch[1]));

    // --- Session RSS routes (#49) ---
    if (path === "/sessions" && req.method === "GET") return handleListSessions(req, res);

    // /sessions/:id/json
    const sessionJsonMatch = path.match(/^\/sessions\/([^/]+)\/json$/);
    if (sessionJsonMatch && req.method === "GET") return handleGetSessionJSON(req, res, decodeURIComponent(sessionJsonMatch[1]));

    // /sessions/:id (RSS)
    const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch && req.method === "GET") return handleGetSessionRSS(req, res, decodeURIComponent(sessionMatch[1]));

    jsonResponse(res, 404, {
      error: "Not found",
      endpoints: {
        "POST /v1/responses": "OpenAI Responses API (async-default, 202 + RSS feed URL)",
        "GET /sessions": "List sessions (filterable: ?prefix=, ?since=, ?limit=)",
        "GET /sessions/:id": "RSS 2.0 XML feed for session events",
        "GET /sessions/:id/json": "JSON status + response + timeline",
        "GET /jobs": "List background jobs (legacy)",
        "GET /jobs/:id": "Single job detail (legacy)",
        "GET /feed/:jobId": "RSS 2.0 XML feed for job progress (legacy)",
        "DELETE /jobs": "Delete all terminal jobs",
        "DELETE /jobs/:id": "Delete a specific job",
        "GET /history?limit=N": "Conversation history",
        "GET /health": "Health check",
      },
    });
  }

  return {
    start(requestedPort = 0) {
      return new Promise((resolve, reject) => {
        server = createServer(handleRequest);
        server.listen(requestedPort, "127.0.0.1", () => {
          port = server.address().port;
          resolve(port);
        });
        server.on("error", reject);
      });
    },

    stop() {
      return new Promise((resolve) => {
        if (!server) return resolve();
        sseClients.forEach((c) => c.end());
        sseClients.length = 0;
        server.close(() => {
          server = null;
          port = null;
          resolve();
        });
      });
    },

    bindSession(deps) {
      session = deps;
    },

    getPort() {
      return port;
    },

    isRunning() {
      return server !== null;
    },
  };
}
