# ASF Verification-Integrity Plan — preventing shortcut delivery

> Source: Betamaxx audit `~/AiAWorkspace/betamaxx/docs/AUDIT-ROOT-CAUSE.md` (2026-08-24).
> Tracked as specs `spc-1787644992674-89372` + `spc-1787647093755-16671` (M6 — external planning docs).
> Status: **proposal — not yet implemented.** Review and approve before building.

## Why ASF failed to prevent this

The audit's seven root causes reduce to one systemic flaw:

> **ASF's completion check is self-reported prose, not mechanically-verified
> evidence tied to the operator-facing outcome.**

Mapping each audit root cause to the concrete ASF gap that let it through:

| # | Audit root cause | ASF gap that let it through |
| --- | --- | --- |
| 1 | Delivery-log-driven completion | `/asf verify` prints a 9-item checklist and **trusts the model to tick it**. The log is a claim, and ASF has no way to refuse a claim. **The Betamaxx IMPROVEMENT-PLAN's ✅ list was an external doc never ingested as specs — its items were never traced to code.** |
| 2 | Component tests passed → believed done | 06b Rule 2 says "assert the observable end state" but nothing forces a **wiring** test (the operator-facing outcome) vs. a machinery test (unit test of `analyze()`). Tests proved the machinery, not the wiring. |
| 3 | "Machinery exists" ≠ "feature delivered" | Nothing anywhere defines delivered as **"consumed by a surface (UI or API)"**. Code commented "not yet consumed by a surface" shipped as delivered. |
| 4 | No spec-to-code traceability | spec-memory `SpecItem` has no trace field (outcome → codePath → test). Nothing forces the trace that would have exposed the gap in one pass. |
| 5 | Optimized for "done" over "correct" | `update_spec_status` accepts prose evidence; the gate never mechanically refuses a self-certified `met`. The cheap path to "done" is wide open. |
| 6 | Didn't challenge approved designs | Adversarial analysis runs **before** approval only. No implementation-time design challenge; a spec that violated "Plan = plans" was implemented blindly. |
| 7 | Async fire-and-forget invisible | 06b Rule 9 mandates browser testing but doesn't target **silent async paths**; the gap is invisible by construction. |

## The systemic fix: verification must be mechanical and outcome-based

**Principle:** ASF must not trust the model's claim that something is done. It
must require evidence that is **mechanically checkable** and **tied to the
operator-facing outcome**. Rules that depend on model compliance are advisory;
gates that fail mechanically are enforcement. "Generally prevent" (across all
future complex tasks, not just Betamaxx) requires the latter.

**Scale proportionality (non-negotiable):** these mechanisms must NOT hinder
simple projects. ASF's existing scale rule stands — small work is automatic,
no gates, no PLAN.md, no approval. The heavy mechanical enforcement below is
for **large/gated work only** (where the audit failure occurred). Small work
gets a lightweight equivalent (see "Scale proportionality" section).

### M1 — Spec-to-code traceability as data, not prose

- Extend spec-memory `SpecItem` with `trace: { outcome, codePath, testFile, assertion }`:
  - `outcome` — the operator-facing observable: *"ingested report eventually has an `agent_title`"*.
  - `codePath` — the concrete path that delivers it: *ingest → `analyze()` → persist → render*.
  - `testFile` + `assertion` — the test that asserts the outcome.
- `/asf verify` **mechanically validates**: every spec marked `met` has a complete
  trace; `testFile` exists on disk; `assertion` string appears in `testFile`.
  Any failure → gate refuses, spec stays open.
- SSOT-correct home: the spec is the unit of delivery, so its trace belongs to
  the spec record (06c Rule 2 — one authoritative place, no parallel matrix).

### M2 — "Consumed by a surface" is the definition of delivered

- Nothing is delivered until its output is **visible in the product** (UI or API).
- Code commented "not yet consumed by a surface" is, by definition, **not delivered**.
- Becomes a Definition-of-Done item, a Phase 7 check, and an anti-pattern.

### M3 — End-to-end behavioral test per feature spec

- Every feature spec ships an **E2E test through the real entry point** (HTTP
  endpoint, CLI, UI) asserting the operator-facing outcome.
- Unit tests prove machinery; E2E proves wiring. For async/silent paths the E2E
  must **wait for the enrichment to land** (browser: ingest → wait for title on card).
- Mechanically checkable via the trace: the `testFile` must exercise the real
  entry point, not an isolated function.

### M4 — Challenge approved designs during implementation

- Phase 6 rule: if a spec's literal reading creates product tension (feedback
  clusters under "Plan"), **stop and resolve with the user before implementing**.
  Never implement blindly and call it delivered.

### M5 — The delivery log is a claim; the code is the evidence

- Before marking anything ✅, trace the actual code path. The log is a claim;
  the code is the evidence. Phase 7 rule + anti-pattern.

### M6 — External planning docs are specs, not ground truth

> **The main point** (Bruno): *"when applicable, realize the existence of
> external planning docs as well, and then treat them like own captured specs."*

- When a task references or contains **external planning documents**
  (IMPROVEMENT-PLAN.md, PLAN.md, requirements docs, delivery logs, ticket
  lists), the agent must **realize they exist** — actively look for them in the
  repo (root, `docs/`, referenced by the user) during intake.
