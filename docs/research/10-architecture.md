# Research Notes 1 — Architecture: standards for deciding great architecture

Authoritative sources read (see SOURCES.md for URLs):
ISO/IEC/IEEE 42010:2022 (architecture description), arc42 template + arc42 quality
model, SEI ATAM (CMU SEI), MADR/ADR practice, C4 model, ISO/IEC 25010:2023 (product
quality model), Parnas information hiding, Ousterhout *A Philosophy of Software
Design* / Stanford CS190 modular-design notes, evolutionary architecture &
architecture fitness functions (Ford/Parsons/Kua; Thoughtworks).

---

## A1. ISO/IEC/IEEE 42010:2022 — what an architecture description must contain

Central distinction: **architecture** (fundamental concepts/properties) vs
**architecture description** (the work product expressing it).

Key concepts: **Entity of Interest**, **stakeholders**, **concerns** (performance,
security, maintainability…), **viewpoint** (specification for constructing a view),
**view**, **architecture decision**, **architecture rationale** (justification
linking decisions to stakeholder concerns).

The standard **requires that decisions and their rationale be documented**, and that
stakeholder concerns be explicitly addressed. Stated benefits: completeness,
traceability between concerns → decisions → architecture, and *facilitating analysis
and evaluation*.

**ASF status**: PLAN.md has an "Architecture / Design" section (modules, data model,
key flows, interfaces, SSOT map, layering, standalone testability). It has **no
stakeholder/concern framing, no decision records, no rationale linking decision →
concern**. Decisions appear as prose "Approach … with rationale", one blob.

## A2. arc42 — the pragmatic documentation standard (12 sections)

1 Introduction & Goals (incl. **quality goals**) · 2 Constraints (regulations, external)
· 3 Context & Scope (external systems/interfaces) · 4 Solution Strategy (core ideas)
· 5 Building Block View (modularization, refined hierarchically — usually largest)
· 6 Runtime View (important runtime scenarios) · 7 Deployment View · 8 Crosscutting
Concepts (technology choices, recurring patterns, dev/deploy processes) ·
9 **Architectural Decisions** · 10 **Quality Requirements** (quality tree + scenarios)
· 11 **Risks & Technical Debt** · 12 Glossary (ubiquitous language).

**ASF status**: PLAN.md covers ≈ 1, 3 (partial), 4, 5, 12 (implicit). Missing as
explicit, named sections: **2 Constraints**, **6 Runtime View**, **7 Deployment View**,
**8 Crosscutting Concepts**, **9 Architectural Decisions**, **10 Quality
Requirements**, **11 Risks & Technical Debt** (PLAN.md has "Risks & mitigations" —
partially covered), **12 Glossary**.

## A3. SEI ATAM — architecture *evaluation* produces risks, sensitivity points, tradeoffs

ATAM (CMU SEI) is "a method for evaluating software architectures relative to quality
attribute goals"; it exposes **architectural risks**, **sensitivity points** (a
component/property that significantly affects a quality attribute), **tradeoff points**
(sensitivity point affecting more than one attribute), **non-risks**, and **risk
themes** synthesized against business drivers. Nine steps; core mechanics: business
drivers → **quality attribute utility tree** (attributes refined to *scenarios*
annotated with stimulus/response and prioritized) → analyze architectural approaches
against high-priority scenarios → prioritize stakeholder scenarios (voting) → re-analyze
→ present results. Outputs: architectural approaches, utility tree, scenario set +
which were mapped onto the architecture, attribute-specific questions and answers,
risks, non-risks, risk themes. Documented benefits: risks found early, clarified
quality-attribute requirements, documented basis for decisions.

**ASF status**: Phase 4 adversarial analysis is a *checklist*, not a scenario-based
evaluation. It has "Architecture questions" (data flow, state, scaling, rollback,
observability) and a Risks section in PLAN.md. Missing: **quality-attribute scenarios
as the unit of analysis**, **prioritization of scenarios**, **sensitivity/tradeoff
points as named outputs**, **risk themes**, **which scenarios the architecture actually
addresses (mapping)**. Nothing in the ASF asks "which quality attribute would break if
this decision changed?" — i.e. no tradeoff reasoning at all.

## A4. ADR / MADR — the decision-record standard

