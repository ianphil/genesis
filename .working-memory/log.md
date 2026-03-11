# AI Notes — Log

## 2026-03-11
- upgrade-skill: shipped upgrade.js script alongside SKILL.md — agents no longer reinvent file-fetching logic each run
- upgrade-skill: script uses `gh api` with recursive tree fetch (single call) instead of per-file MCP calls
- upgrade-skill: JSON stdout interface (`check`/`install` subcommands) keeps agent role to UX only
