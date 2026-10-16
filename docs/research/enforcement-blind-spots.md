# Enforcement blind spots — how ASF's rules are actually enforced, and how far the Pi harness can carry them

**Status: research record. Non-normative.** Nothing here changes ASF behaviour.
Approved items land through `review-decisions.md` (P22: normative standards change
only through review). Proposals are **P38–P45** in
[improvement-proposals.md](improvement-proposals.md).

**Origin.** This started as P30 (a `performance` level in the Code Health Gate).
The PO deferred it with a reason: *"I don't understand what you are talking
about"* — a proposal the PO cannot evaluate is not approvable, whatever its
evidence — and redirected to the question underneath it: **if this is about
enforcement of ASF rules, research and elaborate how we can vastly improve that
on Pi Agent.** This document answers that question. P30 is deferred, not
rejected, and its `prototype-perf-gate/` numbers stand.

---

## 1. The finding, in one paragraph

ASF is, mechanically, **a very large prompt and two commands**. `skills/aia-asf`
is 24,869 words containing 29 numbered rules, ~198 normative markers and 41
checklist items. `pi-aia-asf/index.ts` registers exactly two things —
`/asf` and `/asf-approve` — and **zero `pi.on()` handlers**: no `tool_call`, no
`agent_before_settle`, no `turn_end`, no `user_bash`. Enforcement therefore
comes from three layers, and two of the three are self-attestation. Of the 19
Definition-of-Done items in `06b-testing-qa.md:177`, **four** have any mechanical
backing, and even those fire only if the agent chooses to invoke the command
that runs them. The other fifteen — "full test suite green", "browser exercised
every interface the change touches", "regression test for every bug fixed",
"no secrets in the repo", "timeouts and bounded retries" — are enforced by
printing `- [ ]` and asking the graded party not to tick a box it did not earn.
The command named `/asf verify` does not verify the DoD; it *emits* it
(`index.ts:382-392`: `"Do not tick anything you did not run."`). Meanwhile the
Pi harness exposes a full enforcement surface — `tool_call` can **block**
execution, `agent_before_settle` is an **actionable** boundary that can refuse
to settle and demand one more turn, `user_bash` can intercept local commands,
and a `tool_call` handler failure blocks the tool as a fail-safe — and pi's own
security doc states plainly that none of it is on by default: Pi *"does not ask
for approval before every tool call"* and *"Project trust does not limit what
tool calls can access or affect."* The gap is not capability. **ASF has not
connected its rules to the levers that exist.**

---

## 2. What ASF is made of — measured, not estimated

`skills/aia-asf/` (SKILL.md + 15 references), counted with `wc`/`grep`:

| measure | value |
|---|---|
| words | 24,869 |
| lines | 2,714 |
| numbered `## Rule N —` headings | 29 (20 in 06b, 9 in 06c) |
| normative markers (`must`/`must not`/`never`/`always`/`required`/`forbidden`/`do not`) | 198 |
| bullet + numbered instruction lines | 603 |
| checklist items (`- [ ]`) | 41 |
| DoD items in 06b Rule 10 | 19 |
| `pi.on()` handlers in `index.ts` | **0** |
| `pi.registerCommand` | 2 (`/asf`, `/asf-approve`) |
| `pi.registerTool` | 0 |

Concentration matters more than the total, because ASF already uses progressive
disclosure — references are read on demand, not all up front. The honest number
is the density at the moment of work. Phase 6 (implementation) mandates
SKILL.md + `06-implementation` + 06b + 06c + 06i + 06d = **15,480 words, 123
normative markers**; with the on-demand set (06f/06g/06h/06j) it reaches
**20,695 words, 165 normative markers** — and that sits *on top of* a
conversation that is already long.

**The good news is in that table.** ASF's skill-per-phase design is already the
right instinct: it keeps simultaneous density near the band where models still
perform, rather than dumping 24,869 words into every run. Any proposal below
must preserve that, or it will make things worse while trying to make them
better.

---

## 3. Why prose rules cannot hold: the measured ceiling

