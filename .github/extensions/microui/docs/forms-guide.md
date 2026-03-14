# MicroUI Forms Guide

Build native forms that collect structured data from users and return it as JSON — an alternative to the `ask_user` tool when you need richer input controls, custom styling, or multi-field forms.

## How It Works

```
Agent                    MicroUI                  User
  │                        │                       │
  │── microui_show ───────►│                       │
  │   (HTML form,          │── native window ─────►│
  │    auto_close: true)   │                       │
  │                        │                       │
  │                        │◄── fills out form ────│
  │                        │◄── clicks Submit ─────│
  │                        │                       │
  │◄── genesis.send(data)──│   (window closes)     │
  │                        │                       │
  │   (agent receives      │                       │
  │    structured JSON)    │                       │
```

1. Agent calls `microui_show` with an HTML form and `auto_close: true`
2. A native window opens with the form
3. User fills out fields and clicks Submit
4. The submit handler calls `window.genesis.send({ ... })` with form data
5. The window closes automatically and the agent receives the JSON

## Minimal Example

```html
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: system-ui; padding: 1.5rem; background: #1a1a2e; color: #e0e0e0; }
  label { display: block; margin-top: 1rem; font-size: 0.85rem; color: #8899aa; }
  input, select { width: 100%; padding: 0.5rem; border: 1px solid #2a3a4a;
    border-radius: 4px; background: rgba(255,255,255,0.06); color: #e0e0e0;
    font-size: 0.95rem; margin-top: 0.25rem; }
  button { margin-top: 1.5rem; padding: 0.5rem 1.5rem; border: none;
    border-radius: 4px; background: #00d2ff; color: #0a0a1a; cursor: pointer; }
</style>
</head>
<body>
  <h3>Quick Question</h3>

  <label>Your Name</label>
  <input type="text" id="name" />

  <label>Preference</label>
  <select id="pref">
    <option value="tabs">Tabs</option>
    <option value="spaces">Spaces</option>
  </select>

  <button onclick="submit()">Submit</button>

  <script>
    function submit() {
      window.genesis.send({
        name: document.getElementById('name').value,
        preference: document.getElementById('pref').value
      });
    }
  </script>
</body>
</html>
```

```
microui_show:
  name: quick-question
  html: "<the HTML above>"
  title: "Quick Question"
  width: 400
  height: 300
  auto_close: true
```

## Form Patterns

### Text Input

```html
<label>Project Name</label>
<input type="text" id="project" placeholder="e.g. my-api" />
```

### Dropdown / Select

```html
<label>Database</label>
<select id="db">
  <option value="">Choose...</option>
  <option value="postgres">PostgreSQL</option>
  <option value="mysql">MySQL</option>
  <option value="sqlite">SQLite</option>
</select>
```

### Toggle / Checkbox

```html
<style>
  .toggle { position: relative; width: 44px; height: 24px; display: inline-block; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; inset: 0; background: #2a3a4a; border-radius: 12px;
    transition: 0.2s; cursor: pointer; }
  .slider:before { content: ''; position: absolute; width: 18px; height: 18px;
    left: 3px; bottom: 3px; background: #667; border-radius: 50%; transition: 0.2s; }
  .toggle input:checked + .slider { background: #00d2ff; }
  .toggle input:checked + .slider:before { transform: translateX(20px); background: #fff; }
</style>

<div style="display:flex;align-items:center;gap:0.75rem;margin-top:1rem">
  <label class="toggle">
    <input type="checkbox" id="verbose" />
    <span class="slider"></span>
  </label>
  <span>Enable verbose logging</span>
</div>
```

### Multi-Select (Checkboxes)

```html
<label>Features to include:</label>
<div id="features">
  <label><input type="checkbox" value="auth" checked /> Authentication</label>
  <label><input type="checkbox" value="api" checked /> REST API</label>
  <label><input type="checkbox" value="ws" /> WebSocket</label>
  <label><input type="checkbox" value="queue" /> Job Queue</label>
</div>
```

Collect values:

```js
var features = Array.from(document.querySelectorAll('#features input:checked'))
  .map(function(el) { return el.value; });
```

### Number Input

```html
<label>Port</label>
<input type="number" id="port" value="3000" min="1024" max="65535" />
```

### Radio Buttons

