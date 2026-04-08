# Responses API Extension

Exposes the Copilot CLI agent as an OpenAI Responses API–compatible HTTP server.
External clients (web UIs, mobile apps, scripts, other agents) send prompts via
HTTP and get results back as JSON, SSE streams, or RSS feeds.

**Async is the default.** `POST /v1/responses` returns `202 Accepted` with a job
ID and RSS feed URL. The prompt executes in the background via the cron engine.
Use `async: false` for fire-and-forget on the current session, or `stream: true`
for SSE.

## Endpoints

| Method   | Path              | Description                                              |
|----------|-------------------|----------------------------------------------------------|
| `POST`   | `/v1/responses`   | Submit a prompt (async by default, 202 + job ID + feed)  |
| `GET`    | `/jobs`           | List background jobs (`?status=`, `?limit=`)             |
| `GET`    | `/jobs/:id`       | Single job detail with status timeline                   |
| `GET`    | `/feed/:jobId`    | RSS 2.0 XML feed of job status updates                   |
| `DELETE` | `/jobs`           | Delete all terminal jobs (completed, failed, cancelled)  |
| `DELETE` | `/jobs/:id`       | Delete a specific job (cancels if running, then deletes) |
| `GET`    | `/history?limit=N`| Conversation history (last N messages, or all)           |
| `GET`    | `/health`         | Liveness check with job count and uptime                 |

## Request / Response

### Request Format

```json
{
  "model": "copilot",
  "input": "Your prompt here",
  "instructions": "Optional system instructions",
  "id": "my-custom-job-id",
  "stream": false,
  "async": true,
  "timeout": 120000
}
```

| Field          | Type                | Default | Description                                                    |
|----------------|---------------------|---------|----------------------------------------------------------------|
| `input`        | string \| array     | —       | **Required.** Prompt string or array of `{ role, content }` items |
| `model`        | string              | `"copilot"` | Ignored by the agent; passed through in response envelope  |
| `instructions` | string              | —       | Prepended as system context                                    |
| `id`           | string              | auto    | Custom job ID. Auto-generated as `job_{shortUuid}` if omitted  |
| `stream`       | boolean             | `false` | `true` → SSE streaming response                               |
| `async`        | boolean             | `true`  | `false` → fire-and-forget on current session. Default is async background job |
| `timeout`      | number (ms)         | `120000`| Timeout for async background jobs                              |
| `previous_response_id` | string     | —       | Chain responses for multi-turn conversations                   |
| `temperature`  | number              | `1.0`   | Passed through in response envelope                            |
| `metadata`     | object              | `{}`    | Passed through in response envelope                            |

**HTTP Headers:**

| Header           | Description                                                    |
|------------------|----------------------------------------------------------------|
| `X-Agent-Name`   | Sender's agent name (e.g., `moneypenny`). Included in envelope as `from` attribute. Optional — omit if caller is not an agent. |

### Default (Async Background Job)

```bash
curl -s -X POST http://127.0.0.1:15210/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"Analyze the codebase and list all API endpoints"}'
```

Response (`202 Accepted`):

```json
{
  "id": "job_a1b2c3d4e5f6g7h8",
  "object": "response",
  "created_at": 1710523200,
  "status": "queued",
  "feed_url": "http://127.0.0.1:15210/feed/job_a1b2c3d4e5f6g7h8"
}
```

The caller polls `feed_url` or `GET /jobs/:id` for progress and results.

### Fire-and-Forget (Current Session)

```bash
curl -s -X POST http://127.0.0.1:15210/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"Refactor the auth module","async":false}'
```

Response (`202 Accepted`) — prompt sent to the agent's current session:

```json
{
  "object": "response",
  "created_at": 1710523200,
  "status": "accepted",
  "message": "Prompt sent to current session"
}
```

The agent executes the prompt in its own session. No job tracking, no RSS feed —
use `async: true` (default) if you need those. Use `stream: true` if you need
to see the response.

### Message Envelope

Every prompt delivered via the Responses API is wrapped in a structured XML
envelope. The receiving agent sees who sent the message, how it was delivered,
and the actual content in clean, parseable sections.

