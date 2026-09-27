# Research Notes 4 — Software craft: standards for writing great, solid software

Sources read: Ousterhout *A Philosophy of Software Design* + Stanford CS190 modular
design lecture notes, Parnas *On the Criteria To Be Used in Decomposing Systems into
Modules*, Fowler/Beck code-smell catalog (Refactoring.Guru), Nygard *Release It!*
(2nd ed., via detailed summary), 12-Factor App methodology, Fowler on method size /
semantic distance, mutation-testing literature (cross-ref 30-testing-qa.md).

---

## C1. Complexity is the enemy; it has a definition and two causes (Ousterhout)

Complexity = "anything related to the structure of a software system that makes it
hard to understand and modify." It manifests as **change amplification** (a simple
change requires edits in many places), **cognitive load** (too much to hold in mind),
and **unknown unknowns** (obscurity). Causes: **dependencies** and **obscurity**.
Two countermeasures: **eliminate** complexity (make code obvious) and **encapsulate**
complexity (hide it behind a simple interface).

This is the *definitional* basis for the ASF's existing modularity rules — but the
ASF never states the definition, so its rules optimize proxies (line counts) instead
of the thing itself.

## C2. Deep modules, not small modules (the ASF's biggest craft-level tension)

- Module = interface + implementation. **Deep**: small interface, substantial
  implementation (Unix file I/O: 5 calls; garbage collector). **Shallow**: interface
  nearly as complex as implementation (`addNullValueForAttribute`).
- "**Many courses teach that classes should be small — that results in shallow
  classes.**" "**Classitis**": small classes taken to the extreme.
- "**Size doesn't really matter that much. Classes in the range of 200–2000 lines are
  fine. The most important thing is depth: the power of the abstraction.**"
- "It is more important for a module to have a simple interface than a simple
  implementation." **Pull complexity downwards** / **Martyr principle**: let a few
  module authors suffer so thousands of users don't; handle error conditions rather
  than throwing them upward; **minimize "voodoo constants"** — if you don't know the
  right default, the user won't either.
- **Information hiding (Parnas)**: decompose on *secrets/design decisions*, not on
  execution order. "The single most important idea in software design."
- **Information leakage** is the opposite: implementation details exposed through the
  interface, or via **back-door leakage** (implicit contracts: file formats, call
  order). **Temporal decomposition** is the most common cause — code structure mirrors
  the order of operations, so the same design decision gets duplicated across stages
  (train-dataset-creator / training / test-dataset-creator / evaluation is the
  canonical bad split).
- **New layer, new abstraction**: pass-through methods are a red flag; if a layer
  merely forwards, it is adding interface without hiding anything.
- **Generic classes are deeper**: design the interface to cover the general shape of
  current needs, not today's one call site.
- **TDD has no design feedback loop**: "it focuses on getting specific features
  working, rather than finding the best design"; 10 well-tested merges can still
  degrade the design. The unit of development should be **abstractions**, not
  features; design abstractions wholesale when the need appears.
- Fowler's counterpoint on method size: "To me length is not the issue. The key is
  the **semantic distance between the method name and the method body**." Long methods
  are OK when composed of relatively independent pieces.

**ASF status — this is a real defect, not a preference:**
- 06c Rule 1: *"a function/concern exceeds ~100 lines or 3 levels of nesting →
  extract"*; Rule 1 header: *"Small, well-readable modules"*.
- 06e defaults: `maxFileLines: 300`, `maxLinesPerFunction: 50`, `maxDepth: 4`.
- The authoritative literature says these are **proxies that can be optimized in the
  wrong direction**: an agent told "keep files under 300 lines" will split into
  shallow pass-through modules (classitis), *increasing* interface surface, coupling,
  and cognitive load while "passing" the gate. The ASF's own 06c Rule 2 (SSOT) and
  Rule 4 (testable standalone) are the real goals; line limits are at best smoke
  detectors.
- Also in tension: 06c Rule 3 ("No hardcoding; config drives behavior") has no
  counterweight; Ousterhout's "minimize voodoo constants" says *good defaults in the
  module* beat config knobs nobody can choose. Both are right — the rule needs the
  boundary drawn (config for real variation with sensible defaults; never config for
  values the module author should have decided).

## C3. Code smells — a named catalog the ASF can reference (Fowler/Beck)

Groups (Refactoring.Guru catalog):
- **Bloaters**: Long Method, Large Class, Primitive Obsession, Long Parameter List,
  Data Clumps.
