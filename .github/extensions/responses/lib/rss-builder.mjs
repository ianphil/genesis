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

export function buildRssFeed(job, statusItems, port) {
  const jobId = escapeXml(job.id);
  const link = `http://127.0.0.1:${port}/jobs/${jobId}`;
  const prompt = escapeXml((job.prompt || "").slice(0, 200));
  const lastBuild = toRfc822(job.updatedAt || job.createdAt);

  const items = (statusItems || []).map(item => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(item.description)}</description>
      <link>${link}</link>
      <pubDate>${toRfc822(item.timestamp)}</pubDate>
      <guid isPermaLink="false">${jobId}-${escapeXml(item.timestamp)}</guid>
    </item>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Job ${jobId} — Status Feed</title>
    <link>${link}</link>
    <description>Status updates for job: ${prompt}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>${items}
  </channel>
</rss>`;
}
