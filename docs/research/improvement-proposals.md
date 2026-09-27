# ASF Improvement Proposals — research findings, mapped to gaps

**Status**: research phase only. **No ASF code or docs have been changed.** Each
proposal below is individually reviewable; nothing is implemented until you approve
it. Review them one by one — I will implement only what you approve.

**How to read**: each proposal has ID, evidence (research note + source), the gap in
the current ASF, the concrete proposed change, priority, effort (S/M/L), and risk.
Proposals marked **bundle** are small and naturally ship together, but each is still
individually approvable.

**Scale rule applies to every proposal**: nothing here adds ceremony to small work.
Every proposal is scoped to large work (or is an optional tool that degrades
gracefully), consistent with the ASF's non-negotiable scale proportionality.

---

## Gap summary (inventory hypotheses G1–G11 → proposals)

| # | Thin spot (from inventory) | Research verdict | Proposal(s) |
|---|---|---|---|
| G1 | No architecture decision records / tradeoff analysis | **Confirmed** — ADR/MADR is standard practice; ATAM gives the tradeoff method | P01, P03 |
| G2 | No NFR / quality-attribute scenarios | **Confirmed** — ISO 25010 + scenario format (SEI/Q42) is the standard | P02 |
| G3 | Security = one adversarial bullet | **Confirmed** — SSDF PW.1/PW.2, ASVS, STRIDE are the standard methods | P15, P16, P18 |
| G4 | Supply chain advisory only | **Confirmed** — SSDF PW.4/RV, SLSA, SCA are gated practices | P17 |
| G5 | No test strategy / depth | **Confirmed** — 29119-4 techniques, risk-based derivation, mutation score | P10, P11, P12 |
| G6 | No reliability/operability requirements | **Confirmed** — Release It! patterns, 12-factor, observability | P06, P07 |
| G7 | Self-review only | **Confirmed** — test independence (29119) + writer/reviewer/owner (AI era) | P19 |
| G8 | DoD silent on security/accessibility/license/data | **Confirmed** — ASVS chapters + SSDF PW | P16, P21 |
| G9 | No failure/stability patterns in built systems | **Confirmed** — Nygard patterns are the standard set | P06, P08 |
| G10 | No defect-escape / metrics feedback | **Confirmed** — SSDF RV.3 + DORA metrics | P22 |
| G11 | Machine-checkable gates / vacuous tests | **Partially covered** (M1, Gate 8) — mutation score is the missing mechanical check | P12, P05 |
| — | Deep-module vs size thresholds (new) | **Confirmed tension** — Ousterhout/Parnas/Fowler vs 06c Rule 1 + 06e thresholds | P05 |

---

## P01 — Architecture Decision Records (ADRs) for large work

- **Evidence**: MADR (adr.github.io/madr) — the standard lightweight ADR template
  (Context / Decision / Consequences) with lifecycle states; ISO/IEC/IEEE 42010
  treats decisions as first-class architecture content; ATAM (SEI) makes
  tradeoff analysis an explicit step. Research note 10-architecture.md A4.
- **Gap**: the ASF's Phase 5 PLAN.md captures *what* will be built but has no
  mechanism for *why this option over alternatives*. Decisions are made silently
  inside the plan; there is no record of options considered, consequences
  accepted, or reversals. 06c Rule 6 requires an architecture writeup but not
  decision provenance.
- **Proposed change**: for large work, PLAN.md gains a short "Decisions" section:
  each significant decision (≤ 5 lines) = decision, options considered (2+),
  chosen, consequence. Optional `docs/decisions/NNNN-*.md` for decisions that
  outlive the task. Small work: none.
- **Priority**: high. **Effort**: S. **Risk**: low — pure documentation; the only
  failure mode is verbosity, mitigated by the 5-line cap and large-work scope.

## P02 — Quality-attribute requirements (ISO 25010 + scenario format)

- **Evidence**: ISO/IEC 25010:2023 nine quality characteristics (functional
  suitability, performance efficiency, compatibility, usability, reliability,
  security, maintainability, portability, safety); arc42 quality model maps them
  to architecture sections; the standard scenario format (stimulus → response →
  measure) from SEI/arc42 makes NFRs testable. Research note 10-architecture.md
  A6–A7.