**IFScale** ([arXiv:2507.11538](https://arxiv.org/abs/2507.11538), 20 models,
7 providers, 500 keyword-inclusion instructions, PDF read in full) measures
adherence as instruction *density* rises. Headline: *"even the best frontier
models only achieve **68% accuracy** at the max density of 500 instructions."*
Per-model accuracy at density 10 / 50 / 100 / 250 / 500:

| model | 10 | 50 | 100 | 250 | 500 |
|---|---|---|---|---|---|
| claude-opus-4 | 100.0% | 100.0% | 94.6% | 67.9% | 44.6% |
| claude-sonnet-4 | 100.0% | 98.0% | 94.4% | 77.2% | 42.9% |
| gpt-4.1 | 98.0% | 98.8% | 95.4% | 74.0% | 48.9% |
| gpt-4.5-preview | 100.0% | 93.6% | 90.8% | 65.0% | 43.0% |
| llama-4-scout | 100.0% | 54.4% | 27.2% | 9.3% | 6.7% |

Three things in that data bear directly on ASF:

1. **The 100–250 band is where degradation starts**, and that is ASF's Phase-6
   operating band (§2). At 100 instructions the best models are at ~94–95%; at
   250 they are at 65–80%. A rule is not "enforced" by being written down; it is
   enforced by being *in the subset the model happened to honour this run*.
2. **Primacy bias.** The paper reports a *"bias towards earlier instructions"*
   and reports a Primacy Effect Ratio per model. Rules stated late in a long
   document are structurally disadvantaged — which is an argument about *where*
   ASF puts its hard rules, not just whether it states them.
3. **The failure mode at density is omission, not partial compliance.** The
   Omission:Modification ratio climbs from ~0–1 at low density to **5–6:1** at
   500 for the Claude models: *"their failure mode defaults to complete
   instruction dropping rather than…"* This is the worst possible failure mode
   for a quality factory. A half-followed rule leaves a trace; a dropped rule
   leaves nothing. Nothing in ASF's current apparatus can distinguish "the agent
   violated Rule 9" from "the agent never got to Rule 9".

Three decay patterns are reported — **threshold decay** (reasoning models:
near-perfect until a critical density, then rising variance and decreased
adherence), **linear decay**, and **exponential decay** — with standard deviation
growing with density (claude-opus-4: 0.0% at 10, 4.7% at 100, 14.0% at 500). So
the failure is not only probable, it is **inconsistent**: the same rule can hold
on Tuesday's run and vanish on Thursday's, which is precisely the "flaky gate"
property that makes people distrust gates.

**LIFBench** (ACL 2025 long paper, PDF read — 2,766 instructions, three
long-context scenarios, eleven tasks, 20 models, six length intervals) adds the
stability axis, and one methodological point ASF should steal: its evaluator
LIFEVAL is explicitly *"a rubric-based assessment method that enables precise,
automated scoring of complex LLM responses **without reliance on LLM-assisted
assessments or human judgment**."* The authors did not trust a model to grade
instruction-following. Neither should ASF.

**Honest scope limits on this section.** IFScale's unit is a *keyword-inclusion*
constraint in a business-report task, not a procedural workflow rule; the
generalisation from "follows 250 keyword constraints" to "follows 250 process
rules" is a reasonable inference, not a measured result. The instruction counts
in §2 are greps over normative-sounding words — a proxy, not a validated
instruction inventory, and a document can carry weight without the words
"must"/"never". And none of this says ASF's rules are *being* violated at
30%; it says prose is a load-bearing structure whose load capacity is measured
elsewhere and is nowhere near unlimited. That is enough to justify moving the
load, and not enough to justify any specific threshold.

---

## 4. The audit: what enforces what, today

Classification of the 19 DoD items (`06b-testing-qa.md:177-196`). **H** = hard
(the agent cannot declare done without satisfying it), **M** = mechanical verdict
produced, but only if the agent runs the command, and the agent can ignore the
output, **S** = self-attested (a box the agent ticks).

| # | DoD item | Class | Who actually checks |
|---|---|---|---|
| 1 | Typecheck/build passes | S | agent's own claim |
| 2 | Full suite green, not a subset | S | agent's own claim (Rule 19's "gate never moves" is prose) |
| 3 | Regression test per bug fixed | S | agent's own claim |
| 4 | Triggers **and** non-triggers | S | agent's own claim |
| 5 | Artifact inspected + clean-room install | S | agent's own claim |
| 6 | Observable end state verified | S | agent's own claim |
| 7 | Browser exercised every touched interface (Rule 9) | S | agent's own claim; "page + action + assertion" is *requested* detail, never checked |
| 8 | Every MUST spec `met` with evidence | **H** | `pi-vigilant` `update_spec_status` rejects `met`/`not-met` without evidence (V1, this round) |
| 9 | Spec-to-code trace validated | **M** | `/asf verify` (`index.ts:~340-365`) — real, but agent-invoked |
| 10 | Code Health Gate passed | **M** | `/asf health` exit code — real, but agent-invoked |
| 11 | Every feature consumed by a surface | S | agent's own claim |
| 12 | E2E behavioural test per feature spec | S | agent's own claim |
| 13 | Unverifiable → `partial` + asked user | **H** | vigilant (evidence required; no self-certification path) |
| 14 | Long-running ops under explicit timeout | S | agent's own claim |
| 15 | No wait exceeded 1800 s ceiling | **H** | vigilant length-loop guard (host-enforced ceiling) |
| 16 | Delivery report complete | S | agent's own claim |
| 17 | Stability line (06f) | S | agent's own claim |
| 18 | Security line (06h) | S | agent's own claim |
| 19 | Model line (06j) | S + **M** | agent's claim; `/asf health model` mechanical when run |

