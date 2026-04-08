#!/usr/bin/env node
// packages.js — Install extensions and skills from third-party Genesis packages.
// Zero dependencies. Requires: Node.js 18+, gh CLI authenticated.
//
// Usage:
//   node packages.js search <owner/repo[@ref]>               — list available items
//   node packages.js install <owner/repo[@ref]> [--ref <r>] [--items a,b] — install items
//   node packages.js remove <owner/repo> [--items a,b]       — remove installed items
//   node packages.js list                                     — list all installed packages
//   node packages.js check <owner/repo[@ref]> [--ref <r>]    — compare installed vs remote

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
  return process.cwd();
}

function readLocalRegistry(root) {
  const p = path.join(root, ".github", "registry.json");
  if (!fs.existsSync(p)) {
    return { version: "0.0.0", source: "", extensions: {}, skills: {}, packages: [] };
  }
  const reg = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!Array.isArray(reg.packages)) reg.packages = [];
  return reg;
}

function writeLocalRegistry(root, registry) {
  const p = path.join(root, ".github", "registry.json");
  fs.writeFileSync(p, JSON.stringify(registry, null, 2) + "\n", "utf8");
}

function makeStagedRemovalPath(itemDir) {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return path.join(
    path.dirname(itemDir),
    `${path.basename(itemDir)}.remove-${suffix}`
  );
}

// ── Pure logic (testable) ────────────────────────────────────────────────────

// Parse "owner/repo" or "owner/repo@ref" into { owner, repo, ref }
function parsePackageSource(source) {
  const atIdx = source.indexOf("@");
  let repoStr = source;
  let ref = null;

  if (atIdx !== -1) {
    repoStr = source.slice(0, atIdx);
    ref = source.slice(atIdx + 1);
  }

  const slashIdx = repoStr.indexOf("/");
  if (slashIdx === -1 || slashIdx === 0 || slashIdx === repoStr.length - 1) {
    throw new Error(
      `Invalid package source "${source}". Expected "owner/repo" or "owner/repo@ref".`
    );
  }

  return {
    owner: repoStr.slice(0, slashIdx),
    repo: repoStr.slice(slashIdx + 1),
    ref,
  };
}

// Find an installed package entry by source (owner/repo), ignoring ref
function findInstalledPackage(registry, ownerRepo) {
  return (registry.packages || []).find((p) => p.source === ownerRepo) || null;
}

// Detect conflicts between items about to be installed and what's already in the registry.
// Returns an array of conflict descriptions (strings).
function detectConflicts(registry, itemsByType, packageSource) {
  const conflicts = [];

  for (const type of ["extensions", "skills"]) {
    const incoming = itemsByType[type] || {};
    const existing = registry[type] || {};

    for (const name of Object.keys(incoming)) {
      if (name in existing) {
        const origin = existing[name].package || registry.source || "template";
        if (origin !== packageSource) {
          conflicts.push(
            `${type.slice(0, -1)} "${name}" already exists (origin: ${origin})`
          );
        }
      }
    }
  }

  return conflicts;
}

// Merge package items into top-level registry extensions/skills with a `package` field
function mergeIntoTopLevel(registry, packageSource, installedByType) {
  for (const type of ["extensions", "skills"]) {
    if (!registry[type]) registry[type] = {};
    for (const [name, info] of Object.entries(installedByType[type] || {})) {
      registry[type][name] = { ...info, package: packageSource };
    }
  }
}

// Remove package items from top-level registry
function removeFromTopLevel(registry, packageSource, names) {
  for (const type of ["extensions", "skills"]) {
    const items = registry[type] || {};
    for (const name of names) {
      if (name in items && items[name].package === packageSource) {
        delete items[name];
      }
    }
  }
}

// Build the list output for installed packages
function buildListOutput(registry) {
  return (registry.packages || []).map((pkg) => ({
    source: pkg.source,
    ref: pkg.ref || null,
    extensions: Object.entries(pkg.installed.extensions || {}).map(
      ([name, info]) => ({ name, version: info.version, description: info.description })
    ),
    skills: Object.entries(pkg.installed.skills || {}).map(
      ([name, info]) => ({ name, version: info.version, description: info.description })
    ),
  }));
}

// ── Search command ────────────────────────────────────────────────────────────

