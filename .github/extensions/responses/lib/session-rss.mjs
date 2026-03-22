// session-rss.mjs — Build RSS 2.0 feeds from session events
//
// Generates standard RSS 2.0 XML from a session timeline.
// Each event becomes an <item>. The response gets <content:encoded> for full text.

/**
 * Build an RSS 2.0 XML string from session data.
 *
 * @param {string} sessionId
 * @param {string} prompt - The original prompt (for channel description)
 * @param {string} baseUrl - Base URL for links (e.g., "http://127.0.0.1:15210")
 * @param {Array<{title: string, description: string, timestamp: string, fullText?: string}>} timeline
 * @returns {string} RSS 2.0 XML
 */
export function buildSessionRSS(sessionId, prompt, baseUrl, timeline) {
  const link = `${baseUrl}/sessions/${encodeURIComponent(sessionId)}`;
  const lastBuild = timeline.length > 0
    ? new Date(timeline[timeline.length - 1].timestamp).toUTCString()
    : new Date().toUTCString();

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">\n`;
  xml += `  <channel>\n`;
  xml += `    <title>Session ${esc(sessionId)}</title>\n`;
  xml += `    <link>${esc(link)}</link>\n`;
  xml += `    <description>${esc(truncate(prompt || sessionId, 500))}</description>\n`;
  xml += `    <language>en-us</language>\n`;
  xml += `    <lastBuildDate>${lastBuild}</lastBuildDate>\n`;

  for (const item of timeline) {
    xml += `    <item>\n`;
    xml += `      <title>${esc(item.title)}</title>\n`;
    xml += `      <description>${esc(truncate(item.description, 500))}</description>\n`;
    xml += `      <link>${esc(link)}</link>\n`;
    if (item.timestamp) {
      xml += `      <pubDate>${new Date(item.timestamp).toUTCString()}</pubDate>\n`;
      xml += `      <guid isPermaLink="false">${esc(sessionId)}-${esc(item.timestamp)}</guid>\n`;
    }
    if (item.fullText) {
      xml += `      <content:encoded><![CDATA[${item.fullText}]]></content:encoded>\n`;
    }
    xml += `    </item>\n`;
  }

  xml += `  </channel>\n`;
  xml += `</rss>\n`;
  return xml;
}

// --- Helpers ---

function esc(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(text, max = 200) {
  if (!text) return "";
  const s = String(text);
  return s.length > max ? s.slice(0, max) + "…" : s;
}