**4 of 19 hard, 3 mechanical-but-optional, 15 self-attested.** The same shape
holds across the 29 numbered rules: the ones with a hook are the ones that
survive. The 06j model gate works because `lib/code-health/model.mjs` exists;
06h's "no unbounded resource use" has never been checked by anything in its
existence.

### The terminal act is unguarded

The most important row is not in the table. **The moment that matters — the
agent writing "done" — is a message the agent writes about itself.** Nothing
inspects the DoD before that message is sent. Vigilant verifies *specs* (and,
this round, requires evidence for their terminal transitions) and scans changed
files for completeness markers; it does not know ASF's DoD exists, and by the
06j §7 boundary it must never learn what it contains. That boundary is correct
and must be preserved. It also means the DoD's enforcement has to be built
**ASF-side**, which is exactly where nobody has built it.

### The precedent that proves it can work

ASF already has a working enforcement story, and it is worth naming so the
proposals look like an extension of something proven rather than a new idea:
**P27's model gate**. Before P27, "the model is asserted, not assumed" was a
sentence. After P27 there is `lib/code-health/model.mjs`, a `/asf health model`
level, a fixture of the actual production incident, and 73 assertions. The rule
did not get stronger because it was rewritten; it got stronger because a
deterministic check was put under it. Every proposal below is that move, applied
to the fifteen rows that are still `S`.

---

## 5. What the Pi harness actually offers

From `docs/extensions.md` and `docs/security.md` (both read), plus the shipped
examples. This is the list of levers ASF currently pulls none of.

| lever | what it can do | enforcement power |
|---|---|---|
| `tool_call` | *"can mutate input or block execution"*; return `{ block: true, reason }` | **hard, pre-action** — the tool never runs |
| `tool_result` | handlers compose, each sees prior changes | post-hoc inspection/redaction |
| `user_bash` | intercept local bash; returning `operations`/`result` stops propagation; **a handler failure blocks the command rather than falling through** | **hard** for shell-side rules |
| `agent_before_settle` | *"the final actionable boundary: it can append entries and request one continuation"* | **hard, at completion** — can refuse to let the run end |
| `turn_end` | actionable; can chain entries and return `continue: true` | per-turn checkpoint |
| `agent_end` / `agent_settled` | `agent_settled` is *"final and notification-only"* | observe/report, **not** block |
| `before_agent_start` | prompt sections, `systemPromptOptions`, tool set, forced system prompt | shape what the model sees |
| `context` / `context_with_system` | transform transcript (system restored after) | inject reminders at the right moment |
| `message_end` | replace a finalised message preserving role | rewrite, use with care |
| `pi.registerTool()` | `execute()` throws → failed result; `isError: true` keeps data | make a rule a callable with a real verdict |
| `exposure: "hidden"` + `setActiveTools` | *"Re-register a tool with `exposure: "hidden"` to withdraw it, since tools cannot be unregistered"* | remove the ability entirely |
| `annotations` (`destructiveHint` etc.) | *"The hints are **not verified**, but a permission extension can use them"* | advisory input to a gate |
| `pi.appendEntry()` / `pi.sendMessage()` | durable non-context state / content sent to the model | evidence ledger vs nudge |

