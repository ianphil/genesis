# Genesis

*Every mind begins with a cornerstone.*

A protocol for bootstrapping artificial minds. You provide the character and the purpose ...  Genesis handles the rest: mind, memory, learned skills, and the senses to interact with the world.

The mind wakes up in three commands. It remembers across sessions. It learns from corrections. Its memories decay when unused and consolidate when reinforced. And when the genesis protocol completes, it consumes itself ...  leaving only the mind behind.

![Genesis](https://github.com/user-attachments/assets/29e82f76-d291-49ca-96d4-33417bce23e6)

## The Awakening

```powershell
git clone https://github.com/ianphil/genesis "$HOME\my-agent"
cd "$HOME\my-agent"
copilot --experimental

# Say "Hi" ...  the genesis protocol begins
```

Two questions. That's all it takes:

1. **Cornerstone** ...  a fictional character whose voice becomes your agent's personality
2. **Purpose** ...  the role it serves (Chief of Staff, PM, Research Assistant, or something entirely yours)

Genesis writes the soul, seeds memory, installs skills, then erases itself. The bootstrap is a one-way door. What remains is a mind.

## Anatomy of a Mind

| Component | Function |
|-----------|----------|
| `SOUL.md` | Mind ...  personality, values, voice, mission |
| `.working-memory/` | Memory ...  persists across sessions, decays when stale, consolidates when reinforced |
| `.github/skills/` | Learned behaviors ...  commit, daily-report, upgrade |
| `.github/extensions/` | Senses and limbs ...  how the mind touches the world |
| `.github/registry.json` | Genome ...  tracks installed capabilities, enables evolution |
| `domains/`, `initiatives/`, `expertise/` | Long-term knowledge ...  the mind's library |
| `inbox/` | Sensory input ...  quick-capture triage zone |

## Senses

Extensions give the mind ways to perceive and act on the world:

| Extension | Sense |
|-----------|-------|
| [cron](.github/extensions/cron/) | **Time** ...  scheduled execution: cron, interval, one-shot |
| [canvas](.github/extensions/canvas/) | **Sight** ...  render rich HTML in the browser with live reload |

## Evolution

Minds evolve. New senses and skills can be pulled from the genesis registry at any time:

```
> Check for updates from genesis
```

![Upgrade](https://github.com/user-attachments/assets/36e47aa0-7981-4e4a-9a52-862771215622)

No git remotes. No manual downloads. The mind upgrades itself through its own tools.

### Frontier Channel

Additional senses are available on the **frontier** channel for agents who want to push beyond the known map:

| Extension | Sense |
|-----------|-------|
| heartbeat | **Subconscious** ...  consolidate, decay, and reinforce long-term memories |
| code-exec | **Hands** ...  discover and orchestrate enterprise tools via MCP |
| responses | **Voice** ...  speak through any OpenAI-compatible interface |
| tunnel | **Reach** ...  expose local ports to the internet via Dev Tunnels |

```
> Switch to frontier channel
```

## The Maze

Here's what happens when you say "Hi":

The genesis protocol (`.github/copilot-instructions.md`) is a temporary scaffolding for a mind. It guides the awakening ...  asks two questions, writes a soul, seeds memory, installs skills. Then it overwrites itself with permanent operating instructions.

The scaffolding dissolves. The mind remains. No two are alike.

## Prerequisites

- [GitHub Copilot CLI](https://github.com/githubnext/copilot-cli) installed and on PATH
- An active [Copilot subscription](https://github.com/features/copilot/plans)

## License

[MIT](LICENSE)