#### Structure

```xml
<message from="agent-name">
  <from agent="agent-name">
    Check your Yellow Pages (contacts.json) for context on this agent.
  </from>
  <delivery mode="fire-and-forget|streaming|background">
    Transport context — informs the agent how the message arrived.
  </delivery>
  <content>
    The actual message from the caller.
  </content>
</message>
```

- **`<from>`** — only present when the caller includes an `X-Agent-Name` HTTP header.
  The Yellow Pages skill (`.github/skills/yellow-pages/`) maintains the agent directory.
  If `X-Agent-Name` is not set, `<from>` is omitted (backwards compatible).
- **`<delivery>`** — transport metadata, not a behavioral command. Describes how the
  message arrived; the `<content>` determines what the agent should do.
- **`<content>`** — the actual prompt/message from the caller.

#### Delivery Modes

**Fire-and-forget (`async: false`):**

```xml
<message from="moneypenny">
  <from agent="moneypenny">
    Check your Yellow Pages (contacts.json) for context on this agent.
  </from>
  <delivery mode="fire-and-forget">
    The caller is not waiting for a response. Use your judgment —
    the content determines whether action or a reply is appropriate.
    To reply, use your Yellow Pages to reach the sender.
  </delivery>
  <content>
    Hey Q — quick heads up, the deploy is running.
  </content>
</message>
```

**Streaming (`stream: true`):**

```xml
<message from="moneypenny">
  <from agent="moneypenny">
    Check your Yellow Pages (contacts.json) for context on this agent.
  </from>
  <delivery mode="streaming">
    The caller is connected via SSE and receiving your output in
    real time. Respond normally.
  </delivery>
  <content>
    Explain this codebase.
  </content>
</message>
```

**Background job (`async: true`, default):**

```xml
<message from="moneypenny">
  <from agent="moneypenny">
    Check your Yellow Pages (contacts.json) for context on this agent.
  </from>
  <delivery mode="background" job-id="job_a1b2c3d4e5f6g7h8"
            feed-url="http://127.0.0.1:15210/feed/job_a1b2c3d4e5f6g7h8">
    This is a tracked background job. Your work and response are
    captured in the feed. Complete the task described in the content.
  </delivery>
  <content>
    Analyze the codebase and list all API endpoints.
  </content>
</message>
```

The envelope is context, not a command — the agent uses judgment about whether
to reply, and the `<content>` drives behavior.

### Streaming

```bash
curl -N -X POST http://127.0.0.1:15210/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"Explain this codebase","stream":true}'
```

Returns an SSE stream following the OpenAI event sequence:

```
event: response.created
event: response.output_item.added
event: response.content_part.added
event: response.output_text.delta      ← repeated for each chunk
event: response.content_part.done
event: response.output_item.done
event: response.completed
```

## Background Jobs

### Job Lifecycle

```
POST /v1/responses
       │
       ▼
  Create one-shot cron job (fires in ~3s)
  Create job in registry (status: queued)
  Return 202 { id, feed_url }
       │
       ▼  (cron engine picks up the job)
  Spawn new Copilot session (sessionId: {agent}-{jobId})
  Execute prompt via session.sendAndWait()
  Status: queued → running → completed | failed
       │
       ▼
  Poll GET /jobs/:id or GET /feed/:jobId for results
```

**State machine:**

```
  queued ──▶ running ──▶ completed
    │           │
    │           └──────▶ failed
    │
    └──▶ cancelled  (via DELETE /jobs/:id)
```

- **queued** — Cron job created, waiting for the engine to pick it up.
- **running** — Cron job has fired, agent session is executing.
- **completed** — Agent finished successfully. Session turns and checkpoints are available.
- **failed** — Agent errored out. Error message in status items.
- **cancelled** — Cancelled via `DELETE /jobs/:id`. If already running, execution may continue.

Status is resolved lazily on each request by merging data from the job registry,
cron system (job file + history records), session store (turns + checkpoints),
and progress file (tool calls, sub-agents, turn events captured during execution).

### RSS Feed