- **Gap**: Phase 1 intake asks about performance/security/reliability in prose
  ("how fast? how safe? how reliable?") but has no *format* and no coverage
  checklist. NFRs end up as vague sentences that cannot be verified — and the
  ASF's own verification machinery (M1) only handles functional specs.
- **Proposed change**: for large work, intake/plan gains a compact quality
  requirements table: characteristic → scenario (stimulus/response/measure) →
  acceptance. Default template covers performance, reliability, security,
  maintainability, usability; others only when the work touches them. Small work:
  none.
- **Priority**: high. **Effort**: M. **Risk**: medium — NFR scenarios can be
  over-specified; mitigated by "only the characteristics the work touches" and a
  hard cap on scenario count (e.g. ≤ 8).

## P03 — Lightweight architecture evaluation (ATAM-style) in Phase 4/5

- **Evidence**: SEI ATAM — the leading architecture evaluation method; its core
  outputs are a utility tree (quality goals → scenarios), sensitivity points,
  tradeoff points, and a risk list; it "exposes architectural risks that
  potentially inhibit achievement of business goals" and reveals how quality
  goals trade off against each other. Research note 10-architecture.md A3.
- **Gap**: Phase 4 adversarial analysis challenges the *plan* (specs, risks,
  failure modes) but never evaluates the *architecture* as a structure: no
  utility tree, no sensitivity/tradeoff analysis, no architectural risk list.
  The ASF can ship a well-specified system whose architecture is fragile.
- **Proposed change**: for large work, Phase 4 gains a short ATAM-lite step:
  (1) quality goals from P02, (2) 3–6 key scenarios, (3) identify sensitivity
  points (where a change in one attribute affects another) and tradeoff points,
  (4) list architectural risks with mitigations. Output: ≤ 1 page in PLAN.md.
- **Priority**: medium. **Effort**: M. **Risk**: medium — ATAM is a 3–4 day
  process in full; the ASF version must be explicitly lite (the literature itself
  warns against heavyweight evaluation). Mitigation: fixed page cap + large-work
  scope.

## P04 — Architecture views: context, runtime, deployment (arc42/C4-lite)

- **Evidence**: arc42's 12 sections group into requirements/quality, structures
  & views, and concepts/decisions; C4 provides zoom levels (context → container
  → component → code); the **context view** (external systems, actors, data
  flows) is the prerequisite for security analysis (trust boundaries) and for
  the runtime view. Research note 10-architecture.md A2, A5.
- **Gap**: 06c Rule 6 requires an architecture writeup, but the ASF has no
  required *views* — no context diagram (what does this system talk to?), no
  runtime view (what happens at runtime?), no deployment view (where does it
  run?). For a pi extension, the context view is exactly the extension↔host
  boundary the ASF already tests (06b Rule 14) — but it is never *drawn*.
- **Proposed change**: for large work, PLAN.md gains an optional "Views" section
  with up to three diagrams (text/ASCII or mermaid): context, runtime, deployment
  — each ≤ 15 lines, only if the work has external interfaces/runtime/deployment
  concerns. Small work: none.
- **Priority**: medium. **Effort**: S. **Risk**: low.

## P05 — Depth-over-size: reframe modularity rules (fixes a real defect)

- **Evidence**: Ousterhout — complexity = change amplification + cognitive load +
  unknown unknowns; modules should be **deep** (small interface, large
  implementation); "many courses teach that classes should be small — that
  results in shallow classes"; "size doesn't really matter that much… the most
  important thing is depth"; Parnas — decompose on secrets, not execution order
  (temporal decomposition is the most common failure); Fowler — "length is not
  the issue; the key is the semantic distance between the method name and the
  method body". Research note 20-software-craft.md C1–C2.
- **Gap**: 06c Rule 1 says "small, well-readable modules" with extraction
  triggers at ~100 lines / 3 nesting levels; 06e defaults enforce
  `maxFileLines: 300`, `maxLinesPerFunction: 50`. These are **proxies that can
  be optimized in the wrong direction**: an agent told to keep files under 300
  lines will split into shallow pass-through modules (classitis), increasing
  interface surface, coupling and cognitive load while *passing* the gate. The
  ASF's own Rule 2 (SSOT) and Rule 4 (testable standalone) are the real goals;
  line limits are smoke detectors.