- **OO Abusers**: Alternative Classes with Different Interfaces, Refused Bequest,
  Switch Statements, Temporary Field.
- **Change Preventers**: Divergent Change, Parallel Inheritance Hierarchies,
  Shotgun Surgery (a change touches many places — the *change-amplification* smell).
- **Dispensables**: Duplicated Code, Lazy Element, Speculative Generality, Dead Code,
  Comments (as smell when they explain *what* instead of *why*).
- **Couplers**: Feature Envy, Inappropriate Intimacy, Message Chains, Middle Man,
  Incomplete Library Class.

"Code smell = surface indication that usually corresponds to a deeper problem."
The catalog is the *diagnostic vocabulary*; 06c's rules are the *treatment*.

**ASF status**: 06c covers duplication (Rule 2), god-files (Rule 1), hardcoding
(Rule 3) — i.e. a subset of Bloaters/Change Preventers/Dispensables. No mention of
Feature Envy, Shotgun Surgery, Primitive Obsession, Speculative Generality, Dead
Code (06b Rule 13 covers dead *wiring* at the product level, not dead code at the
module level), Middle Man (the pass-through smell), or "Comments as smell".

## C4. Stability patterns (Nygard, *Release It!*) — the built system must survive

Stability **antipatterns**: integration points (every external call is a potential
failure; a response is not trustworthy just because the connection succeeded);
**blocked threads** (one slow call exhausts the pool → frozen system);
**cascading failures** (local problem spreads through queues/connections/shared
pools); **unbounded result sets** (a query returning a million rows → OOM, GC
pauses, collateral damage).

Stability **patterns**:
- **Timeouts**: connection, read, and *total operation* timeouts — first line of
  defense; every external call must finish within a predictable time.
- **Circuit breaker**: Closed → Open (fail fast via fallback) → Half-Open (trial
  calls); stops amplifying a degraded dependency.
- **Bulkheads**: separate thread/connection pools per dependency or request class;
  critical vs background isolation; one damaged section must not sink the ship.
- **Retry with backoff + jitter**: bounded retries, exponential (1s, 2s, 4s, 8s),
  jitter to avoid synchronized retry storms; **retry only operations that are safe
  to repeat** (idempotency!).
- **Load shedding + backpressure**: reject excess work deliberately to keep the core
  alive; better to shed than to die.
- **Fail fast**: validate preconditions at the boundary; don't start expensive work
  that cannot succeed.
- **Handshaking**: signal readiness to receive traffic / leaving rotation (graceful
  startup/shutdown).
- **Steady state**: runs indefinitely without manual cleanup, leaks, or hidden queue
  growth.
- **Blast radius** is the evaluation lens: what is the worst case if this dependency
  fails, and where is the boundary?

**ASF status**: Rule 15 (bounded waits, 30-min ceiling) is the *agent's* discipline —
arguably the ASF's own implementation of timeouts. But nothing in the ASF requires
the *deliverable* to have timeouts/circuit breakers/bulkheads/bounded retries/
idempotency/load shedding. Phase 4 asks "what breaks first? can we recover
automatically?" — a question, not a pattern set. For an agent-built system this is
the difference between "works on my machine" and "survives production".

## C5. 12-Factor — the operational contract for a service

I. Codebase (one repo per app, explicit) · II. Dependencies (declare + isolate,
exact versions) · III. Config (environment, not code; no config in repo) · IV.
Backing services (attached resources, swappable) · V. Build/release/run (strict
separation) · VI. Processes (stateless, no local persistence) · VII. Port binding ·
VIII. Concurrency (scale out via processes) · IX. Disposability (fast start, graceful
shutdown, crash-resilient) · **X. Dev/prod parity** (minimize divergence — the
precondition for "tested in prod-like env") · **XI. Logs as event streams** (stdout,
aggregated, time-ordered; not files) · XII. Admin processes (one-off scripts as
release processes).

**ASF status**: 06b Rule 11 (test the shipped artifact) and 06c Rule 3 (config) touch
II/III/X. Nothing on logs-as-event-streams, disposability, dev/prod parity as a
*requirement*, statelessness, or build/release/run separation (the ASF release flow
is git-tag + npm-publish, which is close to V but not stated as such).

## C6. Observability — what "see it working in production" means concretely

