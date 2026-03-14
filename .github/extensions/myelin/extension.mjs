import { createRequire as __createRequire } from "node:module";
if (!globalThis.require) { globalThis.require = __createRequire(import.meta.url); }
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// require-external:@github/copilot-sdk
var require_copilot_sdk = __commonJS({
  "require-external:@github/copilot-sdk"(exports, module) {
    module.exports = globalThis.require("@github/copilot-sdk");
  }
});

// require-external:@github/copilot-sdk/extension
var require_extension = __commonJS({
  "require-external:@github/copilot-sdk/extension"(exports, module) {
    module.exports = globalThis.require("@github/copilot-sdk/extension");
  }
});

// require-external:better-sqlite3
var require_better_sqlite3 = __commonJS({
  "require-external:better-sqlite3"(exports, module) {
    module.exports = globalThis.require("better-sqlite3");
  }
});

// require-external:@huggingface/transformers
var require_transformers = __commonJS({
  "require-external:@huggingface/transformers"(exports, module) {
    module.exports = globalThis.require("@huggingface/transformers");
  }
});

// src/extension/extension.in-process.ts
var import_copilot_sdk = __toESM(require_copilot_sdk(), 1);
var import_extension = __toESM(require_extension(), 1);
import { homedir as homedir3 } from "node:os";
import { join as join3 } from "node:path";
import { existsSync as existsSync2 } from "node:fs";

// src/memory/graph.ts
var import_better_sqlite3 = __toESM(require_better_sqlite3(), 1);

