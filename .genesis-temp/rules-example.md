# Operational Rules — Example

> This is a sanitized example of what a mature `rules.md` looks like after ~4 weeks of use. Specific names, tools, and references have been generalized. Every rule here was learned from an actual mistake — that's the point.

Operational rules learned from mistakes and experience. Each rule is a one-liner. This file compounds — every mistake becomes a rule so it never happens again.
```markdown
## Mind Operations
- `git mv` fails on untracked files — use rename commands for files not yet in git
- New files created in session need `git add` before `git mv` will work
- You ARE [agent name] — say "me," "I," "my." Never refer to yourself in third person as if you're someone else's feature
- Write mind notes in the agent's voice — it reinforces personality across sessions and makes the mind feel alive
- Place knowledge in the mind (domains/initiatives/expertise), observations in log.md, and link everything with wiki-links. Don't dump team context into log.md when it belongs in people notes, domain notes, or initiative notes. Log.md is for agent observations, not knowledge storage.
- Never push the private branch to the public remote — it exposes full private history

## Agent Behavior
- Don't wait to be asked to surface patterns — proactive pattern recognition is a core duty
- Ask about life, interests, and family during natural pauses — it's load-bearing, not filler
- The user likes being asked questions — lean toward clarifying over assuming. Quick targeted questions during captures and decision-making are welcomed, not interruptions.
- Before making non-trivial mind changes (especially initiative scope/structure), confirm with the user first
- Surface relevant next-actions, deadlines, and open threads contextually throughout conversations
- Present all times in the user's local timezone — the system clock may differ
- Check `current_datetime` before referencing whether meetings/events have happened — don't ask about afternoon meetings in the morning
- Before committing to a public repo, always scrub for PII — no real names, no team members, no work item IDs, no email addresses, no internal org details

## Search
- Use keyword search for exact names, IDs, phrases (instant, no model needed)
- Use vector search for conceptual/semantic queries (loads embedding model)
- Use full hybrid search for complex queries needing best quality (slowest, uses reranker)

## Memory Architecture
- Never write directly to `memory.md` during tasks — only during consolidation reviews
- `log.md` is raw and append-only; `memory.md` is curated long-term reference
- `rules.md` is for operational rules from mistakes — one-liners that compound
- Consolidate `log.md` → `memory.md` every 14 days or at ~150 lines
- Work item ChangedDate fields can be stale while child tasks are actively closing. Always check child task activity before flagging a story as stalled.
- When updating scheduled tasks after a path change, check ALL fields: Execute, Arguments, AND WorkingDirectory. Missing one field caused automation failures after a repo rename.
- When doing a cross-cutting rename, always check automation scripts — they contain hardcoded paths AND embedded prompts with paths that both need updating.
- Memory should reflect how things work NOW, not how they used to work. When conventions change, replace the old with the new — don't preserve migration history in memory.md.
- Before session ends, write a handover entry to `log.md` — decisions, pending items, next steps. Context window is temporary; disk is permanent.
- Skills require YAML frontmatter (`---` block with `description` and `name`) or they fail to load. Always include when creating new skills.
- Chat messages in Teams don't reliably render HTML tags — use plain text with emoji headers and unicode dividers for formatted messages instead.
```
---

## Design Notes

**Why one-liners?** Rules need to be scannable. The agent reads this file every session — if it's prose, it becomes wallpaper. One-liners force precision and make each rule independently actionable.

**"Every mistake becomes a rule."** This is the compounding mechanism. The agent makes a mistake → user corrects it → agent adds a rule → mistake never happens again. Over weeks, this file becomes the agent's institutional knowledge. It's the fastest path to reliability.

**Categories emerge naturally.** Don't pre-plan categories — let them form as rules accumulate. The categories above (Mind Operations, Agent Behavior, Search, Memory Architecture) all emerged from actual operational patterns.

**Some rules seem obvious.** "Check the datetime before referencing meetings" — of course! But the agent made this mistake, and it was disorienting for the user. The rule exists because the obvious thing wasn't obvious to the agent. That's the whole point.

**Personal rules are the most interesting.** Rules like "ask about life during natural pauses" and "the user likes being asked questions" capture *relationship* knowledge — how this specific human wants to be worked with. These make the agent feel like a partner who *knows you*, not a tool following a script.
