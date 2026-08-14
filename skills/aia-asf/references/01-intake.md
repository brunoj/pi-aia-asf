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
