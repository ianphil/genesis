#!/usr/bin/env node
// upgrade.js — Deterministic upgrade script for genesis-based agents.
// Zero dependencies. Requires: Node.js 18+, gh CLI authenticated.
//
// Usage:
//   node upgrade.js check              — compare local vs remote registry
//   node upgrade.js install name1,name2 — install/update selected items
//   node upgrade.js install --all       — install/update everything from remote registry
//   node upgrade.js remove name1,name2  — remove selected items from local
//   node upgrade.js pin name1,name2     — pin items to prevent removal
//   node upgrade.js channel <name>      — switch release channel (e.g. main, frontier)
//   node upgrade.js migrate --source <owner/repo> [--channel <name>]
//                                        — rewrite registry: assign non-template items to a package source

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
  // User-level layout: registry.json at CWD (e.g. ~/.copilot/)
  if (fs.existsSync(path.join(process.cwd(), "registry.json"))) {
    return process.cwd();
  }
  // Fallback: cwd
  return process.cwd();
}

function detectLayout(root) {
  if (fs.existsSync(path.join(root, ".github", "registry.json"))) return "repo";
  if (fs.existsSync(path.join(root, "registry.json"))) return "user";
  return "repo";
}

function registryPath(root) {
  return detectLayout(root) === "user"
    ? path.join(root, "registry.json")
    : path.join(root, ".github", "registry.json");
}