function search(rawSource) {
  const { owner, repo, ref: parsedRef } = parsePackageSource(rawSource);
  const ref = parsedRef || "main";

  let remote;
  try {
    const remoteRaw = gh(
      `/repos/${owner}/${repo}/contents/.github/registry.json?ref=${ref}`
    );
    remote = JSON.parse(
      Buffer.from(remoteRaw.content, "base64").toString("utf8")
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        error: `Failed to fetch registry from ${owner}/${repo}@${ref}: ${e.message.slice(0, 200)}`,
      })
    );
    process.exit(1);
  }

  const result = {
    source: `${owner}/${repo}`,
    ref,
    version: remote.version,
    extensions: Object.entries(remote.extensions || {}).map(([name, info]) => ({
      name,
      version: info.version,
      description: info.description,
    })),
    skills: Object.entries(remote.skills || {}).map(([name, info]) => ({
      name,
      version: info.version,
      description: info.description,
    })),
  };

  console.log(JSON.stringify(result, null, 2));
}

// ── Install command ───────────────────────────────────────────────────────────

function install(rawSource, opts) {
  const { owner, repo, ref: parsedRef } = parsePackageSource(rawSource);
  const ref = opts.ref || parsedRef || "main";
  const requestedItems = opts.items ? new Set(opts.items) : null;

  const root = opts.root || findRepoRoot();
  const local = readLocalRegistry(root);
  const ownerRepo = `${owner}/${repo}`;

  let remote;
  try {
    const remoteRaw = gh(
      `/repos/${owner}/${repo}/contents/.github/registry.json?ref=${ref}`
    );
    remote = JSON.parse(
      Buffer.from(remoteRaw.content, "base64").toString("utf8")
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        error: `Failed to fetch registry from ${ownerRepo}@${ref}: ${e.message.slice(0, 200)}`,
      })
    );
    process.exit(1);
  }

  // Collect the items to install
  const toInstallByType = { extensions: {}, skills: {} };
  const allRemoteNames = new Set();
  for (const type of ["extensions", "skills"]) {
    for (const [name, info] of Object.entries(remote[type] || {})) {
      allRemoteNames.add(name);
      if (requestedItems === null || requestedItems.has(name)) {
        toInstallByType[type][name] = info;
      }
    }
  }

  // Conflict detection — skip items that already exist from a different origin
  const conflicts = detectConflicts(local, toInstallByType, ownerRepo);
  const conflictNames = new Set(
    conflicts.map((c) => c.match(/"([^"]+)"/)?.[1]).filter(Boolean)
  );

  const result = {
    source: ownerRepo,
    ref,
    installed: [],
    updated: [],
    skipped: [],
    errors: [],
    registryUpdated: false,
  };

  // Report unknown requested items
  if (requestedItems) {
    for (const name of requestedItems) {
      if (!allRemoteNames.has(name)) {
        result.errors.push({ name, error: `Item "${name}" not found in ${ownerRepo}@${ref}` });
      }
    }
  }

  // Report conflicts as skipped
  for (const conflict of conflicts) {
    const name = conflict.match(/"([^"]+)"/)?.[1] || "unknown";
    result.skipped.push({ name, reason: conflict });
  }

  // Fetch tree once for file downloads
  let treeMap = new Map();
  if (Object.values(toInstallByType).some((t) => Object.keys(t).length > 0)) {
    try {
      const tree = gh(`/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`);
      for (const entry of tree.tree) {
        if (entry.type === "blob") {
          treeMap.set(entry.path, entry.sha);
        }
      }
    } catch (e) {
      console.error(
        JSON.stringify({
          error: `Failed to fetch file tree from ${ownerRepo}@${ref}: ${e.message.slice(0, 200)}`,
        })
      );
      process.exit(1);
    }
  }

  // Find or create the package entry in registry
  let pkgEntry = findInstalledPackage(local, ownerRepo);
  if (!pkgEntry) {
    pkgEntry = { source: ownerRepo, ref, installed: { extensions: {}, skills: {} } };
    local.packages.push(pkgEntry);
  } else {
    // Update ref if it changed
    pkgEntry.ref = ref;
  }

  for (const type of ["extensions", "skills"]) {
    for (const [name, info] of Object.entries(toInstallByType[type])) {
      if (conflictNames.has(name)) continue;

      const isUpdate = name in (pkgEntry.installed[type] || {});
      const itemPath = info.path;

      try {
        const prefix = itemPath.endsWith("/") ? itemPath : itemPath + "/";
        const files = [];
        for (const [filePath, sha] of treeMap) {
          if (filePath.startsWith(prefix) || filePath === itemPath) {
            files.push({ path: filePath, sha });
          }
        }

        if (files.length === 0) {
          result.errors.push({ name, error: `No files found in tree under ${itemPath}` });
          continue;
        }

        let fileCount = 0;
        for (const file of files) {
          const content = ghBlob(owner, repo, file.sha);
          const localPath = path.join(root, file.path);
          fs.mkdirSync(path.dirname(localPath), { recursive: true });
          fs.writeFileSync(localPath, content);
          fileCount++;
        }

        let npmInstalled = false;
        const pkgJsonPath = path.join(root, itemPath, "package.json");
        if (fs.existsSync(pkgJsonPath)) {
          try {
            execSync("npm install --omit=dev", {
              cwd: path.join(root, itemPath),
              encoding: "utf8",
              stdio: "pipe",
              timeout: 120000,
            });
            npmInstalled = true;
          } catch (e) {
            result.errors.push({
              name,
              error: `npm install failed: ${e.message.slice(0, 200)}`,
            });
          }
        }

        const itemMeta = { version: info.version, path: info.path, description: info.description };

        // Update package entry
        if (!pkgEntry.installed[type]) pkgEntry.installed[type] = {};
        pkgEntry.installed[type][name] = itemMeta;

        const entry = {
          name,
          type: type === "extensions" ? "extension" : "skill",
          version: info.version,
          files: fileCount,
          npmInstalled,
        };

        if (isUpdate) {
          result.updated.push(entry);
        } else {
          result.installed.push(entry);
        }
      } catch (e) {
        result.errors.push({ name, error: e.message.slice(0, 300) });
      }
    }
  }

  if (result.installed.length > 0 || result.updated.length > 0) {
    // Merge into top-level registry
    mergeIntoTopLevel(local, ownerRepo, pkgEntry.installed);
    writeLocalRegistry(root, local);
    result.registryUpdated = true;
  }

  console.log(JSON.stringify(result, null, 2));
}

