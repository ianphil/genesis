// Field normalization for MCP server responses.
//
// Different MCP servers return field names with inconsistent casing.
// This module normalizes them so consumer code sees consistent names.

const NORMALIZATION_CONFIG = {
  ado: "ado-pascal-case",
  // Add other servers here as needed
};

/**
 * Normalize ADO API response field names to consistent PascalCase.
 *
 * Different ADO REST APIs return field names with different casing:
 * - Search API: 'system.id', 'system.parent'
 * - Work Item APIs: 'System.Id', 'System.Parent'
 */
function normalizeAdoFields(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(normalizeAdoFields);
  if (typeof obj !== "object") return obj;

  const normalized = {};
  for (const [key, value] of Object.entries(obj)) {
    let normalizedKey = key;

    if (key.startsWith("system.")) {
      normalizedKey = "System." + key.slice(7).replace(/^(.)/, (c) => c.toUpperCase());
    } else if (key.startsWith("microsoft.")) {
      normalizedKey = "Microsoft." + key.slice(10).replace(/^(.)/, (c) => c.toUpperCase());
    } else if (key.startsWith("custom.")) {
      normalizedKey = "Custom." + key.slice(7).replace(/^(.)/, (c) => c.toUpperCase());
    } else if (key.toLowerCase().startsWith("wef_")) {
      normalizedKey = "WEF_" + key.slice(4);
    }

    normalized[normalizedKey] = normalizeAdoFields(value);
  }

  return normalized;
}

/**
 * Apply field normalization based on server configuration.
 * @param {any} obj - Response object to normalize
 * @param {string} serverName - MCP server name (e.g., 'ado')
 * @returns {any} Normalized object
 */
export function normalizeFieldNames(obj, serverName) {
  const strategy = NORMALIZATION_CONFIG[serverName];

  switch (strategy) {
    case "ado-pascal-case":
      return normalizeAdoFields(obj);
    default:
      return obj;
  }
}

/**
 * Check if a server has normalization configured.
 * @param {string} serverName
 * @returns {boolean}
 */
export function hasNormalization(serverName) {
  return serverName in NORMALIZATION_CONFIG;
}
