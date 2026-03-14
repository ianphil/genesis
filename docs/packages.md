# Genesis Packages

Genesis packages let you install extensions and skills from any GitHub repository, not just the genesis template. They follow the same registry format as genesis itself.

## What is a Genesis Package

A Genesis package is any GitHub repository that contains:

- A `.github/registry.json` declaring extensions and/or skills in the same format as the genesis template registry
- The corresponding extension and/or skill directories

Packages are referenced as `owner/repo` (e.g. `someuser/cool-extensions`). An optional `@ref` pins to a specific tag or branch (e.g. `someuser/cool-extensions@v1.0.0`).

For discoverability, package authors should add the `genesis-package` topic to their GitHub repository.

## How Packages Differ from the Template Source

| | Template source (`ianphil/genesis`) | Packages (any GitHub repo) |
|---|---|---|
| **Tracked in** | Top-level `extensions` / `skills` in `registry.json` | `packages[]` array, also merged into top-level |
| **Controls** | Registry version, release channel | Their own versioning |
| **Conflict behavior** | Authoritative — packages cannot overwrite | Additive — blocked if name already exists |
| **Upgraded via** | `upgrade.js` | `packages.js` |

Template-owned extensions and skills are authoritative. A package cannot install an extension or skill with the same name as one that already exists (from the template or another package).

## Registry Schema

The `packages` array in `.github/registry.json` tracks installed packages:

```json
{
  "version": "0.14.0",
  "source": "ianphil/genesis",
  "channel": "main",
  "extensions": {
    "weather": {
      "version": "0.1.0",
      "path": ".github/extensions/weather",
      "description": "Weather data lookups",
      "package": "someuser/cool-extensions"
    }
  },
  "skills": {},
  "packages": [
    {
      "source": "someuser/cool-extensions",
      "ref": "v1.0.0",
      "installed": {
        "extensions": {
          "weather": {
            "version": "0.1.0",
            "path": ".github/extensions/weather",
            "description": "Weather data lookups"
          }
        },
        "skills": {}
      }
    }
  ]
}
```

- `packages[].source` — `owner/repo` of the package
- `packages[].ref` — pinned git ref (tag or branch), or `null` for the default branch
- `packages[].installed` — what was installed from this package (subset of the package's registry)
- Items in `packages[].installed` are also merged into the top-level `extensions`/`skills` with a `package` field tracking their origin

## Creating a Genesis Package

Any GitHub repository can be a Genesis package. You need:

1. **`.github/registry.json`** — following the genesis registry format:

   ```json
   {
     "version": "0.1.0",
     "extensions": {
       "weather": {
         "version": "0.1.0",
         "path": ".github/extensions/weather",
         "description": "Weather data lookups"
       }
     },
     "skills": {}
   }
   ```

2. **Extension and skill directories** at the paths declared in your registry.

3. (Optional) Add the `genesis-package` topic to your GitHub repo for discoverability.

The `source` and `channel` fields in your registry are optional — they are only meaningful for the genesis template itself.

## Package Filtering

When installing a package, you can select specific items rather than installing everything it offers:

```bash
node .github/skills/packages/packages.js install someuser/cool-extensions --items weather
```

This installs only the `weather` extension, even if the package also declares other items.

## Conflict Handling

If a package tries to install an extension or skill with a name that already exists — from the template source or another package — the install **skips that item** with a clear error. It does not silently overwrite.

The conflict is reported in the `skipped` array of the install result:

```json
{
  "skipped": [
    {"name": "cron", "reason": "extension \"cron\" already exists (origin: ianphil/genesis)"}
  ]
}
```

Other items from the same package install normally. A conflict on one item never blocks others.

## Using the Packages Skill

The `packages` skill provides the agent-facing interface. See `.github/skills/packages/SKILL.md` for full details.

### Quick reference

| Action | Command |
|--------|---------|
| Browse a package | `node .github/skills/packages/packages.js search owner/repo` |
| Install everything | `node .github/skills/packages/packages.js install owner/repo` |
| Install specific items | `node .github/skills/packages/packages.js install owner/repo --items a,b` |
| Install pinned version | `node .github/skills/packages/packages.js install owner/repo@v1.0.0` |
| List installed | `node .github/skills/packages/packages.js list` |
| Remove a package | `node .github/skills/packages/packages.js remove owner/repo` |
| Remove specific items | `node .github/skills/packages/packages.js remove owner/repo --items a` |
| Check for updates | `node .github/skills/packages/packages.js check owner/repo` |

All commands output JSON. The packages skill formats this for the user.
