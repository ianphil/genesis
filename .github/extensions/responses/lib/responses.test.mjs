import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInput,
  buildResponse,
  build202Response,
  createStreamWriter,
} from "./responses.mjs";

// ---------------------------------------------------------------------------
// Mock response object for streaming tests
// ---------------------------------------------------------------------------

function createMockRes() {
  const written = [];
  const headers = {};
  return {
    writeHead(status, hdrs) {
      Object.assign(headers, { status, ...hdrs });
    },
    write(chunk) {
      written.push(chunk);
    },
    end() {
      written.push("__END__");
    },
    written,
    headers,
  };
}

// ---------------------------------------------------------------------------
// normalizeInput
// ---------------------------------------------------------------------------

describe("normalizeInput", () => {
  it("passes through a plain string", () => {
    assert.equal(normalizeInput("hello"), "hello");
  });

  it("joins array of strings with double newline", () => {
    assert.equal(normalizeInput(["a", "b", "c"]), "a\n\nb\n\nc");
  });

  it("extracts content from conversation array [{role, content}]", () => {
    const input = [
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
    ];
    assert.equal(normalizeInput(input), "first\n\nsecond");
  });

  it('handles nested content arrays with type: "input_text"', () => {
    const input = [
      {
        role: "user",
        content: [{ type: "input_text", text: "nested input" }],
      },
    ];
    assert.equal(normalizeInput(input), "nested input");
  });

  it('handles nested content arrays with type: "text"', () => {
    const input = [
      {
        role: "user",
        content: [{ type: "text", text: "nested text" }],
      },
    ];
    assert.equal(normalizeInput(input), "nested text");
  });

  it("prepends instructions when provided", () => {
    const result = normalizeInput("prompt", "do this");
    assert.equal(result, "[System instructions: do this]\n\nprompt");
  });

  it("handles null/undefined instructions (no prepend)", () => {
    assert.equal(normalizeInput("prompt", null), "prompt");
    assert.equal(normalizeInput("prompt", undefined), "prompt");
  });

  it("handles empty array → empty string", () => {
    assert.equal(normalizeInput([]), "");
  });
});

// ---------------------------------------------------------------------------
// buildResponse
// ---------------------------------------------------------------------------

describe("buildResponse", () => {
  it("returns object with correct shape", () => {
    const r = buildResponse("hello");
    assert.ok(r.id);
    assert.equal(r.object, "response");
    assert.equal(typeof r.created_at, "number");
    assert.ok(Array.isArray(r.output));
    assert.equal(typeof r.output_text, "string");
  });

  it('status is "completed"', () => {
    assert.equal(buildResponse("x").status, "completed");
  });

  it("output_text matches input content", () => {
    assert.equal(buildResponse("hello world").output_text, "hello world");
  });

  it("uses provided model name", () => {
    const r = buildResponse("x", { model: "gpt-5" });
    assert.equal(r.model, "gpt-5");
  });

  it('generates unique id starting with "resp_"', () => {
    const a = buildResponse("x");
    const b = buildResponse("x");
    assert.ok(a.id.startsWith("resp_"));
    assert.ok(b.id.startsWith("resp_"));
    assert.notEqual(a.id, b.id);
  });

  it("includes previousResponseId from opts", () => {
    const r = buildResponse("x", { previousResponseId: "prev_123" });
    assert.equal(r.previous_response_id, "prev_123");
  });

  it("includes metadata from opts", () => {
    const meta = { foo: "bar" };
    const r = buildResponse("x", { metadata: meta });
    assert.deepEqual(r.metadata, meta);
  });
});

// ---------------------------------------------------------------------------
// build202Response
// ---------------------------------------------------------------------------

describe("build202Response", () => {
  it("returns object with jobId as id", () => {
    const r = build202Response("job_abc", "https://feed");
    assert.equal(r.id, "job_abc");
  });

  it('status is "queued"', () => {
    const r = build202Response("job_abc", "https://feed");
    assert.equal(r.status, "queued");
  });

  it("includes feed_url", () => {
    const r = build202Response("job_abc", "https://feed/url");
    assert.equal(r.feed_url, "https://feed/url");
  });

  it("has created_at as unix timestamp", () => {
    const before = Math.floor(Date.now() / 1000);
    const r = build202Response("j", "f");
    const after = Math.floor(Date.now() / 1000);
    assert.ok(r.created_at >= before && r.created_at <= after);
  });

  it('object is "response"', () => {
    assert.equal(build202Response("j", "f").object, "response");
  });
});

// ---------------------------------------------------------------------------
// createStreamWriter
// ---------------------------------------------------------------------------

describe("createStreamWriter", () => {
  it("writes SSE headers to response", () => {
    const mock = createMockRes();
    createStreamWriter(mock);
    assert.equal(mock.headers.status, 200);
    assert.equal(mock.headers["Content-Type"], "text/event-stream");
    assert.equal(mock.headers["Cache-Control"], "no-cache");
  });

  it("writeDelta accumulates text", () => {
    const mock = createMockRes();
    const sw = createStreamWriter(mock);
    sw.writeDelta("hello ");
    sw.writeDelta("world");
    assert.equal(sw.getText(), "hello world");
  });

  it("getText returns accumulated text", () => {
    const mock = createMockRes();
    const sw = createStreamWriter(mock);
    assert.equal(sw.getText(), "");
    sw.writeDelta("abc");
    assert.equal(sw.getText(), "abc");
  });

  it("complete writes final events", () => {
    const mock = createMockRes();
    const sw = createStreamWriter(mock);
    sw.writeDelta("done");
    sw.complete();

    const all = mock.written.join("");
    assert.ok(all.includes("event: response.content_part.done"));
    assert.ok(all.includes("event: response.output_item.done"));
    assert.ok(all.includes("event: response.completed"));
    assert.equal(mock.written.at(-1), "__END__");
  });

  it("error writes error event", () => {
    const mock = createMockRes();
    const sw = createStreamWriter(mock);
    sw.error("something broke");

    const all = mock.written.join("");
    assert.ok(all.includes("event: error"));
    assert.ok(all.includes("something broke"));
    assert.equal(mock.written.at(-1), "__END__");
  });
});
