import { createServer } from "node:http";
import {
  normalizeInput,
  buildResponse,
  buildAcceptedResponse,
  createStreamWriter,
} from "./responses.mjs";

/**
 * Creates an HTTP server that bridges external clients to the Copilot session
 * via an OpenAI Responses API–compatible interface.
 *
 * Endpoints:
 *   POST /v1/responses  — OpenAI Responses API (compatible)
 *   GET  /health        — liveness check
 *   GET  /history       — recent conversation history
 *
 * Session methods are bound once via bindSession() after joinSession() resolves.
 * The server only exists while a session is active (process = lifecycle unit).
 */
export function createChatApiServer(log) {
  let server = null;
  let port = null;
  let session = null;
  const sseClients = [];

  function corsHeaders() {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

  function handleHealth(_req, res) {
    jsonResponse(res, 200, {
      status: "ok",
      session: "connected",
      port,
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  }

  // ---------------------------------------------------------------------------
  // OpenAI Responses API — POST /v1/responses
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

    // --- Async LRO ---
    if (body.async === true) {
      jsonResponse(res, 201, buildAcceptedResponse());
      session.sendAndWait({ prompt }, timeout).catch(() => {});
      return;
    }

    // --- Streaming ---
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

      // If no streaming deltas were captured (SDK may not propagate them
      // to extensions), emit the full response as a single delta so the
      // client still gets content.
      if (!writer.getText() && finalContent) {
        writer.writeDelta(finalContent);
      }

      writer.complete();
      return;
    }

    // --- Non-streaming ---

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
  }

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

    jsonResponse(res, 404, {
      error: "Not found",
      endpoints: {
        "POST /v1/responses": "OpenAI Responses API (compatible)",
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