`GET /feed/:jobId` returns an RSS 2.0 XML feed with time-series status updates.
During execution, the feed includes incremental updates for tool calls, sub-agent
activity, file operations, and agent turns — not just start/end events.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Job job_a1b2c3d4 — Status Feed</title>
    <link>http://127.0.0.1:15210/jobs/job_a1b2c3d4</link>
    <description>Status updates for job: Analyze the codebase...</description>
    <language>en-us</language>
    <lastBuildDate>Thu, 15 Mar 2024 12:00:00 GMT</lastBuildDate>
    <item>
      <title>Job Created</title>
      <description>Request received and queued.</description>
      <pubDate>Thu, 15 Mar 2024 12:00:00 GMT</pubDate>
      <guid isPermaLink="false">job_a1b2c3d4-2024-03-15T12:00:00.000Z</guid>
    </item>
    <item>
      <title>Processing Started</title>
      <description>Agent began processing.</description>
      <pubDate>Thu, 15 Mar 2024 12:00:03 GMT</pubDate>
      <guid isPermaLink="false">job_a1b2c3d4-2024-03-15T12:00:03.000Z</guid>
    </item>
    <item>
      <title>Tool: grep</title>
      <description>pattern: TODO|FIXME</description>
      <pubDate>Thu, 15 Mar 2024 12:00:05 GMT</pubDate>
      <guid isPermaLink="false">job_a1b2c3d4-2024-03-15T12:00:05.000Z</guid>
    </item>
    <item>
      <title>✓ grep</title>
      <description>Found 15 matches across 8 files</description>
      <pubDate>Thu, 15 Mar 2024 12:00:06 GMT</pubDate>
      <guid isPermaLink="false">job_a1b2c3d4-2024-03-15T12:00:06.000Z</guid>
    </item>
    <item>
      <title>Checkpoint: Analyzing files</title>
      <description>Found 42 source files across 8 directories.</description>
      <pubDate>Thu, 15 Mar 2024 12:00:15 GMT</pubDate>
      <guid isPermaLink="false">job_a1b2c3d4-2024-03-15T12:00:15.000Z</guid>
    </item>
    <item>
      <title>File Edited: src/auth.ts</title>
      <description>Edited via edit</description>
      <pubDate>Thu, 15 Mar 2024 12:00:20 GMT</pubDate>
      <guid isPermaLink="false">job_a1b2c3d4-2024-03-15T12:00:20.000Z</guid>
    </item>
    <item>
      <title>Completed</title>
      <description>Job finished successfully.</description>
      <pubDate>Thu, 15 Mar 2024 12:00:30 GMT</pubDate>
      <guid isPermaLink="false">job_a1b2c3d4-2024-03-15T12:00:30.000Z</guid>
    </item>
  </channel>
</rss>
```

**Status item types:**

| Source | Example titles |
|--------|---------------|
| Job registry | "Job Created" |
| Session turns | "Processing Started", "Turn 1", "Turn 2" |
| Session checkpoints | "Checkpoint: Analyzing files" |
| Session files | "File Edited: src/auth.ts", "File Created: README.md" |
| Progress file | "Tool: grep", "✓ grep", "✗ powershell", "Agent turn started" |
| Progress file | "Sub-agent: explore codebase", "Sub-agent completed" |
| Cron history | "Completed", "Failed" |

Status items are built from session turns and checkpoints stored in `~/.copilot/session-store.db`.

### Job Endpoints

#### GET /jobs

List all background jobs. Supports filtering and pagination.

```bash
# All jobs
curl -s http://127.0.0.1:15210/jobs

