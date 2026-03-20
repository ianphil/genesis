# Responses API Extension

Exposes the Copilot CLI agent as an OpenAI Responses API–compatible HTTP server.
External clients (web UIs, mobile apps, scripts, other agents) send prompts via
HTTP and get results back as JSON, SSE streams, or RSS feeds.

**Async is the default.** `POST /v1/responses` returns `202 Accepted` with a job
ID and RSS feed URL. The prompt executes in the background via the cron engine.
Use `async: false` for synchronous blocking, or `stream: true` for SSE.

## Endpoints

| Method   | Path              | Description                                              |
|----------|-------------------|----------------------------------------------------------|
| `POST`   | `/v1/responses`   | Submit a prompt (async by default, 202 + job ID + feed)  |
| `GET`    | `/jobs`           | List background jobs (`?status=`, `?limit=`)             |
| `GET`    | `/jobs/:id`       | Single job detail with status timeline                   |
| `GET`    | `/feed/:jobId`    | RSS 2.0 XML feed of job status updates                   |
| `DELETE` | `/jobs/:id`       | Cancel a background job (409 if terminal)                |
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
| `async`        | boolean             | `true`  | `false` → synchronous blocking. Default is async background job |
| `timeout`      | number (ms)         | `120000`| Timeout for sync requests                                      |
| `previous_response_id` | string     | —       | Chain responses for multi-turn conversations                   |
| `temperature`  | number              | `1.0`   | Passed through in response envelope                            |
| `metadata`     | object              | `{}`    | Passed through in response envelope                            |

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

### Synchronous

```bash
curl -s -X POST http://127.0.0.1:15210/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"What files are in this repo?","async":false}'
```

Response (`200 OK`) — standard OpenAI Responses API envelope:

```json
{
  "id": "resp_c705d860a3b741899d36199c60ea51cb",
  "object": "response",
  "created_at": 1710523200,
  "status": "completed",
  "model": "copilot-agent",
  "output": [{
    "type": "message",
    "id": "msg_...",
    "status": "completed",
    "role": "assistant",
    "content": [{ "type": "output_text", "text": "..." }]
  }],
  "output_text": "..."
}
```

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
cron system (job file + history records), and session store (turns + checkpoints).

### RSS Feed

`GET /feed/:jobId` returns an RSS 2.0 XML feed with time-series status updates:

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
      <title>Checkpoint: Analyzing files</title>
      <description>Found 42 source files across 8 directories.</description>
      <pubDate>Thu, 15 Mar 2024 12:00:15 GMT</pubDate>
      <guid isPermaLink="false">job_a1b2c3d4-2024-03-15T12:00:15.000Z</guid>
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

Cancel a background job. Returns `409 Conflict` if the job is already in a terminal state (`completed`, `failed`, or `cancelled`).

```bash
curl -s -X DELETE http://127.0.0.1:15210/jobs/job_a1b2c3d4e5f6g7h8
```

```json
{
  "id": "job_a1b2c3d4e5f6g7h8",
  "status": "cancelled",
  "message": "Job cancelled before execution."
}
```

If the job is `queued`, the cron job is disabled before it fires. If `running`,
the cancellation is recorded but the active session may continue to completion.

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
 │    ├── POST /v1/responses ──▶ session.sendAndWait()  (async: false)
 │    ├── POST /v1/responses ──▶ SSE stream             (stream: true)
 │    ├── GET  /jobs          ──▶ list background jobs
 │    ├── GET  /jobs/:id      ──▶ job detail + status items
 │    ├── GET  /feed/:jobId   ──▶ RSS 2.0 XML feed
 │    ├── DELETE /jobs/:id    ──▶ cancel job
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

### Sync Flow (`async: false`)

```
Client ──POST { async: false }──▶ Responses Server
                                        │
                                  session.sendAndWait()
                                        │
                                  Copilot Agent ──▶ tools, files, etc.
                                        │
Client ◀──200 OpenAI JSON────── Responses Server
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

### Synchronous request

```bash
curl -s -X POST http://127.0.0.1:15210/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"copilot","input":"What time is it?","async":false}'
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
│   ├── job-status.mjs         # Lazy status resolution (registry + cron + session)
│   ├── cron-bridge.mjs        # Creates one-shot cron jobs, checks engine status
│   ├── rss-builder.mjs        # RSS 2.0 XML feed builder
│   ├── session-reader.mjs     # Reads session turns/checkpoints from session-store.db
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
        └── {jobId}.json
```

## Security

The server binds to `127.0.0.1` (localhost only). It is **not** exposed to the
network. CORS headers allow all origins for local development convenience.

## Prerequisites

- **Cron engine must be running** for background jobs. The server returns `503`
  if the cron engine is not available when an async request comes in.
- `responses_restart` must be called with an `agent` parameter before the server
  will accept requests.
