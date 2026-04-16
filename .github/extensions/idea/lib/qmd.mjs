import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const IDEA_FOLDERS = ["domains", "initiatives", "expertise", "inbox"];

let qmdModulePromise;

export function getRepoRoot() {
  // Extension lives at .github/extensions/idea/lib/qmd.mjs — 4 levels up.
  const thisFile = fileURLToPath(import.meta.url);
  const root = resolve(dirname(thisFile), "..", "..", "..", "..");

  // Validate: the expected extension path should exist under root.
  const probe = join(root, ".github", "extensions", "idea");
  if (!existsSync(probe)) {
    throw new Error(
      `IDEA: derived repo root "${root}" looks wrong — expected ${probe} to exist.`,
    );
  }

  return root;
}

export function getAgentDbPath(repoRoot) {
  const home = process.env.USERPROFILE || process.env.HOME || homedir();
  const name = basename(repoRoot);
  const hash = createHash("sha256").update(resolve(repoRoot)).digest("hex").slice(0, 8);
  const dir = join(home, ".cache", "qmd", `${name}-${hash}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, "index.sqlite");
}

export function discoverCollections(repoRoot) {
  const collections = {};
  for (const folder of IDEA_FOLDERS) {
    const folderPath = join(repoRoot, folder);
    if (existsSync(folderPath)) {
      collections[folder] = { path: folderPath, pattern: "**/*.md" };
    }
  }

  if (Object.keys(collections).length === 0) {
    throw new Error(
      `IDEA: no collections found under "${repoRoot}". ` +
      `Expected at least one of: ${IDEA_FOLDERS.join(", ")}`,
    );
  }

  return { collections };
}

export async function loadQmd() {
  if (!qmdModulePromise) {
    qmdModulePromise = (async () => {
      // 1. QMD_PATH env var override (escape hatch)
      if (process.env.QMD_PATH) {
        try {
          const { pathToFileURL } = await import("node:url");
          return await import(pathToFileURL(process.env.QMD_PATH).href);
        } catch {
          // Fall through to local node_modules.
        }
      }

      // 2. Extension-local node_modules (installed by npm)
      try {
        const extDir = dirname(dirname(fileURLToPath(import.meta.url)));
        const localPath = join(extDir, "node_modules", "@tobilu", "qmd", "dist", "index.js");
        const { pathToFileURL } = await import("node:url");
        return await import(pathToFileURL(localPath).href);
      } catch {
        // Fall through to bare specifier.
      }

      // 3. Bare specifier (works if global install is resolvable)
      try {
        return await import("@tobilu/qmd");
      } catch {
        throw new Error(
          "Cannot find @tobilu/qmd. Run `npm install` in the idea extension directory, "
          + "or set QMD_PATH to the QMD index.js path.",
        );
      }
    })();
  }

  return qmdModulePromise;
}

export async function openStore() {
  const { createStore } = await loadQmd();
  const repoRoot = getRepoRoot();
  const dbPath = getAgentDbPath(repoRoot);
  const config = discoverCollections(repoRoot);
  return createStore({ dbPath, config });
}

export const { extractSnippet, addLineNumbers } = await loadQmd();
