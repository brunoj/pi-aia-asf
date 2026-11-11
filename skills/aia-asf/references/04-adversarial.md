# Phase 4 — Adversarial Analysis Checklist

> **Scale note: the full checklist and gate apply to LARGE work.** Small work does
> a quick mental pass on edge cases and failure modes while implementing — no
> formal review, no user checkpoint.

Challenge every spec and design decision like a hostile reviewer. For each item, determine: capture a new spec / supersede an existing one / accept the risk (recorded).

## Per-spec questions

> **Security lens (always applied):** for every design under review, also ask
> the `references/06h-security.md` questions — where are the **trust
> boundaries** (where does untrusted input cross into trusted code)? What does
> STRIDE say about each (Spoofing, Tampering, Repudiation, Information
> disclosure, Denial of service, Elevation of privilege)? Is there a **threat
> registry** (threat → likelihood × impact → mitigation → status)? Any
> High×High threat unmitigated and unrecorded blocks delivery. **Large work
> writes the one-page threat model** (context view + STRIDE matrix + registry)
> as part of the plan (see `references/06h-security.md`).

> **Architecture lens (always applied):** for every architecture under review,
> ask the ATAM-lite questions (`references/05-plan.md`) — which quality goals
> matter most? Which 3–6 scenarios stress the architecture? Which decisions
> are **sensitivity/tradeoff points** (load-bearing for one goal, harmful to
> another)? What are the architectural risks and mitigations?

> **Code-quality lens (always applied):** for every module/design under review,
> also ask the `references/06c-code-quality.md` questions — is shared logic
> duplicated anywhere? Is the single escalation path identifiable? Is the module
> testable standalone with the same calls? Any hardcoded values that belong in
> config?

> **Traceability lens (always applied):** for every spec, ask — *what is the
> operator-facing outcome, and what code path delivers it?* Trace the path in
> your head: where could **dead wiring** hide (a function defined but never
> called, an async enrichment that never lands, a surface that never renders)?
> If the outcome has no concrete path, the spec is not yet real.

- **Edge cases**: empty input, zero data, max load, missing fields, concurrent access, duplicate input, unicode, huge payloads
- **Failure modes**: what breaks first? Is failure loud or silent? Can we recover automatically?
- **Security**: authentication, authorization, injection (SQL/XSS), data exposure, secrets, abuse/rate-limiting, supply chain
- **Maintainability**: will a new engineer understand this in 6 months? Is the design over-engineered or under-documented?
- **Dependencies**: license, maintenance, size, security history, lockfile hygiene
- **Scope**: does anything here NOT need to exist? Cut it (record the cut).
- **Feasibility**: does the research support the spec? Is the plan's chosen stack proven for this use case?

## Architecture questions

- **Data flow**: what's the full path of a request/event? Where can it fail?
- **State**: what state exists, where does it live, what happens on restart?
- **Scaling**: what happens at 10× the expected load?
- **Rollback**: if this ships and breaks, how do we revert?
- **Observability**: logs, metrics, errors — can we see it working in production?

## Data & model questions (P27 — when the work touches persistence)

The code and the behaviour get reviewed; the model usually does not, and a model
defect is invisible to every behavioural test (full rules in
[06j-data-model.md](06j-data-model.md)). For every entity the change touches:

- **Ownership**: who creates this row, who may delete it, and does it survive its
  parent? If nobody can answer, that is the finding.
- **Fan-out**: what else points at this row, and what happens to those rows when
  it is deleted — by a constraint, by an ORM mapping, or by a loop someone wrote?
- **Identity**: what makes two rows the same thing, and does anything enforce it?
- **Invariants**: what must *always* be true of this data, and is it enforced
  somewhere that cannot be bypassed, or only asserted in a handler?
- **Non-effects**: which tables/collections must be unchanged by this operation —
  and does any test look at them?

"The suite is green" is not an answer to any of these; the suite almost certainly
never populated the table in question.

## Resolution rules

- Finding → **new spec** (capture_spec) or **spec change** (capture superseding spec; old one becomes obsolete)
- Accepted risk → write it into the PLAN.md risks section with rationale
- Scope change → **ask the user before proceeding**