// ── Remove command ────────────────────────────────────────────────────────────

function remove(rawSource, opts) {
  const { owner, repo } = parsePackageSource(rawSource);
  const ownerRepo = `${owner}/${repo}`;
  const root = (opts && opts.root) || findRepoRoot();
  const local = readLocalRegistry(root);

  const pkgEntry = findInstalledPackage(local, ownerRepo);

  const result = {
    source: ownerRepo,
    removed: [],
    errors: [],
    registryUpdated: false,
  };

  if (!pkgEntry) {
    result.errors.push({ name: ownerRepo, error: "Package not found in local registry" });
    return result;
  }

  // Determine which item names to remove
  const requestedItems = (opts && opts.items)
    ? new Set(opts.items)
    : new Set([
        ...Object.keys(pkgEntry.installed.extensions || {}),
        ...Object.keys(pkgEntry.installed.skills || {}),
      ]);

  const pendingRemovals = [];

  for (const type of ["extensions", "skills"]) {
    for (const name of Array.from(requestedItems)) {
      const items = pkgEntry.installed[type] || {};
      if (!(name in items)) continue;

      const info = items[name];
      const itemDir = path.join(root, info.path);
      let stagedDir = null;

      try {
        if (fs.existsSync(itemDir)) {
          stagedDir = makeStagedRemovalPath(itemDir);
          fs.renameSync(itemDir, stagedDir);
        }

        delete pkgEntry.installed[type][name];
        pendingRemovals.push({ name, info, type, itemDir, stagedDir });
      } catch (e) {
        if (stagedDir && fs.existsSync(stagedDir)) {
          fs.renameSync(stagedDir, itemDir);
        }
        result.errors.push({ name, error: e.message.slice(0, 300) });
      }
    }
  }

  if (pendingRemovals.length > 0) {
    try {
      // Remove from top-level registry
      const removedNames = pendingRemovals.map((r) => r.name);
      removeFromTopLevel(local, ownerRepo, removedNames);

      // Remove the entire package entry if no items remain
      const remainingExt = Object.keys(pkgEntry.installed.extensions || {}).length;
      const remainingSkills = Object.keys(pkgEntry.installed.skills || {}).length;
      if (remainingExt + remainingSkills === 0) {
        local.packages = local.packages.filter((p) => p.source !== ownerRepo);
      }

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
      // Rollback
      for (let i = pendingRemovals.length - 1; i >= 0; i--) {
        const item = pendingRemovals[i];
        pkgEntry.installed[item.type][item.name] = item.info;
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

// ── List command ──────────────────────────────────────────────────────────────

function list(opts) {
  const root = (opts && opts.root) || findRepoRoot();
  const local = readLocalRegistry(root);
  return buildListOutput(local);
}

// ── Check command ─────────────────────────────────────────────────────────────

function check(rawSource, opts) {
  const { owner, repo, ref: parsedRef } = parsePackageSource(rawSource);
  const ref = (opts && opts.ref) || parsedRef || "main";
  const ownerRepo = `${owner}/${repo}`;

  const root = (opts && opts.root) || findRepoRoot();
  const local = readLocalRegistry(root);

  const pkgEntry = findInstalledPackage(local, ownerRepo);

  let remote;
  try {
    const remoteRaw = gh(
      `/repos/${owner}/${repo}/contents/.github/registry.json?ref=${ref}`
    );
    remote = JSON.parse(
      Buffer.from(remoteRaw.content, "base64").toString("utf8")
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        error: `Failed to fetch registry from ${ownerRepo}@${ref}: ${e.message.slice(0, 200)}`,
      })
    );
    process.exit(1);
  }

  const result = {
    source: ownerRepo,
    ref,
    remoteVersion: remote.version,
    updates: [],
    new: [],
    current: [],
    notInstalled: !pkgEntry,
  };

  if (!pkgEntry) {
    // Nothing installed yet — all remote items are "new"
    for (const type of ["extensions", "skills"]) {
      for (const [name, info] of Object.entries(remote[type] || {})) {
        result.new.push({
          name,
          type: type === "extensions" ? "extension" : "skill",
          version: info.version,
          description: info.description,
        });
      }
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const type of ["extensions", "skills"]) {
    const remoteItems = remote[type] || {};
    const installedItems = pkgEntry.installed[type] || {};

    for (const [name, info] of Object.entries(installedItems)) {
      const remoteItem = remoteItems[name];
      if (!remoteItem) {
        result.updates.push({
          name,
          type: type === "extensions" ? "extension" : "skill",
          localVersion: info.version,
          status: "removed_upstream",
        });
      } else if (compareSemver(remoteItem.version, info.version) > 0) {
        result.updates.push({
          name,
          type: type === "extensions" ? "extension" : "skill",
          localVersion: info.version,
          remoteVersion: remoteItem.version,
          status: "update_available",
        });
      } else {
        result.current.push({
          name,
          type: type === "extensions" ? "extension" : "skill",
          version: info.version,
        });
      }
    }

    for (const [name, info] of Object.entries(remoteItems)) {
      if (!(name in installedItems)) {
        result.new.push({
          name,
          type: type === "extensions" ? "extension" : "skill",
          version: info.version,
          description: info.description,
        });
      }
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

// ── Exports (for testing) ────────────────────────────────────────────────────

module.exports = {
  parsePackageSource,
  detectConflicts,
  mergeIntoTopLevel,
  removeFromTopLevel,
  buildListOutput,
  findInstalledPackage,
  compareSemver,
  remove,
  list,
};

// ── CLI entry ─────────────────────────────────────────────────────────────────

if (require.main === module) {
  const [, , command, ...args] = process.argv;

  function parseFlags(flagArgs) {
    const flags = { items: null, ref: null };
    const positional = [];
    for (let i = 0; i < flagArgs.length; i++) {
      if (flagArgs[i] === "--ref" && flagArgs[i + 1]) {
        flags.ref = flagArgs[++i];
      } else if (flagArgs[i] === "--items" && flagArgs[i + 1]) {
        flags.items = flagArgs[++i].split(",").map((s) => s.trim());
      } else if (!flagArgs[i].startsWith("--")) {
        positional.push(flagArgs[i]);
      }
    }
    if (!flags.items && positional.length > 0) {
      flags.items = positional;
    }
    return flags;
  }

  switch (command) {
    case "search": {
      if (!args[0]) {
        console.error(JSON.stringify({ error: "Usage: node packages.js search <owner/repo[@ref]>" }));
        process.exit(1);
      }
      search(args[0]);
      break;
    }
    case "install": {
      if (!args[0]) {
        console.error(JSON.stringify({ error: "Usage: node packages.js install <owner/repo[@ref]> [--ref <ref>] [--items name1,name2]" }));
        process.exit(1);
      }
      const { ref, items } = parseFlags(args.slice(1));
      install(args[0], { ref, items });
      break;
    }
    case "remove": {
      if (!args[0]) {
        console.error(JSON.stringify({ error: "Usage: node packages.js remove <owner/repo> [--items name1,name2]" }));
        process.exit(1);
      }
      const { items } = parseFlags(args.slice(1));
      console.log(JSON.stringify(remove(args[0], { items }), null, 2));
      break;
    }
    case "list": {
      console.log(JSON.stringify(list(), null, 2));
      break;
    }
    case "check": {
      if (!args[0]) {
        console.error(JSON.stringify({ error: "Usage: node packages.js check <owner/repo[@ref]> [--ref <ref>]" }));
        process.exit(1);
      }
      const { ref } = parseFlags(args.slice(1));
      check(args[0], { ref });
      break;
    }
    default: {
      console.error(JSON.stringify({
        error: `Unknown command: ${command}. Use "search", "install", "remove", "list", or "check".`,
      }));
      process.exit(1);
    }
  }
}
