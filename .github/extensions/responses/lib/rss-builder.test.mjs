import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRssFeed } from "./rss-builder.mjs";

function makeJob(overrides = {}) {
  return {
    id: "job-001",
    prompt: "Summarize the latest news",
    createdAt: "2025-01-15T10:00:00Z",
    updatedAt: "2025-01-15T12:00:00Z",
    ...overrides,
  };
}

function makeItems(count = 1) {
  return Array.from({ length: count }, (_, i) => ({
    title: `Status ${i + 1}`,
    description: `Description for status ${i + 1}`,
    timestamp: `2025-01-15T1${i}:00:00Z`,
  }));
}

describe("buildRssFeed", () => {
  it("generates valid XML with correct structure", () => {
    const xml = buildRssFeed(makeJob(), makeItems(), 3000);

    assert.ok(xml.startsWith("<?xml"), "should start with <?xml");
    assert.ok(xml.includes('<rss version="2.0"'), "should contain <rss version=\"2.0\"");
    assert.ok(xml.includes("xmlns:content"), "should contain content namespace");
    assert.ok(xml.includes("<channel>"), "should contain <channel>");
    assert.ok(xml.includes("Job job-001"), "should contain the job ID in the title");
    assert.ok(xml.includes("http://127.0.0.1:3000/jobs/job-001"), "should contain the port in the link URL");
  });

  it("escapes XML special characters in prompt", () => {
    const job = makeJob({ prompt: '<script>alert("x")&\'test\'' });
    const xml = buildRssFeed(job, [], 3000);

    assert.ok(xml.includes("&lt;script&gt;"), "should escape < and >");
    assert.ok(xml.includes("&amp;"), "should escape &");
    assert.ok(xml.includes("&quot;"), "should escape double quotes");
    assert.ok(xml.includes("&apos;"), "should escape single quotes");
    assert.ok(!xml.includes('<script>'), "should not contain raw <script>");
  });

  it("handles empty statusItems array", () => {
    const xml = buildRssFeed(makeJob(), [], 3000);

    assert.ok(xml.includes("<?xml"), "should still be valid XML");
    assert.ok(!xml.includes("<item>"), "should not contain <item> elements");
  });

  it("creates one <item> per statusItem", () => {
    const xml = buildRssFeed(makeJob(), makeItems(3), 3000);
    const itemCount = (xml.match(/<item>/g) || []).length;

    assert.equal(itemCount, 3, "should have exactly 3 <item> blocks");
  });

  it("includes pubDate in RFC 822 format", () => {
    const items = [{ title: "T", description: "D", timestamp: "2025-06-20T14:30:00Z" }];
    const xml = buildRssFeed(makeJob(), items, 3000);
    const expected = new Date("2025-06-20T14:30:00Z").toUTCString();

    assert.ok(xml.includes(`<pubDate>${expected}</pubDate>`), "should include RFC 822 pubDate");
  });

  it("includes guid with job ID and timestamp", () => {
    const xml = buildRssFeed(makeJob(), makeItems(1), 3000);

    assert.ok(xml.includes('<guid isPermaLink="false">'), "should contain guid element");
    assert.ok(xml.includes("job-001-"), "guid should contain job ID");
  });

  it("truncates long prompts to 200 chars", () => {
    const longPrompt = "A".repeat(500);
    const job = makeJob({ prompt: longPrompt });
    const xml = buildRssFeed(job, [], 3000);

    assert.ok(!xml.includes("A".repeat(201)), "should not contain more than 200 chars of prompt");
    assert.ok(xml.includes("A".repeat(200)), "should contain exactly 200 chars of prompt");
  });

  it("handles missing/null fields gracefully", () => {
    const job = { id: "job-null", prompt: null, createdAt: null, updatedAt: null };

    assert.doesNotThrow(() => buildRssFeed(job, [], 3000));

    const xml = buildRssFeed(job, [], 3000);
    assert.ok(xml.includes("<?xml"), "should produce valid XML");
    assert.ok(xml.includes("<channel>"), "should still have channel");
  });

  it("uses createdAt when updatedAt is null for lastBuildDate", () => {
    const job = makeJob({ updatedAt: null });
    const xml = buildRssFeed(job, [], 3000);
    const expected = new Date("2025-01-15T10:00:00Z").toUTCString();

    assert.ok(xml.includes(`<lastBuildDate>${expected}</lastBuildDate>`), "should fall back to createdAt");
  });

  it("includes content:encoded CDATA when item has fullText", () => {
    const items = [{
      title: "Response",
      description: "Full AI response with lots of detail.",
      timestamp: "2025-01-15T11:00:00Z",
      fullText: "Full AI response with lots of detail.",
    }];
    const xml = buildRssFeed(makeJob(), items, 3000);

    assert.ok(xml.includes("<content:encoded>"), "should contain content:encoded element");
    assert.ok(xml.includes("<![CDATA[Full AI response"), "should wrap fullText in CDATA");
    assert.ok(xml.includes("]]></content:encoded>"), "should close CDATA and element");
  });

  it("omits content:encoded when item has no fullText", () => {
    const xml = buildRssFeed(makeJob(), makeItems(1), 3000);

    assert.ok(!xml.includes("content:encoded"), "should not contain content:encoded");
    assert.ok(!xml.includes("<![CDATA["), "should not contain CDATA");
  });

  it("truncates long descriptions with ellipsis", () => {
    const items = [{
      title: "Response",
      description: "A".repeat(300),
      timestamp: "2025-01-15T11:00:00Z",
    }];
    const xml = buildRssFeed(makeJob(), items, 3000);

    assert.ok(!xml.includes("A".repeat(201)), "description should be truncated");
    assert.ok(xml.includes("…"), "should contain ellipsis");
  });
});
