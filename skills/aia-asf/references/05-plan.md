# Phase 5 — PLAN.md Template

> **Scale note: this phase is for LARGE work only.** Small work skips PLAN.md and
> the approval gate entirely — implement directly.

Write `PLAN.md` in the project root. It must be executable by any competent engineer without re-deriving decisions.

```markdown
# <Project> — Plan

Status: DRAFT / APPROVED
Date: YYYY-MM-DD

## Goal
One sentence. What are we building and why?

## Context
Existing system, repo layout, relevant prior work. Links to research sources.

## Approach
Decided approach with rationale. Cite the research (package names, URLs).

## Decisions (P01 — ADRs, one per significant decision)

For every decision with alternatives (stack, architecture, protocol, library):

```markdown
### <Decision title>
- **Decision:** <what we chose>
- **Options considered:** <2+ real options, not strawmen>
- **Rationale:** <why this one — cite the research>
- **Consequence:** <what this costs / what it enables>
```

Five lines max per decision. Significant decisions live in the plan; if a
project accumulates many, move them to `docs/decisions/NNNN-<slug>.md` and
keep one line each in the plan. A decision with only one option is not a
decision — skip it.

## Quality requirements (P02 — ISO 25010 scenarios)

Only the characteristics this work actually touches (cap ~8). For each:

| Characteristic | Scenario (stimulus → response → measure) | Acceptance |
|---|---|---|
| e.g. Performance | 1000 concurrent users submit a report → system responds | p95 < 2s |
| e.g. Reliability | DB restarts mid-ingest → no data loss | 0 lost records |
| e.g. Security | unauthenticated request → rejected | 401 |

Each scenario is testable: stimulus, response, measure. If you cannot write
the measure, the requirement is not real yet.

## Architecture evaluation (P03 — ATAM-lite)

One page max. Before committing to the architecture:

1. **Quality goals** — from the Quality requirements table (the 3–6 that
   matter most).
2. **Key scenarios** — the 3–6 scenarios that stress the architecture most
   (highest risk × impact from Phase 4).
3. **Sensitivity/tradeoff points** — which decisions are load-bearing for
   which quality goal, and where two goals pull against each other (e.g.
   performance vs security).
4. **Architectural risks** — each with mitigation, or an explicit accepted
   risk with rationale.

## Views (P04 — optional, only when they earn their place)

Add a view only if it communicates something the prose does not: **context**
(external systems/interfaces), **runtime** (key flows/state), **deployment**
(environments/topology). Each view ≤15 lines (ASCII or mermaid). No view for
its own sake — the Architecture/Design prose is the primary artifact.

## Architecture / Design
- Modules and their responsibilities (small, single-purpose — see `references/06c-code-quality.md`)
- Data model / schema (if any)
- Key flows (request lifecycle, event flow)
- Interfaces / contracts between components
- **Where shared truth lives** (single source of truth map: which module owns each shared capability)
- **Layering**: one-way dependency rules between layers; what each layer may/may not import
- **Standalone testability**: how each module is exercised outside the host with the same calls

## Spec-to-code traceability matrix
For every spec, the operator-facing outcome, the code path that delivers it, and the test that asserts it. This is what `/asf verify` checks mechanically at delivery (M1).

| Spec | Operator-facing outcome | Code path | Test (asserts outcome) |
|------|------------------------|-----------|------------------------|
| spc-… | e.g. "ingested report has an agent_title on the card" | ingest → analyze() → persist → render | tests/e2e-ingest.test.ts (`agent_title`) |
| … | | | |

## Milestones
| # | Milestone | Exit criteria |
|---|-----------|---------------|
| M1 | Scaffold + CI | Repo builds, tests run |
| M2 | Core feature | Feature works end-to-end (tests pass) |
| ... | ... | ... |

## Task list
- [ ] M1: Initialize package (`npm init`, deps)
- [ ] M1: Set up test runner
- [ ] M2: Implement <feature> (tests first)
- [ ] ...

## Dependencies
| Package | Version | License | Purpose |
|---------|---------|---------|---------|

## Risks & mitigations
From adversarial analysis. Each risk: likelihood, impact, mitigation, owner.

## Definition of done
- [ ] All MUST specs met (pi-vigilant)
- [ ] Test suite green
- [ ] Browser-tested if UI involved
- [ ] CHANGELOG updated
- [ ] User approved delivery/release

## Out of scope
Explicitly cut items (so nobody re-adds them).
```

## Approval gate (MANDATORY — large work only)

Present the plan and ask:

> "Plan ready. Do you approve starting implementation? (yes / changes needed)"

Do not implement before explicit approval. If the user says "go", record the plan as APPROVED.