- **Proposed change**: (a) reframe 06c Rule 1: "deep, single-purpose modules" —
  interface simpler than implementation; pass-through layers and shallow
  wrappers are defects; "new layer, new abstraction"; (b) add anti-patterns:
  temporal decomposition, back-door leakage, information leakage; (c) add the
  Ousterhout counterweight to Rule 3 (config): "minimize voodoo constants —
  provide good defaults in the module; config is for real variation, not for
  values the author should have decided"; (d) 06e: keep thresholds but document
  them as smoke detectors, and add an optional **interface-vs-implementation
  depth check** (interface surface vs implementation size) as a report-only
  metric first (no gate).
- **Priority**: high. **Effort**: M. **Risk**: medium — changing a Rule is
  changing the standard; but the change *relaxes* a wrong constraint while
  strengthening the real one. Mitigation: keep thresholds as warnings, add the
  depth metric report-only.

## P06 — Stability patterns for deliverables (Release It!)

- **Evidence**: Nygard — stability antipatterns (integration points, blocked
  threads, cascading failures, unbounded result sets) and patterns (timeouts:
  connection/read/total; circuit breaker Closed/Open/Half-Open; bulkheads;
  bounded retries with exponential backoff + jitter, only for idempotent
  operations; load shedding + backpressure; fail fast; handshaking; steady
  state). Research note 20-software-craft.md C4.
- **Gap**: the ASF has Rule 15 (bounded waits) for the *agent*, but nothing
  requires the *deliverable* to have timeouts, circuit breakers, bulkheads,
  bounded retries, idempotency, or load shedding. Phase 4 asks "what breaks
  first? can we recover automatically?" — a question, not a pattern set.
- **Proposed change**: new reference `06f-stability.md` (small, indexed from
  SKILL.md) naming the patterns with one-line rules: every external call has a
  timeout (connection/read/total); retries bounded with backoff+jitter and only
  on idempotent operations; circuit breaker at integration points; bulkheads for
  shared resources; bounded result sets; fail-fast validation; graceful
  shutdown. Phase 6 DoD: "if the deliverable makes external calls, it has
  timeouts and bounded retries". Large work only.
- **Priority**: high. **Effort**: M. **Risk**: low-medium — rules are checkable
  by inspection; the risk is over-engineering small deliverables, mitigated by
  "if it makes external calls" scoping.

## P07 — Observability requirements for services

- **Evidence**: 12-factor XI (logs as event streams), fitness-function-driven
  development (operability fitness functions: health endpoint, structured logs,
  metrics, runbook), Release It! Part II (monitoring/logging as design
  concerns), OWASP A09 (security logging). Research note 20-software-craft.md
  C5–C6.
- **Gap**: 06c Rule 7 requires full I/O logging for *debug* replay — strong, but
  not production observability. Phase 4 asks "logs, metrics, errors — can we see
  it working in production?" as a question only. No requirement that a
  deliverable ship a health endpoint, structured logs, correlation IDs, metrics,
  or a runbook.
- **Proposed change**: DoD items for service-like deliverables (large work):
  health/readiness endpoint; structured logs to stdout; correlation IDs through
  the request chain; metrics where a metrics system exists; a runbook section in
  the README (start/stop/health/known issues). Small work: none.
- **Priority**: medium. **Effort**: S. **Risk**: low.

## P08 — Error-handling design rules

- **Evidence**: Ousterhout — "define errors out of existence" (best error
  handling removes the error condition); handle at the boundary, fail fast;
  OWASP A10:2025 — Mishandling of Exceptional Conditions is a new Top-10
  category (generic to user, detailed to log); idempotency as the prerequisite
  for safe retries (C4). Research note 20-software-craft.md C7.
- **Gap**: 06b Rules 4–5 cover verification-time honesty about errors; nothing
  tells the agent how to *design* error handling in the deliverable: no
  boundary rule, no idempotency rule, no "generic to user / detailed to log"
  rule, no "fail fast" rule.
- **Proposed change**: add to 06c (or fold into 06f): error-handling design
  rules — validate at the boundary and fail fast; define errors out of existence
  where possible; user-facing errors are generic, logs carry detail; idempotency
  is a design property for anything retryable; never use exceptions for control
  flow.
- **Priority**: medium. **Effort**: S. **Risk**: low.

## P09 — Code-smell reference (diagnostic vocabulary)

