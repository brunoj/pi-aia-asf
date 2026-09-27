# Research Notes 5 — The AI-executed factory: what the AI-era literature adds

Sources read: OWASP AI Agent Security Cheat Sheet (2026), Martin Fowler/Böckeler on
Spec-Driven Development (Kiro/spec-kit/Tessl), LLM coding workflow best-practices
compendium (2026; cites Stack Overflow 2025, Sonar 2026, DORA 2025, GitHub
Octoverse 2025), OWASP LLM Top 10 (cross-ref 40-security.md S6), plus the ASF's own
history (Loop Guardian, M1–M6, honesty rules).

---

## A1. The central fact: verification is the bottleneck, not generation

- Sonar 2026: developers report **42 % of committed code is AI-generated or
  significantly AI-assisted** (up from 6 % in 2023); projected 65 % by 2027.
- Stack Overflow 2025: 46 % actively distrust AI-tool accuracy; only 3 % highly
  trust it.
- **"AI changed the cost of producing code, not the accountability for shipping
  it."** The scarce skill is now verification, review, rollback, ownership.
- **Verification debt** is the named risk: "teams can generate more code than they
  can understand, test, review, and operate" — it shows up as larger PRs, brittle
  tests, hidden security issues, more reverts, slower review.
- DORA's generative-AI analysis: **every 25 % increase in AI adoption was associated
  with a 1.5 % decrease in delivery throughput and a 7.2 % decrease in delivery
  stability** — because faster generation increases batch size and review burden.

**ASF status**: the ASF is *already* the answer to this (spec-driven, evidence-based,
M5 "the code is the evidence", honesty rules, small commits). This is the strongest
validation of the ASF's core design. The remaining gap is *breadth*: the ASF
verifies correctness and wiring, but not (yet) test-quality (mutation), security
(threat model), or independent review.

## A2. The writer → reviewer → human-owner pattern (independent review)

"The strongest pattern is **writer agent, reviewer agent, human owner**. The writer
optimizes for implementation. The reviewer optimizes for skepticism. The human owner
decides whether the criticism is valid." Ask the reviewer to be adversarial, cite
file-specific concerns, distinguish blockers from suggestions, and answer "what
would break in production?" — not "is this good?" A second model/agent is an
independent critique by a different reasoning path; it catches missing tests,
inconsistent assumptions, unused code, security concerns, simpler alternatives.

This is the AI-era form of **test independence** (29119, T7 in 30-testing-qa.md):
the writer must not be the only verifier.

**ASF status**: Phase 4 adversarial analysis is *self*-review by the same agent that
designed the thing. 06d delegation allows subagents but does not *require* an
independent reviewer for large work. The ASF has no "reviewer agent" role, no
"blockers vs suggestions" convention, no "what would break in production" prompt.

## A3. Mode separation = the ASF's phases, validated