MADR definition: an Architectural Decision is "a justified software design choice that
addresses a functional or non-functional requirement of architectural significance."
Template (MADR 4.x): title · **Context and Problem Statement** · **Decision Drivers** ·
**Considered Options** · **Decision Outcome** ("Chosen option X because …") ·
**Consequences** (Good/Bad because…) · **Confirmation** (how compliance with the ADR
will be verified — e.g. design review or an ArchUnit-style test) · **Pros and Cons of
the Options** (Good/Neutral/Bad because…) · More Information. Status lifecycle
(proposed/accepted/deprecated/superseded by ADR-xxxx), numbered files in
`docs/decisions/`, lintable markdown, categories via subfolders.

The **Confirmation** element is notable: an ADR states how the machine will check that
the implementation actually follows the decision. That is exactly the ASF's trace
philosophy applied to architecture decisions.

**ASF status**: zero decision records. PLAN.md "Approach" is a single narrative;
alternatives are considered in Phase 2 research output ("Alternatives considered — one
line each, why rejected") but never attached to the decision they lost, never
versioned, never revisited, and never linked to a check.

## A5. C4 model — zoom levels, and the "don't draw everything" rule

Context → Container → Component → Code, plus landscape/dynamic/deployment. Explicit
guidance: **"you don't need to use all 4 levels; only those that add value — the system
context and container diagrams are sufficient for most teams."** Different levels tell
different stories to different audiences.

**ASF status**: 06c Rule 6 requires an architecture writeup ("what each module is, what
it uses, how and why, where truth lives"). No notion of audience/zoom level, no
container-vs-component distinction (an agent writing a "module list" often mixes
processes/services with files), no requirement for a context view (what external
systems the deliverable touches — which is also the security-boundary view).

## A6. ISO/IEC 25010:2023 — the nine quality characteristics (the checklist ASF lacks)

Functional Suitability · Performance Efficiency · Compatibility · Interaction Capability
(formerly Usability) · **Reliability** (faultlessness, fault tolerance, availability,
recoverability) · **Security** (confidentiality, integrity, non-repudiation,
accountability, authenticity, resistance) · Maintainability (modularity, reusability,
analysability, modifiability) · **Flexibility** (testability, adaptability, scalability,
installability, replaceability) · **Safety** (operational constraints, risk
identification, fail safe, hazard warning, safe integration).

Note **Testability is a first-class quality sub-characteristic** — the ASF treats it as
a design property (06c Rule 4) but does not name it as a quality requirement to be
specified and measured.

## A7. Quality scenarios — the standard *format* for non-functional requirements

SEI quality attribute scenario = 6 elements: **source of stimulus, event/stimulus,
artifact, environment, response, response measure (metric)**.

arc42's pragmatic critique and alternative (Q42 two-tier), which is directly
compatible with ASF's scale philosophy:
- **Tier 1 (simple)**: Requirement + Acceptance Criteria (numeric thresholds).
- **Tier 2 (complex)**: Context + Trigger + Acceptance Criteria.
- Acceptance-criteria rules: be specific; measurable; **include units**; use
  thresholds; **state the scope/load the threshold applies under** ("p95 < 250 ms at
  10 000 concurrent users", not "p95 < 250 ms"); **define the failure path** (what the
  system does when the threshold is breached — e.g. circuit breaker opens within ≤ 3 s).
- Common metrics: percentages, time bounds, thresholds, counts ("zero critical
  vulnerabilities"), uptime, error budgets.

**ASF status**: 01-intake has "Concretize: what does 'fast' mean — under 200ms? →
capture as spec". That is the right instinct and nothing more: no format, no
load/scope requirement, no failure-path requirement, no coverage check across the 25010
characteristics, no requirement that large work carry any non-functional spec at all.

## A8. Fitness functions — architecture quality as an executable, continuously-checked
## test (evolutionary architecture)

Evolutionary architecture = "supports guided, incremental change as a first principle".
Mechanism = **fitness functions**: automated tests over architecture characteristics
that gate promotion. Categories documented by Thoughtworks with concrete examples:
code quality (coverage/maintainability), **resiliency** (error rate during a rolling
deploy, behaviour under injected network latency), **observability** (logs in the
aggregator, metrics emitted, health endpoint, correlation/tracing IDs present),
**performance** (transaction time, error rate at N transactions), **compliance**
(no PII in logs, audit age), **security** (approved libraries only, no OWASP Top 10,
no plaintext secrets in the codebase, no CVEs in deps or images), **operability**
(runbook exists, README exists, alerts exist, tracing IDs).

This is the authoritative framing for what ASF's Code Health Gate (06e) is doing — and
it shows 06e's scope is narrow (code metrics only: complexity, size, duplication,
cycles) while the standard set also includes observability, resiliency, performance,
security and operability fitness functions.

## A9. Design-level theory that contradicts parts of ASF's current wording

- **Parnas (information hiding)**: decompose on *secrets/design decisions*, not on the
  flow of execution. Each module encapsulates one design decision; the interface must
  not reflect that information.
- **Ousterhout**: complexity = "anything related to the structure of a system that makes
  it hard to understand and modify"; manifests as **change amplification**,
  **cognitive load**, **unknown unknowns**; caused by **dependencies** and **obscurity**.
  - **Deep modules**: simple interface, substantial implementation. "It is more
    important for a module to have a simple interface than a simple implementation."
  - **"Many courses teach that classes should be small — that results in shallow
    classes."** "Classitis". **"Size doesn't really matter that much. Classes in the
    range of 200–2000 lines are fine. The most important thing is depth."**
  - **Temporal decomposition** is one of the most common causes of information leakage
    (structure mirrors execution order → the same decision is duplicated across stages).
  - **Pass-through methods are a red flag**: a new layer must introduce a new abstraction.
  - **Pull complexity downwards / Martyr principle**: handle errors rather than throwing
    them upward; **minimize "voodoo constants"** (config parameters the user cannot
    possibly choose correctly) — default values are the module's job.
  - **General-purpose (somewhat generic) interfaces are deeper** than special-purpose ones.
  - **TDD lacks a design feedback loop**: "it focuses on getting specific features
    working, rather than finding the best design"; ten well-tested merges can still
    degrade the design. Remedy: design abstractions wholesale, review for depth.
- **Fowler** (via the same reading): "To me length is not the issue. The key is the
  **semantic distance between the method name and the method body**."

**Tension with ASF as it stands:**
1. 06c Rule 1 says *"small, well-readable modules"* and gives extraction triggers
   ("exceeds ~100 lines or 3 levels of nesting → extract"). 06e gates on
   `maxFileLines: 300`, `maxLinesPerFunction: 50`. The authoritative position is that
   size is a *smoke detector* and **depth** (interface vs implementation) is the goal;
   a size-only rule measurably rewards splitting into shallow pass-throughs — which is
   precisely the failure mode an LLM agent exhibits when told "keep files under 300
   lines". This is a real, citable defect in the standard, not a style preference.
2. 06c Rule 3 says *"No hardcoding; config drives behavior"* with no counterweight.
   Ousterhout's "minimize voodoo constants" is the counterweight: every config knob is
   a burden pushed onto the operator; knobs should exist for real variation and ship
   with defaults the module author chose. Unqualified "everything in config" produces
   the 40-parameter module that is shallow and undebuggable.
3. ASF's test-first rule (Phase 6) is stated as an absolute with no design-feedback
   counterpart — exactly the gap Ousterhout identifies. ASF partially compensates via
   06c Rule 5 (refactor gate) and Gate 8, but has no "review for depth" step.

## A10. What the standards collectively imply for an *agent-run* factory

1. **Decisions must be records, not prose** — numbered, dated, with options,
   consequences, and a *confirmation* mechanism. Otherwise an agent's later refactor
   silently reverses a decision it never saw.
2. **Non-functional requirements need a standard, measurable format** (quality
   scenarios with load scope + failure path) and a coverage checklist (ISO 25010's nine
   characteristics) — otherwise "fast/secure/maintainable" is never verified.
3. **Architecture must be evaluated against prioritized scenarios before coding**, and
   the evaluation's *outputs* are named artifacts: risks, non-risks, sensitivity
   points, tradeoff points, risk themes.
4. **Architecture quality should be executable** (fitness functions) and gated, with
   the gate scope wider than code metrics (observability, resiliency, performance,
   security, operability).
5. **Documentation is for a reader and a purpose** — context/container views for
   outsiders, component/code views for maintainers; "just enough" is the explicit rule.
6. **Depth beats size.** Metrics must be paired with the design goal they proxy, or the
   agent optimizes the proxy.
