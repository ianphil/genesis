import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve as pathResolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import {
  normalizeInput,
  buildResponse,
  build202Response,
  createStreamWriter,
} from "./responses.mjs";
import { createJob, getJob, listJobs, updateJobStatus } from "./job-registry.mjs";
import { isCronEngineRunning, createOneShotCronJob } from "./cron-bridge.mjs";
import { resolveJobStatus } from "./job-status.mjs";
import { buildRssFeed } from "./rss-builder.mjs";

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
        await session.send({ prompt });
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

    // --- Sync (explicit opt-in with async: false) ---
    if (body.async === false) {
      try {
        const response = await session.sendAndWait({ prompt }, timeout);
        const content = response?.data?.content ?? "(no response)";
        jsonResponse(res, 200, buildResponse(content, opts));
      } catch (err) {
        jsonResponse(res, 502, {
          error: {
            type: "server_error",
            message: "Agent failed to respond",
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

    try {
      createOneShotCronJob(extDir, agentName, {
        cronJobId,
        prompt,
        sessionId,
        model: body.model || null,
        timeoutSeconds: Math.ceil(timeout / 1000),
      });

      createJob(extDir, agentName, { id: jobId, cronJobId, sessionId, prompt });

      log.info(`background job created: ${jobId} (cron=${cronJobId}, session=${sessionId})`);
      jsonResponse(res, 202, build202Response(jobId, feedUrl(jobId)));
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
  // DELETE /jobs/:id — cancel a job
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

    if (currentStatus === "completed" || currentStatus === "failed") {
      return jsonResponse(res, 409, {
        error: "Job is already in a terminal state",
        status: currentStatus,
      });
    }

    if (currentStatus === "cancelled") {
      return jsonResponse(res, 409, { error: "Job is already cancelled" });
    }

    // Best-effort: disable the cron job if it hasn't fired yet
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

    updateJobStatus(extDir, agentName, jobId, "cancelled");

    jsonResponse(res, 200, {
      id: jobId,
      status: "cancelled",
      message: currentStatus === "queued"
        ? "Job cancelled before execution."
        : "Job marked as cancelled. Running execution may continue to completion.",
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

    // /jobs/:id
    const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
    if (jobMatch && req.method === "GET") return handleGetJob(req, res, decodeURIComponent(jobMatch[1]));
    if (jobMatch && req.method === "DELETE") return handleDeleteJob(req, res, decodeURIComponent(jobMatch[1]));

    // /feed/:jobId
    const feedMatch = path.match(/^\/feed\/([^/]+)$/);
    if (feedMatch && req.method === "GET") return handleFeed(req, res, decodeURIComponent(feedMatch[1]));

    jsonResponse(res, 404, {
      error: "Not found",
      endpoints: {
        "POST /v1/responses": "OpenAI Responses API (async-default, 202 + RSS feed URL)",
        "GET /jobs": "List background jobs with RSS feed URLs",
        "GET /jobs/:id": "Single job detail with status items",
        "GET /feed/:jobId": "RSS 2.0 XML feed for job progress",
        "DELETE /jobs/:id": "Cancel a background job",
        "GET /history?limit=N": "Conversation history (last N messages, or all)",
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
