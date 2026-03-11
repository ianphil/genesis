// Identity loader — assembles SOUL.md + agent files into a system message.
// Caches result at engine startup since identity doesn't change between runs.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getMindRoot } from "./paths.mjs";

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** Strip YAML frontmatter from markdown content */
function stripFrontmatter(content) {
  return content.replace(FRONTMATTER_RE, "").trim();
}

/** Read a file, return null on error */
function safeRead(filePath) {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Load the mind's identity: SOUL.md + all agent files.
 * Returns a single string suitable for SystemMessage injection.
 */
export function loadIdentity(extDir) {
  const mindRoot = getMindRoot(extDir);
  const parts = [];

  // 1. Read SOUL.md
  const soul = safeRead(join(mindRoot, "SOUL.md"));
  if (soul) {
    parts.push(soul);
  }

  // 2. Glob .github/agents/*.agent.md, sorted alphabetically
  const agentsDir = join(mindRoot, ".github", "agents");
  try {
    const agentFiles = readdirSync(agentsDir)
      .filter((f) => f.endsWith(".agent.md"))
      .sort();

    for (const file of agentFiles) {
      const content = safeRead(join(agentsDir, file));
      if (content) {
        parts.push(stripFrontmatter(content));
      }
    }
  } catch {
    // agents directory may not exist yet
  }

  return parts.join("\n\n---\n\n");
}

// Cached identity for engine use
let cachedIdentity = null;

/** Get cached identity, loading on first call */
export function getCachedIdentity(extDir) {
  if (cachedIdentity === null) {
    cachedIdentity = loadIdentity(extDir);
  }
  return cachedIdentity;
}

/** Clear cache (useful for testing) */
export function clearIdentityCache() {
  cachedIdentity = null;
}
