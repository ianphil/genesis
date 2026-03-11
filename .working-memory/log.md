# AI Notes — Log

## 2026-03-11
- cron/sdk: Copilot SDK lives under `~/.copilot/pkg/{platform}-{arch}/` (e.g. `win32-x64`), not `universal/` — must check platform dir first
- cron/sdk: SDK API is camelCase (`createSession`, `sendAndWait`, `stop`), not PascalCase — `createSession` requires `onPermissionRequest: approveAll`
- cron/sdk: `sendAndWait({ prompt }, timeoutMs)` replaces manual event wiring — handles idle/error/timeout internally
- cron/executor: `spawn()` without `shell: true` cannot run shell built-ins (e.g. `echo`) on Windows; also breaks quoted arguments when naively split by whitespace
- cron/executor: pass full command string with `shell: true` instead of splitting args
