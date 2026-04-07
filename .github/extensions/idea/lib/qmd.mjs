import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

let qmdModulePromise;

export function getDefaultDbPath() {
  const home = process.env.USERPROFILE || process.env.HOME || homedir();
  return join(home, ".cache", "qmd", "index.sqlite");
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
  return createStore({ dbPath: getDefaultDbPath() });
}

export const { extractSnippet, addLineNumbers } = await loadQmd();
