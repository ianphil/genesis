import { joinSession } from "@github/copilot-sdk/extension";

import { embedPendingDocuments, embedQuery } from "./lib/embed.mjs";
import { openStore } from "./lib/qmd.mjs";

function normalizeLimit(limit, fallback = 10) {
  const value = Number(limit);
  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }

  return Math.min(Math.floor(value), 25);
}

function formatScore(score) {
  return `${Math.round(score * 100)}%`;
}

function cleanSnippet(snippet) {
  return snippet
    .replace(/^@@\s+[^@]+@@\s*(?:\([^)]*\)\s*)?/, "")
    .trim();
}

async function buildSnippet(store, extractSnippet, result, query) {
  const body = await store.getDocumentBody(result.displayPath);
  if (!body) {
    return null;
  }

  const { line, snippet } = extractSnippet(body, query, 280, result.chunkPos);
  return {
    line,
    snippet: cleanSnippet(snippet),
  };
}

async function formatResults({ store, extractSnippet, query, results, label }) {
  if (results.length === 0) {
    return `No ${label} results found for "${query}".`;
  }

  const lines = [`${label} results for "${query}":`, ""];

  for (const [index, result] of results.entries()) {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`   Path: ${result.displayPath}`);
    lines.push(`   Collection: ${result.collectionName}`);
    lines.push(`   Score: ${formatScore(result.score)} (${result.source})`);

    const snippet = await buildSnippet(store, extractSnippet, result, query);
    if (snippet?.snippet) {
      lines.push(`   Snippet (line ${snippet.line}): ${snippet.snippet.replace(/\s+/g, " ")}`);
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatReindexResult(update, embed) {
  const lines = [
    "IDEA reindex complete.",
    "",
    `Collections scanned: ${update.collections}`,
    `Indexed: ${update.indexed} new`,
    `Updated: ${update.updated}`,
    `Unchanged: ${update.unchanged}`,
    `Removed: ${update.removed}`,
    `Pending embeddings after scan: ${update.needsEmbedding}`,
    "",
    `Documents embedded: ${embed.documents}`,
    `Chunks embedded: ${embed.chunks}`,
    `Elapsed: ${embed.elapsedSeconds.toFixed(1)}s`,
  ];

  if (embed.force) {
    lines.push("Mode: force re-embed");
  }

  return lines.join("\n");
}

function formatStatus(status, health, collections) {
  const lines = [
    "IDEA index status:",
    "",
    `Total documents: ${status.totalDocuments}`,
    `Needs embedding: ${status.needsEmbedding}`,
    `Vector index: ${status.hasVectorIndex ? "yes" : "no"}`,
    `Days stale: ${health.daysStale ?? "unknown"}`,
    `Collections: ${status.collections.length}`,
    "",
  ];

  for (const collection of status.collections) {
    const meta = collections.find((item) => item.name === collection.name);
    const flags = [];
    if (meta?.includeByDefault) {
      flags.push("default");
    }

    lines.push(
      `- ${collection.name}: ${collection.documents} docs at ${collection.path ?? "(db-only)"}`
      + (flags.length > 0 ? ` [${flags.join(", ")}]` : ""),
    );
  }

  return lines.join("\n");
}

await joinSession({
  tools: [
    {
      name: "idea_search",
      description: "Keyword search across the IDEA mind using BM25 lexical search.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Exact words or phrases to search for.",
          },
          collection: {
            type: "string",
            description: "Optional collection name to limit the search.",
          },
          limit: {
            type: "integer",
            description: "Maximum number of matches to return (default 10, max 25).",
          },
        },
        required: ["query"],
      },
      handler: async (args) => {
        const store = await openStore();
        try {
          const { extractSnippet } = await import("./lib/qmd.mjs");
          const results = await store.searchLex(args.query, {
            collection: args.collection,
            limit: normalizeLimit(args.limit),
          });

          return await formatResults({
            store,
            extractSnippet,
            query: args.query,
            results,
            label: "Keyword",
          });
        } finally {
          await store.close();
        }
      },
    },
    {
      name: "idea_recall",
      description: "Semantic search across the IDEA mind using Copilot embeddings and QMD vector search.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural-language question or concept to recall.",
          },
          collection: {
            type: "string",
            description: "Optional collection name to limit the search.",
          },
          limit: {
            type: "integer",
            description: "Maximum number of matches to return (default 10, max 25).",
          },
        },
        required: ["query"],
      },
      handler: async (args) => {
        const store = await openStore();
        try {
          const { extractSnippet } = await import("./lib/qmd.mjs");
          const queryVector = await embedQuery(args.query);
          const results = await store.internal.searchVec(
            args.query,
            "text-embedding-3-small",
            normalizeLimit(args.limit),
            args.collection,
            undefined,
            queryVector,
          );

          return await formatResults({
            store,
            extractSnippet,
            query: args.query,
            results,
            label: "Semantic",
          });
        } finally {
          await store.close();
        }
      },
    },
    {
      name: "idea_reindex",
      description: "Re-scan the IDEA collections from disk and refresh Copilot-backed vector embeddings.",
      parameters: {
        type: "object",
        properties: {
          force: {
            type: "boolean",
            description: "Rebuild all embeddings instead of only missing ones.",
            default: false,
          },
        },
      },
      handler: async (args) => {
        const store = await openStore();
        try {
          const update = await store.update();
          const embed = await embedPendingDocuments(store, {
            force: Boolean(args.force),
          });
          return formatReindexResult(update, embed);
        } finally {
          await store.close();
        }
      },
    },
    {
      name: "idea_status",
      description: "Show IDEA index health, document counts, staleness, and configured collections.",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const store = await openStore();
        try {
          const [status, health, collections] = await Promise.all([
            store.getStatus(),
            store.getIndexHealth(),
            store.listCollections(),
          ]);
          return formatStatus(status, health, collections);
        } finally {
          await store.close();
        }
      },
    },
  ],
});
