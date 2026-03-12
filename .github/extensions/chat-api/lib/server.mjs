import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  normalizeInput,
  buildResponse,
  createStreamWriter,
} from "./responses.mjs";

/**
 * Creates an HTTP server that bridges external chat clients to the Copilot session.
 *
 * Endpoints:
 *   POST /chat          — send a message, receive the agent's response (blocking)
 *   GET  /chat/stream   — SSE stream for a single prompt (query: ?prompt=...)
 *   GET  /health        — liveness check
 *   GET  /history       — recent conversation history
 *
 * @param {object} deps
 * @param {Function} deps.sendAndWait  — session.sendAndWait bound to the active session
 * @param {Function} deps.send         — session.send bound to the active session
 * @param {Function} deps.getMessages  — session.getMessages bound to the active session
 * @param {Function} deps.onEvent      — session.on bound to the active session
 */
export function createChatApiServer(deps) {
  let server = null;
  let port = null;
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

  async function handleChat(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return jsonResponse(res, 400, { error: "Request body must be valid JSON" });
    }

    const prompt = body.message || body.prompt;
    if (!prompt || typeof prompt !== "string") {
      return jsonResponse(res, 400, {
        error: "Missing 'message' or 'prompt' field (string)",
      });
    }

    const timeout = typeof body.timeout === "number" ? body.timeout : 120_000;

    try {
      const response = await deps.sendAndWait({ prompt }, timeout);
      const content = response?.data?.content ?? "(no response)";
      jsonResponse(res, 200, {
        id: randomUUID(),
        content,
        model: response?.data?.model,
        timestamp: Date.now(),
      });
    } catch (err) {
      jsonResponse(res, 502, {
        error: "Agent failed to respond",
        detail: err.message,
      });
    }
  }

  async function handleStream(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const prompt = url.searchParams.get("prompt");
    if (!prompt) {
      return jsonResponse(res, 400, { error: "Missing ?prompt= query parameter" });
    }

    res.writeHead(200, {
      ...corsHeaders(),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const streamId = randomUUID();
    res.write(`data: ${JSON.stringify({ type: "start", id: streamId })}\n\n`);

    const unsubs = [];

    // Listen for streaming deltas
    const offDelta = deps.onEvent("assistant.streaming_delta", (event) => {
      const chunk = event?.data?.content || event?.data?.delta || "";
      if (chunk) {
        res.write(`data: ${JSON.stringify({ type: "delta", content: chunk })}\n\n`);
      }
    });
    unsubs.push(offDelta);

    // Listen for completion
    const done = new Promise((resolve) => {
      const offMessage = deps.onEvent("assistant.message", (event) => {
        const content = event?.data?.content ?? "";
        res.write(`data: ${JSON.stringify({ type: "complete", content })}\n\n`);
        resolve();
      });
      unsubs.push(offMessage);
    });

    // Send the prompt (non-blocking)
    try {
      await deps.send({ prompt });
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`
      );
      unsubs.forEach((fn) => fn());
      res.end();
      return;
    }

    // Wait for completion or client disconnect
    const timeout = setTimeout(() => {
      res.write(`data: ${JSON.stringify({ type: "error", error: "timeout" })}\n\n`);
      res.end();
    }, 300_000);

    req.on("close", () => {
      clearTimeout(timeout);
      unsubs.forEach((fn) => fn());
    });

    await done;
    clearTimeout(timeout);
    unsubs.forEach((fn) => fn());
    res.write("data: [DONE]\n\n");
    res.end();
  }

  async function handleHistory(_req, res) {
    try {
      const messages = await deps.getMessages();
      jsonResponse(res, 200, { messages });
    } catch (err) {
      jsonResponse(res, 500, { error: err.message });
    }
  }

  function handleHealth(_req, res) {
    jsonResponse(res, 200, {
      status: "ok",
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

    // --- Streaming ---
    if (body.stream === true) {
      const writer = createStreamWriter(res, opts);
      const unsubs = [];

      const offDelta = deps.onEvent("assistant.streaming_delta", (event) => {
        const chunk = event?.data?.content || event?.data?.delta || "";
        if (chunk) writer.writeDelta(chunk);
      });
      unsubs.push(offDelta);

      let finalContent = "";
      const done = new Promise((resolve) => {
        const offMessage = deps.onEvent("assistant.message", (event) => {
          finalContent = event?.data?.content ?? "";
          resolve();
        });
        unsubs.push(offMessage);
      });

      try {
        await deps.send({ prompt });
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
    const timeout = typeof body.timeout === "number" ? body.timeout : 120_000;

    try {
      const response = await deps.sendAndWait({ prompt }, timeout);
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

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      return res.end();
    }

    if (path === "/health" && req.method === "GET") return handleHealth(req, res);
    if (path === "/chat" && req.method === "POST") return handleChat(req, res);
    if (path === "/chat/stream" && req.method === "GET") return handleStream(req, res);
    if (path === "/history" && req.method === "GET") return handleHistory(req, res);
    if (path === "/v1/responses" && req.method === "POST") return handleResponses(req, res);

    jsonResponse(res, 404, {
      error: "Not found",
      endpoints: {
        "POST /v1/responses": "OpenAI Responses API (compatible)",
        "POST /chat": "Send a message, get a response",
        "GET /chat/stream?prompt=...": "SSE stream for a prompt",
        "GET /history": "Conversation history",
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

    getPort() {
      return port;
    },

    isRunning() {
      return server !== null;
    },
  };
}
