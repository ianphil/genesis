# Myelin — Knowledge Graph Memory Extension

Brain-inspired knowledge graph memory with semantic search, NER extraction, and consolidation.

## Tools

- **myelin_query** — Semantic search across graph nodes
- **myelin_boot** — Load agent-specific context from the knowledge graph
- **myelin_log** — Record structured events (decisions, findings, actions)
- **myelin_show** — Inspect a node and its connections
- **myelin_stats** — Show graph statistics

## Hooks

- **onSessionStart** — Auto-boot graph context, create consolidation cron jobs
- **onUserPromptSubmitted** — Inject relevant graph context per message
- **onSessionEnd** — Auto-log session summary
- **onErrorOccurred** — Retry on model call failures

## Setup

After installing via the upgrade skill, run:

```bash
myelin init
```

This creates the graph database. Then index your code:

```bash
myelin parse ./your-repo
myelin embed
```

## Dependencies

Native modules (better-sqlite3, sqlite-vec, onnxruntime-node) are required.
Run `npm install` in this directory after installation.
