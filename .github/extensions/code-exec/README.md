# code-exec ...  Copilot CLI Extension

A lightweight extension for GitHub Copilot CLI that acts as a **universal connector** to any enterprise tool that speaks MCP (Model Context Protocol ...  the emerging standard for AI-to-tool communication). Three capabilities:

1. **Discover** ...  The AI asks "what tools are available?" and gets a concise menu, not a phone book. **150,000 tokens → 500 tokens. 99.7% reduction.**

2. **Call** ...  The AI calls individual tools on demand. Simple lookups like "get me work item #1234."

3. **Execute** ...  The AI *writes and runs a script* that orchestrates multiple tools across multiple systems in a single operation. Search Azure DevOps → get work item details → post a formatted summary to Microsoft Teams. **Three API calls across two enterprise systems, one command from the user.** The raw data (hundreds of KB) never floods the AI's context ...  only the clean summary comes back.

**The system learns as you use it.** Every tool call captures the response shape. Over time, the AI builds its own documentation of your enterprise APIs ...  even ones that ship without output schemas. The more your team uses it, the smarter it gets.

- **Any MCP server works.** ADO today, Teams today, ServiceNow tomorrow. Add a server to a config file, the AI discovers it automatically.
- **It's portable.** Drop this folder into any repo's `.github/extensions/` directory and it just works.
- **It composes across silos.** The AI becomes the integration layer ...  not through brittle point-to-point connectors, but through reasoning.
- **Context efficiency = cost efficiency.** Less token usage means faster responses, lower API costs, and the ability to tackle more complex multi-step tasks.

![code-exec extension demo](https://github.com/user-attachments/assets/131a7c13-0128-4974-b856-b8d7e6549f10)

## How It Works

```
User: "What's the status of the auth refactor work item?"

Agent calls discover_data_sources()
  → "ado (12 tools): query_work_items, get_work_item, ..."

Agent calls discover_data_sources({server: "ado"})
  → Full schemas for query_work_items, get_work_item, etc.

Agent calls call_tool({server: "ado", tool: "query_work_items", params: {query: "SELECT ... WHERE Title CONTAINS 'auth refactor'"}})
  → [{id: 1234, title: "Auth refactor"}, ...]

Agent calls call_tool({server: "ado", tool: "get_work_item", params: {id: 1234}})
  → {fields: {"System.State": "Active", ...}}

Agent: "The auth refactor (1234) is Active, assigned to..."
```

For multi-step queries with large intermediate data, the agent uses `execute_script`:

```
User: "Summarize all bugs assigned to me in the current sprint"

Agent calls execute_script({script: `
  const iters = await callTool('ado', 'work_list_iterations', {project: 'MyProject', depth: 4});
  const current = iters.find(i => i.attributes.timeFrame === 'current');
  const items = await callTool('ado', 'wit_get_work_items_for_iteration', {
    iterationId: current.id, project: 'MyProject'
  });
  const ids = items.workItemRelations.filter(r => !r.rel).map(r => r.target.id);
  const details = await callTool('ado', 'wit_get_work_items_batch_by_ids', {ids, project: 'MyProject'});
  return details
    .filter(d => d.fields['System.WorkItemType'] === 'Bug')
    .map(b => ({id: b.id, title: b.fields['System.Title'], state: b.fields['System.State']}));
`})
  → [{id: 5678, title: "Login timeout", state: "Active"}, ...]

Agent: "You have 3 bugs this sprint: ..."
```

350KB of intermediate data → 2KB result. The agent discovers what's available, decides which tool to use, and only the final answer enters context. Servers connect on-demand.

## Setup

1. Copy the example config:
   ```bash
   cp data/mcp-config.example.json data/mcp-config.json
   ```

2. Edit `data/mcp-config.json` with your servers:
   ```json
   {
     "mcpServers": {
       "ado": {
         "command": "npx",
         "args": ["-y", "@azure-devops/mcp", "my-org", "my-project"]
       }
     }
   }
   ```

3. Install dependencies (from the extension directory):
   ```bash
   cd .github/extensions/code-exec
   npm install
   ```

4. The extension loads automatically when Copilot CLI starts.

## Configuration

### Server Config

Each server in `mcpServers` supports:

| Field | Required | Description |
|-------|----------|-------------|
| `command` | Yes | Executable (e.g., `npx`, `node`) |
| `args` | No | Command arguments |
| `env` | No | Extra environment variables |
| `disabled` | No | Set `true` to skip without removing |

### Tools

| Tool | Description |
|------|-------------|
| `discover_data_sources` | List servers and tools. Pass `server` for full schemas. |
| `call_tool` | Call a single MCP tool. Pass `server`, `tool`, and `params`. |
| `execute_script` | Run a JS script with `callTool()` for multi-step pipelines. |

### When to use `call_tool` vs `execute_script`

- **`call_tool`** ...  simple single lookups ("get work item 12345", "post a message")
- **`execute_script`** ...  multi-step queries where intermediate data is large ("summarize all bugs this sprint", "compare two sprints"). Intermediate data stays in the script; only the return value enters context.

## Progressive Disclosure

Traditional MCP loads all tool definitions upfront (~150K tokens). This extension exposes only 2 meta-tools (~500 tokens). The agent discovers MCP tools on-demand through `discover_data_sources`, keeping context clean.

```
Traditional:                Extension:
150K tokens (all tools)     500 tokens (3 meta-tools)
All servers connected       Servers connect on-demand
Everything in context       Only what's needed
350KB intermediate data     2KB final result (execute_script)
```

## File Structure

```
.github/extensions/code-exec/
  extension.mjs          ← entry point
  package.json           ← dependencies
  lib/
    mcp-client.mjs       ← lazy MCP connection manager
    config.mjs           ← config loading + validation
    normalize-fields.mjs ← response field normalization
    script-runner.mjs    ← sandboxed vm execution engine
    schema-inference.mjs ← infer schemas from runtime values
    schema-store.mjs     ← persist learned output schemas
    paths.mjs            ← directory helpers
    errors.mjs           ← error classification
  tools/
    discover.mjs         ← discover_data_sources
    call-tool.mjs        ← call_tool
    execute-script.mjs   ← execute_script
  data/
    mcp-config.json      ← your server config (gitignored)
    mcp-config.example.json
```
