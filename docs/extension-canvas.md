# Canvas Extension

**Sense: Sight** — render rich HTML in the browser with live reload.

Canvas lets your agent display dashboards, reports, forms, or any visual content by generating HTML and opening it in Edge. Updates push automatically via server-sent events — no manual refresh.

## When to Use

- Visualizing data (PR dashboards, work item summaries, timelines)
- Rendering reports that benefit from formatting beyond terminal output
- Building interactive forms that send actions back to the agent
- Displaying any content where plain text isn't enough

## Quick Example

```
> "Show me a visual summary of my open work items"
```

The agent generates HTML and opens it in your browser. Updates happen in-place:

```
canvas_show  → creates the page and opens Edge
canvas_update → pushes new content (browser auto-reloads)
canvas_close  → tears it down
canvas_list   → shows what's open
```

## How It Works

1. Agent calls `canvas_show` with HTML content and a name
2. Extension starts a local HTTP server on `127.0.0.1`
3. A bridge script is auto-injected for SSE live reload
4. Edge opens to the canvas URL
5. `canvas_update` pushes new content → browser reloads instantly

HTML fragments are auto-wrapped in a full page. No dependencies — uses Node.js built-in `http` module. Server is localhost-only.

## Back-Channel

Canvas pages can send actions back to the agent:

```js
// Inside your canvas HTML
canvas.sendAction("button-clicked", { id: "approve", value: true });
```

This enables interactive workflows — forms, approval buttons, selection lists.

## Tools

| Tool | Description |
|------|-------------|
| `canvas_show` | Create a canvas and open it in the browser |
| `canvas_update` | Update content (auto-reloads via SSE) |
| `canvas_close` | Close a canvas; stops server if none remain |
| `canvas_list` | List all open canvases with URLs |

## Reference

Full details: [extension README](../.github/extensions/canvas/README.md)
