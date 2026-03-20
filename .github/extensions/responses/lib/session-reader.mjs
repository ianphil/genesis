import Database from "better-sqlite3";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

export function getSessionStorePath() {
  return join(homedir(), ".copilot", "session-store.db");
}

function openDb() {
  const dbPath = getSessionStorePath();
  if (!existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

export function getSessionTurns(sessionId) {
  let db;
  try {
    db = openDb();
    if (!db) return [];
    const rows = db
      .prepare(
        "SELECT turn_index, user_message, assistant_response, timestamp FROM turns WHERE session_id = ? ORDER BY turn_index"
      )
      .all(sessionId);
    return rows.map((r) => ({
      turnIndex: r.turn_index,
      userMessage: r.user_message,
      assistantResponse: r.assistant_response,
      timestamp: r.timestamp,
    }));
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export function getSessionCheckpoints(sessionId) {
  let db;
  try {
    db = openDb();
    if (!db) return [];
    const rows = db
      .prepare(
        "SELECT checkpoint_number, title, overview, created_at FROM checkpoints WHERE session_id = ? ORDER BY checkpoint_number"
      )
      .all(sessionId);
    return rows.map((r) => ({
      number: r.checkpoint_number,
      title: r.title,
      overview: r.overview,
      timestamp: r.created_at,
    }));
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export function getSessionFiles(sessionId) {
  let db;
  try {
    db = openDb();
    if (!db) return [];
    const rows = db
      .prepare(
        "SELECT file_path, tool_name, first_seen_at FROM session_files WHERE session_id = ? ORDER BY first_seen_at"
      )
      .all(sessionId);
    return rows.map((r) => ({
      filePath: r.file_path,
      toolName: r.tool_name,
      timestamp: r.first_seen_at,
    }));
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

function truncate(text, max = 200) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) : text;
}

export function buildStatusItemsFromSession(sessionId) {
  const turns = getSessionTurns(sessionId);
  const checkpoints = getSessionCheckpoints(sessionId);
  const files = getSessionFiles(sessionId);

  const items = [];

  for (const t of turns) {
    if (t.turnIndex === 0) {
      items.push({
        title: "Processing Started",
        description: "Agent began processing.",
        timestamp: t.timestamp,
      });
    } else {
      items.push({
        title: `Turn ${t.turnIndex}`,
        description: truncate(t.assistantResponse),
        timestamp: t.timestamp,
        fullText: t.assistantResponse || null,
      });
    }
  }

  for (const cp of checkpoints) {
    items.push({
      title: `Checkpoint: ${cp.title}`,
      description: truncate(cp.overview),
      timestamp: cp.timestamp,
    });
  }

  for (const f of files) {
    const verb = f.toolName === "create" ? "Created" : "Edited";
    items.push({
      title: `File ${verb}: ${f.filePath}`,
      description: `${verb} via ${f.toolName}`,
      timestamp: f.timestamp,
    });
  }

  items.sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    return 0;
  });

  return items;
}