Two facts the proposals must respect:

- **None of this is on by default.** `docs/security.md`: *"Pi can read, change,
  and execute files with the permissions of the account that started it, and it
  **does not ask for approval before every tool call**"*, and *"Project trust
  does not limit what tool calls can access or affect."* The absence of
  enforcement is a design position, not an oversight — which means an ASF
  enforcement layer is a *choice with a cost*, and the cost is friction.
- **The continuation lever has a documented deadlock.** `pi-vigilant/index.ts`
  around `agent_settled` records a real production hang: waiting inside an
  `agent_settled` handler for the resumed run's own `agent_settled` blocks the
  handler from ever returning. Any ASF gate that demands another turn must be
  written against `agent_before_settle`/`agent_end` with vigilant's guard
  discipline (bounded continuations, epoch/run-id guards, no unconditional
  `continue: true`), not by inventing a fresh mechanism.

And the counter-example worth noting: `examples/extensions/claude-rules.ts` is
the *prose* pattern — list rule files in the system prompt, let the model read
them. `confirm-destructive.ts` is the *hook* pattern — `session_before_switch`
returns `{ cancel: true }`. Pi ships both; ASF has, so far, only ever written
the first kind.

---

## 6. What the enforcement literature says to do with them

Four sources, all read, and the transferable claim from each stated narrowly.