// src/memory/schema.ts
var SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    salience REAL DEFAULT 0.5,
    confidence REAL DEFAULT 1.0,
    source_agent TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    last_reinforced TEXT NOT NULL,
    pinned INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS edges (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    description TEXT DEFAULT '',
    source_agent TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    last_reinforced TEXT NOT NULL,
    PRIMARY KEY (source_id, target_id, relationship),
    FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS node_tags (
    node_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (node_id, tag),
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS properties (
    node_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (node_id, key),
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS node_fts USING fts5(
    name, description, content='nodes', content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
    INSERT INTO node_fts(rowid, name, description)
    VALUES (new.rowid, new.name, new.description);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
    INSERT INTO node_fts(node_fts, rowid, name, description)
    VALUES ('delete', old.rowid, old.name, old.description);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
    INSERT INTO node_fts(node_fts, rowid, name, description)
    VALUES ('delete', old.rowid, old.name, old.description);
    INSERT INTO node_fts(rowid, name, description)
    VALUES (new.rowid, new.name, new.description);
END;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_salience ON nodes(salience DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_source_agent ON nodes(source_agent);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_relationship ON edges(relationship);
CREATE INDEX IF NOT EXISTS idx_node_tags_tag ON node_tags(tag);
CREATE INDEX IF NOT EXISTS idx_nodes_pinned ON nodes(pinned) WHERE pinned = 1;
`;
var CODE_COLUMNS = [
  ["category", "TEXT DEFAULT 'knowledge'"],
  ["file_path", "TEXT"],
  ["line_start", "INTEGER"],
  ["line_end", "INTEGER"],
  ["ado_id", "INTEGER"],
  ["state", "TEXT"],
  ["iteration", "TEXT"],
  ["namespace", "TEXT DEFAULT 'unclassified'"]
];
var CODE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_nodes_category ON nodes(category)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_category_type ON nodes(category, type)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(file_path)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_ado_id ON nodes(ado_id)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_namespace ON nodes(namespace)"
];
var CODE_SCHEMA_EXTENSIONS = CODE_COLUMNS.map(
  ([name, typedef]) => `ALTER TABLE nodes ADD COLUMN ${name} ${typedef}`
);
var CLASSIFICATION_COLUMNS = {
  nodes: [
    ["sensitivity", "INTEGER DEFAULT 0"],
    ["sensitivity_reason", "TEXT"]
  ],
  edges: [
    ["sensitivity", "INTEGER DEFAULT 0"],
    ["sensitivity_reason", "TEXT"]
  ]
};
var CLASSIFICATION_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_nodes_sensitivity ON nodes(sensitivity)",
  "CREATE INDEX IF NOT EXISTS idx_edges_sensitivity ON edges(sensitivity)"
];
var PINNED_COLUMNS = [
  ["pinned", "INTEGER DEFAULT 0"]
];
var PINNED_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_nodes_pinned ON nodes(pinned) WHERE pinned = 1"
];
function initSchema(db) {
  db.exec(SCHEMA_SQL);
}
function extendSchemaForCode(db) {
  const existing = new Set(
    db.pragma("table_info(nodes)").map(
      (r) => r.name
    )
  );
  for (const [colName, colDef] of CODE_COLUMNS) {
    if (!existing.has(colName)) {
      db.exec(`ALTER TABLE nodes ADD COLUMN ${colName} ${colDef}`);
    }
  }
  for (const idx of CODE_INDEXES) {
    db.exec(idx);
  }
}
function extendSchemaForClassification(db) {
  const existingNodes = new Set(
    db.pragma("table_info(nodes)").map(
      (r) => r.name
    )
  );
  const existingEdges = new Set(
    db.pragma("table_info(edges)").map(
      (r) => r.name
    )
  );
  for (const [colName, colDef] of CLASSIFICATION_COLUMNS.nodes) {
    if (!existingNodes.has(colName)) {
      db.exec(`ALTER TABLE nodes ADD COLUMN ${colName} ${colDef}`);
    }
  }
  for (const [colName, colDef] of CLASSIFICATION_COLUMNS.edges) {
    if (!existingEdges.has(colName)) {
      db.exec(`ALTER TABLE edges ADD COLUMN ${colName} ${colDef}`);
    }
  }
  for (const idx of CLASSIFICATION_INDEXES) {
    db.exec(idx);
  }
}
function extendSchemaForPinned(db) {
  const existing = new Set(
    db.pragma("table_info(nodes)").map(
      (r) => r.name
    )
  );
  for (const [colName, colDef] of PINNED_COLUMNS) {
    if (!existing.has(colName)) {
      db.exec(`ALTER TABLE nodes ADD COLUMN ${colName} ${colDef}`);
    }
  }
  for (const idx of PINNED_INDEXES) {
    db.exec(idx);
  }
}

// src/memory/graph.ts
var NodeType = /* @__PURE__ */ ((NodeType2) => {
  NodeType2["Concept"] = "concept";
  NodeType2["Person"] = "person";
  NodeType2["Decision"] = "decision";
  NodeType2["Pattern"] = "pattern";
  NodeType2["Bug"] = "bug";
  NodeType2["Convention"] = "convention";
  NodeType2["Initiative"] = "initiative";
  NodeType2["Tool"] = "tool";
  NodeType2["Meeting"] = "meeting";
  NodeType2["Rule"] = "rule";
  return NodeType2;
})(NodeType || {});
var RelationshipType = /* @__PURE__ */ ((RelationshipType2) => {
  RelationshipType2["RelatesTo"] = "relates_to";
  RelationshipType2["DependsOn"] = "depends_on";
  RelationshipType2["Supersedes"] = "supersedes";
  RelationshipType2["LearnedFrom"] = "learned_from";
  RelationshipType2["BelongsTo"] = "belongs_to";
  RelationshipType2["AuthoredBy"] = "authored_by";
  RelationshipType2["BlockedBy"] = "blocked_by";
  RelationshipType2["MentionedIn"] = "mentioned_in";
  RelationshipType2["EvolvedInto"] = "evolved_into";
  RelationshipType2["ConflictsWith"] = "conflicts_with";
  return RelationshipType2;
})(RelationshipType || {});
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function nameToId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
function shortId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var KnowledgeGraph = class {
  /** Underlying database handle. Prefer class methods for most operations. */
  db;
  vecAvailable = false;
  constructor(dbPath = ":memory:") {
    this.db = new import_better_sqlite3.default(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    initSchema(this.db);
    extendSchemaForCode(this.db);
    extendSchemaForClassification(this.db);
    extendSchemaForPinned(this.db);
    this.initVecExtension();
  }
  // ── Schema helpers ───────────────────────────────────────────────────────
  /** Extend core schema with code-graph columns (idempotent). */
  extendForCode() {
    extendSchemaForCode(this.db);
  }
  /** Extend core schema with classification columns (idempotent). */
  extendForClassification() {
    extendSchemaForClassification(this.db);
  }
  initVecExtension() {
    try {
      let sqliteVec;
      try {
        sqliteVec = globalThis.require?.("sqlite-vec");
      } catch {
        try {
          const mod = globalThis.require?.("node:module");
          if (mod?.createRequire) {
            const req = mod.createRequire(import.meta.url);
            sqliteVec = req("sqlite-vec");
          }
        } catch {
        }
      }
      if (!sqliteVec) return;
      sqliteVec.load(this.db);
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS node_embeddings
        USING vec0(
            node_id TEXT PRIMARY KEY,
            embedding FLOAT[384]
        )
      `);
      this.vecAvailable = true;
    } catch {
    }
  }
  // ── Node Operations ──────────────────────────────────────────────────────
  addNode(node) {
    const now = isoNow();
    const id = node.id || nameToId(node.name) || shortId();
    const full = {
      id,
      type: node.type ?? "concept" /* Concept */,
      name: node.name,
      description: node.description ?? "",
      salience: node.salience ?? 0.5,
      confidence: node.confidence ?? 1,
      sourceAgent: node.sourceAgent ?? "",
      createdAt: node.createdAt ?? now,
      lastReinforced: node.lastReinforced ?? now,
      tags: node.tags ?? [],
      category: node.category,
      filePath: node.filePath,
      lineStart: node.lineStart,
      lineEnd: node.lineEnd,
      namespace: node.namespace,
      sensitivity: node.sensitivity,
      sensitivityReason: node.sensitivityReason,
      pinned: node.pinned
    };
    this.db.prepare(
      `INSERT INTO nodes (id, type, name, description, salience, confidence,
         source_agent, created_at, last_reinforced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      full.id,
      full.type,
      full.name,
      full.description,
      full.salience,
      full.confidence,
      full.sourceAgent,
      full.createdAt,
      full.lastReinforced
    );
    if (full.category || full.namespace || full.sensitivity !== void 0 || full.sensitivityReason || full.pinned) {
      try {
        const sets = [];
        const vals = [];
        if (full.category) {
          sets.push("category = ?");
          vals.push(full.category);
        }
        if (full.namespace) {
          sets.push("namespace = ?");
          vals.push(full.namespace);
        }
        if (full.sensitivity !== void 0) {
          sets.push("sensitivity = ?");
          vals.push(full.sensitivity);
        }
        if (full.sensitivityReason) {
          sets.push("sensitivity_reason = ?");
          vals.push(full.sensitivityReason);
        }
        if (full.pinned) {
          sets.push("pinned = ?");
          vals.push(1);
        }
        if (sets.length > 0) {
          vals.push(full.id);
          this.db.prepare(`UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
        }
      } catch {
      }
    }
    const tagStmt = this.db.prepare(
      "INSERT OR IGNORE INTO node_tags (node_id, tag) VALUES (?, ?)"
    );
    for (const tag of full.tags) {
      tagStmt.run(full.id, tag);
    }
    return full;
  }
  getNode(id) {
    const row = this.db.prepare("SELECT * FROM nodes WHERE id = ?").get(id);
    if (!row) return null;
    return this.rowToNode(row);
  }
  findNodes(filters = {}) {
    const {
      type,
      sourceAgent,
      tag,
      minSalience = 0,
      limit = 50,
      namespace,
      category,
      ceiling,
      pinned
    } = filters;
    let query = "SELECT DISTINCT n.* FROM nodes n";
    const conditions = ["n.salience >= ?"];
    const params = [minSalience];
    if (tag) {
      query += " JOIN node_tags nt ON n.id = nt.node_id";
      conditions.push("nt.tag = ?");
      params.push(tag);
    }
    if (type) {
      conditions.push("n.type = ?");
      params.push(type);
    }
    if (sourceAgent) {
      conditions.push("n.source_agent = ?");
      params.push(sourceAgent);
    }
    if (namespace) {
      conditions.push("n.namespace = ?");
      params.push(namespace);
    }
    if (category) {
      conditions.push("n.category = ?");
      params.push(category);
    }
    if (ceiling !== void 0) {
      conditions.push("(n.sensitivity IS NULL OR n.sensitivity <= ?)");
      params.push(ceiling);
    }
    if (pinned === true) {
      conditions.push("n.pinned = 1");
    } else if (pinned === false) {
      conditions.push("(n.pinned = 0 OR n.pinned IS NULL)");
    }
    query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY n.salience DESC LIMIT ?";
    params.push(limit);
    const rows = this.db.prepare(query).all(...params);
    return rows.map((r) => this.rowToNode(r));
  }
  searchNodes(query, limit = 20) {
    try {
      const rows2 = this.db.prepare(
        `SELECT n.* FROM nodes n
           JOIN node_fts fts ON n.rowid = fts.rowid
           WHERE node_fts MATCH ?
           ORDER BY rank
           LIMIT ?`
      ).all(query, limit);
      if (rows2.length > 0) {
        return rows2.map((r) => this.rowToNode(r));
      }
    } catch {
    }
    const like = `%${query}%`;
    const rows = this.db.prepare(
      `SELECT * FROM nodes
         WHERE name LIKE ? OR description LIKE ?
         ORDER BY salience DESC
         LIMIT ?`
    ).all(like, like, limit);
    return rows.map((r) => this.rowToNode(r));
  }
  updateNode(id, fields) {
    const allowed = {
      name: "name",
      description: "description",
      salience: "salience",
      confidence: "confidence",
      sourceAgent: "source_agent",
      lastReinforced: "last_reinforced",
      sensitivity: "sensitivity",
      sensitivityReason: "sensitivity_reason",
      pinned: "pinned"
    };
    const sets = [];
    const vals = [];
    for (const [jsKey, dbCol] of Object.entries(allowed)) {
      const val = fields[jsKey];
      if (val !== void 0) {
        sets.push(`${dbCol} = ?`);
        vals.push(jsKey === "pinned" ? val ? 1 : 0 : val);
      }
    }
    if (sets.length === 0) return false;
    vals.push(id);
    const result = this.db.prepare(`UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return result.changes > 0;
  }
  deleteNode(id) {
    const result = this.db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
    return result.changes > 0;
  }
  reinforceNode(id, boost = 0.1) {
    const now = isoNow();
    const row = this.db.prepare("SELECT salience FROM nodes WHERE id = ?").get(id);
    if (!row) return null;
    const newSalience = Math.min(1, row.salience + boost);
    this.db.prepare(
      "UPDATE nodes SET salience = ?, last_reinforced = ? WHERE id = ?"
    ).run(newSalience, now, id);
    return newSalience;
  }
  // ── Edge Operations ──────────────────────────────────────────────────────
  addEdge(edge) {
    const now = isoNow();
    const full = {
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      relationship: edge.relationship,
      weight: edge.weight ?? 1,
      description: edge.description ?? "",
      sourceAgent: edge.sourceAgent ?? "",
      createdAt: edge.createdAt ?? now,
      lastReinforced: edge.lastReinforced ?? now
    };
    this.db.prepare(
      `INSERT INTO edges (source_id, target_id, relationship, weight,
         description, source_agent, created_at, last_reinforced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      full.sourceId,
      full.targetId,
      full.relationship,
      full.weight,
      full.description,
      full.sourceAgent,
      full.createdAt,
      full.lastReinforced
    );
    return full;
  }
  getEdges(nodeId, direction = "both", relationship) {
    const edges = [];
    if (direction === "outgoing" || direction === "both") {
      let query = "SELECT * FROM edges WHERE source_id = ?";
      const params = [nodeId];
      if (relationship) {
        query += " AND relationship = ?";
        params.push(relationship);
      }
      const rows = this.db.prepare(query).all(...params);
      edges.push(...rows.map((r) => this.rowToEdge(r)));
    }
    if (direction === "incoming" || direction === "both") {
      let query = "SELECT * FROM edges WHERE target_id = ?";
      const params = [nodeId];
      if (relationship) {
        query += " AND relationship = ?";
        params.push(relationship);
      }
      const rows = this.db.prepare(query).all(...params);
      edges.push(...rows.map((r) => this.rowToEdge(r)));
    }
    return edges;
  }
  reinforceEdge(sourceId, targetId, relationship, boost = 0.1) {
    const now = isoNow();
    const result = this.db.prepare(
      `UPDATE edges SET weight = MIN(1.0, weight + ?), last_reinforced = ?
         WHERE source_id = ? AND target_id = ? AND relationship = ?`
    ).run(boost, now, sourceId, targetId, relationship);
    return result.changes > 0;
  }
  // ── Tag Operations ───────────────────────────────────────────────────────
  addTag(nodeId, tag) {
    this.db.prepare("INSERT OR IGNORE INTO node_tags (node_id, tag) VALUES (?, ?)").run(nodeId, tag);
  }
  getTags(nodeId) {
    const rows = this.db.prepare("SELECT tag FROM node_tags WHERE node_id = ?").all(nodeId);
    return rows.map((r) => r.tag);
  }
  // ── Property Operations ──────────────────────────────────────────────────
  setProperty(nodeId, key, value) {
    this.db.prepare(
      "INSERT OR REPLACE INTO properties (node_id, key, value) VALUES (?, ?, ?)"
    ).run(nodeId, key, value);
  }
  getProperty(nodeId, key) {
    const row = this.db.prepare("SELECT value FROM properties WHERE node_id = ? AND key = ?").get(nodeId, key);
    return row?.value ?? null;
  }
  getProperties(nodeId) {
    const rows = this.db.prepare("SELECT key, value FROM properties WHERE node_id = ?").all(nodeId);
    const result = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }
  // ── Subgraph Queries ─────────────────────────────────────────────────────
  querySubgraph(filters = {}) {
    const {
      agent,
      tag,
      minSalience = 0,
      depth = 1,
      limit = 50,
      ceiling,
      traversalMode = "skip"
    } = filters;
    const seedNodes = this.findNodes({
      sourceAgent: agent,
      tag,
      minSalience,
      limit,
      ceiling
    });
    const visited = /* @__PURE__ */ new Set();
    const visibleIds = /* @__PURE__ */ new Set();
    const nodes = [];
    for (const n of seedNodes) {
      visited.add(n.id);
      visibleIds.add(n.id);
      nodes.push(n);
    }
    for (let d = 0; d < depth; d++) {
      const frontier = /* @__PURE__ */ new Set();
      for (const nid of visited) {
        if (ceiling !== void 0 && traversalMode === "prune" && !visibleIds.has(nid)) {
          continue;
        }
        for (const e of this.getEdges(nid)) {
          frontier.add(e.sourceId);
          frontier.add(e.targetId);
        }
      }
      for (const nid of frontier) {
        if (!visited.has(nid)) {
          visited.add(nid);
          const node = this.getNode(nid);
          if (node && node.salience >= minSalience) {
            const nodeSensitivity = node.sensitivity ?? 0;
            if (ceiling === void 0 || nodeSensitivity <= ceiling) {
              visibleIds.add(nid);
              nodes.push(node);
            }
          }
        }
      }
    }
    const edges = [];
    for (const nid of visibleIds) {
      for (const e of this.getEdges(nid, "outgoing")) {
        if (visibleIds.has(e.targetId)) {
          edges.push(e);
        }
      }
    }
    nodes.sort((a, b) => b.salience - a.salience);
    return { nodes: nodes.slice(0, limit), edges };
  }
  // ── Homeostatic Operations ───────────────────────────────────────────────
  decayAll(decayRate = 0.05) {
    const now = Date.now();
    const rows = this.db.prepare(
      "SELECT id, salience, last_reinforced FROM nodes WHERE salience > 0 AND (pinned = 0 OR pinned IS NULL)"
    ).all();
    let count = 0;
    const updateStmt = this.db.prepare(
      "UPDATE nodes SET salience = ? WHERE id = ?"
    );
    for (const row of rows) {
      const lastReinforced = new Date(row.last_reinforced).getTime();
      const daysSince = (now - lastReinforced) / 864e5;
      const effectiveDecay = decayRate * Math.min(1, daysSince / 7);
      const newSalience = Math.max(0, row.salience - effectiveDecay);
      if (newSalience !== row.salience) {
        updateStmt.run(newSalience, row.id);
        count++;
      }
    }
    return count;
  }
  prune(minSalience = 0.05, minAgeDays = 30) {
    const cutoffMs = Date.now() - minAgeDays * 864e5;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const result = this.db.prepare(
      "DELETE FROM nodes WHERE salience < ? AND last_reinforced < ? AND (pinned = 0 OR pinned IS NULL)"
    ).run(minSalience, cutoffIso);
    return result.changes;
  }
  // ── Statistics ───────────────────────────────────────────────────────────
  stats() {
    const nodeCount = this.db.prepare("SELECT COUNT(*) as c FROM nodes").get().c;
    const edgeCount = this.db.prepare("SELECT COUNT(*) as c FROM edges").get().c;
    const tagCount = this.db.prepare("SELECT COUNT(DISTINCT tag) as c FROM node_tags").get().c;
    const typeDistribution = {};
    const typeDist = this.db.prepare("SELECT type, COUNT(*) as c FROM nodes GROUP BY type").all();
    for (const row of typeDist) {
      typeDistribution[row.type] = row.c;
    }
    const avgRow = this.db.prepare("SELECT AVG(salience) as a FROM nodes").get();
    const avgSalience = avgRow.a != null ? Math.round(avgRow.a * 1e3) / 1e3 : 0;
    return {
      nodeCount,
      edgeCount,
      tagCount,
      typeDistribution,
      avgSalience
    };
  }
  // ── Vector Embedding Operations ──────────────────────────────────────────
  hasVecTable() {
    const row = this.db.prepare(
      "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='node_embeddings'"
    ).get();
    return row.c > 0;
  }
  semanticSearch(queryEmbedding, limit = 20, category, namespace, ceiling) {
    if (!this.hasVecTable()) return [];
    try {
      const queryVec = new Float32Array(queryEmbedding).buffer;
      const extraConditions = [];
      const extraParams = [];
      const cols = new Set(
        this.db.pragma("table_info(nodes)").map(
          (r) => r.name
        )
      );
      if (category && cols.has("category")) {
        extraConditions.push("n.category = ?");
        extraParams.push(category);
      }
      if (namespace && cols.has("namespace")) {
        extraConditions.push("n.namespace = ?");
        extraParams.push(namespace);
      }
      if (ceiling !== void 0 && cols.has("sensitivity")) {
        extraConditions.push("(n.sensitivity IS NULL OR n.sensitivity <= ?)");
        extraParams.push(ceiling);
      }
      const whereExtra = extraConditions.length > 0 ? " AND " + extraConditions.join(" AND ") : "";
      const rows = this.db.prepare(
        `SELECT n.*, e.distance FROM nodes n
           JOIN node_embeddings e ON n.id = e.node_id
           WHERE e.embedding MATCH ? AND k = ?${whereExtra}
           ORDER BY e.distance`
      ).all(Buffer.from(queryVec), limit, ...extraParams);
      return rows.map((r) => ({ node: this.rowToNode(r), distance: r.distance }));
    } catch {
      return [];
    }
  }
  upsertEmbedding(nodeId, embedding) {
    if (!this.hasVecTable()) return;
    try {
      const vec = Buffer.from(new Float32Array(embedding).buffer);
      this.db.prepare("DELETE FROM node_embeddings WHERE node_id = ?").run(nodeId);
      this.db.prepare(
        "INSERT INTO node_embeddings (node_id, embedding) VALUES (?, ?)"
      ).run(nodeId, vec);
    } catch {
    }
  }
  hasEmbedding(nodeId) {
    if (!this.hasVecTable()) return false;
    const row = this.db.prepare(
      "SELECT COUNT(*) as c FROM node_embeddings WHERE node_id = ?"
    ).get(nodeId);
    return row.c > 0;
  }
  embeddingStats() {
    const totalNodes = this.db.prepare("SELECT COUNT(*) as c FROM nodes").get().c;
    if (!this.hasVecTable()) {
      return {
        totalNodes,
        embeddedNodes: 0,
        coveragePct: 0,
        vecAvailable: false
      };
    }
    const embeddedNodes = this.db.prepare("SELECT COUNT(*) as c FROM node_embeddings").get().c;
    const coveragePct = totalNodes > 0 ? Math.round(embeddedNodes / totalNodes * 1e3) / 10 : 0;
    return {
      totalNodes,
      embeddedNodes,
      coveragePct,
      vecAvailable: true
    };
  }
  // ── Lifecycle ────────────────────────────────────────────────────────────
  close() {
    this.db.close();
  }
  // ── Internal helpers ─────────────────────────────────────────────────────
  rowToNode(row) {
    const tags = this.getTags(row.id);
    return {
      id: row.id,
      type: Object.values(NodeType).includes(row.type) ? row.type : row.type,
      name: row.name,
      description: row.description,
      salience: row.salience,
      confidence: row.confidence,
      sourceAgent: row.source_agent,
      createdAt: row.created_at,
      lastReinforced: row.last_reinforced,
      tags,
      category: row.category ?? void 0,
      filePath: row.file_path ?? void 0,
      lineStart: row.line_start ?? void 0,
      lineEnd: row.line_end ?? void 0,
      namespace: row.namespace ?? void 0,
      sensitivity: row.sensitivity ?? void 0,
      sensitivityReason: row.sensitivity_reason ?? void 0,
      pinned: row.pinned === 1 ? true : void 0
    };
  }
  rowToEdge(row) {
    return {
      sourceId: row.source_id,
      targetId: row.target_id,
      relationship: Object.values(RelationshipType).includes(
        row.relationship
      ) ? row.relationship : row.relationship,
      weight: row.weight,
      description: row.description,
      sourceAgent: row.source_agent,
      createdAt: row.created_at,
      lastReinforced: row.last_reinforced
    };
  }
};