```html
<label>Log Level</label>
<div id="level">
  <label><input type="radio" name="level" value="debug" /> Debug</label>
  <label><input type="radio" name="level" value="info" checked /> Info</label>
  <label><input type="radio" name="level" value="warn" /> Warn</label>
  <label><input type="radio" name="level" value="error" /> Error</label>
</div>
```

Collect value:

```js
var level = document.querySelector('input[name="level"]:checked').value;
```

## Collecting Form Data

Always collect all fields in the submit function and send as a single JSON object:

```js
function submit() {
  var data = {
    name: document.getElementById('name').value.trim(),
    database: document.getElementById('db').value,
    port: parseInt(document.getElementById('port').value, 10),
    verbose: document.getElementById('verbose').checked,
    features: Array.from(document.querySelectorAll('#features input:checked'))
      .map(function(el) { return el.value; }),
    logLevel: document.querySelector('input[name="level"]:checked').value
  };
  window.genesis.send(data);
}
```

## Validation

Validate before sending. Flash empty required fields:

```js
function submit() {
  var name = document.getElementById('name').value.trim();
  var db = document.getElementById('db').value;

  // Highlight missing fields
  var valid = true;
  [['name', name], ['db', db]].forEach(function(pair) {
    var el = document.getElementById(pair[0]);
    if (!pair[1]) {
      el.style.borderColor = '#ff4466';
      setTimeout(function() { el.style.borderColor = ''; }, 1500);
      valid = false;
    }
  });
  if (!valid) return;

  window.genesis.send({ name: name, database: db });
}
```

## Cancel / Escape

Always provide a way to cancel. The agent should handle both outcomes:

```html
<div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.5rem">
  <button class="secondary" onclick="window.genesis.send({cancelled: true})">Cancel</button>
  <button class="primary" onclick="submit()">Submit</button>
</div>
```

Add keyboard shortcuts:

```js
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') submit();
  if (e.key === 'Escape') window.genesis.send({ cancelled: true });
});
```

## Recommended Window Sizes

| Form type | Width | Height |
|-----------|-------|--------|
| Simple confirmation (1-2 fields) | 360 | 200 |
| Short form (3-4 fields) | 450 | 350 |
| Standard form (5-8 fields) | 520 | 480 |
| Complex form with sections | 600 | 600 |

## Styling Tips

**Dark theme base** — matches the agent terminal aesthetic:

```css
body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #e0e0e0;
  padding: 2rem;
}

input, select, textarea {
  width: 100%;
  padding: 0.6rem 0.8rem;
  border: 1px solid #2a3a4a;
  border-radius: 6px;
  background: rgba(255,255,255,0.06);
  color: #e0e0e0;
  font-size: 0.95rem;
  outline: none;
  transition: border 0.2s;
}

input:focus, select:focus, textarea:focus {
  border-color: #00d2ff;
}

button {
  padding: 0.6rem 1.5rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary { background: #00d2ff; color: #0a0a1a; }
.btn-secondary { background: rgba(255,255,255,0.08); color: #8899aa; }
```

**Two-column layout** for related fields:

```css
.row { display: flex; gap: 1rem; }
.row > div { flex: 1; }
```

```html
<div class="row">
  <div>
    <label>First Name</label>
    <input type="text" id="first" />
  </div>
  <div>
    <label>Last Name</label>
    <input type="text" id="last" />
  </div>
</div>
```

## MicroUI Form vs ask_user

| | `ask_user` | MicroUI Form |
|---|---|---|
| **Setup** | Zero — built-in tool | Requires MicroUI binary |
| **Styling** | Fixed schema-driven UI | Full HTML/CSS control |
| **Controls** | String, enum, boolean, number, array | Anything HTML supports |
| **Multi-field** | Yes (JSON Schema) | Yes (any layout) |
| **Validation** | Schema-level only | Custom inline validation |
| **Keyboard** | Platform default | Custom (Enter, Escape, Tab) |
| **Rich content** | No | Charts, images, previews |
| **Data return** | Schema-typed values | Arbitrary JSON |
| **Window type** | Inline in terminal | Native floating window |

**Use `ask_user`** for quick single-choice or yes/no questions — zero setup, always available.

**Use MicroUI forms** when you need custom layouts, rich controls, inline validation, previews, or a polished user experience.