Research / plan / implement / verify as **separate modes with changed permission
levels** ("Research only; do not edit"; "Propose the smallest plan"; "Implement
steps 1–2 only"; "Run the focused tests and summarize failures"). Mode separation
"turns AI from a text generator into a controlled engineering assistant" and
"reduces correction loops because the model has to understand before modifying."

**ASF status**: fully present (Phases 1–7 with gates). No change needed; cite as
validation.

## A4. Stop rules for agent drift — the ASF has this in pi-vigilant, not in ASF

Trigger list from the literature: two or three failed correction loops; unexplained
security-sensitive change; growing diff outside approved files; a test failure the
model keeps patching around instead of understanding; deleting tests to make a suite
pass; replacing specific errors with generic catches; weakening types; adding sleeps
to fix races; changing public contracts without migration notes. "The model should
never negotiate its own blast radius."

**ASF status**: pi-vigilant's Loop Guardian (D1/D2/D3 detectors + steer escalation)
covers the *loop* half; 06-implementation M4 covers product tension; 06b Rule 6
covers "test per bug". But the ASF has no explicit **drift stop-rules** (scope
creep, test-deletion, type-weakening, sleep-adding, contract changes) as named
anti-patterns, and no rule that the agent must *stop and report* when it catches
itself doing them.

## A5. Spec-driven development: the ASF is spec-anchored, and the critique confirms
## the ASF's design choices

Three levels: **spec-first** (spec for the task, then discarded), **spec-anchored**
(spec kept and evolved with the feature), **spec-as-source** (only the spec is
edited; code generated). The ASF is **spec-anchored** (specs persist, trace SSOT,
verification re-runs) — the middle level, which the literature treats as the
sensible default.

The critique of SDD tools is a checklist of things the ASF already avoids:
- **"One workflow to fit all sizes?"** — Kiro/spec-kit were "a sledgehammer to
  crack a nut" on small bugs; the ASF's scale rule (small = automatic) is exactly
  the fix, and the literature says an effective SDD tool "would at the very least
  have to provide flexibility for a few different core workflows, for different
  sizes and types of changes" — the ASF has precisely this.
- **"Reviewing markdown over code?"** — spec-kit produced "a LOT of markdown files…
  repetitive… I'd rather review code"; the ASF's M5 ("the delivery log is a claim;
  the code is the evidence") and Rule 11 (test the shipped artifact) are the
  countermeasure.
- **"False sense of control?"** — "even with all of these files and templates and
  prompts and workflows and checklists, I frequently saw the agent ultimately not
  follow all the instructions"; the ASF's answer is machine-checkable gates
  (M1 testFile/assertion, Gate 8) rather than trusting checklists — the right
  answer, and a reason to prefer *mechanical* gates over prose rules in any new
  proposal.
- **Non-determinism**: "the price for that is LLMs' non-determinism… spec-as-source
  might end up with the downsides of both MDD and LLMs: inflexibility *and*
  non-determinism." The ASF's spec-anchored middle ground avoids this.

**ASF status**: validated; no change needed. New proposals should prefer
machine-checkable mechanisms (like 06e) over prose instructions (like most of 06b),
and stay scale-aware.

## A6. Context engineering — memory bank vs specs (a distinction the ASF can name)

The literature separates **memory bank** (repo-wide context: AGENTS.md, architecture
notes, service boundaries, data model rules, API examples, test commands, security
requirements, known traps — relevant across all sessions) from **specs** (relevant
only to the task that creates/changes that functionality). "Context is
infrastructure, and stale context creates bad code at scale." Keep it short enough
that agents actually use it; "update it after mistakes."

**ASF status**: SKILL.md + references are the memory bank (good); PLAN.md + specs
are the specs (good). The ASF never states the distinction or the freshness rule
("remove stale advice quickly because models follow old instructions with the same
confidence as current ones"). Minor.

## A7. AI-specific security (OWASP AI Agent Security Cheat Sheet) — applies to the
## ASF's own products

Key risks: prompt injection (direct/indirect), **tool abuse & privilege
escalation**, data exfiltration, memory poisoning, goal hijacking, **excessive
autonomy**, high-impact action abuse, decision/approval manipulation, cascading
failures in multi-agent systems, **denial of wallet** (unbounded loops → cost),
sensitive data exposure, supply chain.

Best practices (each with concrete patterns):
1. **Tool security & least privilege**: minimum tools per task; per-tool permission
   scoping (read-only vs write, specific resources); separate tool sets per trust
   level; explicit authorization for sensitive operations. (Bad: unrestricted shell
   `allowed_commands: "*"`. Good: allowlisted paths/operations/blocked patterns.)
2. **Input validation & prompt-injection defense**: treat all external data as
   untrusted (user messages, retrieved documents, API responses, emails);
   delimiters between instructions and data; content filtering; separate LLM call to
   validate untrusted content.
3. **Memory & context security**: validate/sanitize before persisting; per-user
   isolation; TTL + size limits; audit for sensitive data; integrity checks.
4. **Human-in-the-loop**: explicit approval for high-impact/irreversible actions;
   action previews; autonomy boundaries by risk level; audit trails; interrupt and
   rollback. **Separate decision-making from execution** for irreversible ops; bind
   approval to the exact action (actor, tool, resource, normalized params,
   timestamp, expiry); short-lived authz artifacts + replay protection; step-up
   auth for critical actions; **idempotency**; **fail closed** when classification/
   validation/logging fails.
5. **Output validation & guardrails**: schema-validated structured outputs; PII
   filtering; rate/scope limits on actions.
6. **Monitoring & observability**: log all decisions/tool calls/outcomes; anomaly
   detection (tool-call rate, failed calls, injection attempts, sensitive-data
   access, cost per session); alerts; audit trails; structured decision metadata.
7. **Multi-agent security**: trust boundaries between agents; sanitize inter-agent
   messages; prevent privilege escalation through chains; isolate execution
   environments; **circuit breakers** to prevent cascading failures.
8. **Data protection & privacy**: minimize sensitive data in context; classification
   → per-operation handling (redact/mask); encryption at rest/in transit; retention.
9. **Secure agent testing & adversarial validation**: **abuse-case test matrix**
   (prompt override, tool misuse, privilege escalation, memory poisoning, data
   exfiltration, recursive tool abuse, approval bypass, multi-agent chaining);
   regression tests for previously observed failures; **CI gates: block releases
   when high-risk tool policies/approval logic/credential scopes change without
   updated tests**; version-controlled red-team prompts; "review test changes
   carefully; attackers may try to weaken or remove security tests in the same PR";
   retain validation evidence (agent version, model provider, tool policy, abuse
   cases, observed behavior, accepted residual risk).

**ASF status**: zero. The ASF's deliverables are pi extensions — *agents with
tools* — and the ASF itself is an agent with tools (bash, write, edit, web). This
cheat sheet is the most directly applicable external standard in the whole research
set. The ASF has no requirement that a delivered agent have least-privilege tool
config, HITL for high-impact actions, output validation, cost bounds, an abuse-case
test matrix, or a security regression suite.

## A8. AI-aware review and delivery artifacts

- **AI PR template** asks: spec link/summary, tool used, human owner, tests run,
  files intentionally changed, security-sensitive areas touched, known limitations.
  Purpose: traceability — "reviewers need to know what the agent was asked to do and
  what evidence supports the change." Not paperwork theater; it is the AI-era form
  of the test-completion report.
- **Review layers**: intent → behavior → security → maintainability; "make the agent
  explain the diff, but do not accept explanation as proof."
- **Test guidance for AI**: first test proves the behavior that could regress; for a
  bug, preserve the reproduction; for a feature, test the **public contract** not
  private implementation; for security/permissions, include **denial cases**, not
  just happy paths; "if the model only adds tests that mirror its implementation,
  ask for tests against the spec and examples" — this is exactly what mutation
  testing mechanizes (T2).
- **Metrics**: track PR size, cycle time, test failure rate, review comments per
  diff, reverts, escaped defects, incidents, flaky-test growth, % of AI-assisted
  PRs needing rework. "If throughput rises but reverts and incidents rise faster,
  the workflow is failing."

**ASF status**: 06b Rule 12 (operator-facing outcome) ≈ "test the public contract";
Rule 7 (triggers AND non-triggers) ≈ "include denial cases" — the ASF already has
the *spirit* of the test guidance. Missing: the delivery report has no
spec-link/owner/security-areas/known-limitations fields; no escaped-defect metric
loop (G10); no explicit "explain the diff, explanation ≠ proof" rule (M5 covers
this for delivery logs, not for code review).

## A9. What the AI-era literature says the ASF already does right (no change)

- Phases = mode separation with permission changes (A3).
- Spec-anchored + scale rule = the answer to "one workflow to fit all sizes" (A5).
- M5/M6 + Rule 11 = the answer to "reviewing markdown over code" and "false sense
  of control" (A5).
- Machine-checkable gates (M1, Gate 8) over prose checklists (A5).
- Small commits, no-auto-publish, release discipline = "Git as the control plane"
  and "small, reviewable batches" (A1/A2).
- Loop Guardian (pi-vigilant) = stop rules for loops (A4, partial).
- Honesty rules (06b 1–5, 11) = "do not accept explanation as proof" (A8).

## A10. Candidate additions distilled from this pillar

1. **Independent reviewer gate for large work**: a second agent (different
   reasoning path) reviews PLAN + diff + tests against "what would break in
   production", producing blockers vs suggestions; human owner decides. (A2, T7)
2. **Agent-drift stop-rules** as named anti-patterns in 06-implementation: scope
   creep, test deletion, type weakening, sleep-adding, generic catches, contract
   changes without migration notes; stop + report. (A4)
3. **AI-agent security requirements for deliverables** (OWASP cheat sheet, scaled):
   least-privilege tool config, HITL for high-impact actions, output validation,
   cost bounds, memory hygiene, abuse-case test matrix, security regression suite,
   validation evidence. (A7, S6)
4. **Delivery report fields**: spec link, owner, tests run, files intentionally
   changed, security-sensitive areas touched, known limitations, not-tested
   register. (A8, T7)
5. **Escaped-defect feedback loop**: when a bug escapes to the user, the ASF should
   ask "which gate should have caught this?" and close the gap (RV.3 root-cause
   analysis, G10).
6. **Context freshness rule**: memory-bank docs (SKILL.md/references) must be
   re-verified for staleness; stale advice is actively harmful to an agent. (A6)
