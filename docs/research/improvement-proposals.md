# ASF Improvement Proposals — research findings, mapped to gaps

**Status**: living record. P01–P22 were the original research batch and are all
reviewed; P23–P27 followed from user directives. Each proposal carries its own
decision block, and **[review-decisions.md](review-decisions.md)** is the
authoritative approve/reject record — a proposal is implemented only after the
PO or the user approves it (user directives count as approval authority).

**How to read**: each proposal has ID, evidence, the gap in the current ASF, the
concrete change, priority, effort (S/M/L), and risk. Proposals marked **bundle**
are small and naturally ship together, but each is still individually approvable.

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
| — | **Performance absent entirely** (user directive) | **Confirmed** — ISO 25010 performance efficiency is a specified characteristic; ASVS 5.0 (which 06h already claims) requires it at L2; agents fix perf bugs at ~3% unaided vs ~20% with instructions+tooling (PerfBench, .NET scope) | P28–P37 |
| — | ASVS chapter table is 4.0 numbering under a 5.0 label, so the ASVS DoD is unfalsifiable (found while verifying) | **Confirmed** against the official OWASP/ASVS 5.0 chapter list; no test guards it | P36, P37 |
| — | Research behaviour: authority of sources unaddressed (user directive) | **Confirmed** — 02-research is Phase-2/large-only, shallow templates, no source tiers; two load-bearing claims in this round were wrong until fetched | P33 |
| — | **Rules are prose, not enforcement** (user directive, after deferring P30 as not evaluable) | **Confirmed** — `index.ts` registers **0** `pi.on()` handlers; of 19 DoD items **4 hard / 3 mechanical-agent-invoked / 15 self-attested**; `/asf verify` emits the DoD rather than checking it; IFScale: best frontier model 68% adherence at 500 instructions, failure mode is *omission* (5–6:1 over modification) | P38–P45 |
| — | No pre-action or at-completion gate, though the harness provides both | **Confirmed** against `docs/extensions.md` (`tool_call` can block; `agent_before_settle` is the final actionable boundary) and `docs/security.md` (Pi *"does not ask for approval before every tool call"*) | P40, P41 |

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

## P24 — Completeness standard: no stubs, no fabricated data, no invented facts

- **Evidence**: user directive — "newer models tend to just build stubs,
  incomplete things or hallucinate data. aia-asf should explicitly instruct
  against that, and pi-vigilant should guard against it on completion."
  Clarified: "the agent should be able to either explain the discrepancies
  (perhaps the directive was to explicitly make a stub), or finish the work.
  No accidental stubs, hallucinations etc — agents should always be called out
  about this."
- **Gap**: the ASF had anti-placeholder rules for commits/CHANGELOG/docs and a
  wiring rule (M5, "machinery no surface consumes"), but nothing against a
  deliverable that is a stub, is incomplete, or is populated with fabricated
  data and invented facts. Green tests do not catch it — the tests get written
  against the stub, so the fake looks verified.
- **Proposed change** (both sides, since the guard is only honest if the rule
  and the check agree):
  - **ASF**: new mandatory reference `06i-completeness.md` — core rule (ship
    the real thing, or say out loud what is not real); banned patterns
    (`TODO`/`not implemented`/`coming soon` on a user-reachable path, fake or
    seed data the user reads as their own, invented facts stated as checked,
    silently deferred scope, built-but-never-wired, mocks in production paths,
    dead config); legitimate exceptions that must be **declared** (user asked
    for a scaffold, approved deferral, test seam); prove-it-is-real evidence
    (exercise each part through the user's entry point and name that action in
    the delivery report); completeness DoD. Wired into Phase 6 (mandatory read
    + discipline rule 11), Phase 7 (DoD), anti-patterns, reference index.
  - **pi-vigilant**: completeness guard at final verification. Scans the files
    the session changed (git baseline diff + worktree; mtime fallback outside
    git — so work the agent already committed is still covered) for stub /
    fabricated-data / fact-hole markers, and injects the concrete evidence
    (file:line) into the verification prompt. The call-out is **always** made:
    findings variant, scan-failure variant, or a clean-scan variant that still
    asks the two questions a scan cannot answer (was anything deferred, is
    everything wired). The agent must finish the work or state the discrepancy
    — a deliberate stub is acceptable only when the user asked for it, and then
    it is said out loud. Config: `completenessGuard` (default on),
    `completenessMaxFindings` (25).
- **Proportionality**: the scanner reads only changed files, skips
  tests/fixtures/docs/dependencies/generated code (mocks at a test seam are
  correct practice), caps findings and says when it capped; the prompt addition
  is bounded. Small work reads only the core rule and the DoD of 06i.
- **Priority**: critical. **Effort**: M. **Risk**: low — prompt-based, never
  blocks a run, disable via `completenessGuard: false`.

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

**Bundle 6 — completeness (user directive, highest urgency)**: P24 (no stubs,
no fabricated data, no invented facts — ASF rule + pi-vigilant completion
guard).

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

---

## P25 — Risk-based test selection for the inner loop (relax 06b Rule 10's "not a subset")

- **Evidence**: user directive — "look into relaxing Rule 10", with the intent
  stated as: decide, from project complexity and what the change touches, a
  **sensible and sufficient subset** to run, and **periodically (a coin toss
  every few iterations) run the FULL suite even on small problems**.
  Measured cost on the ASF's own projects (this machine, this turn):
  pi-vigilant **156s** / 10 suites, pi-aia-browser **52–65s** / 3 suites
  (123s when run back-to-back with the others), pi-aia-asf **42s** / 8 suites.
  At 156s an iteration, a 20-iteration cycle spends **~52 minutes** waiting on
  the suite — and the agent is tempted to skip testing entirely, which is the
  real failure mode.
- **Gap**: 06b Rule 10 says "Full test suite green (**not a subset**)" and
  06-implementation.md says "Run the suite; refactor; re-run / only commit
  green" — with **no distinction between the inner loop and the gate**. So the
  only sanctioned behaviour is a full run on every iteration. There is no
  concept of test-impact selection, no cost threshold below which selection
  would be pointless ceremony, and no periodic full run to catch cross-cutting
  breakage before the very end.
- **Root observation**: Rule 10 is a **Definition-of-Done checklist** — a gate
  at the *end*. The expense is in the *inner loop*. Those two are separable,
  and only the inner loop should be relaxed. **The gate must not move**: a
  subset run must never satisfy a DoD checkbox.
- **Proposed change** — new **06b Rule 19 "Test selection for the inner loop"**,
  plus a one-line clarification on Rule 10's checkbox, plus a Phase 6 line:

  **1. Separate loop from gate.**
  - *Inner loop*: run a **selected subset** (fast feedback).
  - *Gate* — before commit, before merge, at DoD, before release: **FULL suite,
    always**. Non-negotiable, never relaxed, must be an actual full run in this
    cycle with its output shown.

  **2. Selection = affected closure, not guesswork.**
  - Footprint = files changed this iteration (`git diff --name-only`).
  - Map to tests via the project's test-impact map (`.asf-test.json`, or the
    import graph, or module↔test convention).
  - Include the **transitive dependents** — tests for modules that import a
    changed module, not only its own test file.
  - **Unknown footprint ⇒ FULL run.** If the change touches shared/global
    state, build config, dependencies, the test harness, or cannot be mapped →
    run full. The strategy degrades to today's behaviour whenever it cannot be
    sure.

  **3. Always-run core (never excludable).**
  - regression tests added this cycle;
  - the feature's **E2E outcome test** (Rules 12/14) for the spec in flight;
  - the `testFile` named in every `met`/in-progress spec's `trace`;
  - the shipped-artifact / smoke test (Rule 1).

  **4. Cost threshold — proportionality guard.**
  - Measure the full-suite runtime once and **state the number**.
  - If it is ≤ `fastThresholdSeconds` (default **90s**), **always run full** —
    selection is *forbidden*, it saves nothing and only adds miss risk.
  - Above the threshold, selection applies. (This keeps small projects exactly
    as they are today.)

  **5. Periodic full run (the coin toss).**
  At each iteration boundary after the first, run FULL if **any** of:
  - `iteration % fullRunEvery == 0` (default **4**), **or**
  - coin toss: `random() < coinToss` (default **0.5**) — catches cycles that end
    on an awkward iteration count, so a subset streak can't silently run to the
    end, **or**
  - a **forced trigger**: shared/global state, config, dependency or harness
    change; merge/rebase; a cross-module refactor; the first run after ≥2
    consecutive subset-only iterations; before commit; before release.

  **6. Honesty (this is where the relaxation could rot).**
  - A subset run is **reported as a subset run**: "Ran 3/10 suites (affected:
    X, Y, Z); full suite not run." Never "suite green" (Rule 11).
  - Rule 17's Tests field must list suites run vs not run, per run.
  - Selection is a **speed** mechanism, never an escape from a failing test: a
    failing test is fixed or deleted (Rule 16), never excluded from a run.
  - If a defect escapes that a full run would have caught, run the
    escaped-defect loop (Rule 18) and **tighten** `fullRunEvery`/`coinToss`/
    the always-run core.