## Zero-context review — the part that actually finds things

The questions above, asked by the agent that wrote the plan, are a checklist. Familiarity
is what hides blind spots: the author knows what it meant, so it never hits the sentence
that could be read two ways. So for LARGE work the checklist is **also** run by agents
that were never in the conversation.

**The artifact is the review surface.** The plan/spec lives in a file; reviewers get the
path plus the source the artifact references — never the chat transcript. A reviewer that
is handed the conversation is not a fresh reviewer, and the pass is void.

**Lenses** (one persona each in `../agents/`, all read-only, all bound by the shared
mandates — cite or abstain, critique first, no chitchat):

| Lens | Audits |
|---|---|
| `asf-design-critic` | architecture, scalability, data model, security posture, unmitigated risk |
| `asf-codebase-fitness` | layering, SSOT, ownership, migration — correct in the abstract vs correct *here* |
| `asf-zoom-out` | right problem, unasked questions, silent scope, reversibility |
| `asf-comprehension` | could a competent engineer execute this without asking a question |
| `asf-implementation-readiness` | interfaces, ordering, test hooks, rollback |
| `asf-structural` | traceability, gate integrity, honest n/a, verifiable DoD |

`asf-synthesizer` orchestrates: spawn, verify, retry once, deduplicate, triage, write the
report artifact, report per-reviewer status.

**How they are spawned, in order of preference:**

1. the `subagent` extension (parallel mode), if loaded;
2. `pi -p "<brief>" --no-extensions --no-skills -t read,grep,find,ls` per lens;
3. neither available → **stop and record the review as `not run`**. Say it out loud. A
   review run in the author's own context is not this review, and must never be reported
   as if it were.

**Budget** (`.asf-review.json` at the project root, or these defaults):

```json
{ "maxReviewers": 6, "abForBlockers": true, "maxReaudits": 2, "maxConcurrent": 3, "tokenCeilingMultiple": 6 }
```

Budget is deliberately generous — the job must not be interrupted for want of tokens.
What stays tight is *termination*, not effort: `maxReaudits` bounds the loop, and
`maxConcurrent` is bounded by the machine (reviewers compete with the test suites). At the
ceiling the pass stops and reports what it found, listed as partial — never continues
quietly.

**A/B duplication** (`abForBlockers`) runs two independent instances of one lens to lift
recall, and only at the **blocker boundary**: a re-review after blockers were addressed.
Outside that boundary a request for A/B is refused — recall is the expensive property and
it is bought where a missed blocker is expensive.

**Cite or be `not run` (the rule that makes the rest trustworthy).** Before a report is
accepted, every cited `file:lines` must resolve — the file exists and the range is inside
it. A report whose citations do not resolve is recorded `not run`, **never** as "zero
findings". This is not hypothetical: a read-only subagent asked about a file that did not
exist returned a confident reading of a *different* file and exited 0. Exit code and
confidence are both cheap; a resolvable citation is not.

**Findings** carry severity (`Blocker | Major | Nit`), scope (`file:lines`), the finding
and a recommendation. The synthesizer deduplicates across lenses and normalises file
references. Severity meanings are fixed across lenses so findings can be merged.

**Critique first.** Reviewers lead with what is wrong, missing or risky. "Default to
stress-testing: never agree by default" — agreement is a result of the audit, not a
starting position, and unearned praise in a review report is noise that displaces signal.
A report that found nothing must state **what it checked** (`checked: ["file:lines", …]`);
a clean report with no scope is recorded as `not run`, because a review that left no
evidence of having happened is indistinguishable from one that did not.

**Convergence.** Each stage allows `maxReaudits` re-audits. At the cap, report the open
items to the author, record them, and move on — an unbounded review loop is a cost bug,
not diligence.

## Adversarial gate

Summarize: findings found, specs added/changed, risks accepted → user confirmation.
For persistence work, the summary states the ownership answers found missing
(06j) — an unanswered ownership question is a finding like any other, not a
detail to discover during implementation.
