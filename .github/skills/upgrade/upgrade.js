#!/usr/bin/env node
// upgrade.js — Deterministic upgrade script for genesis-based agents.
// Zero dependencies. Requires: Node.js 18+, gh CLI authenticated.
//
// Usage:
//   node upgrade.js check              — compare local vs remote registry
//   node upgrade.js install name1,name2 — install/update selected items

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

  // Fetch remote registry
  const remoteRaw = gh(
    `/repos/${owner}/${repo}/contents/.github/registry.json`
  );
  const remote = JSON.parse(
    Buffer.from(remoteRaw.content, "base64").toString("utf8")
  );

  const result = {
    source: local.source,
    remoteVersion: remote.version,
    localVersion: local.version,
    new: [],
    updated: [],
    current: [],
    localOnly: [],
  };

  // Compare both extensions and skills
  for (const type of ["extensions", "skills"]) {
    const remoteItems = remote[type] || {};
    const localItems = local[type] || {};

    for (const [name, info] of Object.entries(remoteItems)) {
      const item = {
        name,
        type: type === "extensions" ? "extension" : "skill",
        version: info.version,
        path: info.path,
        description: info.description,
      };

      if (!(name in localItems)) {
        result.new.push(item);
      } else if (compareSemver(info.version, localItems[name].version) > 0) {
        result.updated.push({
          ...item,
          localVersion: localItems[name].version,
        });
      } else {
        result.current.push(item);
      }
    }

    for (const [name, info] of Object.entries(localItems)) {
      if (!(name in remoteItems)) {
        result.localOnly.push({
          name,
          type: type === "extensions" ? "extension" : "skill",
          version: info.version,
          path: info.path,
          description: info.description,
        });
      }
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

// ── Install command ──────────────────────────────────────────────────────────

function install(names) {
  const root = findRepoRoot();
  const local = readLocalRegistry(root);
  const { owner, repo } = parseSource(local.source);

  // Fetch remote registry
  const remoteRaw = gh(
    `/repos/${owner}/${repo}/contents/.github/registry.json`
  );
  const remote = JSON.parse(
    Buffer.from(remoteRaw.content, "base64").toString("utf8")
  );

  // Fetch full tree once
  const tree = gh(`/repos/${owner}/${repo}/git/trees/main?recursive=1`);
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

// ── CLI entry ────────────────────────────────────────────────────────────────

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
  default:
    console.error(
      JSON.stringify({
        error: `Unknown command: ${command}. Use "check" or "install".`,
      })
    );
    process.exit(1);
}