- **Optional config** (same precedent as P23's `.asf-release.json`), project
  root, all defaults conservative:
  ```json
  { "fastThresholdSeconds": 90, "fullRunEvery": 4, "coinToss": 0.5,
    "alwaysRun": ["test/e2e-*.mjs"], "map": { "src/foo.ts": ["test/foo-*.mjs"] } }
  ```
- **Priority**: high. **Effort**: M (docs + a selection helper + a test).
  **Risk**: medium — the risk is *under-testing*, mitigated by: unknown ⇒ full,
  always-run core, gate never moves, honest reporting, and the feedback loop.
- **Non-regression**: does not weaken Rules 1–18. The DoD checkbox keeps its
  meaning; only the per-iteration run becomes selectable. Small work and fast
  suites are unaffected (threshold guard).

### Decision (2026-10-07): ✅ **Approve (substantially revised)** — implemented as 06b Rule 19

The design above was **rewritten during review**. Two review findings drove it:

1. **The "~52 minutes" evidence was wrong.** It counted every iteration's full
   run as overhead. But this project **commits after every change**, and the
   pre-commit full run is the Rule 10 gate — which must never move. So those
   runs are not overhead, they are the gate. The saving is only the
   **intermediate red-green-refactor runs inside a single change** (steps 1–3
   of the test-first loop), not the pre-commit run. The rule was re-scoped to
   exactly that, and it is stated in the rule itself so a later run cannot
   re-widen it.
2. **The coin toss was unimplementable.** An LLM cannot generate a random
   number; asked to flip a coin it *picks* one, and it picks the one that
   skips the slow run. The `iteration % fullRunEvery` counter had the same
   disease — no defined iteration boundary means nobody keeps the count and
   the trigger silently never fires. **Both were deleted**, along with the
   "N consecutive subset runs" backstop (redundant: every commit is
   full-gated, so a subset streak cannot survive a commit).

**What replaced them — the user's own rule, which is simpler and stricter:**

> run a partial test on impact area only when **certain** that this is
> warranted. If the assessment is that you are **not certain** and the splash
> **might** be greater, then **always do full run**.

This inverts the burden of proof: **default is full**, and a subset requires an
affirmative case. It also removes the self-serving-judgment hole, because
uncertainty — the easy direction to be wrong in — now costs the agent a slow
run rather than a fast one.

Two enforcement additions keep "certain" from becoming a feeling the agent
asserts to save time:

- **No impact statement ⇒ not certain.** The subset run must be preceded by a
  stated argument for why the blast radius stops at the impact area. Restating
  the file list is explicitly *not* such an argument.
- **A mechanical disqualifier list** operationalizes "might be greater":
  shared/global state, deps/lockfile, build/test/CI config or the harness,
  schema/migrations/shared fixtures, public contracts/shared types, cross-module
  refactor/rename/move/delete, and **any changed file with no entry in the
  test-impact map**. No judgment on these — certainty is impossible by
  definition, always full. The last item means a project that has not built a
  map simply always runs full: the relaxation only ever applies where the
  mapping is known, never where it is guessed.

The ≤90s measured-runtime guard is kept (below it, assess nothing, run full).
`.asf-test.json` is **not** introduced — no config file is needed to make the
rule work, and an unused knob is drift surface.

**Landed in**: `06b-testing-qa.md` Rule 19 (+ the Rule 10 checkbox
cross-reference), `06-implementation.md` test-first steps 3–4, `SKILL.md`
index count and two anti-patterns. Tested by `test/test-test-selection.mjs`
(26 assertions), including a regression guard that **fails if the coin-toss or
iteration-counter machinery ever returns**.

---

## P26 — Browser-verify every interface a change TOUCHES, during the build

- **Evidence**: user directive — "Ensure that pi-aia-asf enforces/suggests to
  always test via the browser any touched interfaces in the building run."
- **What already existed** (checked before writing, not assumed): 06b Rule 9
  "Browser testing is mandatory for any web surface" (5 steps + the silent-async
  paragraph), a `06-implementation.md` "Browser testing (MANDATORY for web
  interfaces)" section, SKILL.md Phase 6 discipline rule 5, a Rule 10 DoD
  checkbox, and the "verifying a UI only via API/curl" anti-pattern. So this was
  **not** a missing-capability gap, and adding a second browser rule would have
  created exactly the duplication 06c forbids (the "test copy that differs from
  production" pattern). Rule 9 was strengthened in place instead.
- **The three real gaps:**
  1. **Deliverable-level trigger.** Every formulation keyed on *"if the
     deliverable has a UI/website/web app"*. An agent editing one helper in an
     existing app reads that as not-engaged — "I only changed a helper" is
     precisely the change that reaches a rendered surface unnoticed. The trigger
     is now **can this change reach a rendered surface**, with an explicit
     touched list (page/route/component/form/template; markup, styling, copy,
     formatting, truncation, empty and error states; client-side state, routing,
     data fetching the view depends on; **an API, serializer or query that a UI
     consumes** — server-side diffs are not exempt for living in `src/server/`;
     auth/permission paths that gate visibility; user-triggered uploads and
     downloads).
  2. **Timing read as an end-of-run activity.** "Must be verified", "verify:
     loads, journeys" are Phase 7 language. It is now **in the Phase 6 loop, per
     change, before committing that change** — while the context is warm and the
     defect is one edit wide. Deferring it makes the gate the first time anyone
     looked, with the cause buried in the whole change.
  3. **No teeth.** Completeness demands the exercising action be *named* in the
     delivery report; browser testing demanded nothing. Now a run is reported
     with the page/URL opened, the action taken and what was asserted — or
     `n/a: no rendered surface touched, because <reason>`. Bare "browser tested"
     is called out as an assertion, not evidence, and an unavailable
     `pi-aia-browser` must be said out loud rather than read as a passed check.
- **Interaction with Rule 19 (this proposal closes a hole P25 opened).** P25
  permits subset runs in the loop; nothing stopped a subset from excluding the
  browser/E2E suite for the surface just changed. Rule 9 now states that for a
  touched surface the browser/E2E suite is **never excludable** — selection may
  drop unrelated suites, never the one that looks at what you just changed.
- **Same safety inversion as Rule 19.** Uncertain whether the change reaches a
  rendered surface? Then it is touched. *"It's only a backend change"* is not an
  argument; naming the render path it cannot affect is. Uncertainty costs a
  browser run, never a skipped one — so the cheap direction to be wrong in is
  the safe direction.
- **Enforcement, stated honestly.** A skill rule is ultimately instruction; no
  text mechanically forces an agent to open a browser. The available teeth are:
  the Rule 10 DoD checkbox (now worded for touched interfaces + evidence), the
  `/asf verify` checklist item in `index.ts` (so it appears in the mechanically
  emitted gate), the delivery-report evidence field, and 42 assertions in
  `test/test-browser-touched.mjs` with 6 negative controls. Anything stronger
  would need a runtime hook that observes browser tool calls against the diff —
  not built here, and worth a separate proposal if wanted.
- **Priority**: high. **Effort**: S-M. **Risk**: low — the failure mode added is
  *over*-testing (a browser run for a change that could not reach a surface),
  which is bounded and cheap next to the alternative.
- **Non-regression**: Rule 9 keeps its number, its 5 steps and its silent-async
  paragraph; nothing was duplicated, nothing was removed.

## P27 — The model gate: prevent bad data-model design, not its symptoms

- **Evidence**: a production incident. `PUT /api/admin/checklist/{version}`
  rebuilt a template by deleting and re-inserting its steps and questions;
  `org_action_items.question_id` carried `ON DELETE CASCADE`; every
  organisation's generated action items were deleted. Recovery replayed from
  saved answers (46 → 327 rows) and lost completion state. The user's mandate:
  *"implement upgrades to asf / vigilant that take care of this on a fundamental
  level (so not the symptom management you started with first, but preventing
  bad design that can lead to this)."*
- **The diagnosis this proposal is built on.** Every gate ASF owns inspects
  **code shape**: 06c modules, 06e functions, 06g test technique, 06b observable
  behaviour, 06h security posture. None inspects the **model**. Worse, the
  Definition of Done is entirely behavioural — build passes, suite green,
  artifact inspected, surface consumes it, E2E passes — and **all of that passed
  on the code that ate the data**. The meta-blind spot, stated once: *every gate
  we own asserts the intended effect; not one asserts the non-effect.* A
  rebuild-by-delete is also not "poor engineering" to an agent — it is the
  shortest correct-looking implementation of "sync these rows", invisible as a
  smell because ASF has no vocabulary for persistence smells at all.
- **Research**: `docs/research/model-blind-spots.md` — 14 defect classes
  invisible to the current gates (ownership/lifecycle, identity, concurrency,
  object authorization, time, units, locale, scale cliffs, unit-of-work,
  contract evolution, deletion semantics, environment divergence, silent-zero,
  cross-session interference), plus online practice: Vernon's aggregate rules,
  architecture fitness functions, the ActiveRecord `dependent:` matrix
  (including the `restrict_*` options nobody uses), expand-contract migrations,
  OWASP IDOR two-user methodology, Postgres RLS for tenancy, and the soft-delete
  cascade-decision table whose own conclusion validated the design: *the
  exercise's value is forcing per-rule decisions rather than providing one
  answer.*
- **What landed** (each soft rule paired with a hard counterpart, per the
  standing rule that prose an LLM can rationalise around is not a gate):
  `06j-data-model.md` (ownership classes, the `asf-model:` declaration, M1–M8,
  legitimate exceptions, model DoD); `06e` **`model` level** with two objective
  fitness functions, built into the existing harness (levels, thresholds,
  baseline, ratchet, `gate.mode`) so no new architecture was needed; `06g` §3
  invariant & non-effect tests; `06b` **Rule 20** + the Rule 10 model line;
  `04-adversarial` data & model lens; `05-plan` ownership table;
  `06-implementation` test-first step 6 + **Model drift**; `index.ts`
  QA_CHECKLIST item.
- **Two user corrections that shaped the design.**
  1. **Store-agnostic, by requirement**: *"not all (not nearly) database systems
     ASF works with will be SQL — plenty of schema-free like mongo and so on."*
     The defect is not SQL-shaped: an instance inheriting its parent's lifecycle
     happens in a FK action, an ORM mapping attribute, a document-store delete
     dependency, or a loop someone wrote. The scanner recognises a small
     illustrative set across those forms, projects add dialect via
     `model.extraCascadePatterns`, and **where the store exposes no constraint to
     inspect, the invariant tests are the only hard gate** — said in the text, so
     nobody reads a schema scan as covering a store it cannot see.
  2. **No over-enumeration.** ASF is a general software factory; a normative
     reference that catalogues products, dialects and helper-function names
     implies coverage nobody can maintain. An earlier draft's
     "cascade into a table that has an owner column" and "named recursive-delete
     helper" rules were **dropped**, not trimmed: both infer from a name, and a
     gate that fires on a guess gets rationalised around or switched off — and
     either way the real rule dies with it.
- **Honesty about the mechanism.** The scanner is documented as **a tripwire, not
  an authority**; `scanned: 0` must be reported rather than hidden; an
  `asf-model-accept: <reason>` waiver is greppable so an accepted exception stays
  visible instead of becoming a silent pass. The obligation, not the scan, is the
  gate: Rule 10's checkbox and the invariant tests.
- **Out of scope, deliberately.** Backup/restore/rollback (user: symptom
  management) and a `tool_call` blocker on destructive commands — the incident's
  actual trigger was a human clicking a checkbox in an admin UI, which no
  agent-facing gate could have stopped. That asymmetry is the reason the schema
  fix and the agent gate are both needed: the schema protects against
  human-caused damage, the gates against agent-caused damage.
- **Priority**: high. **Effort**: M. **Risk**: false positives on unusual
  dialects, bounded by the greppable waiver and `extraCascadePatterns`; the
  failure mode added is *asking for a declaration*, which is cheap.
- **Verification**: `test/test-model-gate.mjs` — 70 assertions: the incident as a
  fixture, a negative control per rule (declared cascade silent, upsert not a
  rebuild, different tables not a rebuild, `map.delete` not a DELETE, unknown
  dialect invisible until configured), a real-build check that the level returns
  `fail` and exit 1, a documented-gap assertion for the hand-rolled
  document-store cascade the scan cannot see, and the normative wiring across
  eight files. Full suite 372 checks / 10 suites / 0 failures; negative control
  on the wiring (remove Rule 20 → suite fails).

---

# Performance batch (P28–P37) — user directive

**Evidence base**: [performance-blind-spots.md](performance-blind-spots.md)
(standards: ISO/IEC/IEEE 25010:2023 performance efficiency and **OWASP ASVS 5.0,
whose own L2 clauses already require identifying resource-demanding functionality
and defending it**; SEI ATAM quality scenarios and performance tactics; Google
SRE golden signals; Gregg USE method; Nielsen response-time limits; Dean &
Barroso tail at scale; Tene coordinated omission/wrk2; Node `node:bench` (and
why ASF cannot use it), `perf_hooks` and event-loop guides; AWS eight test types;
Gunther USL; the measurement-validity literature — Stabilizer, Laaber's cloud
variability study, the duet procedure, Otava/MongoDB and Mozilla Perfherder
change-point detection; performance-bug literature — PerfBench, TANDEM,
Jin/Song/Lu (PLDI'12), PerfChecker, PerfSig, performance-test coverage studies;
the engines actually in the corpus — `pg`, SQLite, MongoDB explain semantics and
driver monitoring; OWASP API4:2023/DoS; ISTQB CT-PT; LLM code-hallucination
studies; plus ASF's own reproduction of the noise problem on this machine).

**The single number that justifies the batch**: coding agents resolve real-world
performance bugs **~3%** of the time; with performance-aware instructions and
benchmarking tooling, **~20%** (PerfBench, arXiv:2509.24091). Instructions and
measurement are precisely what ASF supplies.

**Scale rule**: P28/P31/P32/P35 are large-work; P29's one-line DoD applies to
all work (like 06h §0); P30's built-in tripwires are cheap and run where a hot
path is touched; load/stress/soak/scalability are large-work or scheduled. No
proposal adds ceremony to small work.

---

## P28 — Performance scenarios are mandatory where a cost surface exists

- **Evidence**: ISO/IEC/IEEE 25010:2023 defines a product quality model of nine
  characteristics "further subdivided into subcharacteristics" that "provide a
  reference model for the quality of the products to be **specified, measured and
  evaluated**" ([ISO abstract](https://www.iso.org/standard/78176.html));
  performance's three — time behaviour, resource utilization, capacity — are
  stated as properties that *meet requirements*, i.e. they are requirements, not
  aspirations ([arc42 quality model](https://quality.arc42.org/qualities/performance)).
  SEI quality-attribute scenarios (stimulus → response → **measure**) are the
  standard form, and ATAM exists to expose architectural risks against them.
  ASF already owns the format (`05-plan.md` "Quality requirements (P02)" with an
  example `1000 concurrent users → p95 < 2s`) but never requires it.
- **Gap**: a plan can pass Phase 5 with zero performance scenarios and no one
  notices; the example row makes it look optional. Without a declared target
  there is nothing to measure against, so every later gate is unanchored and
  "fast enough" becomes a judgment call — the exact failure mode 06e was created
  to remove for structure.
- **Proposed change**: in `05-plan.md`, the Quality requirements table **must**
  contain at least one performance scenario per critical journey when the
  deliverable has a cost surface — a user-facing request path, a batch/import/
  report job, a queue consumer, a scheduled task, or any store read that scales
  with user data. Each scenario states stimulus, load (concurrency or dataset
  size), and the measure (percentile + threshold + resource ceiling); each is
  captured as a **MUST spec** (`capture_spec`, area `performance`) so vigilant's
  generic spec gate refuses "done" while it is open (06j §7 boundary: the
  obligation crosses, the check does not). "Cannot write the measure" ⇒ the
  requirement is not real yet — that line already exists and becomes enforced.
  When the user has not given a target, propose one **with a cited source** (P33)
  and record it as a proposal, never as a fact.
- **Priority**: high. **Effort**: S. **Risk**: invented targets ⇒ mitigated by
  the citation rule; over-specification for internal tools ⇒ mitigated by
  "critical journey" scoping and L1-style minimalism.

---

## P29 — `06k-performance.md`: the performance reference

- **Evidence**: every other quality dimension ASF enforces has a single-concern
  reference (06h security, 06i completeness, 06j data model). Performance has
  none — `grep -ri performance skills/` returns a spec-area label, one plan
  example, and one observability line in 06f.
- **Gap**: no vocabulary (percentile vs mean, load/stress/soak/spike/volume,
  saturation vs utilization), no measurement-validity rules, no diagnostic
  method, no architecture-level option set, no stack-specific trap list.
- **Proposed change**: new reference, same shape as 06h/06j (Read when / Skip
  when / Sources / one-line DoD / sections / "Where this applies in ASF" /
  anti-patterns), **mandatory when a cost surface exists, advisory otherwise**:
  1. **One-line DoD (all work)** — *"the paths this change touches are measured,
     not guessed; no regression against the committed baseline; no unbounded
     resource use on user-controlled input."*
  2. **Budget & scenario** — the P28 scenario is the contract; the number names
     its source.
  3. **Measurement validity** (the §2 rules of the research doc): percentiles
     not means; coordinated-omission-free (open-loop/constant-throughput) load;
     warmup and minimum duration; raw-sample inspection for GC pauses and
     multimodality; environment recorded; lab vs field declared.
  4. **Test-type menu** — the eight AWS types with question/pattern/duration/
     cadence, and which are CI-cheap (smoke, baseline, load-lite) vs scheduled
     (stress, soak, scalability, spike, volume).
  5. **Diagnostics** — USE method checklist (utilization/saturation/errors per
     resource; low average utilization ≠ no saturation) + four golden signals +
     the symptom/cause split; off-CPU and queueing intuition for "slow but CPU
     idle".
  6. **Optimization option set** — SEI performance tactics in three groups
     (resource demand / resource management / resource arbitration), used to
     name the *layer* of a fix, which feeds P32's escalation test.
  7. **Stack traps** (illustrative, not a catalogue — P27's no-over-enumeration
     rule), each with the objective signal the gate looks for: event-loop
     blocking and worker-pool starvation in Node (official guide, plus
     `eventLoopUtilization()` as the saturation reading); N+1 / missing index /
     full scan (`Seq Scan`, `SCAN`, `COLLSCAN`) / over-fetch /
     connection-pool-exhaustion / row-at-a-time writes on the engines the corpus
     actually uses (`pg`, `better-sqlite3`, `mongodb`).
  8. **Performance ↔ denial of service** — the measured half of 06h's
     "no unbounded resource use": declared ceilings verified by one abuse-case
     load run, against the OWASP API4:2023 list of limits whose absence makes an
     API vulnerable (execution timeouts, max memory, file descriptors,
     processes, upload size, **operations per request**, **records per page**,
     third-party spend), with the `?size=200` → `?size=200000` scenario as the
     worked example.
  9. **Escalation ladder** — pointer to P32's triggers.
- **Priority**: high. **Effort**: M. **Risk**: doc bloat ⇒ capped (~180 lines,
  Rule 9 applies to it from day one); becoming a performance *catalogue* ⇒
  explicitly forbidden, traps are examples with named signals.

---

## P30 — `performance` level in the Code Health Gate (objective fitness functions)

- **Evidence**: 06e already proves the pattern — measured levels, thresholds,
  committed baseline, `gate.mode`/`gate.scope`/`missingTool`, tools via
  `npx --no-install`, built-in checks where a missing dependency must never
  become an excuse (the P27 `model` level). The measurements themselves are all
  documented and reachable: `EXPLAIN`-family tripwires exist for every engine in
  the corpus (`pg` → plan-node tree with `Seq Scan`, machine-readable via
  `FORMAT JSON`; `better-sqlite3`/`node:sqlite` → `SCAN` vs `SEARCH USING INDEX`;
  `mongodb` → `COLLSCAN` vs `IXSCAN`), query counting has a driver-side seam
  (`monitorCommands: true` → `commandStarted` with `commandName`/`duration`), and
  k6 exits 99 on threshold breach. The yield of exactly this kind of cheap static
  check is measured, not hoped for: an analyser with **two** patterns found 126
  instances in 18 of 29 apps (1.1 M LoC), 68 confirmed as previously unknown
  (ICSE'14, PerfChecker). Comparison policy is the hard part and the literature
  is unambiguous about it (Wilcoxon rank-sum + effect size, test/control
  interleaved on the same machine, ≤ 5% false-positive budget).
- **Feasibility, measured before proposing** (this machine, Node v22.22.1, 4
  cores):
  - `node:bench` is **not available** — it was added in v26.9.0 behind
    `--experimental-bench`, and `package.json` declares no `engines`. So `bench`
    ships its own ~40-line harness (hrtime sampling, warmup, randomized
    interleaving, Wilcoxon rank-sum + Hodges–Lehmann ratio), or uses Tinybench
    (no dependencies, reports median/stddev/margin of error/percentiles; already
    bundled with the Vitest every ASF project uses). `node:bench`'s documented
    rules are the harness's specification, not its implementation.
  - A prototype of that harness was run against a workload with known extra
    work: **0/40 false fires and 40/40 detection at +10%** when quiet, while a
    naive "median +15%" rule missed the 10% regression **every time**. Under
    three competing CPU hogs the CV went to ~50% and detection fell to 13/25
    while the naive rule began firing on unchanged code. Hence: the gate **must
    refuse to run on a busy machine** (`skipped: machine busy`, checked via load
    average vs core count and the measured CV) and must report the CV it saw.
    A 30-sample trial costs seconds, so the cheap/expensive split in P34 is
    honest.
  - `queryBudget` and `planScan` were prototyped end-to-end on `node:sqlite`:
    a lazy per-author fetch counted **11 queries at n=10 and 41 at n=40** (⇒
    N+1) against **2 and 2** for the eager version, and `SCAN post` became
    `SEARCH post USING INDEX post_author (author_id=?)` after adding the index.
    Both are objective, need no third-party tool, and run in milliseconds.
  - **Caveat that shapes severity**: SQLite's own docs warn that EXPLAIN QUERY
    PLAN output "is intended for interactive debugging only" and "applications
    should not depend on the output format" (it changed in 3.24.0 and 3.36.0),
    and `node:sqlite` is still experimental on Node 22. So `planScan` is a
    **warning** where the parser does not recognise the output — reported as
    `scanned: 0`, never a pass and never a hard failure. `queryBudget`, which
    counts driver events rather than parsing plans, is the metric allowed to
    fail hard.
- **Gap**: nothing measures time behaviour, resource utilisation or capacity.
  A change that turns one query into 1 + N, or adds a synchronous `fs.*Sync` to
  a request path, is invisible to every gate ASF owns.
- **Proposed change**: a `performance` block in `.asf-code-health.json` and a
  `performance` level in `/asf health`, each metric independently switchable,
  report-only until a project's baseline stabilises (like `design`/depth):
  | metric | what it measures | how | default |
  |---|---|---|---|
  | `queryBudget` | queries issued per named operation on a seeded dataset of N rows | driver event seam (`monitorCommands` for `mongodb`, `pg` query events, `prepare()` wrapper for sqlite) | **fail** when count grows with N or exceeds ceiling |
  | `planScan` | execution plans of the queries an operation issues | engine-native plan output: `Seq Scan` / `SCAN` / `COLLSCAN`, above a declared row threshold | **warn** (format-fragile, see caveat); `scanned: 0` is never a pass |
  | `bench` | declared hot-path benchmarks vs committed baseline | ASF harness or Tinybench + statistical comparison (P31); refuses to run on a busy machine | fail on significant regression only |
  | `resourceCeiling` | heap/RSS, `eventLoopUtilization()`, connection count after a short sustained run | runtime hooks | fail beyond ceiling; monotonic-trend ⇒ leak signal |
  | `load` | p95/p99/error rate for declared journeys at a declared arrival rate | k6/wrk2 via `npx --no-install` | fail on threshold breach; `missingTool: warn` |
  | `webBudget` | bundle bytes and lab Core Web Vitals (LCP/INP/CLS at p75) | Lighthouse CI when present | warn → fail once baselined |
  Metrics are ordered by phase, not by alphabet: phase 1 is `queryBudget` +
  `planScan` (built-in, cheap, highest hit rate for the stack ASF actually
  guards), phase 2 `bench` + baseline + statistics, phase 3 `resourceCeiling`,
  phase 4 `load`/`webBudget` (tool-present only). Each phase ships its own test
  file and negative controls.
  - Baseline: `.asf-code-health-baseline.json` extended with a `performance`
    section; `--diff` flags regressions, `--update-baseline` is a deliberate act
    (06e Rule 2: fix the cause, not the threshold — raising a perf threshold
    needs a written justification in the commit message).
  - **Honesty rules copied from the model gate**: `scanned: 0` / `no-counter` /
    `tool-missing` / `skipped: machine busy` are **reported, never read as a
    pass**; waivers are greppable (`asf-perf-accept: <reason>`); the built-in
    metrics (query count, plan scan) are the ones that can never be skipped for
    a missing dependency.
  - **Scope honesty**: the corpus uses `pg`, `better-sqlite3`, `mongodb` and
    `express` — no Prisma, no MySQL. Prisma/MySQL docs are cited as the clearest
    *written* statement of the failure modes; the adapters are written for the
    engines that are actually present, and an engine with no adapter reports
    `no-counter`, it does not pass.
- **Priority**: high. **Effort**: L (phased, each phase independently shippable).
  **Risk**: flaky gates in CI ⇒ mitigated by statistics + report-only-until-
  baselined + `missingTool` semantics; over-instrumentation ⇒ mitigated by
  "declared hot operations only", never a whole-repo sweep.

---

## P31 — The measurement contract (a performance claim is an 06i claim)

- **Evidence**: wrk2/coordinated omission (a closed-loop generator never samples
  the slowest requests); `node:bench` (warmup, sample inspection, "a
  statistically consistent result does not prove that a benchmark measured the
  intended work", and it deliberately leaves comparison policy to a higher-level
  tool); Stabilizer, verbatim: "a single binary constitutes just one sample from
  the space of program layouts, regardless of the number of runs"; the measured
  failure rate of the naive alternative — MongoDB's CI reached **~99% false
  positives** with threshold-based detection (Apache Otava), Mozilla's t-test
  system produces **12.5% false-positive alert groups and misses regressions in
  ~6.8%** (Perfherder), and on shared machines the coefficient of variation of
  identical runs spans **0.03% to >100%**, with both standard comparison tests
  false-firing on unchanged code at low sample size; the mitigations that work
  are **test and control on the same machine, interleaved in randomized order**,
  Wilcoxon rank-sum over bootstrap CIs, and an explicit false-positive budget
  (≤ 5%) ([Laaber et al.](https://research.chalmers.se/publication/511491/file/511491_Fulltext.pdf);
  [duet procedure, ICPE'20](https://arxiv.org/abs/2001.05811)); AWS baseline
  guidance ("is this *different* from what we expect?").
- **Gap**: ASF has no rule about what a performance statement must contain, so
  an agent can write "optimized the query, now much faster" in a delivery report
  and 06i does not fire, because 06i guards stubs and fabricated data, not
  unmeasured performance claims.
- **Proposed change**: normative rules (06k §measurement + a 06b cross-reference):
  1. a latency claim names **percentile + load + sample count + environment**
     (runtime version, CPU, concurrent load, dataset size) and whether it is
     **lab or field**;
  2. a throughput claim names **arrival model** (open-loop target rate vs
     closed-loop) and run duration (≥ 10 s or the run is not informative);
  3. a "regression/faster than before" claim requires a **statistical
     comparison** against a retained baseline (rank-sum test + effect size), with
     warmup, both variants measured **interleaved in one process in randomized
     order**, raw samples retained, and the **observed CV reported** — not a
     single before/after pair and not a ±% threshold;
  4. a comparison measured on a **busy machine is void**: the harness checks load
     average against core count (and its own CV) and reports
     `skipped: machine busy` rather than a verdict — measured on this machine,
     contention cut detection of a real 10% regression from 40/40 to 13/25 while
     a naive threshold began firing on unchanged code;
  5. a claim with no measurement is an **assertion**, and 06i's no-invented-facts
     rule applies to it: either measure it or write "not measured, because …".
  6. the delivery report's performance field (P35) is where those numbers go.
- **Priority**: high. **Effort**: S. **Risk**: agents gaming the wording ⇒ the
  numbers are checked by the gate when a baseline exists; where none exists the
  report must say so, which is the visible trace we are after.

---

## P32 — Escalation ladder: a measured performance finding may reopen the architecture

- **Evidence**: the user's directive — *"performance issues should be treated as
  highly important and may justify architectural redesign."* The literature
  supports the mechanism rather than the sentiment: ATAM's output is
  **architectural risks** against quality goals; SEI tactics show that some
  findings are only closable by resource-management/arbitration decisions;
  Tail at Scale shows fan-out/tail problems are structural; USL gives a
  quantitative scalability verdict (σ contention, κ coherency — coherency makes
  throughput *fall* with added capacity); AWS: sub-linear scaling "indicates a
  shared resource bottleneck: a database lock, a singleton connection, or a
  component that cannot be horizontally scaled", and a Lambda throttle means
  "reserved concurrency **or architecture redesign**".
- **Gap**: ASF has no path from a quality finding back to the architecture.
  Phase 5 evaluates the architecture once; afterwards, everything is a bugfix,
  so a structural problem gets patched locally forever (the loop gets faster;
  the fan-out stays). 06h's blocking rule (open High threat ⇒ delivery blocked
  unless explicitly accepted) is the precedent for teeth — performance has none.
- **Proposed change**: an **escalation ladder** in 06k, with hard triggers that
  local tuning cannot close:
  - **T1 scalability**: sub-linear scaling below the configured ratio across
    declared steps, or USL σ/κ beyond configured limits ⇒ *structural*.
  - **T2 breaking point**: stress failure occurs **before** the load the P28
    scenario specifies ⇒ *structural or capacity*.
  - **T3 tail amplification**: p99 dominated by fan-out — query count or remote
    calls growing with result size (N+1 class) ⇒ *structural at the data-access
    boundary*.
  - **T4 time-dependent degradation**: monotonic trend in a sustained run
    (memory/connections/latency) ⇒ *resource-lifecycle defect*, treat as a
    stability finding (06f) and a leak.
  - **T5 tactic-class test**: the candidate fix belongs to SEI
    *resource management* or *resource arbitration* (concurrency, caching,
    replication, scheduling, partitioning, async/queue) rather than *resource
    demand* ⇒ by definition not a local cleanup.
  On any trigger, and only on a statistically supported measurement at a declared
  load:
  1. the finding is recorded as an **architectural risk** in the plan's
     ATAM-lite section (or opened there if the plan is closed);
  2. an **ADR is required** (P01) with ≥2 real options, one of which must be
     structural (cache layer, read model/denormalisation, queue/async, batching,
     index, partitioning, worker pool, connection pooling, pagination ceiling);
  3. the ATAM-lite evaluation is **re-run** for the affected quality goals;
  4. **delivery is blocked** while a High performance finding (one that misses
     the P28 scenario) is open, unless the user explicitly accepts it — recorded
     with rationale, exactly as 06h does for High threats;
  5. "raise the threshold" is not a closure path (06e Rule 2), and re-scoping the
     scenario downward is a **user decision**, not an agent decision.
  Anti-abuse: escalation requires the measurement, the load, and the trigger id
  in the report — an agent may not escalate on a vibe, and may not close a
  trigger by relabelling it.
- **Priority**: high. **Effort**: M. **Risk**: over-escalation (agents love a
  dramatic ADR) ⇒ triggers are numeric and require the measurement artifact;
  under-escalation ⇒ the QA_CHECKLIST item and Rule 10 checkbox make an open
  High finding visible in the delivery report.

---

## P33 — Research-first, with source authority tiers

- **Evidence**: user directive — *"ASF should generally be inclined to search
  online for authoritative sources if it needs to deepen its knowledge on
  anything specific while building software."* `02-research.md` already opens
  with "Never plan architecture on memory alone" but is scoped to Phase 2 of
  large work, its templates are `<topic> best practices 2026`, and it has no
  concept of source authority. The performance literature makes this the
  **dominant cause of the defect class itself**: two thirds of the 109 real
  performance bugs studied by Jin, Song & Lu were introduced by "developers'
  wrong understanding of workload or API performance features" — a lookup that
  was not done, not a typo (PLDI'12, read in full). The code-generation
  literature documents the same failure in agents: knowledge-conflicting
  hallucinations such as non-existent API parameters that survive linters
  ([ACM 10.1145/3793655.3793725](https://dl.acm.org/doi/10.1145/3793655.3793725),
  snippet) and a repository-level hallucination taxonomy whose **RAG-based
  mitigation worked consistently across all six LLMs studied**
  ([arXiv:2409.20550](https://arxiv.org/abs/2409.20550), abstract) — i.e. the
  fix for guessing is looking it up, measured.
  This very batch is the demonstration: INP's 200 ms, the p75 rule, wrk2's 10 s
  calibration floor, `node:bench`'s ten warmups **and the fact that it needs
  Node ≥ 26.9.0**, MySQL's `type: ALL`, SQLite's "do not depend on this output
  format", k6's exit code 99 and the USL formula are all facts that had to be
  looked up — and two of them (a mislabelled PLDI paper as OOPSLA, and a
  `node:bench` gate that cannot run on the installed Node) were wrong in the
  first draft precisely because they were remembered rather than fetched.
- **Gap**: research is a Phase-2 gate for large work, not a habit during
  implementation; nothing tells an agent *when* memory is unsafe or *which*
  sources may make a normative line; a number invented from memory becomes a
  requirement nobody can trace.
- **Proposed change**: upgrade `02-research.md` from a Phase-2 playbook into a
  general research discipline (still one page):
  1. **Search triggers** (memory is not enough): any numeric threshold/SLO/
     budget; any claim about a tool's or runtime's behaviour; any standard's
     requirement; any library API's existence or semantics; any algorithmic or
     architectural choice under load; any "I recall that…".
  2. **Authority tiers**: **T1** primary — standards bodies (ISO/IEC/IEEE),
     official runtime/vendor reference manuals, SEI/OWASP/NIST, peer-reviewed
     (ACM/IEEE/USENIX/arXiv); **T2** reputable engineering practice — Google SRE,
     cloud well-architected guides, official project docs; **T3** practitioner
     blogs, SO/LLM answers, agent memory — **leads only**: a T3 claim must be
     confirmed at T1/T2 before it appears in a plan, a spec, or ASF content.
  3. **Search shapes** beyond "best practices": `<standard> <clause/characteristic>`,
     `<vendor> reference manual <feature>`, `empirical study <topic>`,
     `<topic> taxonomy`, `site: use the original paper, not the blog about it`.
  4. **Citation rule**: any normative number or requirement in a plan, spec, or
     ASF reference names its source (the `Sources:` line 06h already uses is the
     pattern); a number without a source is a **proposal**, not a requirement.
  5. **Applies at all scales and in Phase 6** — the artifact is one line in the
     delivery log (`checked: <source> for <claim>`), so it cannot become
     ceremony; the Phase-2 research gate for large work is unchanged.
  6. **Fetch discipline**: read the 2–3 sources that carry the decision
     (batch_web_fetch), don't stop at snippets — the same honesty labelling
     SOURCES.md already uses ("fetched directly" vs "search-snippet only").
- **Priority**: high. **Effort**: S. **Risk**: research rabbit-holes on small
  work ⇒ triggers are specific and the artifact is one line; the scale rule keeps
  small work at "one line, one source".

---

## P34 — Cost ceiling and CI placement (so the gate is never switched off)

- **Evidence**: AWS cadence guidance (load before every release; stress and
  scalability quarterly or after architecture change; soak monthly; spike before
  known events); k6 exits 99 on threshold breach so CI can stop a pipeline
  (`ThresholdsHaveFailed = 99`); 06b Rule 19 (P25) already made the "never
  excludable" argument for suites that cover a touched surface, and P26 applied
  it to browser tests. The cost problem is now **measured** rather than assumed:
  the first empirical study of performance-test suites (28 open-source systems)
  found they reach **~8.8% method coverage on average — four times less than the
  functional tests — while costing 62× their execution time**, with more coverage
  costing still more time
  ([Imran et al., EASE'24](https://riccardorubei.github.io/files/C_2024_2.pdf)).
  A perf suite is simultaneously thin and expensive, so "run everything always"
  is not survivable and "run nothing" loses the little coverage there is —
  exactly the two-way split below. The cheap half is genuinely cheap: the
  prototype query-count and plan probes run in milliseconds, and a 30-sample
  statistical trial costs seconds.
- **Gap**: no rule about what runs when, so the only two stable outcomes are
  "perf tests are too slow, delete them" or "perf tests exist and nobody runs
  them". And nothing stops subset selection from excluding the perf suite when a
  hot path changed.
- **Proposed change**:
  - **Cheap always** (target ≤ ~60 s, built-in, no installs): query-count
    tripwire, plan scan, `bench` on declared hot paths, resource ceilings.
  - **Scheduled expensive**: stress, scalability, soak, spike, volume — cadence
    per the AWS table (quarterly / after architecture change / monthly / before
    known events), recorded in the plan and in the delivery log with its date.
  - **Never excludable**: when a change touches a declared hot path, the perf
    suite for that path is outside P25 subset selection (same inversion as Rule
    19/P26: uncertain whether it touches a hot path ⇒ it does).
  - **Never green by omission**: a perf test that cannot run in the current
    environment is reported as **skipped with reason** in the delivery report
    (06i), never counted as passing.
- **Priority**: medium. **Effort**: S. **Risk**: cheap-gate drift (someone adds
  40 benchmarks and the gate becomes slow) ⇒ a documented budget and
  "declared hot paths only".

---

## P35 — Performance DoD, delivery-report field, and tests

- **Evidence**: every ASF rule that works is paired with (a) a DoD line, (b) a
  report field with evidence, (c) a checklist item, (d) a test file with negative
  controls — the pattern that made P26/P27 land (skill text is instruction; the
  teeth are the checkbox, the checklist, the report field and the assertions).
- **Gap**: no performance DoD, no performance field in the delivery report, no
  QA_CHECKLIST item, no test file — so even with 06k and the gate, "nobody
  measured" would leave no trace.
- **Proposed change**:
  - `06b-testing-qa.md`: **Rule 21 (Performance)** — declared scenario is the
    contract; measurement follows the P31 contract; regression and escalation
    handled before delivery; untested cost claims are declared, not implied.
    Plus a Rule 10 checkbox line (perf suite run as part of the full run when a
    hot path is touched).
  - `06-implementation.md`: test-first step for performance (write the
    benchmark/query-count assertion before optimising; measure, then change, then
    re-measure) and a **Performance drift** anti-pattern (optimising without a
    measurement; "it should be faster now"; deleting a benchmark to pass a gate).
  - Delivery report (06b Rule 17): add a **performance** field — measured numbers
    + environment, or `not measured, because …`, + open escalations with their
    trigger ids.
  - `index.ts`: `QA_CHECKLIST` item (performance scenario measured / escalation
    open / baseline updated deliberately).
  - `SKILL.md`: reference-index row for `06k-performance.md`, a Phase-4
    **performance lens** ("what is the cost of this design at 10× load; where does
    it break; what is the first resource to saturate?"), and anti-patterns
    (mean-only claims; closed-loop latency claims; threshold-raise to pass;
    optimising without a baseline; "only a backend change" for a hot path).
  - `test/test-perf-gate.mjs`: naive-measurement fixture fails; N+1 fixture
    fails and the eager-load control is silent; a full-scan plan (`Seq Scan` /
    `SCAN` / `COLLSCAN`) is reported with location and `scanned: 0` is reported
    not passed; **an unparseable plan format is announced, never a silent pass**
    (the SQLite format-instability caveat made testable); seeded 20% regression
    fails while seeded within-variance noise passes (the negative control a ±15%
    rule cannot pass); **under simulated CPU contention the gate reports
    `skipped: machine busy` and yields no verdict**; sub-linear scaling fixture
    produces architectural risk + ADR requirement + blocked delivery; threshold-
    raise does not close a trigger; small work requires no load test; wiring
    greps for 06k, the lens, Rule 21, the report field and the checklist item
    with a negative control each.
- **Priority**: high. **Effort**: M. **Risk**: test bloat ⇒ assertions are
  behavioural (real runs), not string-matching prose beyond the wiring greps.

---

## P36 — The ASVS chapter table in 06h is ASVS 4.0 numbering wearing a 5.0 label

- **Evidence**: `06h-security.md:43-51` says "Use OWASP ASVS 5.0 as the checklist
  source" and the table's parentheticals are the **4.0** chapter names. Verified
  against the official source (the `5.0/en/` directory of
  [OWASP/ASVS](https://github.com/OWASP/ASVS/tree/master/5.0/en), file list read):
  | 06h says (ASVS 5.0) | what ASVS 5.0 actually says | where the 06h topic really lives in 5.0 |
  |---|---|---|
  | V1 architecture | **V1 Encoding and Sanitization** | architecture → V15 |
  | V2 auth | **V2 Validation and Business Logic** | auth → V6 |
  | V3 session | **V3 Web Frontend Security** | session → V7 |
  | V4 access control | **V4 API and Web Service** | authorization → V8 |
  | V5 input validation | **V5 File Handling** | validation → V2 |
  | V6 output encoding | **V6 Authentication** | encoding → V1 |
  | V7 crypto | **V7 Session Management** | cryptography → V11 |
  | V8 errors | **V8 Authorization** | logging/error handling → V16 |
  | V14 config | **V14 Data Protection** | configuration → V13 |
  | V15 API | **V15 Secure Coding and Architecture** | API → V4 |
  ASVS 5.0 has **17** chapters (V1 Encoding and Sanitization, V2 Validation and
  Business Logic, V3 Web Frontend Security, V4 API and Web Service, V5 File
  Handling, V6 Authentication, V7 Session Management, V8 Authorization, V9
  Self-contained Tokens, V10 OAuth and OIDC, V11 Cryptography, V12 Secure
  Communication, V13 Configuration, V14 Data Protection, V15 Secure Coding and
  Architecture, V16 Security Logging and Error Handling, V17 WebRTC).
- **Gap**: this is not cosmetic — the DoD line (*"the applicable ASVS chapter
  checks pass at the chosen level"*) is **unfalsifiable as written**. An agent
  told to check "V7 (crypto)" in ASVS 5.0 opens Session Management and either
  checks the wrong thing or reports the right thing under a wrong id, and the
  plan records a chapter selection that no reviewer can match to the standard.
  It is also unguarded: `grep -rn ASVS` finds the table in exactly one file, and
  the security assertions in `test/test-improvements.mjs` only check that strings
  exist (`'DoD has security line'` looks for `"Security line (06h)"`, `'P17
  gitleaks'` looks for the word `gitleaks`) — **nothing asserts any chapter
  mapping**, so it drifted silently.
- **Proposed change**:
  1. Replace the table with real 5.0 numbering, per deliverable type —
     **Web/API service**: V1, V2, V3, V4, V5, V6, V7, V8, (+V9, V10 when tokens /
     OAuth-OIDC are used), V11, V12, V13, V14, V15, V16; **CLI / local tool**: V1,
     V2, V5, V11, V13, V14, V15, V16 (no session/auth/frontend);
     **Library/package**: V1, V2, V5, V11, V13, V14, V15, V16 (its own surface);
     **Agent/tool surface**: V1, V2, V4, V5, V13, V15, V16 + the agent chapter.
     Chapter names are written out next to each id so a wrong pairing cannot hide.
  2. Keep the level-selection rule as is (L1 internal / L2 internet-facing /
     L3 high-value) — it is correct and it is what makes P37 work.
  3. `Sources:` line names the exact source of truth (the ASVS 5.0 chapter list)
     per P33's citation rule, and the doc states the version explicitly at the
     table so a future 5.1 is a visible change, not a silent one.
  4. **Test**: extend `test/test-improvements.mjs` (or a small
     `test/test-security-map.mjs`) with a pinned chapter list and assert every
     `V<n> (topic)` pair in 06h against it — the hard counterpart to a soft prose
     rule, and the thing that was missing when this drifted.
- **Priority**: high (it is a correctness bug in an existing DoD, not a new
  feature). **Effort**: S. **Risk**: low — text plus a test; the only judgement
  call is which chapters apply to which deliverable type, which is recorded in
  the plan and reviewable.

---

## P37 — ASVS 5.0 already requires performance; make those requirements reachable

- **Evidence**: read from the official ASVS 5.0 chapter files
  ([OWASP/ASVS 5.0/en](https://github.com/OWASP/ASVS/tree/master/5.0/en)), with
  the requirement's own level:
  | Req | Level | What it requires (abridged, from the standard) |
  |---|---|---|
  | **15.1.3** | **L2** | documentation identifies functionality that is *time-consuming or resource-demanding*, how to prevent loss of availability from overusing it, and **how to avoid building a response that takes longer than the consumer's timeout**; named defences: asynchronous processing, queues, limiting parallel processes per user and per application |
  | **15.2.2** | **L2** | those defences are **implemented**, not just documented |
  | **5.2.1** | **L1** | accept only files of a size the application can process **without a loss of performance or a denial of service** |
  | **4.3.1** | **L2** | query allowlist / depth limiting / amount limiting / cost analysis against expensive nested queries (GraphQL or data-layer DoS) |
  | **2.4.1** | **L2** | anti-automation against excessive calls that cause quota exhaustion, DoS, or **overuse of costly resources** |
  | **13.1.2** | L3 | documented **maximum concurrent connections per service (connection-pool limits)** and the behaviour when the limit is reached, including fallback/recovery, to prevent DoS |
  | **13.1.3** | L3 | documented **resource-management strategy for every external system** (databases, file handles, threads, HTTP connections): release, **timeouts**, failure handling, retry limits/delays/back-off; short timeouts and disabled-or-strictly-limited retries on synchronous HTTP "to prevent cascading delays and resource exhaustion" |
  | **13.2.6** | L3 | the code actually follows that documented per-connection configuration (max parallel connections, behaviour at max, connection timeouts, retry strategy) |
  | **16.5.2** | L2 | keeps operating securely when external resource access fails (circuit breakers, graceful degradation) |
  | **15.4.4** | L3 | resource-allocation policies prevent **thread starvation** (thread pools, fair progress) |
  | **1.4.3** | L2 | dynamically allocated memory and resources are released |
  ASF's default level for internet-facing work is **L2** (06h §2), so 15.1.3,
  15.2.2, 5.2.1, 4.3.1, 2.4.1, 16.5.2 and 1.4.3 are **already inside the DoD ASF
  claims to meet** — and P36 was hiding them behind the wrong chapter numbers.
- **Gap**: nothing in ASF identifies resource-demanding functionality, states a
  per-user/per-application concurrency limit, or checks a pool limit, timeout or
  retry/back-off policy — because no phase asks and the chapter table never
  pointed at them. The security DoD is therefore being signed against
  requirements nobody examined, which is precisely the 06i failure mode applied
  to security instead of code.
- **Proposed change** (this is the T1 anchor the performance batch has been
  missing — it lets P28/P29/P30 cite a standard ASF already claims, instead of
  motivation from blogs and vendor docs):
  1. `06h-security.md`: name these requirement ids in the DoD section, and make
     the **abuse-case load run** (already in the DoD as a phrase) the evidence
     for 15.2.2 / 5.2.1 / 4.3.1 / 2.4.1 — one run, two gates (P29 §8, P30
     `load`).
  2. `06k-performance.md` (P29) §Budget-and-scenario and §Perf↔DoS cite the same
     ids, so a performance scenario is traceable to a standard clause and a
     reviewer can check it (P33's citation rule).
  3. `06f-stability.md` cross-references **13.1.3 / 13.2.6 / 16.5.2** — timeouts,
     retry/back-off and circuit breaking are one list, not two; the
     `resourceCeiling` metric (P30 phase 3) reports the pool/timeout/retry
     settings it found, and `no-counter` when it cannot see them.
  4. `05-plan.md`: a P28 performance scenario for a store-facing or
     third-party-facing journey *names* the ASVS ids it satisfies, so plan review
     sees the security requirement and the performance requirement as one object.
  5. Tests: extend the perf/security test files so a fixture with an unbounded
     page-size parameter fails the abuse-case check, a fixture with no timeout on
     an outbound call is reported, and `scanned: 0` / `no-counter` never reads as
     a pass.
- **Priority**: high. **Effort**: M (mostly wiring the existing gates to named
  clauses; the new measurement is the abuse-case run). **Risk**: scope creep on
  small work ⇒ the L1/L2 selection rule already scopes it, and the scale rule
  keeps small work at the one-line DoD; double-gating the same measurement with
  security and performance ⇒ deliberate — one measurement, two obligations, and
  the report says which clause each number evidences.

---

# Enforcement batch (P38–P45) — user directive

**Origin.** P30 was deferred with a reason — *"I don't understand what you are
talking about"* — and the PO redirected to the question underneath it: *how are
ASF's rules enforced at all, and how can that be vastly improved on Pi Agent.*
Evidence base: [enforcement-blind-spots.md](enforcement-blind-spots.md)
(§2 ASF's own instruction volume measured; §3 IFScale + LIFBench; §4 the 19-item
DoD audit; §5 the Pi harness hook inventory + pi's own security doc; §6 VEPA,
AI Agent Code of Conduct, Task Shield, CaMeL, AgentDojo).

**The single finding that justifies the batch:** of the 19 Definition-of-Done
items, **4 are hard, 3 are mechanical-but-agent-invoked, and 15 are
self-attested** — enforced by printing `- [ ]` and asking the graded party not to
tick a box it did not earn. `pi-aia-asf/index.ts` registers **zero `pi.on()`
handlers**, while the harness offers `tool_call` (can block execution),
`agent_before_settle` (can refuse to settle and demand one bounded continuation)
and `user_bash` (a handler failure blocks the command). The gap is not
capability; ASF has never connected its rules to the levers that exist.

**The scale rule still applies.** No item here adds ceremony to small work.
Several items *reduce* dishonesty at zero cost (P38 is a label; P45 is a budget).
Nothing here goes into `pi-vigilant` (06j §7 boundary; the guard stays general).

---

## P38 — Enforcement ledger: classify every rule H/M/S and publish it

- **Evidence**: the audit in §4 of the research doc — 4 hard / 3 mechanical /
  15 self-attested across the 19 DoD items, produced in an afternoon with grep
  and a read of `index.ts`. VEPA's framing: guardrail decisions should be
  *"inspectable, reproducible, and deterministic"*; a rule whose enforcement
  class is unknown is none of those. ASF's own 06i principle — say what is real
  and say what is not — has never been applied to ASF's rules themselves.
- **Gap**: `06b Rule 10` presents 19 items in one undifferentiated checklist, so
  *"no secrets in the repo"* (never checked by anything) reads exactly like
  *"every MUST spec met with evidence"* (hard-blocked by vigilant). A reviewer
  cannot tell which boxes carry weight, and neither can the agent.
- **Proposed change**: tag every rule and DoD item with an enforcement class —
  **H** (hard: the agent cannot declare done without satisfying it, with a named
  enforcement site), **M** (mechanical verdict produced by a real command, but
  agent-invoked and ignorable), **S** (self-attested: prose expectation only) —
  and render the class in the checklist and in the `/asf verify` output
  (`index.ts:392`). The delivery report states the split for the run: *"5 hard
  verified, 3 mechanical, 11 self-attested"*. **No rule is upgraded or invented
  here** — this proposal only makes the current truth visible, which is what
  makes the rest of the batch prioritisable.
- **Priority**: high. **Effort**: S. **Risk**: fatalism ("so most of it is
  theatre") ⇒ mitigated by pairing it with P40–P42, which move items up; label
  drift (an `S` quietly rendered as `H`) ⇒ P44's negative control fails the
  build when a rule claims `H` without a named enforcement site.

---

## P39 — Obligations declaration file (revised: vigilant carries the container)

> **Revised by PO decision (A), 2026-10-15.** The PO asked whether `pi-vigilant`
> could carry this while staying general and still working without ASF. It can,
> and the safe line is **general container vs consumer-specific content**: the
> earlier boundary revert forbade vigilant holding *consumer knowledge*, not
> vigilant gaining *capability*. Litmus test for anything added: *could a project
> that has never heard of ASF write this declaration?* The vigilant half is
> **P48**; this proposal shrinks to authoring ASF's declaration file. Full
> reasoning in [review-decisions.md](review-decisions.md).

- **Evidence**: the Code of Conduct paper's own pipeline number — extracting a
  policy tree out of prose by LLM gives detection recall of **53.3% (o1)**, 17.8%,
  8.9%, **4.4%** (Claude 3.5) ([arXiv:2509.23994](https://arxiv.org/html/2509.23994v1),
  read): when a model reads rules out of a document, most are missed. And ASF has
  **no** machine-readable rule inventory today — the rule count is obtainable only
  by grepping headings, which is what the test suite itself does
  (`test-improvements.mjs:42` counts `^## Rule \d+ —`). Two things vigilant
  already provides make a bespoke ASF registry redundant: `lib/completeness.ts`
  is already a generic `{category, marker, re}` → findings signal engine carrying
  the anti-overclaim fields (`source`, `error?` — *"reported so the guard never
  overclaims"*), and `trace{outcome, codePath, testFile, assertion}` is already
  the shape P44 wants. Building either again ASF-side is duplicating a
  verification engine.
- **Gap**: rules exist only as prose, so no gate can enumerate them, no coverage
  claim is possible ("which rules have a check?"), P38's ledger has nowhere to
  live, and a rule can be deleted from a reference file with no test noticing.
- **Proposed change**: ASF ships an **obligations declaration file** in the
  format P48 defines — one entry per rule: `id`, `requirement`, `area`,
  `priority`, `trigger` (from vigilant's general vocabulary: `always`,
  `area:<x>`, `path-glob:<g>`, `tool:<name>`, `when-spec-matches:<regex>`),
  `class` (H/M/S from P38), `signal` (the objective check, or `none`),
  `recurring: true`, and `trace` in **vigilant's shape** — no novel `tests`
  field, so one vocabulary covers "this spec is tested by" and "this rule is
  enforced by". The reference prose stays the human artefact and is **checked
  against** the declaration in both directions (P44). `/asf rules` renders the
  declaration filtered by class/trigger, so "what enforces anything around
  browser testing?" has an answer.
- **Boundary (hard)**: the declaration records *enforcement*, never *meaning* —
  meaning stays in the reference prose. And the declaration carries no
  vigilant-side special case: if ASF needs a new trigger kind, it is justified
  without naming ASF (P48).
- **Priority**: high. **Effort**: **S** (was M — the container is P48's, not
  ours). **Risk**: prose and declaration diverge ⇒ bidirectional assertion, red
  on either side; becoming a second source of truth ⇒ the enforcement-not-meaning
  rule above, asserted by test.

---

## P40 — `tool_call` gate: block the objectively blockable

- **Evidence**: `docs/extensions.md`: *"`tool_call` can mutate input or block
  execution"*; the documented permission example returns
  `{ block: true, reason }`; *"a `tool_call` handler failure blocks the tool as a
  fail-safe"*. `docs/security.md`: Pi *"does not ask for approval before every
  tool call"* and *"Project trust does not limit what tool calls can access or
  affect"* — so this is a choice ASF must make, not a default to enable.
  Positional support: Task Shield verifies *"whether each instruction and tool
  call contributes to user-specified goals"* **before** the action (ACL 2025,
  ASR 2.07% / utility 69.79%); CaMeL enforces *"security policies when tools are
  called"* (77% with provable security vs 84% undefended). ASF has never used
  this hook.
- **Gap**: rules that are trivially objective at the moment of the action are
  enforced, if at all, minutes later by an agent's own reflection. Examples
  sitting unguarded right now: writing a secret into a tracked file; a test run
  invoked with a subset flag when the impact area is not stated (Rule 19's
  "default is full" is prose); a `git push` before the full suite has been run
  in that session (Rule 10's "the gate never moves" is prose); `--force` on a
  branch with uncommitted work.
- **Proposed change**: a `tool_call` handler in `pi-aia-asf/index.ts` that blocks
  **only** rules with a deterministic signal, each individually switchable in
  `.asf-code-health.json`-style config, each with a named reason and a
  documented bypass (`asf-approve` already exists for exactly this). Phase 1
  candidates, chosen because the predicate is decidable from the tool input plus
  session state and never from a judgement call: (a) secret-shaped string written
  to a tracked path; (b) test-subset invocation without the impact statement P25
  requires; (c) push/publish while the session has no recorded full-suite green;
  (d) destructive git while the tree is dirty. **Every blocker ships a near-miss
  fixture that must pass** (P44) — the near-miss is what stops a gate eating
  correct work.
  **Autonomy rule (PO condition, normative for every ASF gate).** ASF is an
  autonomous loop; a gate must not become a round-trip to a human. Verified
  against pi rather than assumed: `block: true, reason` returns the reason **to
  the model** (*"a tool execution failure becomes an error result for the
  model"*), so blocking is agent-facing feedback — while pi's own
  `examples/extensions/permission-gate.ts` does the forbidden thing,
  `await ctx.ui.select("Allow?", ["Yes","No"])`, and blocks outright when
  `!ctx.hasUI`. Therefore: **no ASF gate may call `ctx.ui.select/confirm/input/
  editor` to seek approval**; `examples/extensions/protected-paths.ts` (notify +
  block with reason) is the pattern. The load-bearing corollary: **every blocker
  must have an autonomous exit the agent can take itself** — remove the secret,
  state the impact area, run the full suite, commit or stash. **A blocker whose
  only exit is a human decision is misdesigned and must be a finding, not a
  block.** All four above have real autonomous exits. `asf-approve` remains the
  exception path, is not the designed path, and each use is recorded as gate
  friction (P45). Blocker (a) deliberately has **no self-service bypass**: the
  autonomous exit (do not write the secret) costs nothing and weakens nothing.
- **Priority**: high. **Effort**: M. **Risk**: false blocks ⇒ P45's budget
  demotes the gate automatically; latency per call ⇒ handlers must be pure
  predicates on the input, no I/O beyond a cached config read; the fail-safe
  semantics mean a crashing handler blocks tools, so each handler is wrapped and
  a crash **degrades to allow with a reported finding** for non-safety rules
  (and to block for the secret rule — stated per rule, never accidental).

---

## P40a — (folded into P48/P41) obligations make most of the settle gate unnecessary

> Kept as a stub so the numbering in this file stays stable for the review
> record. With PO decision (A), the verifiable DoD obligations are declared
> (P39) and verified by vigilant's existing evidence gate (P48); P41 shrinks to
> what a spec cannot express. See P41's revised scope.

---

## P41 — Completion gate at `agent_before_settle`: no "done" without evidence

- **Evidence**: `docs/extensions.md`: *"`agent_before_settle` is the final
  actionable boundary: it can append entries and request one continuation"*,
  while `agent_settled` is *"final and notification-only"*. §4's terminal-act
  finding: the moment the agent writes "done" is a message the agent writes
  about itself, and nothing inspects the DoD before it is sent. VEPA: decisions
  must come *"before potentially irreversible agent actions are executed"*.
  P27 is the existence proof that ASF can build one of these and have it hold
  (73 assertions, a real incident as fixture).
- **Gap**: the DoD is a checklist the agent prints and ticks. Fifteen of nineteen
  items have no check at all, and the four hard ones are enforced by vigilant on
  *specs* — not on the DoD. So "the suite was not actually run in full" and "the
  suite was run and is green" produce identical transcripts.
- **Proposed change** *(re-scoped per PO decision (A) — the verifiable DoD
  obligations are declared (P39) and verified by vigilant's existing evidence
  gate (P48), so this proposal keeps only what a spec cannot express)*:
  an ASF-side `agent_before_settle` handler that verifies the **session facts**
  and, when it fails, refuses settlement by requesting **exactly one bounded
  continuation** naming what is missing — reusing vigilant's continuation
  discipline (bounded count, epoch/run-id guard, no unconditional
  `continue: true`), because `pi-vigilant/index.ts` documents a real
  `agent_settled` deadlock caused by waiting for the resumed run inside the
  handler. **In scope (session facts, not expressible as a spec):** `/asf health`
  executed this session with its verdict recorded; full-suite run recorded in
  this session (not claimed); browser verification actually performed, or a
  structured `n/a` with a reason; `/asf` delivery-report fields present;
  `scanned: 0` never read as pass. **Out of scope — handled by P39/P48:** every
  MUST obligation terminal with evidence, per-obligation evidence, and the
  recurring re-open, all of which vigilant already does with a gate that is
  already hardened. **Also out of scope (stays `S`, honestly labelled):**
  "observable end state", "consumed by a surface", quality of evidence. Small
  work: the gate checks the reduced small-work set only — the scale rule is not
  a loophole here, it is the trigger.
- **Priority**: **critical** — this is the load-bearing item; P38/P40/P42/P43
  are useful without it, and none of them closes the terminal act.
  **Effort**: M. **Risk**: loops ⇒ single bounded continuation, hard cap, cap
  asserted in test; nagging on legitimate `n/a` ⇒ every exemption is a structured
  field with a reason, not an argument; deadlock ⇒ never await a resumed run
  inside the handler (the documented trap), and the handler is registered on
  `agent_before_settle`, not `agent_settled`.

---

## P42 — Evidence ledger: claims become artefacts (`pi.appendEntry()`)

- **Evidence**: `docs/extensions.md` state table — *"Durable data excluded from
  model context → `pi.appendEntry()`"*; tool state that follows the branch →
  tool-result `details`. CaMeL's lesson is that the trustworthy part of the
  system is the system layer, not the model's account of itself. §4: today,
  "I ran the full suite" and "I did not run the full suite" are two sentences
  with no observable difference.
- **Gap**: evidence lives inside the assistant's prose, so it cannot be audited,
  cannot be diffed across runs, and cannot be required. P41 has nothing to check
  against until something records what actually ran.
- **Proposed change**: append a durable entry for each verifiable act — full
  suite run (command, exit code, test count, duration), `/asf health` invocation
  (level, verdict, `scanned` count), browser verification (page, action,
  assertion), clean-room install, spec transitions. P41 gates on the **presence
  and shape** of those entries, not on the model's description of them. Entries
  are excluded from model context, so this costs no prompt budget — which matters
  given §3. Absent entry ⇒ the claim is not satisfied, and the honest path is
  the structured `n/a` with a reason, which is itself recorded.
- **Priority**: high. **Effort**: M. **Risk**: ledger bloat ⇒ append on
  completion of an act, never per attempt; entries are small fixed shapes;
  tampering ⇒ the ledger is written by the extension, not by a model-callable
  tool, so the agent cannot append a convenient entry (if it becomes
  model-callable it must be `exposure: "hidden"` from the model).

---

## P43 — Gate authority by evidence, with revocation

- **Evidence**: VEPA's authority layer — a verified rule *"affects deployment
  only after accumulating sufficient supporting evidence"*, with authority
  *"revoked when later feedback contradicts it"*; and its diagnosis of the
  alternative (neural guardrails that *"regress on risks they previously handled
  correctly"*). ASF's own version of the same failure: `gate.mode: warn` exists
  and is the escape hatch people reach for when a gate cries wolf — the
  literature's exact failure mode, already present in ASF's config surface.
- **Gap**: gate authority today is a boolean someone sets by hand. A gate that
  false-fires repeatedly stays blocking until someone disables it entirely, and
  a gate that has never fired stays trusted forever. Nothing measures either.
- **Proposed change**: each gate records its own verdicts (P42) and carries an
  **authority state** — `probation` (warn only, findings reported), `active`
  (blocking), `demoted` (back to warn after exceeding a false-positive budget,
  with the evidence that caused it named). Promotion needs a stated number of
  clean runs plus at least one caught case from a fixture; demotion is automatic
  on budget breach. Every transition is reported, never silent — a gate changing
  its own power is exactly the kind of change P22 says must be visible.
- **Priority**: medium (depends on P40–P42 producing verdict history).
  **Effort**: M. **Risk**: gaming (an agent that never trips a gate looks clean)
  ⇒ promotion requires a *caught* fixture case, not merely absence of findings;
  drift of the state file ⇒ transitions are append-only entries and the state is
  derived, not hand-edited.

---

## P44 — Gate regression harness: every gate ships with a negative control

- **Evidence**: ASF's own best precedent — `test-model-gate.mjs` (73 assertions)
  with the production cascade as a fixture, a negative control per rule, and a
  documented-gap assertion for the case the scan cannot see. And the standing
  lesson from P30's prototype: a gate is only believable when you have measured
  its false-fire rate (0/40 quiet) *and* its power (40/40 at +10%).
- **Gap**: ASF's existing tests largely assert that **the documents contain
  strings** — `test-improvements.mjs:88` checks that the phrase
  `"Security line (06h)"` appears; `chk('threat registry', adv.includes('**threat'))`.
  Those tests keep the prose in place; they cannot tell you whether any rule is
  enforced. A gate that silently stops checking anything would pass today —
  `scanned: 0` read as a pass is the same bug in another costume.
- **Proposed change**: a rule in `06g`/`06b` that **no gate ships without two
  fixtures**: one that must make it fire, one near-miss that must make it pass.
  A shared harness (`test/gate-harness.mjs`) so the pattern is one call per
  gate, and an assertion that every `H`-class rule in the P39 registry names a
  test file *and* an assertion string (mirroring what `capture_spec`'s `trace`
  already demands of specs). Plus a meta-assertion: the count of gates with a
  negative control equals the count of gates.
- **Priority**: high. **Effort**: M. **Risk**: tests asserting the harness
  rather than behaviour ⇒ the near-miss fixture is the test, and a gate whose
  near-miss starts failing is a bug in the gate, not a test to update.

---

## P45 — Enforcement budget: a gate that blocks correct work gets demoted

- **Evidence**: CaMeL's price — **77% of tasks solved with provable security vs
  84% undefended** on AgentDojo (abstract read): enforcement is bought with
  utility, and a serious proposal says how much it is spending. §3's rising
  variance: an inconsistent gate is worse than an absent one, because it trains
  people to route around gates. ASF's `gate.mode: warn` is that learned
  behaviour already in the wild.
- **Gap**: nothing measures what ASF's gates cost. A rule that blocks legitimate
  work has no mechanism to be noticed, so it survives until someone disables the
  whole level — losing the real coverage along with the nuisance.
- **Proposed change**: each gate carries a **utility budget** — blocks-per-run
  and false-block reports from `asf-approve` bypasses are the signal. Exceeding
  it demotes the gate to warn (P43) and files a proposal automatically, which is
  P21's escaped-defect loop pointed at gates instead of code: *"which gate
  blocked correct work, and what changes so it does not again?"* The delivery
  report states gate friction alongside gate verdicts, so the PO can see what
  the enforcement layer is charging.
- **Priority**: medium. **Effort**: S. **Risk**: over-eager demotion of a
  correct-but-annoying gate ⇒ demotion needs a *confirmed* false block (a
  near-miss fixture that the gate failed), not merely a bypass request;
  bypasses without reason are recorded as findings, not as evidence the gate is
  wrong.

---

## P46 — Sane defaults: configuration is opt-in, never a precondition

- **Evidence**: the PO's condition on P32 — *"we want sane ratios, not something
  users HAVE to configure themselves (even if the option should exist)."* This is
  not a preference, it is the difference between a gate and a questionnaire.
  ASF already learned it: 06e ships *"on by default with conservative
  thresholds"*, and the Code Health Gate is the one part of ASF that reliably
  fires. Where ASF has shipped a knob without a default, the knob is the
  behaviour — `.asf-release.json` is inert until someone writes it, and
  `gate.mode: warn` shows what people reach for when a gate is set by hand.
  The performance batch is the worst case for this: P32's triggers are phrased
  as "below the **configured** ratio", "beyond **configured** limits", P30's
  metrics take ceilings and row thresholds, P34 needs a CI-cheap/scheduled split.
  If every one of those needs a human to pick a number first, the batch ships a
  form, not a factory.
- **Gap**: the proposals in this batch name thresholds as configuration and never
  state what happens when nobody configures them. Silence here defaults to "no
  finding is ever High", which is the same outcome as not writing the rule — with
  better documentation.
- **Proposed change**: a **defaults policy**, normative in 06k and 06e:
  1. every numeric threshold, ratio, ceiling, sample count and budget in ASF has
     a **working default shipped in code**, and the default is what runs;
  2. a gate must produce a verdict with **zero** project configuration — the
     first run of a project ASF has never seen is gated;
  3. configuration narrows or relaxes, it never *enables* the obligation to have
     an opinion;
  4. every default is **named and sourced** — a number in code carries a comment
     pointing at the fetched source or the local measurement that justifies it
     (P33's tiers apply to ASF's own constants, not only to plan text);
  5. where no defensible default exists, the honest output is
     `no-default: needs a declared target`, surfaced as a finding — **never** a
     silent pass and never a hard failure that punishes an unconfigured project;
  6. the effective value is always printed next to the verdict
     (`p95 1.8s vs default ceiling 2.0s (source: AWS load-test guidance)`), so a
     default can be argued with rather than guessed at.
  Candidate defaults to seed the batch (each to be justified or replaced at
  implementation, none load-bearing before that): scalability linearity ≥ 0.7 of
  linear across 1×/2×/4× steps; sample count 30 with 10 warmups (measured
  adequate in `prototype-perf-gate/`); significance p < 0.01 with HL ratio > 1.05
  (measured: 0/40 false fires, 40/40 detection at +10%); busy-machine refusal at
  load average > core count; full-scan row threshold 1 000; false-positive budget
  ≤ 5% (Laaber's guidance); sustained-run ceiling and CI-cheap budget per P34.
- **Priority**: high — P32/P30/P34 are not shippable without it. **Effort**: S.
  **Risk**: a wrong default is a wrong verdict at scale ⇒ every default is
  sourced, printed with the verdict, and overridable per project (P47);
  unjustifiable defaults ⇒ rule 5 forces the honest `no-default` report instead
  of inventing a number, which is 06i applied to constants.

### Amendment on approval — the three-tier model (PO, 2026-10-15)

> *"give decent budgets and sensible defaults, adjusted to the project"*, then
> refined: *"have GENERAL well-researched defaults, and allow project specific
> adaptation in a range around that."* So a value is not one number with an
> override; it is **three tiers**, and the band is what keeps calibration from
> becoming an escape hatch.

1. **General default** — researched, shipped in code, sourced per P33. This is
   the anchor and it is what runs on a project ASF has never seen.
2. **Adaptation band** — a documented `floor..ceiling` around the default. The
   band is part of the researched artefact, not a runtime invention.
3. **Project calibration** — derived from measured project characteristics, and
   it **may only move the value inside the band**. Anything outside requires
   explicit user configuration through `/asf config` (P47), shown with
   `origin=override`.

| parameter | general default (tier) | band | calibrated from |
|---|---|---|---|
| perf tier budget (P34) | 60 s (T2 measured: probes in ms, 30-sample trial in seconds) | 30–300 s | observed full-suite runtime (~25% of it, clamped) |
| sample count (P30/P31) | 30 (T2 measured adequate) | 20–60 | observed CV of repeated runs |
| warmups | 10 (T1 `node:bench` convention) | 5–20 | variance, upward only |
| HL effect threshold | 1.05 (T2 measured: 0/40 false fires) | 1.02–1.10 | measured noise floor |
| busy-machine refusal | load avg > core count (T2 measured: detection fell 40/40→13/25 under contention) | 0.75–1.0 × cores | core count (measured, not adaptive) |
| full-scan row threshold | 1 000 (T3, to be justified or replaced) | 100–10 000 | table row counts |
| scalability linearity | ≥ 0.7 (T1 AWS sub-linear guidance) | 0.5–0.9 | declared load steps |
| false-positive budget | ≤ 5% (T1 Laaber et al.) | 1–10% | gate criticality |
| gate blocks-per-run (P45) | per-gate, from fixture | ×0.5–×2 | run length, gate count |

**Non-adaptive, declared as such** — flexing these invalidates the measurement
rather than tuning it, so they have no band and no override path: the
**significance level** (p < 0.01), the **minimum warmups**, interleaving of test
and control, retention of raw samples, and **`scanned: 0` is never a pass**.
A project may not calibrate its way out of a valid comparison; it may only make
the comparison more patient.

**Calibration is itself auditable**: cached with its inputs and date, printed by
`/asf config --explain <key>` (P47) as the derivation rather than the number —
*"perf budget 210 s: general default 60 s, band 30–300 s, calibrated to 25% of
your 14-minute suite"* — and re-derived when a measured input changes materially.
A default that cannot explain itself is a guess with better formatting (P33).

---

## P47 — `/asf config`: one configuration screen for every ASF parameter

- **Evidence**: the PO's condition on P32 — *"the ASF extension should get a
  configuration screen for all these config parameters."* Today ASF's
  configuration is **four hand-edited JSON files** with no discoverability and no
  validation: `.asf-code-health.json` (gate mode/scope, per-level thresholds,
  `model.extraCascadePatterns`), `.asf-release.json` (P23's `when`/`how`),
  `.asf-approve` state, and the waivers scattered as `asf-perf-accept:` /
  `asf-model:` comments in source. A reviewer cannot see what is configured;
  an agent cannot ask about it; a typo is discovered by the gate silently not
  running. Pi ships exactly the right primitive and ASF has not used it:
  **`SettingsList`** (`@earendil-works/pi-tui`, verified in
  `dist/components/settings-list.d.ts`) takes `SettingItem[]` with
  `id`/`label`/`description`/`currentValue`, cycles through `values`, opens
  `submenu`s, supports search and mouse, and reports `onChange(id, newValue)` —
  and `docs/tui.md` names it as the built-in for "settings flows", with
  `preset.ts`/`tools.ts` as worked examples. `ctx.ui.custom()` gives it a screen;
  `ctx.ui.select/confirm/input/editor` cover the rest.
- **Gap**: config is invisible and unvalidatable. P38's ledger is only useful if
  a reviewer can see which gates are on, in what mode, at what threshold — and
  right now the answer requires reading JSON in a project they may never have
  opened.
- **Proposed change**: `/asf config`, a `SettingsList` screen over the union of
  ASF's configuration, grouped by area (Code Health levels and thresholds ·
  performance metrics and ceilings · model scanner · release policy · gates and
  budgets). Requirements:
  1. **every value shows its origin** — `default` / `project` / `override`, with
     the source note from P46 beside it;
  2. **every change is validated on entry** (type, range, enum) and rejected with
     a reason, not at the next gate run;
  3. **writes are explicit** — the screen edits a draft; nothing persists until
     the user confirms, and the diff is shown first (`gate.mode: warn` should be
     hard to set accidentally and easy to see);
  4. **read-only for the agent by default** — the screen is a *user* surface; if
     an agent may drive it, that is a `ctx.hasUI`-gated, confirm-each-write path,
     never a silent config change (P22: ASF's own rules and gates are not
     self-modified mid-run);
  5. **no-UI modes** (JSON/print/RPC) get `/asf config --get` / `--set k=v` with
     the same validation, so the screen is a convenience, not the only door;
  6. **`/asf config --explain <key>`** prints what the parameter does, its
     default, its source and which gate consumes it — turning the config surface
     into documentation rather than folklore.
- **Priority**: high (it is how P46's defaults stay arguable and P43's authority
  stays visible). **Effort**: M. **Risk**: config sprawl — a screen makes knobs
  cheap to add, and unused knobs are drift surface (the reason P25 deleted
  `.asf-test.json`) ⇒ every parameter in the screen must exist in the P39 registry
  and be consumed by a named gate, or it is removed; agent-writes-to-config as a
  bypass route ⇒ rule 4's confirm-each-write and P43's append-only authority
  history.

---

## P48 — Obligation declarations in `pi-vigilant` (cross-repo) — PO decision (A)

**Lands in [`pi-vigilant`](https://github.com/betamaxx/pi-vigilant), not here.**
Recorded in this file because ASF is the driver and the two halves must be
reviewed as one change. Approved by the PO on 2026-10-15 as option **A**.

- **Evidence**: the PO's question — *"Can vigilant be changed in order to remain
  general purpose but ALSO fulfil this functionality (and keep working as well
  without asf)?"* — and three things vigilant already has, which makes this a
  connection rather than a construction: `loadConfig()` already reads external
  config (`index.ts:208`, `pi-vigilant.json`); `lib/completeness.ts` is already a
  generic signal engine — `{category, marker, re}` patterns → `CompletenessFinding[]`
  — carrying the anti-overclaim fields `source: "git-baseline+worktree" |
  "git-worktree" | "mtime" | "none"` and `error?`, documented as *"reported so the
  guard never overclaims"* and *"the guard must say so, not pass silently"*; and
  `trace{outcome, codePath, testFile, assertion}` (`index.ts:550`) is already the
  shape P44 wants. ASF already uses vigilant as the enforcement bridge for one
  rule and it works — `SKILL.md:239`: *"Capture the obligations as MUST specs
  (`capture_spec`) so the loop guard verifies them at settle as it verifies any
  specification from any source — the guard checks completion, it does not know
  what a cascade is and must not have to."* P48 generalises that proven pattern
  from *agent-captured* specs to *declared* standing obligations.
- **Gap**: vigilant verifies **per-task, user-captured** specs only. It has no
  concept of a standing obligation — nothing that is declared before any task,
  applies to every run, and re-opens rather than staying `met`. So ASF's
  methodology-wide rules have nowhere to be verified, and the alternative is a
  second verification engine inside ASF (two evidence gates, two trace
  vocabularies, two ledgers).
- **Proposed change** in `pi-vigilant`:
  1. **Declarations**: load `obligations.d/*.json` beside `pi-vigilant.json`,
     plus an optional per-project `.vigilant/obligations.json`. Each file names
     an opaque `source` string — vigilant never interprets it.
  2. **Shape**: `{ id, requirement, area, priority, trigger, class, signal,
     recurring, trace }`, where `trace` is **the existing `Trace` interface**,
     reused unchanged.
  3. **General trigger vocabulary, closed set**: `always`, `area:<x>`,
     `path-glob:<g>`, `tool:<name>`, `when-spec-matches:<regex>`. Paths, tools,
     areas and spec text are general concepts; the set is enumerated in code, so
     a consumer cannot smuggle in a private predicate.
  4. **`recurring: true`** re-injects the obligation each run with **per-task
     evidence** — without it, the first honest run would satisfy "every bug fix
     has a regression test" forever.
  5. **`class`** (H/M/S) renders in the spec tree: `S` items render as
     expectations, never blockers — P38's ledger visible where the reviewer
     already looks, not in a parallel ledger.
  6. **Signals reuse the completeness engine** rather than a new one, inheriting
     `source`/`error` so an unavailable check reports itself and never passes.
- **Boundary (hard, and it is the whole point)**: vigilant holds **declarations,
  never content**. Zero declarations ⇒ **today's exact behaviour** — betamaxx and
  clear_story see nothing new, and the suite stays green with `pi-aia-asf`
  uninstalled. Guards, one per side: a **vigilant-side test** asserting the repo
  contains no consumer vocabulary (the grep that caught the 06j violation), and an
  **ASF-side test** asserting every ASF obligation is declared rather than
  hard-coded.
- **The rule that keeps it general**: *a new trigger or signal kind must be
  justified without naming the consumer that needed it.* Format accretion is how
  a general container quietly becomes one product's methodology in JSON instead
  of prose; this rule is the only durable defence, so it belongs in vigilant's
  contributing notes, not in a comment.
- **Priority**: high — P39 and the reduced P41 both depend on it. **Effort**: M.
  **Risk**: scope growth on a tool whose value *is* its generality ⇒ closed
  trigger set, inert-without-declarations, per-side tests; consumer leakage
  through the format ⇒ the justification rule plus the grep test; recurring
  obligations becoming noise ⇒ `S` renders as expectation, and P45's budget
  applies to obligation friction as it does to gate friction.
- **Test plan**: declaration with an unknown trigger kind ⇒ rejected with a
  named reason, never ignored; zero declarations ⇒ byte-identical behaviour to
  today (fixture asserting the spec tree is unchanged); `recurring` obligation
  re-opens on a second task with fresh evidence required; `signal` whose tool is
  missing reports `no-counter`/`tool-missing` and never passes; a synthetic
  **non-ASF** declaration file is the primary fixture, so the mechanism is proven
  general by its own test rather than by assertion.
