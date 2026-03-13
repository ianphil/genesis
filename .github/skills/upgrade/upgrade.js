#!/usr/bin/env node
// upgrade.js — Deterministic upgrade script for genesis-based agents.
// Zero dependencies. Requires: Node.js 18+, gh CLI authenticated.
//
// Usage:
//   node upgrade.js check              — compare local vs remote registry
//   node upgrade.js install name1,name2 — install/update selected items
//   node upgrade.js remove name1,name2  — remove selected items from local
//   node upgrade.js pin name1,name2     — pin items to prevent removal

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── Helpers ──────────────────────────────────────────────────────────────────

function gh(apiPath) {
  const raw = execSync(`gh api ${apiPath}`, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function ghBlob(owner, repo, sha) {
  const blob = gh(`/repos/${owner}/${repo}/git/blobs/${sha}`);
  return Buffer.from(blob.content, "base64");
}

function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function findRepoRoot() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".github", "registry.json"))) return dir;
    dir = path.dirname(dir);
  }
  // Fallback: cwd
  return process.cwd();
}

function readLocalRegistry(root) {
  const p = path.join(root, ".github", "registry.json");
  if (!fs.existsSync(p)) {
    return { version: "0.0.0", source: "", extensions: {}, skills: {} };
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeLocalRegistry(root, registry) {
  const p = path.join(root, ".github", "registry.json");
  fs.writeFileSync(p, JSON.stringify(registry, null, 2) + "\n", "utf8");
}

function parseSource(source) {
  const parts = source.split("/");
  return { owner: parts[0], repo: parts[1] };
}

// ── Pure logic (testable) ────────────────────────────────────────────────────

function diffRegistries(local, remote) {
  const result = {
    source: local.source,
    remoteVersion: remote.version,
    localVersion: local.version,
    new: [],
    updated: [],
    current: [],
    renamed: [],
    removed: [],
    localOnly: [],
  };

  // Build rename lookup: oldName → newName, newName → oldName
  const renames = remote.renames || {};
  const reverseRenames = {};
  for (const [oldName, newName] of Object.entries(renames)) {
    reverseRenames[newName] = oldName;
  }

  // Compare both extensions and skills
  for (const type of ["extensions", "skills"]) {
    const remoteItems = remote[type] || {};
    const localItems = local[type] || {};
    const typeSingular = type === "extensions" ? "extension" : "skill";

    for (const [name, info] of Object.entries(remoteItems)) {
      const item = {
        name,
        type: typeSingular,
        version: info.version,
        path: info.path,
        description: info.description,
      };

      if (name in localItems) {
        // Direct match — normal version comparison
        if (compareSemver(info.version, localItems[name].version) > 0) {
          result.updated.push({
            ...item,
            localVersion: localItems[name].version,
          });
        } else {
          result.current.push(item);
        }
      } else {
        // Not installed under this name — check if it's a rename
        const oldName = reverseRenames[name];
        if (oldName && oldName in localItems) {
          result.renamed.push({
            oldName,
            newName: name,
            type: typeSingular,
            version: info.version,
            localVersion: localItems[oldName].version,
            description: info.description,
          });
        } else {
          result.new.push(item);
        }
      }
    }

    for (const [name, info] of Object.entries(localItems)) {
      if (!(name in remoteItems)) {
        // Skip if this is the old name of a rename (already reported above)
        if (name in renames) continue;

        const item = {
          name,
          type: typeSingular,
          version: info.version,
          path: info.path,
          description: info.description,
        };

        // Pinned items go to localOnly; unpinned go to removed
        if (info.local) {
          result.localOnly.push(item);
        } else {
          result.removed.push(item);
        }
      }
    }
  }

  return result;
}

// ── Check command ────────────────────────────────────────────────────────────

function check() {
  const root = findRepoRoot();
  const local = readLocalRegistry(root);

  if (!local.source) {
    console.error(
      JSON.stringify({ error: "No source configured in .github/registry.json" })
    );
    process.exit(1);
  }

  const { owner, repo } = parseSource(local.source);
  const branch = local.branch || "main";

  // Fetch remote registry
  const remoteRaw = gh(
    `/repos/${owner}/${repo}/contents/.github/registry.json?ref=${branch}`
  );
  const remote = JSON.parse(
    Buffer.from(remoteRaw.content, "base64").toString("utf8")
  );

  const result = diffRegistries(local, remote);
  console.log(JSON.stringify(result, null, 2));
}

// ── Install command ──────────────────────────────────────────────────────────

function install(names) {
  const root = findRepoRoot();
  const local = readLocalRegistry(root);
  const { owner, repo } = parseSource(local.source);
  const branch = local.branch || "main";

  // Fetch remote registry
  const remoteRaw = gh(
    `/repos/${owner}/${repo}/contents/.github/registry.json?ref=${branch}`
  );
  const remote = JSON.parse(
    Buffer.from(remoteRaw.content, "base64").toString("utf8")
  );

  // Fetch full tree once
  const tree = gh(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  const treeMap = new Map();
  for (const entry of tree.tree) {
    if (entry.type === "blob") {
      treeMap.set(entry.path, entry.sha);
    }
  }

  const result = {
    installed: [],
    updated: [],
    errors: [],
    registryUpdated: false,
  };

  const requestedNames = new Set(names);

  // Build rename lookup and resolve old names to new names
  const renames = remote.renames || {};
  const reverseRenames = {};
  for (const [oldName, newName] of Object.entries(renames)) {
    reverseRenames[newName] = oldName;
    if (requestedNames.has(oldName)) {
      requestedNames.delete(oldName);
      requestedNames.add(newName);
    }
  }

  for (const type of ["extensions", "skills"]) {
    const remoteItems = remote[type] || {};
    const localItems = local[type] || {};

    for (const [name, info] of Object.entries(remoteItems)) {
      if (!requestedNames.has(name)) continue;

      const isNew = !(name in localItems);
      const itemPath = info.path; // e.g. ".github/extensions/cron"

      try {
        // Find all files under this item's path in the tree
        const prefix = itemPath.endsWith("/") ? itemPath : itemPath + "/";
        const files = [];
        for (const [filePath, sha] of treeMap) {
          if (filePath.startsWith(prefix) || filePath === itemPath) {
            files.push({ path: filePath, sha });
          }
        }

        if (files.length === 0) {
          result.errors.push({
            name,
            error: `No files found in tree under ${itemPath}`,
          });
          continue;
        }

        // Download and write each file
        let fileCount = 0;
        for (const file of files) {
          const content = ghBlob(owner, repo, file.sha);
          const localPath = path.join(root, file.path);
          const dir = path.dirname(localPath);

          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(localPath, content);
          fileCount++;
        }

        // Run npm install if package.json exists
        const pkgPath = path.join(root, itemPath, "package.json");
        let npmInstalled = false;
        if (fs.existsSync(pkgPath)) {
          try {
            execSync("npm install --production", {
              cwd: path.join(root, itemPath),
              encoding: "utf8",
              stdio: "pipe",
            });
            npmInstalled = true;
          } catch (e) {
            result.errors.push({
              name,
              error: `npm install failed: ${e.message.slice(0, 200)}`,
            });
          }
        }

        // Update local registry
        if (!local[type]) local[type] = {};
        local[type][name] = {
          version: info.version,
          path: info.path,
          description: info.description,
        };

        const entry = {
          name,
          type: type === "extensions" ? "extension" : "skill",
          version: info.version,
          files: fileCount,
          npmInstalled,
        };

        // Handle rename — clean up old directory and registry entry
        const oldName = reverseRenames[name];
        if (oldName) {
          for (const t of ["extensions", "skills"]) {
            if (local[t] && local[t][oldName]) {
              const oldDir = path.join(root, local[t][oldName].path);
              if (fs.existsSync(oldDir)) {
                fs.rmSync(oldDir, { recursive: true, force: true });
              }
              delete local[t][oldName];
              break;
            }
          }
          entry.renamedFrom = oldName;
        }

        if (isNew) {
          result.installed.push(entry);
        } else {
          result.updated.push({
            ...entry,
            from: localItems[name].version,
          });
        }
      } catch (e) {
        result.errors.push({
          name,
          error: e.message.slice(0, 300),
        });
      }
    }
  }

  // Update registry version and write
  if (result.installed.length > 0 || result.updated.length > 0) {
    local.version = remote.version;
    writeLocalRegistry(root, local);
    result.registryUpdated = true;
  }

  console.log(JSON.stringify(result, null, 2));
}

// ── Remove command ───────────────────────────────────────────────────────────

function remove(names, root) {
  root = root || findRepoRoot();
  const local = readLocalRegistry(root);

  const result = {
    removed: [],
    errors: [],
    registryUpdated: false,
  };

  for (const name of names) {
    let found = false;

    for (const type of ["extensions", "skills"]) {
      const items = local[type] || {};
      if (!(name in items)) continue;

      found = true;
      const info = items[name];
      const itemDir = path.join(root, info.path);

      try {
        if (fs.existsSync(itemDir)) {
          fs.rmSync(itemDir, { recursive: true, force: true });
        }

        delete local[type][name];

        result.removed.push({
          name,
          type: type === "extensions" ? "extension" : "skill",
          version: info.version,
          path: info.path,
        });
      } catch (e) {
        result.errors.push({
          name,
          error: e.message.slice(0, 300),
        });
      }
      break;
    }

    if (!found) {
      result.errors.push({
        name,
        error: "Not found in local registry (extensions or skills)",
      });
    }
  }

  if (result.removed.length > 0) {
    writeLocalRegistry(root, local);
    result.registryUpdated = true;
  }

  return result;
}

// ── Pin command ──────────────────────────────────────────────────────────────

function pin(names, root) {
  root = root || findRepoRoot();
  const local = readLocalRegistry(root);

  const result = {
    pinned: [],
    errors: [],
  };

  for (const name of names) {
    let found = false;

    for (const type of ["extensions", "skills"]) {
      const items = local[type] || {};
      if (!(name in items)) continue;

      found = true;
      items[name].local = true;

      result.pinned.push({
        name,
        type: type === "extensions" ? "extension" : "skill",
        version: items[name].version,
      });
      break;
    }

    if (!found) {
      result.errors.push({
        name,
        error: "Not found in local registry (extensions or skills)",
      });
    }
  }

  if (result.pinned.length > 0) {
    writeLocalRegistry(root, local);
  }

  return result;
}

// ── Exports (for testing) ────────────────────────────────────────────────────

module.exports = { compareSemver, diffRegistries, remove, pin };

// ── CLI entry ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "check":
      check();
      break;
    case "install":
      if (!args[0]) {
        console.error(
          JSON.stringify({
            error: "Usage: node upgrade.js install name1,name2,...",
          })
        );
        process.exit(1);
      }
      install(args[0].split(",").map((s) => s.trim()));
      break;
    case "remove":
      if (!args[0]) {
        console.error(
          JSON.stringify({
            error: "Usage: node upgrade.js remove name1,name2,...",
          })
        );
        process.exit(1);
      }
      console.log(JSON.stringify(remove(args[0].split(",").map((s) => s.trim())), null, 2));
      break;
    case "pin":
      if (!args[0]) {
        console.error(
          JSON.stringify({
            error: "Usage: node upgrade.js pin name1,name2,...",
          })
        );
        process.exit(1);
      }
      console.log(JSON.stringify(pin(args[0].split(",").map((s) => s.trim())), null, 2));
      break;
    default:
      console.error(
        JSON.stringify({
          error: `Unknown command: ${command}. Use "check", "install", "remove", or "pin".`,
        })
      );
      process.exit(1);
  }
}
