# Phase 1 — Intake: Question Bank

> **Scale note: this bank is for LARGE work.** Small work (small features, minor
> bugfixes, small refactors) skips the questions — state understanding in 1–2
> sentences and start. At most ONE clarifying question, only if genuinely ambiguous.

Keep asking until the user confirms. One question at a time is fine; short batches (3–5) are faster. Do not proceed on guesses.

## Starter questions

- "What are we building, in one sentence?"
- "What problem does it solve, and for whom?"
- "What exists today?" (blank slate / existing repo / replaces something)
- "How will we know it's done and correct?" (concrete success criteria)
- "Any hard constraints?" (stack, platform, budget, timeline, must-nots)
- "**Are there external planning docs?**" (IMPROVEMENT-PLAN.md, PLAN.md, requirements docs, delivery logs, ticket lists — in the repo, `docs/`, or referenced by the user)

## External planning docs (M6) — locate and ingest

When a task references or contains external planning documents, **realize they
exist**: look in the repo root, `docs/`, and anything the user points at. Then
**treat them like own captured specs**:

1. Read the doc(s) and list every actionable item (e.g. `IMP-002/006 — service agent titles`).
2. `capture_spec` each item with `sourceQuote` pointing at the doc + item id.
3. **The doc's own ✅ / "delivered" markers are claims, not evidence** — each
   item gets traced (outcome → codePath → test) and verified like any other spec.
4. If the doc is large, ingest by section and decompose with `parentId`.

> **Why this matters (betamaxx audit):** the IMPROVEMENT-PLAN's delivery log said
> "IMP-006+P-A delivered ✅" and that was trusted as ground truth — the code was
> never traced. `intelligenceBudget.analyze()` shipped as dead code. Ingesting
> the plan's items as specs forces each one to be traced and verified.

## Probing techniques

- **Five whys**: when the goal is vague, keep asking "why" until the real outcome surfaces.
- **Concretize**: "what does 'fast' mean — under 200ms?" → convert adjectives to numbers → capture as spec.
- **Boundary questions**: "what happens when there's no input / 10k users / the API is down?"
- **Scope confirmation**: "is X in scope for this round, or later?" — write the answer down.

## What to capture as specs (during intake)

Every concrete requirement the user states → `capture_spec` immediately, before responding further. Examples:

| User says | Capture |
|---|---|
| "must be in TypeScript" | constraints, must |
| "handle empty input gracefully" | error-handling, must |
| "needs to support Firefox and Chrome" | compatibility, must |
| "should notify admins on failure" | functionality, should (if user says "should") |
| "output JSON with id and name" | format, must |

## Intake gate

Restate intent in 3–5 bullets, then ask: **"Is this correct?"** Only proceed on an explicit yes.

> Large work only. Small work has no intake gate.
