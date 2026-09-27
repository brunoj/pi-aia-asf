# Research Notes 2 — Testing & QA: what the standards require

Sources read: ISO/IEC/IEEE 29119 series (Parts 1–5, via ISO/IEEE catalogue pages and
the standard's own summaries), ISO 29119-1/-2 statements on risk-based testing,
mutation testing (Stryker docs, PITest, academic adequacy material), test
pyramid/diamond literature, flaky-test taxonomy material, characterization
(Golden Master) testing (Feathers), consumer-driven contract testing (Pact).

---

## T1. ISO/IEC/IEEE 29119 — the testing standard, and what it is *built on*

Five parts: **-1 Concepts & definitions**, **-2 Test processes** (organizational,
test-management, and dynamic test levels), **-3 Test documentation** (Test Policy,
Organizational Test Strategy, Test Plan incl. Test Strategy, Test Status, Test
Completion, Test Design Specification, Test Case Specification, Test Procedure
Specification, Test Data Requirements/Readiness, Test Environment
Requirements/Readiness, Actual Results, Test Result, Test Execution Log, Test
Incident Report), **-4 Test techniques** (with *coverage measures* per technique),
**-5 Keyword-driven testing**.

Two load-bearing facts for the ASF:

1. **The whole series is explicitly risk-based.** ISO 29119-1/-2: *"Test plans and
   test strategies are described in the context of risk-based testing, which is the
   recommended approach to strategizing and managing testing that underlies the
   ISO/IEC/IEEE 29119 series and provides the basis for test prioritization and
   focus."* Testing effort is supposed to be *derived from risk*, not from "write a
   test per feature".
2. **Test design techniques are standardized and named**, in three families:
   - *Specification-based (black-box)*: equivalence partitioning, boundary-value
     analysis, decision table testing, state transition testing, cause-effect
     graphing, classification tree, combinatorial/all-pairs, syntax testing,
     scenario testing, random testing.
   - *Structure-based (white-box)*: branch testing, decision testing, branch
     condition, branch condition combination, **MC/DC**, data-flow testing.
   - *Experience-based*: error guessing, exploratory testing.
   Part 4 pairs each technique with a **coverage measure** (coverage as *technique
   adequacy*, not as a vanity percentage).

Also relevant historically: 29119 was built on IEEE 829 (test documentation), IEEE
1008 (unit testing), BS 7925-1/-2. And there is a documented professional backlash
against it ("heavy focus on documentation detracts from actual testing", "confusion
of means and ends") — a useful warning when adding *any* test-artifact requirement
to the ASF: artifacts must serve the test, not the auditor.

**ASF status**: 06b is a set of *proof rules* (what must be demonstrated) plus
regression rules. It names **no test design technique at all**. "Edge cases" in
Phase 4 is a prose list ("empty input, zero data, max load, missing fields,
concurrent access, duplicate input, unicode, huge payloads") which is effectively an
ad-hoc subset of equivalence partitioning + boundary value analysis, with no
vocabulary and no adequacy measure. There is **no risk-based derivation** of what to
test — the ASF tests what the specs cover, which is right for spec-driven work but
silent on *risk* (probability × impact) as the prioritizer, and silent on the
highest-risk code that no spec mentions.

## T2. Mutation testing — the only standard measure of *assertion* quality

- Coverage measures **execution reach**; mutation score measures **assertion
  strength**. A test with no assertions gives 100 % coverage and kills nothing.
- Mutation score = killed / total mutants. Adequacy criterion used in research
  ("the most widely used adequacy score is mutation score").
- Empirically, **coverage and mutation score diverge sharply**: ~80 % branch coverage
  typically corresponds to a 40–60 % mutation score; published comparisons show
  modules at 88–100 % line coverage with 12–45 % mutation score ("coverage theater",
  and notably in *authentication* code).
- Tooling and gate mechanics are mature: Stryker (`thresholds: {high: 80, low: 60,
  break: N}` — **exit code 1 below `break`**, designed for CI), PITest
  (`mutationThreshold`, history/incremental), mutation *levels* (Basic → Standard →
  Advanced → Complete) to trade runtime for rigour, per-file globs, `ignore-mutations`
  / `ignore-methods` to skip irrelevant operators, `since`/baseline for incremental
  runs, per-mutant timeouts to survive infinite loops.
- Interpretation bands used in practice: 80–100 excellent, 60–80 good, 40–60
  adequate-with-gaps, <40 weak.
- **Equivalent mutants** exist and must be triaged, not chased.
- Adoption guidance that matters for an agent-run factory: **start on critical paths
  and high-churn code**, set the threshold **below the measured baseline** first
  (prevent regression), then ratchet; per-module thresholds (business logic high,
  infrastructure lower).
- Prioritizing survivors: business logic → security boundaries → data integrity →
  error handling; boundary mutations are the highest-value class.

**ASF status**: nothing. The ASF has *strong* rules that a test must prove an
operator-facing outcome (Rules 12–14), which is a *semantic* guard against vacuous
tests — but it is unverifiable by machine. Mutation score is the mechanical
counterpart: it is exactly "would this suite notice if the behaviour changed?",
which is the ASF's own question, made executable.

## T3. Suite shape: pyramid vs diamond, and what coverage is for

- **Pyramid** (many unit, some integration, few E2E) optimizes for fast feedback and
  cheap maintenance; unit tests are **coupled to implementation details** — a
  signature change breaks tests without any behaviour change.
- **Diamond** (few unit, many integration, some E2E) optimizes for *behaviour* over
  implementation: integration tests "test upon functionalities, not implementations",
  act as real-life documentation, and survive refactors; the door+lock parable —
  every unit passes, the assembled system does not work.
- Both are strategies for *composition*, and the honest conclusion is
  **context-dependent**: microservices shift toward integration/contract, monoliths
  tolerate more unit testing, legacy codebases need the diamond.
- **Coverage is a diagnostic, not a goal**: "a system with 100 % coverage still has
  bugs — you just haven't found them"; coverage can be trivially gamed
  (`ExcludeFromCodeCoverage`); use it to *find untested regions*, then cover them with
  the cheapest test that proves the behaviour.
- Unit tests remain the right tool for pure logic: parsing, calculations,
  transformations.

**ASF status**: Phase 6 mandates "test-first" and Rule 14 mandates an E2E through the
real entry point, but the ASF never states a **composition policy** — nothing tells
the agent *at which level a given proof belongs*, which is why agent-written suites
tend to be either all-E2E (slow, brittle) or all-unit (vacuous at the seams).

## T4. Determinism and flakiness — a named, fixable defect class

Canonical root causes: **timing/races** (sleep-instead-of-wait, un-awaited async),
**shared state / order dependence** (tests see each other's data), **uncontrolled
randomness**, **clock/timezone dependence**, **external systems** (network, real
APIs), **nondeterministic collection ordering**, **CI resource exhaustion**.

Standard fixes: each test owns its data (transaction rollback / in-memory store);
seeded RNG; **injected/controlled clock** instead of wall time; poll/event with
timeout instead of sleep; mock only what is outside the system boundary; run
repeatedly, in random order, in parallel to *detect* flakiness (e.g. 100 runs);
**fix flaky tests immediately — an ignored flaky test destroys the trust that makes
a green suite meaningful**.

**ASF status**: 06b Rule 8 covers state machines/deadlock; nothing in the ASF names
flakiness, non-determinism, clock injection, order dependence, or "a red build must
mean one thing". For an agent this is *more* dangerous than for a human: an agent
that hits a flaky failure tends to re-run until green and then report success —
which is precisely the "silent failure" class Rule 4/Rule 11 already forbids, but
the ASF gives no vocabulary or rule for it.

## T5. Characterization / Golden Master testing — the correct tool for refactors

Coined by Michael Feathers (*Working Effectively with Legacy Code*). It asserts that
output **matches what was observed before**, not that it is *correct* — a
"historical oracle", a **change detector**: traditional tests whitelist expected
values; characterization tests blacklist *any* change. It is the safety net for
refactoring code without adequate tests, and the sensible approach for complex
outputs (documents, XML, images) where per-attribute assertions are unmaintainable.
Requires repeatability (volatile values must be masked); does **not** imply
correctness; can be generated automatically by exercising existing code.

**ASF status**: 06c Rule 8 says refactors must be behavior-preserving and "run the
existing tests + a regression pass" — but for code with no tests the ASF has **no
mechanism** to establish the baseline. This is a concrete gap: an agent asked to
"refactor this module" has no mandated way to *capture* current behaviour first.

## T6. Contract testing — proving seams without a full integration environment

Consumer-driven contracts (Pact): the consumer records the expectations it has of a
provider; the provider is verified against those recorded contracts in its own CI.
Catches breaking interface changes early, without spinning up every dependent
service; complements (does not replace) integration tests; contracts become a
versioned artifact and drive API versioning decisions.

**ASF status**: the ASF tests *its own* seams (extension ↔ pi host) via harness mocks,
but has no notion of a **contract artifact** for a deliverable that exposes an API/CLI
consumed by something else — and Rule 14's "E2E through the real entry point" is the
only seam proof required.

## T7. Test independence & completion evidence (29119 process concepts worth stealing)

29119-2's process levels carry two ideas the ASF lacks outright:
- **Test independence** — the person who wrote the code is not the only person who
  verifies it; independence is a *property of the verification*, and 29119 discusses
  levels of it (developer-tested → independent tester → independent team).
- **Test Completion Report / exit criteria** — a delivery states what was executed,
  what passed, **what was not tested and why**, and the residual risk. The ASF's DoD
  checklist is binary (done/not done) and has no "not tested, and here is the risk"
  column — while M1-style honesty is exactly the ASF's own value.

## T8. Where the ASF is already *ahead* of the standards

Worth saying plainly, because proposals must not regress it:
- Rules 12–14 (operator-facing outcome, consumed-by-a-surface, E2E through the real
  entry point) target **dead wiring**, which no ISO part or pyramid discussion
  addresses at all.
- Rule 11 (test the shipped artifact, not the source tree) + clean-room verification
  is stronger than most industry practice.
- Rule 7 (triggers **and** non-triggers) is a formal completeness idea most suites
  skip.
- Rule 15 (bounded waits, kill + diagnose) is a discipline most suites don't have —
  and mutation testing needs exactly that property.
- Spec-driven traceability (M1) is a stronger requirements↔tests link than 29119's
  documentation templates require.

## T9. Candidate additions distilled from this pillar (to be proposed)

1. **Risk-based test derivation**: name risk (likelihood × impact) as the prioritizer
   for test effort on large work; require the highest-risk surfaces to have the
   strongest proof level.
2. **Test-design vocabulary**: a short reference naming the standard techniques
   (equivalence partitioning, boundary value analysis, decision table, state
   transition, all-pairs, branch/decision/MC-DC, error guessing) with "use X when Y".
3. **Proof-level policy** (pyramid/diamond resolution): decide per behaviour which
   level proves it, with a default bias to the seam (integration) level and unit
   tests reserved for pure logic.
4. **Determinism rules**: injected clock, seeded RNG, isolated data, poll-not-sleep,
   order-independent, "flaky = defect fixed immediately, never retried into green".
5. **Mutation-score fitness function** as an *optional, scoped* Code Health Gate
   module (Stryker/PITest via `npx --no-install`, baseline + `break` threshold,
   scoped to changed or critical modules) — the mechanical answer to "are the tests
   real?".
6. **Characterization baseline before refactors**: capture current behaviour first
   when no tests exist.
7. **Not-tested register** in the delivery report (exit criteria / test completion
   report idea): what was deliberately not verified and the residual risk.
8. **Contract artifact** for deliverables exposing a consumed interface.
