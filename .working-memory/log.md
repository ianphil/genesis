# AI Notes — Log

## 2026-03-11
- upgrade-skill: shipped upgrade.js script alongside SKILL.md — agents no longer reinvent file-fetching logic each run
- upgrade-skill: script uses `gh api` with recursive tree fetch (single call) instead of per-file MCP calls
- upgrade-skill: JSON stdout interface (`check`/`install` subcommands) keeps agent role to UX only
- copilot-sdk: versions jumped from 0.0.x to 1.0.x — lexicographic sort still works for resolution
- copilot-sdk: skill must show dynamic version resolution, not just {version} placeholders, or agents hardcode stale paths