# Only running jobs, limit 5
curl -s "http://127.0.0.1:15210/jobs?status=running&limit=5"
```

```json
{
  "jobs": [
    {
      "id": "job_a1b2c3d4e5f6g7h8",
      "status": "completed",
      "prompt": "Analyze the codebase and list all API endpoints...",
      "createdAt": "2024-03-15T12:00:00.000Z",
      "updatedAt": "2024-03-15T12:00:30.000Z",
      "feed_url": "http://127.0.0.1:15210/feed/job_a1b2c3d4e5f6g7h8"
    }
  ]
}
```

Prompts are truncated to 100 characters in the list view.

#### GET /jobs/:id

Full job detail including the complete prompt, session metadata, and status timeline.

```bash
curl -s http://127.0.0.1:15210/jobs/job_a1b2c3d4e5f6g7h8
```

```json
{
  "id": "job_a1b2c3d4e5f6g7h8",
  "status": "completed",
  "prompt": "Analyze the codebase and list all API endpoints",
  "sessionId": "fox-job_a1b2c3d4e5f6g7h8",
  "cronJobId": "bg-job_a1b2c3d4e5f6g7h8",
  "createdAt": "2024-03-15T12:00:00.000Z",
  "updatedAt": "2024-03-15T12:00:30.000Z",
  "feed_url": "http://127.0.0.1:15210/feed/job_a1b2c3d4e5f6g7h8",
  "statusItems": [
    { "title": "Job Created", "description": "Request received and queued.", "timestamp": "2024-03-15T12:00:00.000Z" },
    { "title": "Processing Started", "description": "Agent began processing.", "timestamp": "2024-03-15T12:00:03.000Z" },
    { "title": "Completed", "description": "Job finished successfully.", "timestamp": "2024-03-15T12:00:30.000Z" }
  ]
}
```

#### GET /feed/:jobId

RSS 2.0 XML feed for a job. See [RSS Feed](#rss-feed) above.

```bash
curl -s http://127.0.0.1:15210/feed/job_a1b2c3d4e5f6g7h8
```

#### DELETE /jobs/:id

Delete a background job. If the job is running or queued, it is cancelled first
(cron job disabled). All job files (registry + progress) are removed.

```bash
curl -s -X DELETE http://127.0.0.1:15210/jobs/job_a1b2c3d4e5f6g7h8
```

```json
{
  "id": "job_a1b2c3d4e5f6g7h8",
  "status": "deleted",
  "previousStatus": "completed",
  "message": "Job deleted (was completed)."
}
```

Works on any job state — queued, running, completed, failed, or cancelled.

#### DELETE /jobs

Bulk-delete all jobs in a terminal state (completed, failed, cancelled).
Running and queued jobs are left untouched.

```bash
curl -s -X DELETE http://127.0.0.1:15210/jobs
```

```json
{
  "deleted": 5,
  "kept": 2
}
```

## Agent Tools

| Tool                 | Description                                                                    |
|----------------------|--------------------------------------------------------------------------------|
| `responses_status`   | Show server status, port, job count, and all endpoint URLs                     |
| `responses_restart`  | Start or restart the server under a named agent namespace (required `agent` param) |

`responses_restart` must be called before the server will listen. It claims a
namespace (e.g. `fox`), loads config from `data/{agent}/config.json`, and
writes a lockfile at `data/{agent}/responses.lock`.

## Architecture

```
Extension Process (one per session, killed on /clear)
 ├── HTTP Server (127.0.0.1:{port})
 │    ├── POST /v1/responses ──▶ 202 + cron one-shot   (default: async)
 │    ├── POST /v1/responses ──▶ session.send() + 202   (async: false, fire-forget)
 │    ├── POST /v1/responses ──▶ SSE stream             (stream: true)
 │    ├── GET  /jobs          ──▶ list background jobs
 │    ├── GET  /jobs/:id      ──▶ job detail + status items
 │    ├── GET  /feed/:jobId   ──▶ RSS 2.0 XML feed
 │    ├── DELETE /jobs         ──▶ bulk-delete terminal jobs
 │    ├── DELETE /jobs/:id    ──▶ delete job (cancel if active)
 │    ├── GET  /history       ──▶ session.getMessages()
 │    └── GET  /health        ──▶ 200 { status, jobs, uptime }
 └── Lockfile (data/{agent}/responses.lock)
```

### Async Flow (Default)

```
Client ──POST /v1/responses──▶ Responses Server
                                     │
                               create one-shot cron job
                               create job in registry
                                     │
