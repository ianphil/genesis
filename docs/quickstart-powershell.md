# Quickstart — PowerShell

Getting a genesis mind running on Windows, end to end.

## Prerequisites

| Tool | Install |
|------|---------|
| **Git** | `winget install Git.Git` |
| **Node.js** (≥18) | `winget install OpenJS.NodeJS.LTS` |
| **GitHub Copilot CLI** | `npm install -g @anthropic-ai/claude-code` — requires an active [Copilot subscription](https://github.com/features/copilot/plans) |
| **GitHub CLI** | `winget install GitHub.cli` — needed for repo creation and the upgrade skill |

Verify everything is on PATH:

```powershell
git --version; node --version; copilot --version; gh --version
```

## Clone and Bootstrap

```powershell
git clone https://github.com/ianphil/genesis "$HOME\my-agent"
cd "$HOME\my-agent"
copilot --experimental
```

Say "Hi." The genesis protocol asks two questions — a **character** (the agent's personality) and a **role** (what it does). After that, it generates your soul, seeds memory, installs skills, and erases the bootstrap scaffolding.

The whole process takes about five minutes.

## Give Your Mind a Home

After bootstrap, the repo is local-only. Create a private repo to store it:

```powershell
# Option A — let the agent do it (just ask in the session)
# "Create a private repo for this mind"

# Option B — do it yourself
gh repo create my-agent --private --source . --remote origin --push
```

## Install Extension Dependencies

Extensions that use npm packages need their dependencies installed. The bootstrap doesn't do this automatically:

```powershell
Get-ChildItem .github\extensions\*\package.json | ForEach-Object {
    Write-Host "Installing $($_.Directory.Name)..."
    Push-Location $_.DirectoryName
    npm install --no-fund --no-audit
    Pop-Location
}
```

If an extension fails to load, this is almost always the fix.

## First Session After Bootstrap

```powershell
cd "$HOME\my-agent"
copilot --experimental
```

Start talking. Tell it about your work, your team, your priorities. It captures and organizes. A few things to try:

- **"Give me a daily report"** — your first skill in action
- **"Remember that..."** — it captures context to the right place in the mind
- **"Check for updates from genesis"** — pulls new skills and extensions from the template

## Common Operations

### Commit your work

```
> commit and push
```

The commit skill stages, commits, and pushes. No need to leave the session.

### Upgrade from genesis

```
> check for updates
```

Pulls new skills and extensions from the genesis template registry. Non-destructive — your customizations are preserved.

### Install frontier packages

```
> install ianphil/genesis-frontier
```

Adds experimental extensions (heartbeat, code-exec, tunnel, microui) from the frontier package.

### Start the cron engine

```
> start the cron engine
```

Enables autonomous behavior — scheduled prompt jobs that run on a timer. See the [cron prompt pattern guide](cron-prompt-pattern.md) for the full pattern.

## PowerShell Gotchas

A few things that will bite you on Windows if you're not watching:

### Backticks in file content

PowerShell uses backtick (`` ` ``) as its escape character. `Set-Content` will eat backticks in markdown code fences and template literals:

```powershell
# ❌ This strips backticks
Set-Content -Path notes.md -Value "```code```"

# ✅ Use .NET directly
[IO.File]::WriteAllText("$PWD\notes.md", "``````code``````")
```

When in doubt, write files with `[IO.File]::WriteAllText()` or pipe through Node/Python.

### Path separators

Windows uses backslashes. Most Node.js tools handle both, but shell commands and `git` sometimes don't. When constructing paths in PowerShell:

```powershell
# ✅ Use Join-Path
$skillPath = Join-Path ".github" "skills" "commit" "SKILL.md"

# ✅ Or just use backslashes consistently
git --no-pager diff -- ".github\skills\commit\SKILL.md"
```

### Git pager

Always disable the pager in automated contexts:

```powershell
# ✅ Per-command
git --no-pager log --oneline -10

# ✅ Or globally for the session
$env:GIT_PAGER = ""
```

### Execution policy

If scripts won't run, you may need to adjust PowerShell's execution policy:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## Repo Structure After Bootstrap

```
my-agent\
├── SOUL.md                    # Personality, voice, values
├── mind-index.md              # Catalog of all notes
├── .working-memory\
│   ├── memory.md              # Curated long-term reference
│   ├── rules.md               # Operational rules (learned from mistakes)
│   └── log.md                 # Chronological observations
├── .github\
│   ├── copilot-instructions.md  # Permanent repo instructions
│   ├── agents\                # Agent definition files
│   ├── skills\                # Learned behaviors
│   ├── extensions\            # Senses — cron, canvas, responses
│   └── registry.json          # Tracks installed capabilities
├── domains\                   # People, teams, projects
├── initiatives\               # Active efforts with goals
├── expertise\                 # Durable knowledge and patterns
├── inbox\                     # Unprocessed inputs
└── Archive\                   # Completed material
```

## What Happens Next

The first week feels slow. The mind is empty — your agent doesn't know your work yet.

By day three, it starts remembering. By week two, it knows things about your priorities, your team, and your patterns that no fresh session could. Context compounds.

Three things accelerate this:

1. **Correct mistakes.** When it gets something wrong, say so. It adds a rule to `rules.md`. After a week, that file becomes an operations manual.
2. **Give feedback on voice.** Too formal? Too chatty? Say so. Personality compounds too.
3. **Build skills as patterns emerge.** When you find yourself explaining something twice, make it a skill in `.github/skills/`.

## Related

- [Genesis README](../README.md) — overview and philosophy
- [Cron Prompt Pattern](cron-prompt-pattern.md) — autonomous agent loops
- [Contributing](../CONTRIBUTING.md) — how to contribute back to genesis
