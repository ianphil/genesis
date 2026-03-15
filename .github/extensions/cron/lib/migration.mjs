// Migration — moves flat data/ layout to namespaced data/{agent}/ directories.
// Idempotent — safe to call every session.

import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";

/**
 * Migrate legacy flat data/{jobs,history,engine.lock,engine.log} into the
 * namespaced data/{agentName}/ directory. If the target already exists the
 * old copy is simply removed.
 *
 * Layout before:  data/jobs/*.json, data/history/*.json, data/engine.lock, data/engine.log
 * Layout after:   data/{agentName}/jobs/*.json, data/{agentName}/history/*.json, ...
 */
export function migrateLegacyData(extDir, agentName) {
  const dataDir = join(extDir, "data");
  const targetDir = join(dataDir, agentName);

  // Migrate directories (jobs, history)
  for (const dirName of ["jobs", "history"]) {
    const oldDir = join(dataDir, dirName);
    const newDir = join(targetDir, dirName);

    if (!existsSync(oldDir)) continue;

    // Check if old dir contains .json files (not just .gitkeep)
    let jsonFiles;
    try {
      jsonFiles = readdirSync(oldDir).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }

    if (jsonFiles.length === 0) continue;

    mkdirSync(newDir, { recursive: true });

    for (const file of jsonFiles) {
      const oldPath = join(oldDir, file);
      const newPath = join(newDir, file);

      try {
        if (existsSync(newPath)) {
          unlinkSync(oldPath);
        } else {
          renameSync(oldPath, newPath);
        }
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    }
  }

  // Migrate flat files (engine.lock, engine.log)
  for (const filename of ["engine.lock", "engine.log"]) {
    const oldPath = join(dataDir, filename);
    const newPath = join(targetDir, filename);

    if (!existsSync(oldPath)) continue;

    try {
      mkdirSync(targetDir, { recursive: true });
      if (existsSync(newPath)) {
        unlinkSync(oldPath);
      } else {
        renameSync(oldPath, newPath);
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
}