Client ◀──202 { id, feed_url }────── │  (instant)
                                     │
            ┌────────────────────────┘
            ▼
      Cron Engine (separate extension)
            │
      fires one-shot after ~3s
            │
      spawns Copilot session (custom sessionId)
            │
      session.sendAndWait(prompt)
            │
      Agent executes ──▶ tools, files, etc.
            │
      writes turns + checkpoints to session-store.db
            │
Client ──GET /jobs/:id──▶ resolveJobStatus()
                               │
                         merges: registry + cron history + session store
                               │
Client ◀──200 { status, statusItems }
```

### Fire-and-Forget Flow (`async: false`)

```
Client ──POST { async: false }──▶ Responses Server
                                        │
                                  session.send()  (non-blocking)
                                        │
Client ◀──202 Accepted──────── Responses Server
                                        │
                                  Copilot Agent ──▶ tools, files, etc.
                                  (continues in background)
```

## Usage Examples

### Full async workflow

```bash
PORT=15210

# 1. Submit a background job
JOB=$(curl -s -X POST http://127.0.0.1:$PORT/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"List all TODO comments in the codebase"}')

echo "$JOB"
# → { "id": "job_a1b2c3d4e5f6g7h8", "status": "queued", "feed_url": "..." }

JOB_ID=$(echo "$JOB" | jq -r '.id')

# 2. Poll for completion
curl -s http://127.0.0.1:$PORT/jobs/$JOB_ID | jq '.status'
# → "queued" ... "running" ... "completed"

# 3. Get the RSS feed
curl -s http://127.0.0.1:$PORT/feed/$JOB_ID

# 4. List all jobs
curl -s http://127.0.0.1:$PORT/jobs | jq '.jobs[] | {id, status}'
```

### Custom job ID

```bash
curl -s -X POST http://127.0.0.1:15210/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"Run the test suite","id":"test-run-001"}'
```

### Fire-and-forget request

```bash
curl -s -X POST http://127.0.0.1:15210/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"Refactor the auth module","async":false}'
# → 202 { "status": "accepted", "message": "Prompt sent to current session" }
```

### Health check

```bash
curl -s http://127.0.0.1:15210/health | jq
# → { "status": "ok", "session": "connected", "port": 15210, "jobs": 3, "uptime": 1234.5 }
```

## File Structure

```
responses/
├── extension.mjs              # Entry point — joins session, creates server
├── package.json               # Dependencies (better-sqlite3)
├── README.md
├── lib/
│   ├── server.mjs             # HTTP server, request router, all endpoint handlers
│   ├── responses.mjs          # OpenAI envelope builders (200, 202, SSE stream)
│   ├── job-registry.mjs       # Background job CRUD (one JSON file per job)
│   ├── job-status.mjs         # Lazy status resolution (registry + cron + session + progress)
│   ├── cron-bridge.mjs        # Creates one-shot cron jobs, checks engine status
│   ├── rss-builder.mjs        # RSS 2.0 XML feed builder
│   ├── session-reader.mjs     # Reads session turns/checkpoints/files from session-store.db
│   ├── progress-reader.mjs    # Reads JSONL progress files (tool calls, sub-agents)
│   ├── config.mjs             # Config loader (port, logLevel)
│   ├── lifecycle.mjs          # Lockfile management, stale cleanup, legacy migration
│   ├── paths.mjs              # Path helpers (data dir, lockfile, config)
│   ├── logger.mjs             # Leveled logger
│   └── lifecycle.test.mjs     # Tests for lifecycle module
├── tools/
│   └── api-tools.mjs          # Agent tools (responses_status, responses_restart)
└── data/{agent}/              # Runtime data (created per agent namespace)
    ├── config.json            # Port and log level config
    ├── responses.lock         # PID + port lockfile
    └── bg-jobs/               # One JSON file per background job
        ├── {jobId}.json
        └── {jobId}.progress.jsonl  # Tool call / event log (JSONL)
```

## Security

The server binds to `127.0.0.1` (localhost only). It is **not** exposed to the
network. CORS headers allow all origins for local development convenience.

## Prerequisites

- **Cron engine must be running** for background jobs. The server returns `503`
  if the cron engine is not available when an async request comes in.
- `responses_restart` must be called with an `agent` parameter before the server
  will accept requests.
