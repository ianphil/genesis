import { randomUUID } from "node:crypto";

/**
 * Translates between OpenAI Responses API format and the Copilot session.
 *
 * Supports:
 *   - POST /v1/responses  (non-streaming + streaming)
 *   - Normalizes input (string or conversation array) to a prompt string
 *   - Wraps agent output in the OpenAI response envelope
 *   - Emits proper SSE event sequence for streaming
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function responseId() {
  return `resp_${randomUUID().replace(/-/g, "")}`;
}

function messageId() {
  return `msg_${randomUUID().replace(/-/g, "")}`;
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Normalize the `input` field into a plain prompt string.
 * Accepts:
 *   - string
 *   - array of { role, content } conversation items (takes the last user message)
 */
export function normalizeInput(input, instructions) {
  let prompt = "";

  if (typeof input === "string") {
    prompt = input;
  } else if (Array.isArray(input)) {
    // Collect user messages; use the last one as the prompt
    const parts = [];
    for (const item of input) {
      if (typeof item === "string") {
        parts.push(item);
      } else if (item.content) {
        const text =
          typeof item.content === "string"
            ? item.content
            : Array.isArray(item.content)
              ? item.content
                  .filter((c) => c.type === "input_text" || c.type === "text")
                  .map((c) => c.text)
                  .join("\n")
              : String(item.content);
        parts.push(text);
      }
    }
    prompt = parts.join("\n\n");
  }

  // Prepend instructions if provided
  if (instructions && typeof instructions === "string") {
    prompt = `[System instructions: ${instructions}]\n\n${prompt}`;
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// Background job 202 response
// ---------------------------------------------------------------------------

/**
 * Build a 202 Accepted envelope for background job requests.
 */
export function build202Response(jobId, feedUrl) {
  return {
    id: jobId,
    object: "response",
    created_at: nowUnix(),
    status: "queued",
    feed_url: feedUrl,
  };
}

// ---------------------------------------------------------------------------
// Non-streaming response builder
// ---------------------------------------------------------------------------

/**
 * Build a complete OpenAI Responses API response object.
 */
export function buildResponse(content, opts = {}) {
  const id = opts.id || responseId();
  const model = opts.model || "copilot-agent";

  return {
    id,
    object: "response",
    created_at: nowUnix(),
    status: "completed",
    model,
    output: [
      {
        type: "message",
        id: messageId(),
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: content,
          },
        ],
      },
    ],
    output_text: content,
    parallel_tool_calls: false,
    previous_response_id: opts.previousResponseId || null,
    reasoning: null,
    store: false,
    temperature: opts.temperature ?? 1.0,
    text: { format: { type: "text" } },
    tool_choice: "auto",
    tools: [],
    top_p: 1.0,
    usage: null,
    metadata: opts.metadata || {},
  };
}

// ---------------------------------------------------------------------------
// Streaming helpers
// ---------------------------------------------------------------------------

/**
 * Write a single SSE event to the response stream.
 */
function sseEvent(res, eventType, data) {
  res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Create a streaming handler that emits OpenAI Responses API SSE events.
 *
 * Event sequence:
 *   1. response.created
 *   2. response.output_item.added
 *   3. response.content_part.added
 *   4. response.output_text.delta  (repeated)
 *   5. response.content_part.done
 *   6. response.output_item.done
 *   7. response.completed
 */
export function createStreamWriter(res, opts = {}) {
  const id = opts.id || responseId();
  const msgId = messageId();
  const model = opts.model || "copilot-agent";
  const createdAt = nowUnix();
  let accumulatedText = "";
  let sequenceNumber = 0;

  // Write SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });

  const baseResponse = {
    id,
    object: "response",
    created_at: createdAt,
    status: "in_progress",
    model,
    output: [],
    output_text: "",
    parallel_tool_calls: false,
    previous_response_id: opts.previousResponseId || null,
    reasoning: null,
    store: false,
    temperature: opts.temperature ?? 1.0,
    text: { format: { type: "text" } },
    tool_choice: "auto",
    tools: [],
    top_p: 1.0,
    usage: null,
    metadata: opts.metadata || {},
  };

  // 1. response.created
  sseEvent(res, "response.created", baseResponse);

  // 2. response.output_item.added
  const outputItem = {
    type: "message",
    id: msgId,
    status: "in_progress",
    role: "assistant",
    content: [],
  };
  sseEvent(res, "response.output_item.added", {
    output_index: 0,
    item: outputItem,
    sequence_number: sequenceNumber++,
  });

  // 3. response.content_part.added
  const contentPart = { type: "output_text", text: "" };
  sseEvent(res, "response.content_part.added", {
    output_index: 0,
    content_index: 0,
    part: contentPart,
    sequence_number: sequenceNumber++,
  });

  return {
    /** Emit a text delta chunk. */
    writeDelta(text) {
      if (!text) return;
      accumulatedText += text;
      sseEvent(res, "response.output_text.delta", {
        output_index: 0,
        content_index: 0,
        delta: text,
        sequence_number: sequenceNumber++,
      });
    },

    /** Finalize the stream with a completed response. */
    complete() {
      // content_part.done
      sseEvent(res, "response.content_part.done", {
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: accumulatedText },
        sequence_number: sequenceNumber++,
      });

      // output_item.done
      sseEvent(res, "response.output_item.done", {
        output_index: 0,
        item: {
          type: "message",
          id: msgId,
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: accumulatedText }],
        },
        sequence_number: sequenceNumber++,
      });

      // response.completed
      sseEvent(res, "response.completed", {
        ...baseResponse,
        status: "completed",
        output: [
          {
            type: "message",
            id: msgId,
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: accumulatedText }],
          },
        ],
        output_text: accumulatedText,
      });

      res.end();
    },

    /** Emit an error and close the stream. */
    error(message) {
      sseEvent(res, "error", {
        type: "server_error",
        message,
      });
      res.end();
    },

    /** Get accumulated text so far. */
    getText() {
      return accumulatedText;
    },
  };
}
