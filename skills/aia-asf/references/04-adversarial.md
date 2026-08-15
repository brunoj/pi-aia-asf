# Phase 4 — Adversarial Analysis Checklist

> **Scale note: the full checklist and gate apply to LARGE work.** Small work does
> a quick mental pass on edge cases and failure modes while implementing — no
> formal review, no user checkpoint.

Challenge every spec and design decision like a hostile reviewer. For each item, determine: capture a new spec / supersede an existing one / accept the risk (recorded).

## Per-spec questions

> **Code-quality lens (always applied):** for every module/design under review,
> also ask the `references/06c-code-quality.md` questions — is shared logic
> duplicated anywhere? Is the single escalation path identifiable? Is the module
> testable standalone with the same calls? Any hardcoded values that belong in
> config?

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

## Resolution rules

- Finding → **new spec** (capture_spec) or **spec change** (capture superseding spec; old one becomes obsolete)
- Accepted risk → write it into the PLAN.md risks section with rationale
- Scope change → **ask the user before proceeding**

## Adversarial gate

Summarize: findings found, specs added/changed, risks accepted → user confirmation.
