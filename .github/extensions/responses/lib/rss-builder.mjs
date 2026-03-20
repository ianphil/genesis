// RSS 2.0 feed builder for job status data.
// Adapted from jplane/copilot-cli-extensions (Josh's rss-feed extension).

function escapeXml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toUTCString();
}

function truncateDesc(text, max = 200) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export function buildRssFeed(job, statusItems, port) {
  const jobId = escapeXml(job.id);
  const link = `http://127.0.0.1:${port}/jobs/${jobId}`;
  const prompt = escapeXml((job.prompt || "").slice(0, 200));
  const lastBuild = toRfc822(job.updatedAt || job.createdAt);

  const items = (statusItems || []).map(item => {
    const contentEncoded = item.fullText
      ? `\n      <content:encoded><![CDATA[${item.fullText}]]></content:encoded>`
      : "";
    return `
    <item>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(truncateDesc(item.description))}</description>${contentEncoded}
      <link>${link}</link>
      <pubDate>${toRfc822(item.timestamp)}</pubDate>
      <guid isPermaLink="false">${jobId}-${escapeXml(item.timestamp)}</guid>
    </item>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Job ${jobId} — Status Feed</title>
    <link>${link}</link>
    <description>Status updates for job: ${prompt}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>${items}
  </channel>
</rss>`;
}
