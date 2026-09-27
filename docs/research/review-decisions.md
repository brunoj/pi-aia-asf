# ASF Improvement Review — decision log

One-by-one review of `improvement-proposals.md` (P01–P22). Each entry: decision,
scope notes, implementation notes.

| ID | Decision | Notes |
|---|---|---|
| P01 | ✅ **Approve** | ADRs for large work: PLAN.md "Decisions" section (≤5 lines each: decision, options 2+, chosen, consequence); optional `docs/decisions/NNNN-*.md`. Small work: none. |
| P02 | ✅ **Approve** | Quality-attribute table for large work: characteristic → scenario (stimulus/response/measure) → acceptance; default covers performance, reliability, security, maintainability, usability; others only when touched; cap ≤8 scenarios. Small work: none. |
| P03 | ✅ **Approve** | ATAM-lite in Phase 4/5 for large work: utility tree from P02 scenarios, sensitivity/tradeoff points, architectural risk list w/ mitigations; ≤1 page in PLAN.md. Depends on P02. |
| P04 | ✅ **Approve** | Optional "Views" section in PLAN.md for large work: context/runtime/deployment diagrams (text or mermaid, ≤15 lines each), only when the work has external interfaces/runtime/deployment concerns. Small work: none. |
| P05 | ✅ **Approve** | Reframe 06c Rule 1 to "deep, single-purpose modules" (interface simpler than implementation; pass-through/shallow wrappers = defects; new layer = new abstraction); add anti-patterns (temporal decomposition, back-door/information leakage); Ousterhout counterweight to Rule 3 (config); 06e thresholds documented as smoke detectors + report-only depth metric (no gate). |
| P06 | ✅ **Approve** | New 06f-stability.md reference (indexed from SKILL.md): timeouts (conn/read/total), bounded retries w/ backoff+jitter (idempotent only), circuit breaker, bulkheads, bounded result sets, fail-fast, graceful shutdown. DoD: external calls ⇒ timeouts + bounded retries. Large work only. |
| P07 | ✅ **Approve** | DoD items for service-like deliverables (large work): health/readiness endpoint; structured logs to stdout; correlation IDs; metrics where a metrics system exists; runbook section in README (start/stop/health/known issues). Small work: none. |
| P08 | ✅ **Approve** | Error-handling design rules (fold into 06f): validate at boundary + fail fast; define errors out of existence; user-facing errors generic / logs detailed; idempotency as design property for retryable ops; no exceptions for control flow. |
| P09 | ✅ **Approve** | Code-smell reference (≤1 page, 5 groups × 3–4 smells, one line each) as a Phase 4/6 diagnostic lens mapping to existing 06c fixes. No new gate. |
| P10 | ✅ **Approve** | New 06g-test-design.md (small): technique families w/ "use X when Y" (EP, BVA, decision table, state transition, all-pairs, scenario, error guessing); Phase 6 large work: test plan lists technique per behavior + risk rationale (likelihood × impact) for highest-risk surfaces. Small work: none. |
| P11 | ✅ **Approve** | Determinism rules (add to 06b/06g): injected clock (no wall time in logic), seeded RNG, each test owns its data, poll/event w/ timeout instead of sleep, no order dependence, no real network in unit tests; flaky = defect: fix immediately, never retry into green; skipped tests must be reported in delivery. |
| P12 | ⏸️ **Deferred** | Mutation-score fitness function (optional Code Health Gate module, Stryker/pitest, baseline + ratchet, default off). Only L-effort item; revisit in a later round. |
| P13 | ✅ **Approve** | 06c Rule 8 gains a step: before refactoring code without tests, capture current behaviour (characterization tests or recorded before/after run) as regression oracle; if behaviour can't be captured, say so in plan + get approval. |
| P14 | ✅ **Approve** | Extend large-work delivery log template: spec link, tests run + results, not-tested register (what wasn't verified + residual risk), security-sensitive areas touched, known limitations. Small work: one line when applicable. |
| P15 | ✅ **Approve** | Threat model as code for large work (Phase 4/5): context view w/ trust boundaries (P04), element × STRIDE matrix, threat registry (id, component, stride, description, risk, mitigation, mitigated), gate: no high-risk unmitigated threat without recorded acceptance. Small work: one-line security-boundary note when touching untrusted input. |
| P16 | ✅ **Approve** | New 06h-security.md: applicable ASVS 5.0 chapters per deliverable type (CLI/extension: V2,V6,V8,V9,V13,V14,V16; web app: +V3,V4,V7,V10,V11,V12), level by risk (L1 default, L2 if auth/data, L3 high-value), DoD: no applicable L1 requirement unaddressed; deviations recorded w/ rationale. Small work: checklist line only. |
| P17 | ✅ **Approve** | Two optional Code Health Gate modules (06e pattern, default off/warn): (a) supply chain — npm audit --json/osv-scanner w/ threshold + committed baseline + lockfile-committed check; (b) secrets — gitleaks via npx --no-install w/ baseline. Phase 2 one-liner: dependency decision (license, maintenance, security history, pinned). RV loop: re-run SCA before each release. |
| P18 | ✅ **Approve (revised)** | Agent/tool-surface security as an optional chapter INSIDE 06h-security.md (P16), not a separate reference. Applies only when deliverable has agent-like tool surfaces; strictly proportional: small work = one delivery-log line; large work = checks scaled to the job (tool least privilege, HITL for high-impact actions, output validation, abuse-case test for highest-risk surface). Source: OWASP AI Agent Security Cheat Sheet. |
| P19 | ✅ **Approve (revised)** | Independent reviewer gate for large work (second agent, fresh context, adversarial prompt: blockers vs suggestions). Human owner decides ONLY on matters the system genuinely cannot decide (conflicting requirements, product-level tradeoffs, scope conflicts); system resolves everything else autonomously (auto-fix safe blockers, apply safe suggestions, escalate only true conflicts). Reuses 06d subagent machinery. Small work: none. |
| P20 | ✅ **Approve (revised)** | Agent-drift self-correction rules in 06-implementation: named anti-patterns (failed correction loops, unexplained security-sensitive change, diff outside approved files, patching test failures, deleting tests to pass, generic catches, weakened types, sleeps for races, contract changes w/o migration notes). On detection: stop → revert → self-correct → continue (no operator report). Escalate ONLY if drift reveals plan/requirement conflict the system can't resolve. |
| P21 | ✅ **Approve** | Escaped-defect feedback loop (06b): on any escaped defect, the fix must answer "which gate/provision should have caught this, and what changes so it cannot recur"; if no gate existed, that is a proposal to add one. Self-improvement rule, no human decision needed. |
| P22 | ✅ **Approve (revised)** | Context freshness rule, split by kind: (a) NON-NORMATIVE FACTS (package versions, external tool behavior, SOTA details) — update in the same change when found stale; (b) ASF's OWN RULES/GATES/STANDARDS (normative content in SKILL.md + 06x) — NEVER self-modified during a run; file a note/proposal in docs/research/ and escalate; changes go only through the improvement review process. Prevents uncontrolled drift of the ASF itself. |

---

## Implementation status

All 21 approved proposals implemented (2026-09-27) — see CHANGELOG
[Unreleased]. P12 (mutation-score fitness function) remains **deferred** to
a later round. Release (version bump + tag + publish) pending user approval.

| Bundle | Proposals | Where |
|---|---|---|
| Craft core | P05, P08, P11, P13, P20, P22 | 06c, 06f, 06g, 06b, 06-implementation, SKILL.md |
| Architecture | P01, P02, P03, P04 | 05-plan.md, 04-adversarial.md |
| Testing | P10, P14 | 06g, 06b Rule 17 |
| Security | P15, P16, P17, P18 | 06h, 06e, 07-release, 04-adversarial |
| Process | P19, P21, P09, P06, P07 | 06d Part 3, 06b Rule 18, 06c, 06f |

Structure: SKILL.md = lean index (phase flow + gates + reference table);
13 single-concern references loaded on demand (progressive disclosure);
`docs/research/` stays repo-only (not shipped in the npm package).

| P23 | ✅ **Approve** | Configurable release policy (user directive, 2026-09-27): `.asf-release.json` at project root (optional) with `when` (user-stated conditional rules: "when X is true, publish automatically; when Y is true, do this…") and `how` (user-stated instructions with all technical details — credentials, git sync, publish steps — that the ASF drives with judgment, NOT a deterministic command list). Default (no file) = current stance (always send for final review). User definition takes precedence; default only in its absence. Mandatory: **test on publish / in production, if applicable** (package → clean-room registry install + observable end state; deployed app → prod smoke test; N/A → say so). The ASF's own release procedure codified via the same mechanism (repo `.asf-release.json`). Also fixed `scripts/release.sh` echo bug (said pi-vigilant). |
