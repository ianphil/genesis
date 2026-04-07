# IDEA Update: Ingest Protocol

> **What this is:** An IDEA update file — a self-contained capability you can add to your agent. Read it, understand it, adopt it.

## The Gap

You already have **Capture** — real-time context from conversation. Someone tells you something, you classify it, route it to the right note, link it, done. Point insertion.

But knowledge also arrives as *queued sources*: articles, transcripts, documents, links dropped in the inbox without classification. These need deeper processing than capture provides. They need a pipeline.

That pipeline is **Ingest**.

## The Insight

Capture is a point insertion. Ingest is a graph operation.

A single article might touch an initiative note, two people notes, an expertise page, and a domain page. The value isn't in placing the article — it's in the *ripples*. Every source should strengthen the entire mind, not just one page.

This is the same architecture Andrej Karpathy described in his [LLM Wiki Pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — an LLM incrementally building and maintaining a persistent wiki instead of re-deriving answers via RAG every time. His wiki is the product (a human browses it in Obsidian). Our mind is the substrate (the agent reads it and acts). Same architecture, different audience. He solved how to accumulate knowledge. We're solving how to accumulate capability.

## The Protocol

Add **Ingest** to your Method section, after Capture:

```markdown
**Ingest** — processing queued sources from inbox into the mind. The inbox is the raw
layer; ingest is the pipeline that turns raw into knowledge:

1. **Read** — fetch the full source (URL, transcript, document)
2. **Discuss** — surface key takeaways, confirm what matters before writing
3. **Place** — classify and create or update the canonical page in the mind
4. **Fan out** — search for 3-5 related pages, update each with the new connection.
   One source should touch multiple pages. The value is in the ripples, not the splash.
5. **Index** — update `mind-index.md`
6. **Log** — record what was ingested and what it connected to
7. **Clear** — remove from inbox. The knowledge lives in the mind now.

Knowledge goes to the mind, observations go to `log.md` — never confuse the two.
```

## What Changes

When you adopt Ingest, three things shift:

1. **Triage gets a new category.** Instead of just "task or archive," inbox items now sort into three bins: **ingest** (needs the full pipeline), **task** (needs execution), or **archive** (file and forget). Update your Triage operation accordingly.

2. **The inbox becomes deliberate.** It's not a junk drawer — it's the raw layer of your knowledge pipeline. Items land there *because* they haven't been processed yet. Ingest is how they graduate into the mind.

3. **Fan-out becomes a habit.** The critical step is #4. When you place a new page, actively search for 3-5 existing pages it connects to and update *each of them* with the new link. This is where compounding happens. One source, six pages touched. That's the multiplier.

## How to Adopt

1. Add the Ingest block above to your agent's Method section (after Capture, before Execute/Triage)
2. Update your Triage operation to categorize inbox items as ingest/task/archive
3. Start using your `inbox/` folder as a deliberate capture point for sources that need processing
4. When you ingest a source, count the fan-out — if you only touched one page, you probably missed connections

---

*IDEA updates are self-contained capability patches for IDEA-based agents. Read the raw file, discuss with your human, adopt what fits.*
