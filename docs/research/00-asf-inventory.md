# ASF Inventory — the prism for the research

Purpose: an exact map of what the ASF currently provides, so every research finding
can be judged as **already covered / partially covered / missing**.

Sources read: `skills/aia-asf/SKILL.md`, `references/01-intake.md`, `02-research.md`,
`04-adversarial.md`, `05-plan.md`, `06-implementation.md`, `06b-testing-qa.md`,
`06c-code-quality.md`, `06d-delegation.md`, `06e-code-health.md`, `07-release.md`,
`index.ts` (commands, QA_CHECKLIST, M1 trace validation).

## Structure

| Phase | Gate | What it enforces |
|---|---|---|
| 0 Classify | — | work type + **scale** (large = full gated flow, small = automatic) |
| 1 Intake | Gate 1 (large) | ask until clear; capture specs; external planning docs located |
| 2 Research | Gate 2 (large) | SOTA + packages, cited sources, recommendation |
| 3 Specs | Gate 3 (large) | full spec tree, M6 ingestion of external docs, decomposition |
| 4 Adversarial | Gate 4 (large) | edge cases, failure modes, security bullet, maintainability, deps, scope, feasibility + 06c lens + traceability lens |
| 5 Plan | **Gate 5 (mandatory approval)** | PLAN.md incl. architecture, SSOT map, layering, standalone testability, traceability matrix, risks, out-of-scope |
| 6 Implementation | — | test-first, isolation, no scope creep, commits, browser testing, bounded waits, M4 challenge, M5 trace |
| 7 Verification | **Gate 7** (`/asf verify` M1 traceability), **Gate 8** (`/asf health` code health), 06b Rule 10 DoD, 06c modularity DoD | full suite, artifact inspection, clean-room, observable end state, spec closure, honest reporting |
| Release | user decision only | version + CHANGELOG + tag + push; never auto-publish |

## Existing strengths (do not regress these)

1. **Spec-driven contract** — capture_spec/get_task_specs/update_spec_status shared with pi-vigilant; trace = SSOT; M1 mechanical validation (testFile exists, assertion present).
2. **Verification honesty** — 06b Rules 1–5, 11: test the shipped artifact, observable end state, silent-failure probing, read-the-real-error, clean-room, report honestly.
3. **Wiring / dead-code detection** — 06b Rules 12–14: operator-facing outcome, consumed-by-a-surface, E2E through the real entry point. (Rare — most methodologies have nothing like this.)
4. **Regression discipline** — Rule 6 (test per bug), Rule 7 (triggers AND non-triggers), Rule 8 (state machines: deadlock/bad transitions).
5. **Bounded waits** — Rule 15 + 30-min absolute ceiling + explicit single-run waiver.
6. **Modularity standard** — 06c Rules 1–9: small modules, SSOT/single escalation path, no hardcoding, testable-standalone-then-integrated-verbatim, refactor triggers, layering + architecture writeup, replayable debug logging, behavior-preserving refactors, documents-are-code.
7. **Objective code metrics** — 06e: eslint/jscpd/madge thresholds, gate modes, baseline trend.
8. **Delegation limits** — 06d: no parallel writers on one file, exit code ≠ success, evidence not proof.
9. **Scale proportionality** — small work automatic; re-classify upward.

## Known thin spots (hypotheses to test against the literature)

| # | Area | Current state |
|---|---|---|
| G1 | **Architecture decision method** | PLAN.md has an "Architecture / Design" section; no decision records, no tradeoff/quality-attribute analysis, no documented alternatives, no view/template standard, no ADR trail |
| G2 | **Requirements → quality attributes** | Intake captures functional musts; no explicit non-functional/quality-attribute scenarios (latency, availability, maintainability targets), no "how will we measure it" |
| G3 | **Security engineering** | One bullet in adversarial ("auth, injection, data exposure, abuse") + a `security` spec area. No threat modeling, no ASVS/Top-10 style checklist, no secure-by-default requirements, no security testing, no secrets policy, no crypto guidance, no authz design rules |
| G4 | **Supply chain / dependency security** | Adversarial asks "license, maintenance, size, security history, lockfile hygiene" — advisory only. No gate, no SBOM, no provenance, no vuln scan, no pinned/locked install rule |
| G5 | **Testing strategy & depth** | Rules cover *what must be proven*, not *how to structure a test suite*: no test pyramid/diamond, no coverage policy (or its limits), no mutation testing, no property-based testing, no flakiness policy, no test-double taxonomy, no characterization tests, no perf/load testing, no contract testing, no determinism/time control, no test-data strategy |
| G6 | **Reliability / operability of what we build** | No SLO/error-budget, no observability requirements (structured logs, correlation IDs, metrics), no rollback/deploy strategy, no migration discipline, no runbook, no postmortem |
| G7 | **Independent review** | Adversarial analysis is self-review by the same agent. No independent reviewer (subagent) gate, no checklist-based code review, no security review gate |
| G8 | **Definition-of-done breadth** | DoD is strong on correctness/honesty; silent on security, accessibility, license compliance, data protection, backup/restore, docs-for-operators |
| G9 | **Failure/stability patterns** | Bounded waits exist for the *agent*; nothing requires timeouts/retries/backoff/bulkheads/circuit breakers/idempotency in the *built system* |
| G10| **Metrics & feedback** | Code health exists; no defect escape analysis, no "what escaped to production and why did the gate miss it" loop |
| G11 | **AI-executed specifics** | The factory is executed by an LLM: needs machine-checkable gates, vacuous-test detection, "claims vs evidence" (partly M5/M6), context discipline, deterministic reproduction |

## Constraints on any proposal (ASF-specific)

- **Scale proportionality is non-negotiable** — small work must stay automatic; nothing may add ceremony to small work.
- **Judgment-based capture, no keyword matching**; gates must be *mechanically checkable* where possible (that is what makes them hold for an agent).
- **Docs are code** — new reference docs must stay small, indexed from SKILL.md, and SKILL.md must stay a map, not a wall of prose.
- **No new hard dependencies** (pi-intercom precedent); optional tooling must degrade gracefully (06e `missingTool: warn` pattern).
- **Nothing auto-publishes**; ASF owns the release workflow.
- **Every rule must trace to a real failure** (06b's own provenance style) — proposals need evidence.
