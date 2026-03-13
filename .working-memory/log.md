# AI Notes — Log

## 2026-03-13
- upgrade-skill: upgrade.js now exports pure functions (compareSemver, diffRegistries, remove, pin) via module.exports, guarded by require.main === module for CLI
- upgrade-skill: diffRegistries splits old localOnly into removed[] (upstream deleted, not pinned) and localOnly[] (pinned with local:true)
- upgrade-skill: items can be pinned via `local: true` flag in registry.json — prevents nagging on future checks
- testing: upgrade.test.js uses node:test (zero deps), temp dirs via os.tmpdir for filesystem tests, cleanup with fs.rmSync
