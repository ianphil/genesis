// Schema inference — infer TypeScript-like type descriptions from runtime values.
//
// Every call_tool invocation captures the response shape. Over time,
// schemas are merged to build a complete picture of each tool's output.

/**
 * Infer a schema object from a runtime value.
 * @param {any} value
 * @returns {object} JSON-Schema-like descriptor
 */
export function inferSchema(value) {
  if (value === null || value === undefined) {
    return { type: "null" };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: "array", items: {} };
    }
    // Infer from first element as representative
    const itemSchema = inferSchema(value[0]);
    return { type: "array", items: itemSchema };
  }

  switch (typeof value) {
    case "string":
      return { type: "string" };
    case "number":
      return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      const properties = {};
      const keys = Object.keys(value);
      for (const key of keys) {
        properties[key] = inferSchema(value[key]);
      }
      return {
        type: "object",
        properties,
        required: keys,
      };
    }
    default:
      return {};
  }
}

/**
 * Merge two schemas together. Fields present in either become optional
 * unless present in both with the same type.
 * @param {object} existing - Previously inferred schema
 * @param {object} incoming - Newly inferred schema
 * @returns {object} Merged schema
 */
export function mergeSchemas(existing, incoming) {
  if (!existing || Object.keys(existing).length === 0) return incoming;
  if (!incoming || Object.keys(incoming).length === 0) return existing;

  // Different top-level types — widen to anyOf
  if (existing.type !== incoming.type) {
    return { anyOf: [existing, incoming] };
  }

  // Both arrays — merge item schemas
  if (existing.type === "array" && incoming.type === "array") {
    return {
      type: "array",
      items: mergeSchemas(existing.items || {}, incoming.items || {}),
    };
  }

  // Both objects — merge properties
  if (existing.type === "object" && incoming.type === "object") {
    const allKeys = new Set([
      ...Object.keys(existing.properties || {}),
      ...Object.keys(incoming.properties || {}),
    ]);

    const existingRequired = new Set(existing.required || []);
    const incomingRequired = new Set(incoming.required || []);

    const properties = {};
    const required = [];

    for (const key of allKeys) {
      const eProp = existing.properties?.[key];
      const iProp = incoming.properties?.[key];

      if (eProp && iProp) {
        properties[key] = mergeSchemas(eProp, iProp);
        // Only required if present in both
        if (existingRequired.has(key) && incomingRequired.has(key)) {
          required.push(key);
        }
      } else {
        // Only in one — optional
        properties[key] = eProp || iProp;
      }
    }

    return { type: "object", properties, required };
  }

  // Same primitive type — keep as-is
  return existing;
}