- **Evidence**: Fowler/Beck smell catalog — Bloaters (Long Method, Large Class,
  Primitive Obsession, Long Parameter List, Data Clumps), OO Abusers, Change
  Preventers (Divergent Change, Shotgun Surgery, Parallel Inheritance
  Hierarchies), Dispensables (Duplicated Code, Lazy Element, Speculative
  Generality, Dead Code, Comments-as-what), Couplers (Feature Envy,
  Inappropriate Intimacy, Message Chains, Middle Man). "A code smell is a
  surface indication that usually corresponds to a deeper problem." Research
  note 20-software-craft.md C3.
- **Gap**: 06c covers duplication, god-files, hardcoding — a subset. No mention
  of Feature Envy, Shotgun Surgery, Primitive Obsession, Speculative Generality,
  Middle Man (pass-through), or Comments-as-smell. The ASF has the *treatments*
  but not the *diagnostics*.
- **Proposed change**: a short reference (≤ 1 page, 5 groups × 3–4 smells, one
  line each) used as a Phase 4/6 lens: "scan for these smells; if found, apply
  the 06c rule that fixes it". No new gate.
- **Priority**: low. **Effort**: S. **Risk**: low.

## P10 — Risk-based test derivation + test-design vocabulary

- **Evidence**: ISO/IEC/IEEE 29119 — the series is explicitly risk-based ("the
  recommended approach to strategizing and managing testing that underlies the
  series and provides the basis for test prioritization and focus"); Part 4
  names specification-based techniques (equivalence partitioning, boundary
  value analysis, decision table, state transition, all-pairs, scenario,
  random), structure-based (branch, decision, MC/DC, data-flow), experience-based
  (error guessing, exploratory), each with a coverage measure. Research note
  30-testing-qa.md T1.
- **Gap**: 06b has no test-design technique vocabulary and no risk-based
  derivation. "Edge cases" in Phase 4 is an ad-hoc list with no adequacy
  measure; the ASF tests what specs cover but is silent on *risk* as the
  prioritizer and on the highest-risk code no spec mentions.
- **Proposed change**: new reference `06g-test-design.md` (small): the technique
  families with "use X when Y" (e.g. boundary value for ranges, decision table
  for rule combinations, state transition for stateful flows, all-pairs for
  config matrices); Phase 6 large work: test plan lists the technique per
  behavior and the risk rationale (likelihood × impact) for the highest-risk
  surfaces. Small work: none.
- **Priority**: high. **Effort**: M. **Risk**: low-medium — risk of ceremony;
  mitigated by large-work scope and a short reference.

## P11 — Determinism & flakiness rules

- **Evidence**: flaky-test taxonomy — timing/races, shared state/order
  dependence, uncontrolled randomness, clock/timezone dependence, external
  systems, nondeterministic ordering, CI resource exhaustion; fixes — injected
  clock, seeded RNG, isolated data, poll-with-timeout not sleep, mock only
  outside the system boundary, run repeatedly/random-order/parallel to detect,
  fix immediately (an ignored flaky test destroys the meaning of green).
  Research note 30-testing-qa.md T4.
- **Gap**: 06b Rule 8 covers state machines; nothing names flakiness,
  non-determinism, clock injection, order dependence, or "a red build must mean
  one thing". For an agent this is worse than for a human: an agent hitting a
  flaky failure tends to re-run until green and report success — exactly the
  silent-failure class Rule 4/11 forbid, with no vocabulary for it.
- **Proposed change**: add to 06b (or 06g): determinism rules — injected clock
  (no wall time in logic), seeded RNG, each test owns its data, poll/event with
  timeout instead of sleep, no order dependence, no real network in unit tests;
  "flaky = defect: fix immediately, never retry into green; if a test must be
  skipped, it must be reported in the delivery".
- **Priority**: high. **Effort**: S. **Risk**: low.

## P12 — Mutation-score fitness function (optional Code Health Gate module)

- **Evidence**: mutation testing — coverage measures execution reach, mutation
  score measures assertion strength; ~80 % branch coverage typically = 40–60 %
  mutation score; modules at 88–100 % line coverage with 12–45 % mutation score
  (notably in auth code); Stryker `thresholds: {high, low, break}` with exit 1
  below `break` (CI-ready), mutation levels, per-file globs, `ignore-mutations`,
  `since`/baseline for incremental runs, per-mutant timeouts; interpretation
  bands 80–100 excellent / 60–80 good / 40–60 adequate / <40 weak; equivalent
  mutants must be triaged; start on critical paths, set threshold below baseline
  then ratchet. Research note 30-testing-qa.md T2.
- **Gap**: the ASF's Rules 12–14 are a *semantic* guard against vacuous tests but
  are unverifiable by machine. Mutation score is the mechanical counterpart:
  "would this suite notice if the behaviour changed?" — the ASF's own question,
  made executable. Nothing in the ASF measures assertion quality.
- **Proposed change**: optional Code Health Gate module (same pattern as 06e:
  `npx --no-install stryker run` / `pitest`, `missingTool: warn`, tool timeout,
  baseline + `break` threshold, scoped to changed modules or critical paths,
  `--diff`/`--update-baseline`). Default **off** (unlike 06e's eslint/jscpd,
  which stay on) because mutation runs are slow; when enabled, it is a gate for
  large work. Never an ASF dependency.
- **Priority**: medium (high value, heavier). **Effort**: L. **Risk**: medium —
  slow runs, equivalent-mutant noise, tool availability; mitigated by opt-in,
  baseline-ratchet, scoping, and per-mutant timeouts.

## P13 — Characterization baseline before refactors

- **Evidence**: characterization/Golden Master testing (Feathers) — asserts
  output matches what was observed before, not correctness; the historical
  oracle; the safety net for refactoring code without adequate tests; requires
  repeatability (mask volatile values); can be auto-generated. Research note
  30-testing-qa.md T5.
- **Gap**: 06c Rule 8 says refactors must be behavior-preserving and "run the
  existing tests + a regression pass" — but for code with no tests the ASF has
  no mechanism to establish the baseline. An agent asked to "refactor this
  module" has no mandated way to capture current behaviour first.
- **Proposed change**: 06c Rule 8 gains a step: before refactoring code without
  tests, capture current behaviour (characterization tests or a recorded
  before/after run) and use it as the regression oracle; if behaviour cannot be
  captured, say so in the plan and get approval.
- **Priority**: medium. **Effort**: S. **Risk**: low.

## P14 — Delivery report: fields + not-tested register

- **Evidence**: 29119 test completion report (what was executed, what passed,
  what was not tested and why, residual risk); AI-era PR template (spec link,
  tool used, human owner, tests run, files intentionally changed,
  security-sensitive areas touched, known limitations); "do not accept
  explanation as proof". Research notes 30-testing-qa.md T7, 50-ai-era.md A8.
- **Gap**: the ASF's delivery log (M5) is strong on evidence but has no
  structured fields: no spec link, no owner, no "not tested and why", no
  security-sensitive-areas declaration, no known limitations. The DoD checklist
  is binary; there is no residual-risk column.
- **Proposed change**: extend the large-work delivery log template with: spec
  link, tests run (with results), not-tested register (what was deliberately not
  verified + residual risk), security-sensitive areas touched, known
  limitations. Small work: one line ("not tested: X because Y") when applicable.
- **Priority**: medium. **Effort**: S. **Risk**: low.

## P15 — Threat model as code (STRIDE × DFD) for large work

- **Evidence**: Threat Modeling Manifesto four questions; STRIDE six categories
  (Spoofing/Tampering/Repudiation/Information Disclosure/DoS/Elevation of
  Privilege); DFD + **trust boundaries** ("data flows that cross the boundary are
  the moment something untrusted enters the inside — this coincides with where
  validation, authentication, and authorization should take effect");
  risk = likelihood × impact with recorded acceptance; **threat model as code**
  (typed YAML registry + CI gate failing on high-risk unmitigated threats).
  Research note 40-security.md S4.
- **Gap**: Phase 4's "Security:" line is a prompt, not a method. No trust
  boundaries, no STRIDE, no registry, no gate. The ASF's products are agents —
  the boundary between untrusted user content and agent tool execution is the
  most important boundary in everything Ai Applied builds.
- **Proposed change**: for large work, Phase 4/5 gains a threat-model step:
  (1) context view (P04) with trust boundaries marked, (2) element × STRIDE
  matrix, (3) threats as a small registry (`threats/` or PLAN section: id,
  component, stride, description, risk, mitigation, mitigated), (4) gate: no
  high-risk threat may be unmitigated without a recorded acceptance. Small work:
  one-line "security boundary" note when the work touches untrusted input.
- **Priority**: high. **Effort**: M. **Risk**: medium — threat modeling can
  become ritual; mitigated by the four-question framing, the registry-as-code
  pattern (which is exactly the ASF's docs-as-code + machine-checkable gate
  philosophy), and large-work scope.

## P16 — Security DoD checklist from ASVS (chapters × level)

- **Evidence**: ASVS 5.0 — 345 verification requirements, 17 chapters (V1
  encoding/sanitization, V2 validation/business logic, V6 authentication, V7
  session, V8 authorization, V9 tokens, V10 OAuth/OIDC, V11 cryptography, V12
  secure communication, V13 configuration, V14 data protection, V15 secure
  coding & architecture, V16 security logging & error handling), three levels
  (L1 70 / L2 183 / L3 92) with CWE cross-references. Research note
  40-security.md S3.
- **Gap**: no security requirement list, no leveling, no "which chapters apply"
  step. The DoD (G8) is silent on security beyond a checkbox.
- **Proposed change**: new reference `06h-security.md`: the applicable ASVS
  chapters for the deliverable types the ASF produces (CLI/extension: V2, V6,
  V8, V9, V13, V14, V16; web app: + V3, V4, V7, V10, V11, V12), level selection
  by risk (L1 default; L2 if auth/data; L3 high-value), and a DoD line: "no
  applicable L1 requirement may be unaddressed; deviations recorded with
  rationale". Small work: security checklist line only.
- **Priority**: high. **Effort**: M. **Risk**: low-medium — the checklist is
  large; mitigated by chapter selection + L1 default + deviation recording.

## P17 — Supply-chain + secrets gates (optional Code Health modules)

- **Evidence**: SSDF PW.4 (component inventory/SBOM) + RV.1–RV.3 (continuous
  vuln identification, documented remediation decision, root-cause analysis);
  SLSA build levels (L1 provenance → L2 signed hosted build → L3 hardened);
  SCA tooling (`npm audit`, osv-scanner, grype/trivy); secrets scanning
  (gitleaks/trufflehog); "a newly disclosed CVE in a dependency you shipped last
  year is an RV obligation today". Research note 40-security.md S1, S5, S7.
- **Gap**: Phase 4 asks about license/maintenance/size/security history — advisory
  only. No SBOM, no SCA gate, no secrets gate, no lockfile rule, no
  vulnerability-response loop after release. The ASF itself publishes to npm —
  the supply-chain question applies to the factory's own output.
- **Proposed change**: two optional Code Health Gate modules (same 06e pattern,
  default off or warn): (a) **supply chain** — `npm audit --json` (or
  osv-scanner) with threshold + committed baseline + lockfile-committed check;
  (b) **secrets** — gitleaks via `npx --no-install` with baseline. Plus a Phase 2
  line: "record the dependency decision (license, maintenance, security history,
  pinned version)" as a one-liner in the plan. RV loop: before each release, run
  the SCA check again.
- **Priority**: high. **Effort**: M. **Risk**: low-medium — false positives from
  audit; mitigated by baseline + warn-by-default + threshold config.

## P18 — AI-agent security requirements for deliverables

- **Evidence**: OWASP AI Agent Security Cheat Sheet — tool least privilege
  (per-tool scoping, separate tool sets per trust level, explicit authorization
  for sensitive ops), prompt-injection defense (all external data untrusted,
  delimiters, sanitization), memory/context security (validate, isolate,
  TTL+size, integrity), **human-in-the-loop for high-impact actions** (risk
  classification, action previews, approval bound to exact action, fail closed,
  idempotency), output validation (schema, PII filtering, rate limits),
  monitoring (log all tool calls, anomaly detection, cost per session),
  multi-agent trust boundaries + circuit breakers, **abuse-case test matrix**
  (prompt override, tool misuse, privilege escalation, memory poisoning, data
  exfiltration, recursive tool abuse, approval bypass, multi-agent chaining),
  CI gates blocking releases when tool policies/approval logic change without
  updated tests, validation evidence. Research notes 40-security.md S6,
  50-ai-era.md A7.
- **Gap**: zero. The ASF's deliverables are pi extensions — agents with tools —
  and the ASF itself is an agent with tools. No requirement for least-privilege
  tool config, HITL for high-impact actions, output validation, cost bounds, or
  an abuse-case test matrix. This is the most directly applicable external
  standard in the whole research set, and a differentiator: almost no generic
  SDLC framework has it.
- **Proposed change**: new reference `06i-agent-security.md` (small, scaled to
  the ASF): for deliverables that are agents or expose agent-like tool surfaces,
  require (a) least-privilege tool configuration (scoped paths/operations,
  blocked patterns), (b) HITL or explicit confirmation for high-impact actions,
  (c) output validation/schema, (d) cost/consumption bounds, (e) abuse-case test
  matrix with regression tests for observed failures, (f) validation evidence in
  the delivery log. Large work only; small work: one line when the deliverable
  has tools.
- **Priority**: high. **Effort**: M. **Risk**: medium — new domain, could be
  over-engineered; mitigated by scaling and by the "deliverables that are
  agents" scope.

## P19 — Independent reviewer gate for large work

- **Evidence**: 29119 test independence (the writer is not the only verifier);
  AI-era writer → reviewer → human-owner pattern ("the writer optimizes for
  implementation; the reviewer optimizes for skepticism; the human owner
  decides"; ask "what would break in production?", distinguish blockers from
  suggestions; a second model catches missing tests, inconsistent assumptions,
  unused code, security concerns). Research notes 30-testing-qa.md T7,
  50-ai-era.md A2.
- **Gap**: Phase 4 adversarial analysis is self-review by the same agent that
  designed the thing. 06d allows subagents but does not require an independent
  reviewer for large work. The ASF has no reviewer role, no blockers-vs-
  suggestions convention, no "what would break in production" prompt.
- **Proposed change**: for large work, before the plan-approval gate: a second
  agent (fresh context, different reasoning path) reviews PLAN + diff + tests
  with the adversarial prompt, producing blockers vs suggestions; the human
  owner decides. 06d already has the mechanism (compose via `pi -p`, one level
  deep) — this adds the *requirement* and the prompt. Small work: none.
- **Priority**: medium. **Effort**: M. **Risk**: medium — cost of a second
  agent run; mitigated by large-work scope and by reusing 06d's existing
  machinery (no new dependency).

## P20 — Agent-drift stop-rules in 06-implementation

- **Evidence**: AI-era stop rules — trigger after 2–3 failed correction loops,
  unexplained security-sensitive change, growing diff outside approved files, a
  test failure the model keeps patching around, deleting tests to make a suite
  pass, replacing specific errors with generic catches, weakening types, adding
  sleeps to fix races, changing public contracts without migration notes. "The
  model should never negotiate its own blast radius." Research note 50-ai-era.md
  A4.
- **Gap**: pi-vigilant's Loop Guardian covers *loops*; 06b Rule 6 covers
  per-bug tests; but the ASF has no named drift anti-patterns and no rule that
  the agent must stop and report when it catches itself doing them.
- **Proposed change**: add to 06-implementation a short "stop and report" list:
  the named anti-patterns above; when one is detected, stop, report to the
  operator with the diff, and narrow the next step. (Cross-references
  pi-vigilant's Loop Guardian for the loop case.)
- **Priority**: medium. **Effort**: S. **Risk**: low.

## P21 — Escaped-defect feedback loop (RV.3)

- **Evidence**: SSDF RV.3 — analyse vulnerabilities to identify root causes and
  prevent recurrence; DORA metrics — track reverts, escaped defects, incidents,
  flaky-test growth; "if throughput rises but reverts and incidents rise faster,
  the workflow is failing". Research notes 40-security.md S1, 50-ai-era.md A8.
- **Gap**: when a bug escapes to the user, the ASF has no mandated
  root-cause question: "which gate should have caught this?" (G10). The ASF's
  own history shows the value of this (every shipped fix in pi-vigilant/ASF
  traced back to a missed gate).
- **Proposed change**: one rule in 06b: on any escaped defect, the fix must
  include a note answering "which gate/provision should have caught this, and
  what changes so it cannot recur" — and if the answer is "no gate existed",
  that is a proposal to add one. This is the RV.3 loop, scaled.
- **Priority**: medium. **Effort**: S. **Risk**: low.

## P22 — Context freshness rule (memory bank)

- **Evidence**: memory bank vs specs distinction (repo-wide context vs
  task-scoped specs); "context is infrastructure, and stale context creates bad
  code at scale"; "remove stale advice quickly because models follow old
  instructions with the same confidence as current ones". Research note
  50-ai-era.md A6.
- **Gap**: SKILL.md + references are the memory bank but the ASF never states
  the freshness rule or a re-verification step. Stale reference docs are
  actively harmful to an agent.
- **Proposed change**: one line in SKILL.md: reference docs are code (Rule 9);
  when a rule is found stale or contradicted during a run, update it in the
  same change (or file a note), never silently ignore it.
- **Priority**: low. **Effort**: S. **Risk**: low.

---

## P23 — Configurable release policy (user-authored when/how)

- **Evidence**: user directive — "ASF should have a default stance on this
  (and the current one is good), but release behavior should be user
  configurable. Only in absence of user definition should the default
  behavior be used." Refinements: "User should state (or, if user states),
  'when X is true, publish automatically, when Y is true, do this…' and so
  on, and 'To publish, connect with X using credentials Y, sync git…'";
  "Not deterministic commands but instructions for ASF to drive the
  publishing"; "And always test on publish / in production, if applicable!"
- **Gap**: the ASF's stance is a hard rule (never publish without explicit
  approval) with no way for a user to define their own policy; a one-off
  instruction to auto-publish is not persisted. The release flow also lacks
  a mandatory test-on-publish step.
- **Proposed change**: `.asf-release.json` at the project root (optional):
  - `when` — user-stated conditional rules ("when X is true, publish
    automatically; when Y is true, do this…") the ASF evaluates against the
    current state and acts on;
  - `how` — user-stated instructions with all technical details (credentials,
    git sync, publish steps, verification) that the ASF **drives with
    judgment** — not a deterministic command list: it checks prerequisites,
    runs the verification gates, handles failures, applies ASF discipline;
  - no file → default: always send for final review (current stance);
  - user definition takes precedence; default used only in its absence.
  - **Test on publish / in production, if applicable — always**: package →
    clean-room install from registry + observable end state; deployed app →
    prod smoke test; not applicable → say so explicitly.
  - The ASF's own release procedure is codified through the same mechanism
    (repo `.asf-release.json`).
- **Priority**: high. **Effort**: S. **Risk**: low.

---

## Recommended review order & bundles

**Bundle 1 — craft core (small, fixes a real defect)**: P05 (depth-over-size),
P08 (error handling), P11 (determinism), P13 (characterization baseline), P20
(drift stop-rules), P22 (context freshness).

**Bundle 2 — architecture (small-medium)**: P01 (ADRs), P02 (quality
scenarios), P04 (views), P03 (ATAM-lite — optional, depends on P02).

**Bundle 3 — testing (medium-large)**: P10 (risk-based + techniques), P14
(delivery fields), P12 (mutation gate — the only L effort; can be deferred).

**Bundle 4 — security (medium, highest value for Ai Applied)**: P15 (threat
model), P16 (ASVS DoD), P17 (supply chain + secrets gates), P18 (agent
security).

**Bundle 5 — process (medium)**: P19 (independent reviewer), P21 (escaped-
defect loop), P09 (code smells, low).

Suggested first approvals if you want to start small: **P05, P11, P15, P16** —
they are the highest value-to-effort and cover the three biggest confirmed
gaps (depth, determinism, security method).

---

## Notes

- Every proposal was checked against the ASF's existing strengths (spec-driven
  contract, verification honesty, wiring detection, regression discipline,
  bounded waits, modularity standard, code-health metrics, delegation limits,
  scale proportionality). None of them regress those; several *validate* them
  (the ASF's phase structure, M5, scale rule, and machine-checkable gates are
  each confirmed as the right answer by the literature).
- Nothing here adds a hard dependency: all tooling proposals use the 06e
  `npx --no-install` + `missingTool: warn` pattern; the reviewer proposal reuses
  06d's existing subagent mechanism.
- Nothing here auto-publishes or adds ceremony to small work.
- Research notes: `10-architecture.md`, `20-software-craft.md`,
  `30-testing-qa.md`, `40-security.md`, `50-ai-era.md`, `SOURCES.md`,
  `00-asf-inventory.md`.