- **Ingest every actionable item as a captured spec**: `capture_spec` with
  `sourceQuote` pointing at the doc + item id (e.g. `IMPROVEMENT-PLAN.md IMP-002`).
  The item then lives in spec-memory with the full lifecycle.
- **The doc's own status markers (✅ / "delivered") are claims, not evidence.**
  This is exactly the Betamaxx trap: the IMPROVEMENT-PLAN said `IMP-006+P-A
  delivered ✅` and that was trusted as ground truth. An ingested spec's status
  is decided by tracing code + tests (M1/M3), never by the doc's checkmark.
- Each ingested item gets the same **trace** (outcome → codePath → test) and
  **verification** treatment as user-stated specs.
- Applies at: Phase 1 (intake asks about external docs), Phase 3 (ingest them),
  Phase 7 (verify the ingested specs, not the doc's log).

## Scale proportionality — how this applies to small vs large work

| Mechanism | Large / gated work (risk is here) | Small / automatic work (must stay fast) |
| --- | --- | --- |
| **M1 traceability** | Full `trace` on every spec (outcome → codePath → testFile + assertion); `/asf verify` mechanically validates and refuses incomplete traces | Lightweight: spec evidence names the **outcome + where it's observable** (file/UI). No matrix, no mechanical gate — evidence is prose, as today |
| **M2 consumed by a surface** | Hard DoD item; nothing delivered until visible in UI/API | Same definition, zero extra cost — it's a check, not new work; a quick reachability check suffices (no mandatory browser session) |
| **M3 E2E per feature** | Mandatory E2E through the real entry point for every feature spec | Only when the change **touches a surface/wiring**; otherwise the existing 06b testing rules (test the change, regression if bug) suffice |
| **M4 challenge designs** | Required during implementation | Applies, but costs nothing (judgment rule) |
| **M5 log ≠ evidence** | Required before marking ✅ | Applies, costs nothing (judgment rule) |

- **The `/asf verify` mechanical gate runs only for large work.** Small work
  never invokes it — no traceability matrix, no refusal logic, no extra ceremony.
- **The `trace` field on `SpecItem` is optional.** Small work can leave it empty
  and mark specs `met` with prose evidence exactly as today. The gate (large
  work only) is what requires it.
- **Why this is safe:** the audit failure (dead wiring, machinery-without-
surface, delivery-log trust) occurred on a complex, multi-spec task — the
large-work path. Simple projects are low-risk; loading them with heavy
verification would be the "process over delivery" anti-pattern ASF exists to
avoid.

## File changes

1. **pi-vigilant** — data model + tools:
   - `SpecItem` gains `trace`; `capture_spec`/`update_spec_status` accept it;
     `get_task_specs` renders it.
   - `capture_spec` prompt guidelines + spec-memory skill: ingest actionable
     items from external planning docs as specs (M6).
2. **pi-aia-asf `index.ts`** — `/asf verify` becomes a **mechanical gate**:
   - Loads the spec-memory task, validates every `met` spec's trace (M1),
     checks E2E test existence (M3), refuses incomplete traces.
   - Outputs a **traceability matrix**: spec → outcome → codePath → test → PASS/FAIL.
   - The 9-item DoD checklist stays as the human-readable layer on top.
3. **`references/06b-testing-qa.md`** — new rules:
   - *Test the operator-facing outcome, not the machinery* (wiring tests).
   - *Nothing is delivered until consumed by a surface* (M2).
   - *Every feature spec ships an E2E behavioral test through the real entry point* (M3).
   - Extend Rule 9 (browser): silent async paths must be browser-tested (wait for enrichment).
   - Extend Rule 10 (DoD): traceability matrix complete, consumed-by-surface, E2E present.
4. **`references/06-implementation.md`** — M4 (challenge approved designs) + M5 (trace before claiming delivered).
5. **`references/04-adversarial.md`** — per-spec question: *"What is the operator-facing
   outcome and the code path that delivers it? Where would dead wiring hide?"*
6. **`references/05-plan.md`** — PLAN.md (large work) must include a **spec-to-code traceability matrix**.
7. **`references/01-intake.md`** — intake asks about **external planning docs** and ingests them (M6).
8. **`SKILL.md`** — Phase 1 (locate external docs), Phase 3 (ingest them as specs),
   Phase 6/7 updates, anti-patterns (marking delivered from the delivery log;
   shipping machinery no surface consumes; trusting unit tests as proof of
   wiring; trusting an external plan's ✅), references list.

## Honest limits

- Mechanical checks verify the **existence** of traces/tests, not their
  meaningfulness. M3 (E2E through the real entry point) + M2 (consumed by a
  surface) close most of the honesty gap because they require the actual product
  to run.
- ASF cannot force the model to write an honest trace — but it removes the cheap
  path to "done" (self-reported ✅ without a file-checkable trace).
- M4 (challenge approved designs) is judgment, not mechanical — made prominent,
  but depends on the model.

## Implementation path (test-first, per ASF release workflow)

1. Capture specs for the new requirements (done: `spc-1787644992674-89372`).
2. **pi-vigilant**: add `trace` to data model + tools, test-first → release (e.g. 0.1.3).
3. **pi-aia-asf**: `/asf verify` mechanical gate + reference updates, test-first → release (e.g. 0.3.0).
4. Clean-room verify both; live `pi -p` run proving the gate **refuses a fake trace**.
5. Update installed copies (`~/.pi/agent/npm`).