// src/memory/agents.ts
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";

// src/memory/structured-log.ts
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var COPILOT_ROOT = join(homedir(), ".copilot");
var AGENT_LOGS_DIR = join(COPILOT_ROOT, ".working-memory", "agents");
function writeLogEntry(agentName, entryType, summary, options = {}) {
  const logDir = join(AGENT_LOGS_DIR, agentName);
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, "log.jsonl");
  const entry = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    agent: agentName,
    type: entryType,
    summary,
    detail: options.detail ?? "",
    sessionId: options.sessionId ?? "",
    tags: options.tags ?? [],
    context: options.context ?? {}
  };
  appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8");
  return logFile;
}

// src/memory/agents.ts
var COPILOT_ROOT2 = join2(homedir2(), ".copilot");
var AGENTS_DIR = join2(COPILOT_ROOT2, "agents");
var AGENT_LOGS_DIR2 = join2(COPILOT_ROOT2, ".working-memory", "agents");
var DEFAULT_DB = join2(COPILOT_ROOT2, ".working-memory", "graph.db");
function resolveAgent() {
  const envName = process.env.COPILOT_AGENT_NAME || process.env.AGENT_NAME;
  if (envName) return envName.toLowerCase();
  const cwd = process.cwd();
  const cwdMatch = cwd.match(/myelin-(\w+)\d*$/i);
  if (cwdMatch) return cwdMatch[1].toLowerCase();
  return null;
}
function getBootContext(agentName, options = {}) {
  const dbPath = options.dbPath ?? DEFAULT_DB;
  const minSalience = options.minSalience ?? 0.3;
  const limit = options.limit ?? 30;
  const resolvedAgent = agentName || null;
  const graph = new KnowledgeGraph(dbPath);
  try {
    const pinnedNodes = graph.findNodes({ pinned: true, limit: 100 });
    const pinnedIds = new Set(pinnedNodes.map((n) => n.id));
    let allNodes;
    if (resolvedAgent) {
      const ownNodes = graph.findNodes({
        sourceAgent: resolvedAgent,
        minSalience,
        limit,
        ceiling: 1
      });
      const taggedNodes = graph.findNodes({
        tag: resolvedAgent,
        minSalience,
        limit,
        ceiling: 1
      });
      const seen = /* @__PURE__ */ new Set();
      allNodes = [];
      for (const node of [...ownNodes, ...taggedNodes]) {
        if (!seen.has(node.id)) {
          seen.add(node.id);
          allNodes.push(node);
        }
      }
    } else {
      allNodes = graph.findNodes({
        minSalience: Math.max(minSalience, 0.5),
        limit,
        ceiling: 1
      });
    }
    const seenIds = new Set(allNodes.map((n) => n.id));
    for (const pn of pinnedNodes) {
      if (!seenIds.has(pn.id)) {
        seenIds.add(pn.id);
        allNodes.push(pn);
      }
    }
    allNodes.sort((a, b) => b.salience - a.salience);
    const nodes = allNodes.slice(0, limit);
    const label = resolvedAgent ?? "generic";
    if (nodes.length === 0 && pinnedNodes.length === 0) {
      const stats2 = graph.stats();
      if (stats2.nodeCount === 0) {
        return `# Graph Briefing \u2014 ${label}

No graph nodes found yet. The graph will populate as consolidation cycles run.
`;
      }
      return `# Graph Briefing \u2014 ${label}

No matching nodes above salience threshold. Graph has ${stats2.nodeCount} nodes total.
`;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace("T", " ") + " UTC";
    const lines = [
      `# Graph Briefing \u2014 ${label}`,
      `_Generated ${now}_`,
      `_${nodes.length} nodes, sorted by salience_`,
      ""
    ];
    const pinnedInResults = nodes.filter((n) => pinnedIds.has(n.id));
    if (pinnedInResults.length > 0) {
      lines.push("## \u{1F4CC} Pinned");
      for (const node of pinnedInResults) {
        lines.push(
          `- **${node.name}** (${node.salience.toFixed(2)}): ${node.description.slice(0, 120)}`
        );
        const edges = graph.getEdges(node.id, "outgoing");
        for (const edge of edges.slice(0, 3)) {
          const target = graph.getNode(edge.targetId);
          if (target) {
            lines.push(`  \u2192 ${edge.relationship}: ${target.name}`);
          }
        }
      }
      lines.push("");
    }
    const byType = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      if (pinnedIds.has(node.id)) continue;
      const list = byType.get(node.type) ?? [];
      list.push(node);
      byType.set(node.type, list);
    }
    for (const [nodeType, typeNodes] of [...byType.entries()].sort()) {
      const title = nodeType.charAt(0).toUpperCase() + nodeType.slice(1) + "s";
      lines.push(`## ${title}`);
      for (const node of typeNodes) {
        const marker = node.salience >= 0.8 ? "\u{1F534}" : node.salience >= 0.5 ? "\u{1F7E1}" : "\u26AA";
        lines.push(
          `- ${marker} **${node.name}** (${node.salience.toFixed(2)}): ${node.description.slice(0, 120)}`
        );
        const edges = graph.getEdges(node.id, "outgoing");
        for (const edge of edges.slice(0, 3)) {
          const target = graph.getNode(edge.targetId);
          if (target) {
            lines.push(`  \u2192 ${edge.relationship}: ${target.name}`);
          }
        }
      }
      lines.push("");
    }
    const stats = graph.stats();
    lines.push("---");
    lines.push(
      `_Graph total: ${stats.nodeCount} nodes, ${stats.edgeCount} edges, avg salience ${stats.avgSalience}_`
    );
    return lines.join("\n");
  } finally {
    graph.close();
  }
}
function appendStructuredLog(agentName, entryType, summary, options = {}) {
  return writeLogEntry(agentName, entryType, summary, options);
}