From the fitness-function literature (Thoughtworks) + Release It! + 12-factor XI:
- **Structured, parseable logs** emitted to a stream, consumed by an aggregator.
- **Metrics** emitted and consumed by a metrics service.
- **Health endpoint** (readiness/liveness).
- **Correlation/tracing IDs** propagated through the request chain.
- **Runbook** exists; **alerts** exist; README exists (operability fitness functions).
- Security logging (A09): security events logged, tamper-resistant audit trail.

**ASF status**: 06c Rule 7 (full I/O logging, replayable, during debug) is *debug*
observability — strong and unusual, but it is not *production* observability. Phase 4
asks "logs, metrics, errors — can we see it working in production?" as a question
only. No requirement that a deliverable ship a health endpoint, structured logs,
correlation IDs, or a runbook.

## C7. Error handling as design, not as afterthought

- **Define errors out of existence** (Ousterhout): the best error handling is the
  one that removes the error condition (e.g. a module that guarantees a non-null
  result instead of throwing).
- **Handle at the boundary, fail fast**: validate preconditions at the trust
  boundary; return generic messages to users; log detail internally (OWASP A10 —
  Mishandling of Exceptional Conditions is a *new* Top-10 category).
- **Exceptions are for exceptional conditions**; control flow via exceptions is a
  smell (see also "Replace Conditional with Polymorphism").
- **Idempotency** is the prerequisite for safe retries (C4) and for correct
  at-least-once delivery semantics.
- **Fail loudly, fail early** (ASF's own 06b Rule 4/5 is aligned: silent failures are
  the enemy).

**ASF status**: 06b Rules 4–5 cover *verification-time* honesty about errors; 06c
Rule 5 covers refactoring-when-too-complex. Nothing tells the agent how to design
error handling in the deliverable: no boundary rule, no idempotency rule, no
"generic to user / detailed to log" rule.

## C8. Naming, comments, and the reader

- Code is read far more often than written; **make the code obvious to the reader**;
  if the reader doesn't find it clear, the code (not the reader) is wrong.
- **Semantic distance** (Fowler): the gap between what a name promises and what the
  body does — the real measure of method quality.
- Comments should say **what the code cannot** (design rationale, non-obvious
  invariants, why-not alternatives) — not restate the code (smell: "Comments").
- Interface documentation is the contract other modules depend on; the informal
  interface (behavior, side effects, constraints) can only be expressed in comments.

**ASF status**: 06c Rule 1 says "clear names, short functions" — a start. No
semantic-distance rule, no comment-purpose rule, no interface-doc rule (06c Rule 6
requires an architecture writeup, which is the module-level counterpart).

## C9. What the craft literature says the ASF already does right

- 06c Rule 2 (SSOT / single escalation path) is Parnas information hiding + Ousterhout
  "one design decision in one module" — stated in the ASF's own words, correct.
- 06c Rule 4 (testable standalone, then integrate verbatim) is ports-and-adapters +
  testability-as-design — correct and ahead of most industry practice.
- 06c Rule 8 (behavior-preserving refactors) + Rule 9 (documents are code) are
  unusual and correct.
- 06b Rule 13 (dead wiring) is a *product-level* analogue of the "Dead Code" smell.
- The ASF's own "extraction triggers" are the right *kind* of rule (trigger-based,
  not threshold-based) — they just need the depth counterweight.

## C10. Candidate additions distilled from this pillar

1. **Depth rule** (the counterweight to size rules): a module's interface must be
   simpler than its implementation; pass-through layers and shallow wrappers are
   defects; "new layer, new abstraction". Reframe 06c Rule 1 from "small" to
   "deep, single-purpose"; keep size thresholds as smoke detectors only.
2. **Information-hiding checklist**: what design decision does this module own? What
   is the least knowledge that must cross its interface? Any temporal decomposition
   / back-door leakage?
3. **Code-smell reference** (short catalog: the 5 groups, ~15 smells, one line each)
   as a Phase 4/6 lens.
4. **Stability-pattern requirements** for deliverables: timeouts on every external
   call, bounded retries with backoff+jitter on idempotent operations only, circuit
   breaker at integration points, bulkheads for shared resources, bounded result
   sets, fail-fast validation, graceful shutdown.
5. **Observability requirements**: health endpoint, structured logs, correlation
   IDs, metrics, runbook — as DoD items for services.
6. **Error-handling design rules**: define errors out of existence; validate at the
   boundary; generic to user / detailed to log; idempotency as a design property.
7. **12-factor as a reference** for service deliverables (esp. dev/prod parity,
   logs-as-streams, disposability).