**VEPA — verified evolving formal policy for agent guardrails**
([arXiv:2610.12813](https://arxiv.org/html/2610.12813v1), Google Cloud AI
Research / Google DeepMind / UNC; full text read). Its framing is ASF's problem
exactly: *"Runtime guardrails should therefore make **inspectable, reproducible,
and deterministic allow-or-refuse decisions before potentially irreversible
agent actions** are executed."* It splits guardrails into **neural** (LLM
classifiers/monitors — *"non-deterministic and non-verifiable… can be ambiguous,
contradict themselves, and regress on risks they previously handled correctly"*)
and **formal** (executable symbolic rules over typed events — deterministic and
reproducible, but hand-written and frozen pre-deployment). Its design separates
**generation, verification and authority**, *"allowing LLMs to adapt the policy
without directly controlling enforcement"*: an LLM proposes rule patches, a
deterministic verifier admits only structurally valid, conflict-free candidates,
and an *evidence-aware authority layer* activates a verified rule only once it
has enough supporting evidence, revoking authority when later feedback
contradicts it.

> This is **P22, formalised.** ASF already decided, in prose, that the agent may
> *propose* changes to ASF's own rules but never *apply* them mid-run — changes
> go through the improvement review. VEPA is that policy as a mechanism: the LLM
> generates, something else verifies, and a third thing decides whether the rule
> has earned the right to block. ASF has generation and review; it has no
> authority layer, because almost no rule has enforcement to be given authority
> over.

**The AI Agent Code of Conduct — "Policy as Prompt"**
([arXiv:2509.23994](https://arxiv.org/html/2509.23994v1), full text read). Names
the **"policy-to-practice" gap**: *"a critical gap persists between high-level,
human-readable policies and the low-level, machine-enforceable rules required
for practical implementation."* Builds a policy tree from design artifacts
(VALINP / INVALINP / VALOUT / INVALOUT), verified by a separate judge LLM,
compiled into few-shot classifiers returning strict JSON → ALLOW / BLOCK / ALERT,
with human-in-the-loop approval. Cites CONSECA's argument that static policies
*"overrestrict or overallow"* and security must become *"just-in-time,
contextual"*. **And it supplies the cautionary number**: policy-tree extraction
detection recall is **53.3% (o1)**, 17.8%, 8.9%, 4.4% (Claude 3.5) across models
— when the *policy itself* is read out of prose by a model, most of it is
missed. That is §3's omission failure mode showing up in the guardrail pipeline,
and it is the strongest available argument for making ASF's rules structured
data first and prose second.

**Task Shield** ([arXiv:2412.16682](https://arxiv.org/abs/2412.16682), ACL 2025
long, pp. 29680–29697, PDF read). Reframes agent security *"from preventing
harmful actions to ensuring **task alignment**, requiring every agent action to
serve user objectives"*, and implements a test-time mechanism that *"systematically
verifies whether each instruction and tool call contributes to user-specified
goals"* — **ASR 2.07% while maintaining 69.79% utility** on GPT-4o / AgentDojo.
*Scope honestly:* its threat model is indirect prompt injection, not rule
compliance. The transferable part is the **position**: verification happens
per-action, before the action, against a goal the agent did not itself author.
That is a `tool_call` handler, and ASF has none.

**CaMeL — defeating prompt injections by design**
([arXiv:2503.18813](https://arxiv.org/abs/2503.18813), Google/DeepMind/ETH;
abstract read). *"Creates a protective system layer around the LLM… explicitly
extracts the control and data flows from the (trusted) query; therefore, the
untrusted data retrieved by the LLM can never impact the program flow… uses a
notion of a **capability** to prevent the exfiltration of private data over
unauthorized data flows by **enforcing security policies when tools are
called**."* **77% of tasks solved with provable security vs 84% undefended** on
AgentDojo. Two lessons: enforcement lives in the **system layer, not the
prompt**; and it is bought with a measurable utility tax (here ~7 points), which
is the honest price of a gate.

**AgentDojo** ([arXiv:2406.13352](https://arxiv.org/abs/2406.13352), abstract
read) — 97 tasks, 629 security test cases, and the sober baseline: *"state-of-the-art
LLMs fail at many tasks (even in the absence of attacks)."* Compliance is not
free even with no adversary present.

---

## 7. The three principles that follow

1. **A rule is enforced by the cheapest thing that can say no to it.** Prose is
   where a rule is *stated*; a deterministic check is where it is *enforced*.
   Where no check can exist, the honest label is "expectation", not "rule" — and
   the delivery report should say which is which. (ASF already half-knows this:
   06e's thresholds, 06j's scanner, vigilant's evidence requirement.)
2. **Verification belongs outside the thing being verified, and before the
   action.** Task Shield verifies per tool call; CaMeL enforces at the tool
   boundary; VEPA decides before irreversible actions. ASF's DoD currently
   verifies *after* the fact, *by* the actor, *in the actor's own prose*.
   `tool_call` and `agent_before_settle` are the two positions in the Pi harness
   that satisfy this.
3. **Generation, verification and authority are different jobs.** The agent may
   propose a rule; a deterministic verifier checks it; an evidence threshold
   decides whether it may block. This is P22 made mechanical, and it is also the
   answer to the objection that hard gates will be gamed: a gate's authority is
   earned by demonstrated precision, and can be revoked.

And one anti-principle, because the failure of guardrail projects is usually
over-enforcement: **every gate added must be paid for in utility.** CaMeL paid
~7 points on AgentDojo. A gate that blocks correct work is worse than no gate,
because it teaches everyone that gates are theatre — which is how 06e's
`gate.mode: warn` became the default people reach for.

---

## 8. Gap analysis

| Capability | ASF today | What the harness allows |
|---|---|---|
| Pre-action blocking | none (`tool_call` unused) | block any tool call with a reason |
| Completion gating on the DoD | none — agent asserts "done" in prose | `agent_before_settle` refuses + requests one bounded continuation |
| Evidence ledger | specs in vigilant; DoD evidence is prose in the delivery message | `pi.appendEntry()` — durable, outside model context, auditable |
| Rule representation | prose in markdown; counted by grep | structured rule registry, prose generated from it |
| Gate authority / rollback | `gate.mode: warn` set by hand | evidence-earned authority, revocation on false positives (VEPA) |
| Shell-side rules | prose ("no secrets in the repo") | `user_bash` interception |
| Ability withdrawal | n/a | `exposure: "hidden"`, `setActiveTools` |
| Enforcement honesty | checklist implies all 19 items are enforced | report which items are hard / mechanical / self-attested |
| Gate regression testing | 73 assertions on the model gate | same pattern, per gate, with negative controls |

---

## 9. Proposals (detail in improvement-proposals.md)

| ID | Title | Priority | Effort |
|---|---|---|---|
| P38 | Enforcement ledger: classify every rule H/M/S and publish it | high | S |
| P39 | Rule registry — rules as data, prose generated from it | high | M |
| P40 | `tool_call` gate: block the objectively blockable | high | M |
| P41 | Completion gate at `agent_before_settle`: no "done" without evidence | **critical** | M |
| P42 | Evidence ledger via `pi.appendEntry()` — claims become artefacts | high | M |
| P43 | Gate authority by evidence, with revocation (VEPA-style) | medium | M |
| P44 | Gate regression harness: every gate ships with a negative control | high | M |
| P45 | Enforcement budget: a gate that blocks correct work gets demoted | medium | S |

Deliberately **not** proposed (§10): a general policy engine, LLM-judged
compliance, blocking on heuristic rules, an ASF-side copy of vigilant's spec
gate, or any change to pi-vigilant.

---

## 10. Deliberately not proposed

- **No LLM-as-compliance-judge.** LIFBench's evaluator deliberately avoids
  LLM-assisted scoring; the Code of Conduct pipeline's own extraction recall is
  4–53%; §3's omission mode means a judging model can miss the rule it is
  judging. An LLM may *draft* a check; it does not get to *be* the check.
- **No general policy engine / DSL.** VEPA's framework is a research system with
  a deterministic verifier and an authority layer; ASF needs a handful of
  decisions, not a platform. P43 borrows the *authority* idea, not the
  architecture.
- **No blocking on heuristic rules.** Only rules with an objective signal get a
  `tool_call` block (P40). Everything heuristic stays a warning, per P27's
  no-over-enumeration rule: *"a gate that fires on a guess gets rationalised
  around or switched off, and either way the real rule dies."*
- **Nothing in `pi-vigilant`.** The 06j §7 boundary holds: the guard verifies
  completion generically and must work without ASF. Every mechanism here lives
  in `pi-aia-asf`, which is allowed to know what a DoD is.
- **No wholesale tool withdrawal.** `exposure: "hidden"` is powerful enough to
  break legitimate work; it stays out of scope until a specific rule demands it.
- **No unconditional continuation requests.** Vigilant's recorded `agent_settled`
  deadlock is the reason P41 must reuse the existing bounded-continuation
  discipline rather than invent one.

---

## 11. Verification plan

Each proposal is testable; the point of this batch is that the tests are of a
different kind than ASF's current doc-greps.

1. **The ledger is honest (P38)**: an assertion that every DoD item carries an
   `H`/`M`/`S` class, and a negative control — a rule declared `H` without a
   named enforcement site fails the build. This kills the drift where a rule
   quietly upgrades itself from checked to assumed.
2. **Registry ↔ prose agree (P39)**: every rule in the registry appears in its
   reference file and vice versa; a rule added to markdown without a registry
   entry fails. Negative control: prose-only rule ⇒ red.
3. **The block actually blocks (P40)**: for each blocking rule, a fixture that
   attempts the disallowed call and asserts the tool never executed, plus a
   near-miss fixture that must **pass** — the near-miss is the test that keeps a
   gate from eating correct work.
4. **No "done" without evidence (P41)**: a run that declares completion with an
   unmet MUST spec, a missing browser-evidence field, or a `scanned: 0` reported
   as pass is **refused settlement** and receives exactly one bounded
   continuation; a compliant run settles with zero extra turns (the utility
   control). Continuation count is capped and the cap is asserted.
5. **Evidence is an artefact, not a sentence (P42)**: a claim whose evidence
   entry is absent cannot be marked satisfied; tampering with the ledger is
   detectable.
6. **Authority is earned and revocable (P43)**: a gate seeded with false
   positives beyond budget is demoted to warn automatically in the fixture; a
   gate with clean precision regains blocking authority only after the evidence
   threshold.
7. **Gates regress (P44)**: every gate ships a fixture that must fail it and a
   control that must pass it — the 06j pattern (73 assertions) applied to the
   new gates, so a gate cannot rot into a no-op the way `scanned: 0` would.
8. **The budget is enforced (P45)**: a gate that blocks a fixture the harness
   considers correct is demoted in the same run, and the demotion is reported.
9. **The boundary holds**: `grep -rn "asf\|06[a-j]\|DoD" ../pi-vigilant` stays
   empty; vigilant's suite stays green with ASF uninstalled.