// src/memory/embeddings.ts
var MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
var _pipeline = null;
var _loadFailed = false;
async function getPipeline() {
  if (_pipeline !== null) return _pipeline;
  if (_loadFailed) return null;
  try {
    const { pipeline } = await Promise.resolve().then(() => __toESM(require_transformers(), 1));
    _pipeline = await pipeline("feature-extraction", MODEL_NAME);
    return _pipeline;
  } catch {
    _loadFailed = true;
    return null;
  }
}
async function getEmbedding(text) {
  const pipe = await getPipeline();
  if (!pipe) return [];
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

// src/extension/extension.in-process.ts
var WORKING_MEMORY = join3(homedir3(), ".copilot", ".working-memory");
var DB_PATH = join3(WORKING_MEMORY, "graph.db");
var MYELIN_VERSION = "0.3.1";
var sessionAgent = null;
function getGraph() {
  if (!existsSync2(DB_PATH)) return null;
  return new KnowledgeGraph(DB_PATH);
}
var STOPWORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "must",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "she",
  "it",
  "they",
  "them",
  "their",
  "this",
  "that",
  "these",
  "those",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "into",
  "about",
  "between",
  "through",
  "after",
  "before",
  "above",
  "and",
  "or",
  "but",
  "not",
  "no",
  "nor",
  "so",
  "if",
  "then",
  "than",
  "what",
  "which",
  "who",
  "whom",
  "how",
  "when",
  "where",
  "why",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "some",
  "any",
  "just",
  "also",
  "very",
  "too",
  "only",
  "still",
  "already",
  "even",
  "here",
  "there",
  "up",
  "out",
  "over",
  "now",
  "get",
  "make",
  "like",
  "know",
  "think",
  "see",
  "come",
  "go",
  "want",
  "use",
  "find",
  "tell"
]);
function extractKeywords(prompt) {
  return prompt.toLowerCase().replace(/[^\w\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)).slice(0, 8);
}
var session = await (0, import_extension.joinSession)({
  onPermissionRequest: import_copilot_sdk.approveAll,
  hooks: {
    onSessionStart: async (_input, _invocation) => {
      try {
        await session.log(`Myelin v${MYELIN_VERSION} loaded \u2014 5 tools, 4 hooks`);
        if (!existsSync2(DB_PATH)) {
          await session.log("No graph database found. Run `myelin init` to create one.", { level: "warning" });
          return;
        }
        const detectedAgent = resolveAgent();
        if (detectedAgent) {
          sessionAgent = detectedAgent;
        }
        let briefing;
        try {
          briefing = getBootContext(detectedAgent, { dbPath: DB_PATH });
        } catch (bootErr) {
          await session.log(`Graph boot failed: ${bootErr.message}`, { level: "warning" });
          briefing = "";
        }
        const contextParts = [];
        if (briefing) {
          contextParts.push(briefing);
        }
        contextParts.push(
          "",
          "## Myelin Tools Available",
          "You have access to a persistent knowledge graph via Myelin tools:",
          "- **myelin_query** \u2014 Semantic search across graph nodes",
          "- **myelin_boot** \u2014 Load deeper agent-specific context (call with your agent name for richer results)",
          "- **myelin_log** \u2014 Record decisions, findings, actions, and observations during your session",
          "- **myelin_show** \u2014 Inspect a specific node and its connections",
          "- **myelin_stats** \u2014 Show graph statistics"
        );
        const healthGraph = getGraph();
        if (healthGraph) {
          try {
            const healthStats = healthGraph.stats();
            if (healthStats.nodeCount === 0) {
              contextParts.push("", "\u{1F4A1} Graph is empty \u2014 run `myelin parse ./your-repo` to index code");
            } else {
              const embStats = healthGraph.embeddingStats();
              if (!embStats.vecAvailable || embStats.embeddedNodes === 0) {
                contextParts.push("", "\u{1F4A1} No embeddings \u2014 run `myelin embed` for semantic search");
              }
            }
          } catch {
          } finally {
            healthGraph.close();
          }
        }
        await session.log(
          `Auto-boot complete: agent=${detectedAgent ?? "generic"}, context injected`
        );
        return {
          additionalContext: contextParts.join("\n")
        };
      } catch (e) {
        await session.log(`Myelin boot error: ${e.message}`, { level: "error" });
      }
    },
    onUserPromptSubmitted: async (input, _invocation) => {
      try {
        const graph = getGraph();
        if (!graph) return;
        try {
          let context = null;
          let searchMethod = "semantic";
          try {
            const queryEmbedding = await getEmbedding(input.prompt);
            if (queryEmbedding.length > 0) {
              const results = graph.semanticSearch(queryEmbedding, 5, "knowledge", void 0, 2);
              const relevant = results.filter((r) => r.distance < 1.2);
              if (relevant.length > 0) {
                context = relevant.map((r) => `- **${r.node.name}** (${r.node.type}): ${r.node.description?.slice(0, 150)}`).join("\n");
              }
            }
          } catch {
          }
          if (!context) {
            const keywords = extractKeywords(input.prompt);
            if (keywords.length > 0) {
              const ftsQuery = keywords.join(" OR ");
              const nodes = graph.searchNodes(ftsQuery, 10).filter((n) => (n.sensitivity ?? 0) <= 2).slice(0, 5);
              if (nodes.length > 0) {
                searchMethod = "keyword";
                context = nodes.map((n) => `- **${n.name}** (${n.type}): ${n.description?.slice(0, 150)}`).join("\n");
              }
            }
          }
          if (!context) return;
          await session.log(`Myelin context injected (${searchMethod} search)`);
          return {
            additionalContext: `## Relevant Graph Context (Myelin)
${context}`
          };
        } finally {
          graph.close();
        }
      } catch {
      }
    },
    onSessionEnd: async (input, _invocation) => {
      try {
        const agent = sessionAgent || resolveAgent() || "default";
        const summary = input.finalMessage ? input.finalMessage.slice(0, 200) : "Session ended (no final message)";
        appendStructuredLog(agent, "handover", summary, {
          tags: ["auto-session-end"]
        });
      } catch {
      }
    },
    onErrorOccurred: async (input, _invocation) => {
      if (input.recoverable && input.errorContext === "model_call") {
        return { errorHandling: "retry", retryCount: 2 };
      }
    }
  },
  tools: [
    {
      name: "myelin_query",
      description: "Search the knowledge graph semantically. Finds nodes by meaning, not just keywords.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search query" },
          limit: { type: "number", description: "Max results (default: 10)" },
          ceiling: { type: "number", description: "Max sensitivity level 0-3 (default: 1). Filters out nodes above this level." }
        },
        required: ["query"]
      },
      handler: async (args) => {
        const graph = getGraph();
        if (!graph) return "No graph database found. Run `myelin init` first.";
        try {
          const limit = args.limit || 10;
          const ceiling = args.ceiling ?? 1;
          const queryEmbedding = await getEmbedding(args.query);
          if (queryEmbedding.length > 0) {
            const results = graph.semanticSearch(queryEmbedding, limit, void 0, void 0, ceiling);
            if (results.length > 0) {
              const lines2 = results.map(
                (r) => `[${r.distance.toFixed(3)}] ${r.node.type} | ${r.node.name} (${r.node.salience.toFixed(2)}) \u2014 ${r.node.description?.slice(0, 100)}`
              );
              return `Semantic search: '${args.query}' (ceiling=${ceiling})
${lines2.join("\n")}`;
            }
          }
          const nodes = graph.searchNodes(args.query, limit * 2).filter((n) => (n.sensitivity ?? 0) <= ceiling).slice(0, limit);
          if (nodes.length === 0) return `No results for '${args.query}'`;
          const lines = nodes.map(
            (n) => `${n.type} | ${n.name} (${n.salience.toFixed(2)}) \u2014 ${n.description?.slice(0, 100)}`
          );
          return `FTS5 search: '${args.query}' (ceiling=${ceiling})
${lines.join("\n")}`;
        } catch (e) {
          await session.log(`myelin_query error: ${e.message}`, { level: "error" });
          return `Error: ${e.message}`;
        } finally {
          graph.close();
        }
      }
    },
    {
      name: "myelin_boot",
      description: "Load domain-specific knowledge from the graph for a named agent.",
      parameters: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Your agent name \u2014 used to load agent-specific graph context" }
        },
        required: ["agent"]
      },
      handler: async (args) => {
        try {
          sessionAgent = args.agent;
          return getBootContext(args.agent, { dbPath: DB_PATH });
        } catch (e) {
          return `Error: ${e.message}`;
        }
      }
    },
    {
      name: "myelin_log",
      description: "Log a structured event to an agent's knowledge log.",
      parameters: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Agent name" },
          type: {
            type: "string",
            description: "Event type",
            enum: ["decision", "action", "finding", "error", "handover", "observation"]
          },
          summary: { type: "string", description: "One-line summary" },
          detail: { type: "string", description: "Extended detail or context for richer log entries" },
          tags: { type: "string", description: "Comma-separated tags" },
          sensitivity: { type: "number", description: "Sensitivity level 0-3 (default: 0). Controls visibility during consolidation." },
          sensitivity_reason: { type: "string", description: "Why this entry has elevated sensitivity (e.g., 'contains credentials', 'internal architecture')" }
        },
        required: ["agent", "type", "summary"]
      },
      handler: async (args) => {
        try {
          const tags = args.tags ? args.tags.split(",").map((t) => t.trim()) : void 0;
          const context = {};
          if (args.sensitivity !== void 0) context.sensitivity = args.sensitivity;
          if (args.sensitivity_reason) context.sensitivityReason = args.sensitivity_reason;
          appendStructuredLog(args.agent, args.type, args.summary, {
            tags,
            detail: args.detail,
            context: Object.keys(context).length > 0 ? context : void 0
          });
          return `\u2705 ${args.agent}: ${args.summary}`;
        } catch (e) {
          return `Error: ${e.message}`;
        }
      }
    },
    {
      name: "myelin_show",
      description: "Show a knowledge graph node and its connections.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Node name or partial name" }
        },
        required: ["name"]
      },
      handler: async (args) => {
        const graph = getGraph();
        if (!graph) return "No graph database found.";
        try {
          const nodes = graph.searchNodes(args.name, 1);
          if (nodes.length === 0) return `No node matching '${args.name}'`;
          const node = nodes[0];
          const edges = graph.getEdges(node.id);
          const tags = graph.getTags(node.id);
          let result = `${node.type} | ${node.name}
`;
          result += `Salience: ${node.salience.toFixed(2)} | Agent: ${node.sourceAgent}
`;
          result += `Description: ${node.description}
`;
          if (tags.length > 0) result += `Tags: ${tags.join(", ")}
`;
          if (edges.length > 0) {
            result += `
Connections (${edges.length}):
`;
            for (const e of edges) {
              const target = e.sourceId === node.id ? e.targetId : e.sourceId;
              const dir = e.sourceId === node.id ? "\u2192" : "\u2190";
              const other = graph.getNode(target);
              result += `  ${dir} ${e.relationship}: ${other?.name ?? target}
`;
            }
          }
          return result;
        } finally {
          graph.close();
        }
      }
    },
    {
      name: "myelin_stats",
      description: "Show knowledge graph statistics.",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        const graph = getGraph();
        if (!graph) return "No graph database found.";
        try {
          const stats = graph.stats();
          const embStats = graph.embeddingStats();
          return [
            `Nodes: ${stats.nodeCount}`,
            `Edges: ${stats.edgeCount}`,
            `Avg salience: ${stats.avgSalience}`,
            `Embedded: ${embStats.embeddedNodes}/${embStats.totalNodes} (${embStats.coveragePct.toFixed(1)}%)`,
            `Type distribution:`,
            ...Object.entries(stats.typeDistribution).map(([t, c]) => `  ${t}: ${c}`)
          ].join("\n");
        } finally {
          graph.close();
        }
      }
    }
  ]
});