function mapPathToLocal(remotePath, layout) {
  if (layout === "user") {
    return remotePath.replace(/^\.github\//, "");
  }
  return remotePath;
}

function readLocalRegistry(root) {
  const p = registryPath(root);
  if (!fs.existsSync(p)) {
    return { version: "0.0.0", source: "", extensions: {}, skills: {} };
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeLocalRegistry(root, registry) {
  const p = registryPath(root);
  fs.writeFileSync(p, JSON.stringify(registry, null, 2) + "\n", "utf8");
}

function makeStagedRemovalPath(itemDir) {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return path.join(
    path.dirname(itemDir),
    `${path.basename(itemDir)}.remove-${suffix}`
  );
}

function resolveChannel(local) {
  return local.channel || local.branch || "main";
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
    promoted: [],
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
        if (localItems[name].package) {
          // Template now owns this item — it was previously installed via a package
          result.promoted.push({
            ...item,
            package: localItems[name].package,
            localVersion: localItems[name].version,
          });
        } else if (compareSemver(info.version, localItems[name].version) > 0) {
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
        } else if (info.package) {
          // Package-installed items not in template are kept (managed by packages skill)
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
      JSON.stringify({ error: "No source configured in local registry" })
    );
    process.exit(1);
  }

  const { owner, repo } = parseSource(local.source);
  const branch = resolveChannel(local);

  // Fetch remote registry
  const remoteRaw = gh(
    `/repos/${owner}/${repo}/contents/.github/registry.json?ref=${branch}`
  );
  const remote = JSON.parse(
    Buffer.from(remoteRaw.content, "base64").toString("utf8")
  );

  const result = diffRegistries(local, remote);
  result.channel = branch;
  console.log(JSON.stringify(result, null, 2));
}

// ── Install command ──────────────────────────────────────────────────────────

function install(names) {
  const root = findRepoRoot();
  const layout = detectLayout(root);
  const local = readLocalRegistry(root);
  const { owner, repo } = parseSource(local.source);
  const branch = resolveChannel(local);

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
    promoted: [],
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
      const itemPath = info.path; // remote path for tree matching (e.g. ".github/extensions/cron")
      const localItemPath = mapPathToLocal(itemPath, layout);

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
          const localPath = path.join(root, mapPathToLocal(file.path, layout));
          const dir = path.dirname(localPath);

          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(localPath, content);
          fileCount++;
        }

        // Run npm install if package.json exists
        const pkgPath = path.join(root, localItemPath, "package.json");
        let npmInstalled = false;
        if (fs.existsSync(pkgPath)) {
          try {
            execSync("npm install --production", {
              cwd: path.join(root, localItemPath),
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

        // Update local registry — remove package field if promoting
        if (!local[type]) local[type] = {};
        const wasPackage = localItems[name] && localItems[name].package;
        local[type][name] = {
          version: info.version,
          path: localItemPath,
          description: info.description,
        };

        const entry = {
          name,
          type: type === "extensions" ? "extension" : "skill",
          version: info.version,
          files: fileCount,
          npmInstalled,
        };

        // Handle promotion — clean up package tracking
        if (wasPackage) {
          const pkgSource = localItems[name].package;
          entry.promotedFrom = pkgSource;
          if (Array.isArray(local.packages)) {
            for (const pkg of local.packages) {
              if (pkg.source === pkgSource && pkg.installed) {
                const pkgType = pkg.installed[type];
                if (pkgType && pkgType[name]) {
                  delete pkgType[name];
                }
              }
            }
            // Remove empty package entries
            local.packages = local.packages.filter((pkg) => {
              if (!pkg.installed) return false;
              const exts = Object.keys(pkg.installed.extensions || {});
              const skills = Object.keys(pkg.installed.skills || {});
              return exts.length > 0 || skills.length > 0;
            });
          }
          result.promoted.push(entry);
        } else if (isNew) {
          result.installed.push(entry);
        } else {
          result.updated.push({
            ...entry,
            from: localItems[name].version,
          });
        }

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
      } catch (e) {
        result.errors.push({
          name,
          error: e.message.slice(0, 300),
        });
      }
    }
  }

  // Update registry version and write
  if (result.installed.length > 0 || result.updated.length > 0 || result.promoted.length > 0) {
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
  const pendingRemovals = [];

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
      let stagedDir = null;

      try {
        if (fs.existsSync(itemDir)) {
          stagedDir = makeStagedRemovalPath(itemDir);
          fs.renameSync(itemDir, stagedDir);
        }

        delete local[type][name];
        pendingRemovals.push({
          name,
          info,
          type,
          itemDir,
          stagedDir,
        });
      } catch (e) {
        if (stagedDir && fs.existsSync(stagedDir)) {
          fs.renameSync(stagedDir, itemDir);
        }
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

  if (pendingRemovals.length > 0) {
    try {
      writeLocalRegistry(root, local);
      result.registryUpdated = true;

      for (const item of pendingRemovals) {
        if (item.stagedDir && fs.existsSync(item.stagedDir)) {
          fs.rmSync(item.stagedDir, { recursive: true, force: true });
        }

        result.removed.push({
          name: item.name,
          type: item.type === "extensions" ? "extension" : "skill",
          version: item.info.version,
          path: item.info.path,
        });
      }
    } catch (e) {
      for (let i = pendingRemovals.length - 1; i >= 0; i--) {
        const item = pendingRemovals[i];
        local[item.type][item.name] = item.info;

        if (item.stagedDir && fs.existsSync(item.stagedDir)) {
          fs.renameSync(item.stagedDir, item.itemDir);
        }

        result.errors.push({
          name: item.name,
          error: `Failed to update registry: ${e.message.slice(0, 300)}`,
        });
      }
    }
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

// ── Channel command ──────────────────────────────────────────────────────────

function channel(name) {
  const root = findRepoRoot();
  const local = readLocalRegistry(root);

  if (!local.source) {
    console.error(
      JSON.stringify({ error: "No source configured in local registry" })
    );
    process.exit(1);
  }

  const previous = resolveChannel(local);

  if (name === previous) {
    console.log(
      JSON.stringify({
        channel: name,
        changed: false,
        message: `Already on channel "${name}".`,
      })
    );
    return;
  }

  const { owner, repo } = parseSource(local.source);

  // Fetch remote registry from the target channel branch
  let remote;
  try {
    const remoteRaw = gh(
      `/repos/${owner}/${repo}/contents/.github/registry.json?ref=${name}`
    );
    remote = JSON.parse(
      Buffer.from(remoteRaw.content, "base64").toString("utf8")
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        error: `Failed to fetch registry from channel "${name}". Does the branch exist? ${e.message.slice(0, 200)}`,
      })
    );
    process.exit(1);
  }

  // Update the channel in local registry
  local.channel = name;
  delete local.branch; // channel supersedes branch
  writeLocalRegistry(root, local);

  // Diff against the target channel's registry
  const diff = diffRegistries(local, remote);
  diff.channel = name;
  diff.previousChannel = previous;
  diff.changed = true;

  console.log(JSON.stringify(diff, null, 2));
}

// ── Migrate command ──────────────────────────────────────────────────────────

function migrateRegistry(local, remote, source) {
  const migrated = [];
  const skipped = [];

  // For each local item NOT in the target channel's registry, assign it to the package source
  for (const type of ["extensions", "skills"]) {
    const remoteItems = remote[type] || {};
    const localItems = local[type] || {};

    for (const [name, info] of Object.entries(localItems)) {
      if (name in remoteItems) {
        skipped.push({ name, type: type === "extensions" ? "extension" : "skill", reason: "in_template" });
        continue;
      }
      if (info.local) {
        skipped.push({ name, type: type === "extensions" ? "extension" : "skill", reason: "pinned" });
        continue;
      }
      if (info.package) {
        skipped.push({ name, type: type === "extensions" ? "extension" : "skill", reason: "already_package" });
        continue;
      }

      // Assign to package
      local[type][name] = { ...info, package: source };
      migrated.push({
        name,
        type: type === "extensions" ? "extension" : "skill",
        version: info.version,
      });
    }
  }

  // Build the packages[] entry for migrated items
  if (migrated.length > 0) {
    if (!local.packages) local.packages = [];

    let pkgEntry = local.packages.find((p) => p.source === source);
    if (!pkgEntry) {
      pkgEntry = { source, ref: "main", installed: { extensions: {}, skills: {} } };
      local.packages.push(pkgEntry);
    }
    if (!pkgEntry.installed) pkgEntry.installed = { extensions: {}, skills: {} };

    for (const item of migrated) {
      const type = item.type === "extension" ? "extensions" : "skills";
      const info = local[type][item.name];
      pkgEntry.installed[type][item.name] = {
        version: info.version,
        path: info.path,
        description: info.description,
      };
    }
  }

  return { migrated, skipped };
}

function migrate(source, targetChannel) {
  const root = findRepoRoot();
  const local = readLocalRegistry(root);
  const currentChannel = resolveChannel(local);

  if (!local.source) {
    return { error: "No source configured in local registry" };
  }

  const { owner, repo } = parseSource(local.source);

  let remote;
  try {
    const remoteRaw = gh(
      `/repos/${owner}/${repo}/contents/.github/registry.json?ref=${targetChannel}`
    );
    remote = JSON.parse(
      Buffer.from(remoteRaw.content, "base64").toString("utf8")
    );
  } catch (e) {
    return {
      error: `Failed to fetch registry from channel "${targetChannel}". ${e.message.slice(0, 200)}`,
    };
  }

  const { migrated, skipped } = migrateRegistry(local, remote, source);

  // Switch channel to target
  local.channel = targetChannel;
  delete local.branch;

  writeLocalRegistry(root, local);

  return {
    source,
    targetChannel,
    previousChannel: currentChannel,
    migrated,
    skipped,
    registryUpdated: true,
  };
}

// ── Exports (for testing) ────────────────────────────────────────────────────

module.exports = { compareSemver, diffRegistries, remove, pin, resolveChannel, detectLayout, mapPathToLocal, migrate, migrateRegistry };

// ── CLI entry ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "check":
      check();
      break;
    case "install":
      if (args[0] === "--all") {
        const allRoot = findRepoRoot();
        const allLocal = readLocalRegistry(allRoot);
        const allParsed = parseSource(allLocal.source);
        const allBranch = resolveChannel(allLocal);
        const allRemoteRaw = gh(
          `/repos/${allParsed.owner}/${allParsed.repo}/contents/.github/registry.json?ref=${allBranch}`
        );
        const allRemote = JSON.parse(
          Buffer.from(allRemoteRaw.content, "base64").toString("utf8")
        );
        const allNames = [
          ...Object.keys(allRemote.extensions || {}),
          ...Object.keys(allRemote.skills || {}),
        ];
        if (allNames.length === 0) {
          console.log(JSON.stringify({ installed: [], updated: [], errors: [], note: "No items in remote registry" }));
          break;
        }
        install(allNames);
      } else if (!args[0]) {
        console.error(
          JSON.stringify({
            error: "Usage: node upgrade.js install name1,name2,... | --all",
          })
        );
        process.exit(1);
      } else {
        install(args[0].split(",").map((s) => s.trim()));
      }
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
    case "channel":
      if (!args[0]) {
        console.error(
          JSON.stringify({
            error: 'Usage: node upgrade.js channel <name> (e.g. "main", "frontier")',
          })
        );
        process.exit(1);
      }
      channel(args[0].trim());
      break;
    case "migrate": {
      // Parse --source and --channel flags
      let source = null;
      let targetChannel = "main";
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--source" && args[i + 1]) {
          source = args[++i].trim();
        } else if (args[i] === "--channel" && args[i + 1]) {
          targetChannel = args[++i].trim();
        }
      }
      if (!source) {
        console.error(
          JSON.stringify({
            error: 'Usage: node upgrade.js migrate --source <owner/repo> [--channel <name>]',
          })
        );
        process.exit(1);
      }
      console.log(JSON.stringify(migrate(source, targetChannel), null, 2));
      break;
    }
    default:
      console.error(
        JSON.stringify({
          error: `Unknown command: ${command}. Use "check", "install", "remove", "pin", "channel", or "migrate".`,
        })
      );
      process.exit(1);
  }
}
