// Schema store — persist inferred output schemas to disk.
//
// Schemas are stored per-server per-tool in data/schemas/{server}/{tool}.json.
// Each file contains the merged output schema plus metadata (call count, last updated).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "./paths.mjs";
import { inferSchema, mergeSchemas } from "./schema-inference.mjs";

/**
 * Get the schemas directory for a server.
 * @param {string} extDir
 * @param {string} server
 * @returns {string}
 */
function getSchemasDir(extDir, server) {
  return join(getDataDir(extDir), "schemas", server);
}

/**
 * Get the schema file path for a specific tool.
 * @param {string} extDir
 * @param {string} server
 * @param {string} tool
 * @returns {string}
 */
function getSchemaPath(extDir, server, tool) {
  return join(getSchemasDir(extDir, server), `${tool}.json`);
}

/**
 * Read an existing schema for a tool, or null if none exists.
 * @param {string} extDir
 * @param {string} server
 * @param {string} tool
 * @returns {object|null}
 */
export function readToolSchema(extDir, server, tool) {
  const filePath = getSchemaPath(extDir, server, tool);
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Capture a tool call's output and merge into the stored schema.
 * Called automatically by call_tool after each successful invocation.
 * @param {string} extDir
 * @param {string} server
 * @param {string} tool
 * @param {object} params - Input params used
 * @param {any} result - Output value returned
 */
export function captureSchema(extDir, server, tool, params, result) {
  try {
    const dir = getSchemasDir(extDir, server);
    mkdirSync(dir, { recursive: true });

    const existing = readToolSchema(extDir, server, tool);
    const inferred = inferSchema(result);

    let merged;
    let callCount = 1;

    if (existing) {
      merged = mergeSchemas(existing.outputSchema, inferred);
      callCount = (existing.callCount || 0) + 1;
    } else {
      merged = inferred;
    }

    const schema = {
      server,
      tool,
      callCount,
      lastCapturedAt: new Date().toISOString(),
      lastParams: params,
      outputSchema: merged,
    };

    writeFileSync(getSchemaPath(extDir, server, tool), JSON.stringify(schema, null, 2), "utf-8");
  } catch (err) {
    // Schema capture is best-effort — never fail the actual tool call
    console.error(`[code-exec] Schema capture failed for ${server}/${tool}: ${err.message}`);
  }
}

/**
 * List all captured schemas for a server.
 * @param {string} extDir
 * @param {string} server
 * @returns {Array<{tool: string, callCount: number, lastCapturedAt: string}>}
 */
export function listCapturedSchemas(extDir, server) {
  const dir = getSchemasDir(extDir, server);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const data = JSON.parse(readFileSync(join(dir, f), "utf-8"));
        return {
          tool: data.tool,
          callCount: data.callCount,
          lastCapturedAt: data.lastCapturedAt,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Format a captured schema into readable text for the LLM.
 * @param {object} schema - Stored schema object
 * @returns {string}
 */
export function formatCapturedSchema(schema) {
  if (!schema) return "";

  const lines = [
    `\n**Learned output schema** (from ${schema.callCount} call(s), last: ${schema.lastCapturedAt}):`,
    "```json",
    JSON.stringify(schema.outputSchema, null, 2),
    "```",
  ];
  return lines.join("\n");
}
