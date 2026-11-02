# Delegation: Intercom & Subagents

ASF work does not have to happen in one session, in one context window, or one task at a time. Two delegation mechanisms are available. They solve different problems and must not be confused.

| | **Intercom** | **Subagents** |
|---|---|---|
| What it is | Messaging between *live pi sessions* | Spawning a *fresh, isolated pi process* |
| Peer | A human-driven or long-running session with its own context and history | A stateless worker that exits when done |
| You get back | A conversation (peer can push back, ask, disagree) | One result |
| Use when | Another session owns the context/decision | You want the OUTCOME, not the trace |
| Cost | Cheap (a message) | A whole context window + model spend |

---

## Part 1 — Intercom: passing messages to other sessions

> **Optional capability.** `pi-intercom` is **not** a dependency of ASF — ASF
> works fully without it. The `intercom` tool is available only when the user
> has installed it (`pi install npm:pi-intercom`). When it is present, use it
> as described below; when it is absent, fall back to asking the user or
> working in one session.

Other pi sessions on this machine are often working on directly relevant things: the same monorepo, an adjacent service, the package you depend on. **Use intercom to talk to them directly instead of guessing, duplicating their work, or routing everything through the user.**

### When to use intercom

- **Another session owns the context.** They have the repo loaded, the failure reproduced, the domain knowledge. Ask them rather than re-deriving it.
- **Your change affects their work.** You changed a shared interface, published a version, moved a file they depend on. Tell them.
- **You need independent verification.** A second session reproducing your result is stronger evidence than your own re-run (see 06b Rule 11).
- **Cross-project coordination.** Your package is their dependency; sequencing matters.
- **You found something they need to know.** A bug in shared code, a broken assumption, a security issue.

### How

```
intercom({ action: "list" })                                  // who is live
intercom({ action: "send", to: "<name-or-id>", message: "…" }) // fire-and-forget
intercom({ action: "ask",  to: "<name-or-id>", message: "…" }) // wait for a reply
```

Target by session name, full ID, or the short id in parentheses from `list`. Use `cwd` to scope to a directory when two sessions share a name.

### Rules

1. **`list` before you send.** Don't message a session that isn't live.
2. **Say what you want back.** "Please verify X and reply with the result" beats "FYI X."
3. **Give them what they need to act** — file paths, repro commands, exact error text. Assume zero shared context.
4. **`ask` blocks; `send` doesn't.** Use `ask` only when you genuinely need the answer before continuing.
5. **Hand over your weak points, not just your conclusions.** If you want a peer to verify, tell them what you did *not* test and what you'd most like broken. A peer who only receives conclusions will rubber-stamp them.
6. **Their findings are evidence, not proof.** An independent reproduction is strong; an unverified claim from a peer is still a claim (06b Rule 12, and M5: the log is a claim, the code is the evidence).
7. **Don't leak the user's private context** across projects without reason.

---

## Part 2 — Subagents: delegating for the outcome

A subagent is a **fresh `pi` process with its own context window**. It takes a task, works independently, returns a result, and exits. The parent context never sees its intermediate tool calls — only the answer.

> **Core principle: subagents are context isolation, not role-play.** The point is to keep 5,000 lines of grep/read output out of the parent context, not to create "personas."

### When to spawn a subagent

Spawn when **the outcome matters more than the trace**:

- **Scoped codebase research.** "Which module owns retry logic, and what's its interface?" The search noise is worthless once the answer exists. *Signal: gathering the answer means reading many files.*
- **Independent small changes with NO MUTUAL DEPENDENCIES.** Three unrelated files each needing the same mechanical fix — run them in parallel.
- **Fresh-perspective review.** A reviewer that never saw your reasoning catches what familiarity hides. Especially valuable for challenging an approved design (06-implementation M4).
- **Bounded, noisy verification.** Running a long test matrix and reporting just the failures.

**Rule of thumb:** if the task needs exploring many files, or there are 3+ genuinely independent pieces of work, delegate.

### When NOT to spawn a subagent

- **Sequential/dependent work.** If step 2 needs step 1's full output, one context is cleaner than a relay.
- **Anything touching the same file.** See the hard evidence below.
- **Small tasks.** Delegation overhead exceeds the benefit. Just do it.
- **Work needing judgment you'd have to fully specify anyway.** If writing the task description costs more than doing the work, do the work.
- **The core implementation of a gated (LARGE) change.** You own the specs and the traceability. Delegate research and isolated fixes around it, not the spec-carrying work itself.
- **Nested delegation.** A subagent must not spawn subagents. Keep the tree one level deep.

### ⚠️ The no-mutual-dependencies rule is not advisory — it is enforced by physics

**Verified experimentally.** Four subagents were told to each change a different key in the *same* file, reading it and writing the complete file back:

```
before: { a: 1, b: 2, c: 3, d: 4 }   → 4 agents, one key each
after:  { a: 1, b: 2, c: 3, d: 99 }  → 1 of 4 edits survived
```

**Three edits were silently lost.** Every agent reported success. Every process exited 0. There was no error, no conflict marker, no warning — just a file that quietly lost 75% of the intended work.

Concurrent agents each read a snapshot and write back a whole file; last writer wins. Therefore:

- **Never run parallel subagents against the same file.** Partition by file, and state the partition in each task.
- If two tasks *might* touch the same file, they are dependent — **run them sequentially or do them yourself**.
- Independence must be verified before spawning, not assumed. If you cannot name the disjoint file set, you do not have independence.

### ⚠️ Exit code 0 does NOT mean the task succeeded

**Verified:** a subagent asked to read a non-existent file explained the problem conversationally and **exited 0**.

Never treat process exit status as the success signal. **Validate the returned output against what you asked for.** If a subagent was supposed to change code, verify the code changed — read the file, run the test. This is the delegation-shaped instance of M5: *the report is a claim; the code is the evidence.*

### How to spawn

There is **no built-in subagent tool in pi** — this is deliberate ("no sub-agents" is a stated design choice; you compose it yourself). Two supported routes:

**1. Direct subprocess (always available, zero install):**

```bash
pi -p "<task>" --no-extensions --no-skills -t read,grep,find,ls
```

Run several in the background and `wait` for them to parallelize.

**2. A subagent extension** (e.g. the `subagent/` example shipped with pi, or a package providing agent orchestration) — gives streaming output, parallel/chain modes, and usage tracking. Prefer this when available; fall back to `pi -p`.

### Rules for spawning

1. **Restrict tools to the job.** Research agents get read-only (`-t read,grep,find,ls`). Never hand write access to a task that only needs to look.
2. **Use `--no-extensions --no-skills` for research.** Faster, cheaper, and it prevents a subagent from writing to shared state (specs, feedback) that belongs to the parent task.
3. **Specify the output format.** "Return: file path, function name, and the 3-line interface — nothing else." Unspecified output returns an essay.
4. **Bounded, stateless, single-responsibility.** A subagent that needs prior conversation is the wrong tool.
5. **Partition writes by file** and say so explicitly in every parallel task.
6. **Verify the result yourself** (see exit-code warning). For code changes: read the file or run the test.
7. **Cap the fan-out.** A handful of parallel agents, not dozens; each costs a full context window.
8. **One level deep.** No nesting.

### The worker brief — every delegated task gets one

A vague brief makes workers duplicate each other and invent what they were not told. Six
lines, filled in, before anything is spawned:

```markdown
Objective:   <the one thing that must be true when you finish>
File partition:   <the ONLY files you may touch — nothing else>
Interfaces needed:   <what you may call, with signatures>
Interfaces provided: <what you expose, exactly — others code against this>
Output format:   <the shape of the returned result, verbatim>
Done when:       <the checks that must pass before you report — its own tests, not the full suite>
Boundaries:   read-only unless stated; no new dependencies; no scope creep;
        report blockers instead of guessing around them
```

**The file partition is not a courtesy.** Two workers that might touch the same file are
by definition dependent and must not run in parallel — tested, 4 concurrent writers left 1
of 4 edits, silently, all exiting 0. If you cannot name the partition, you do not have
independent work.

### Serial or parallel — decide with numbers, not enthusiasm

**`parallel.enabled` is off by default (P47)** — single-agent is the default, and staying
off is the safe reading: a wrong "yes" costs both time and tokens. The switch is config,
not a dependency (ASF works with no orchestration plugin installed), and `ASF_PARALLEL=1`
enables exactly one run and does not persist.

Parallelism buys wall-clock and costs tokens (multi-agent runs are measured in multiples
of a single-agent run, and coding parallelises worse than research). Before fanning out,
decompose the work in the plan's work-package table (`05-plan.md`) and run the estimator:

```bash
node lib/parallel-estimate.mjs   # or import { estimateParallelism } from 'lib/parallel-estimate.mjs'
```

It returns `verdict: "parallel" | "serial"`, the serial cost, the critical path, the
speed-up the concurrency cap actually yields, the conflicts, and **the reasons either
way**. Parallel requires all three of: no file conflict, no unowned shared interface, at
least 3 fully independent packages, and a speed-up of at least 1.3×. Otherwise it says
serial and tells you why — and a refusal is recorded in the plan rather than silently
omitted, so "we didn't parallelise" is a decision someone can read.

**Shared interfaces count as conflicts.** Disjoint files are not independence: A changes
a signature, B calls the old one, the merge is clean and the build is broken. A package
must declare what it provides and what it needs; an interface neither owns is a dependency.

### The join is one lane, and the suite runs after the rebase

```bash
node -e "import('./lib/parallel-estimate.mjs').then(m=>console.log(m.planJoin({branches:['bmx/a','bmx/b']})))"
```

Per branch, in order, **one at a time**: rebase onto the updated main → run the **full**
suite in the rebased state → fast-forward only if every check passed. Forbidden: an LLM
resolving a merge conflict (it drops peer changes or leaves markers in), merging without
the full suite in the rebased state, two joins in flight. Conflicts are for a human who
can see both intents.

### Interaction with ASF gates

Delegation changes **who does the work**, never **what must be proven**:

- Specs, traceability, and the `/asf verify` gate remain the **parent's** responsibility. A subagent cannot discharge a spec.
- The QA standard (06b) applies to delegated work identically. "A subagent did it" is not evidence.
- Subagent findings enter the record as **claims** until verified against code or tests.
- For LARGE work, the approval gate is unaffected: no subagent may start implementation before plan approval.

### A delegated verification prompt states its measurement contract (P31)

When the thing being delegated is a **verification** — "check that this meets the
performance target" — the prompt must carry the contract, or the subagent will
return a number and a verdict that mean nothing. A verifier handed `is p95 under
2s?` will answer yes or no, and neither answer is evidence.

Every delegated performance-verification prompt states:

```
Claim under test : <metric> <comparison> <value>
Percentile       : p50 / p95 / p99 (which one, and why)
Load             : <concurrency or arrival rate>, <closed-loop | open-loop>
Samples          : <n per arm>, warmups <n>
Environment      : <machine/CI/cores>, load average at run time
Lab or field     : <synthetic harness | observed production traffic>
Method           : <statistical test>, alpha <α>, effect-size threshold
Order            : interleaved, randomized
```

If any of those is missing from the **spec**, do not invent it: report the claim
as incomplete (06b Rule 21) and ask, or state the assumption you are making in
the prompt itself. A subagent that silently invents a load level has produced a
measurement of nothing.

And apply the same rule to the subagent's **answer**: a returned number without
its contract is a claim, not a result. `"p95 was 180ms"` is not a pass; `"p95 was
180ms at 200 concurrent users, open-loop, 30 samples per arm, interleaved, CI
4 cores, load average 0.4, Mann–Whitney p=0.31, ratio 1.02 → no regression"` is.

A verifier that examined nothing reports `scanned: 0` and that is **not a pass**
— a subagent returning "no issues found" having run no scenario is the most
expensive kind of green.

---

## Part 3 — Independent reviewer gate (P19, large work)

Before delivery of **large** work, run an **independent review**: a second
agent with fresh context, no exposure to your reasoning, asked to attack the
result. It is the strongest anti-rubber-stamp check available (Part 2:
fresh-perspective review) and it reuses the subagent machinery above.

### How

Spawn a subagent (Part 2, direct subprocess or extension) with a read-only
tool set and this adversarial prompt shape:

```
You are a hostile reviewer of a delivered change. Review ONLY the diff and
its tests. Classify every finding as:
- BLOCKER: the change is wrong, breaks existing behavior, or violates a
  stated spec/gate — must be fixed before delivery.
- SUGGESTION: improvement that does not block delivery.
- QUESTION: something you cannot determine from the diff.
Return: findings list, nothing else. Do not fix anything.
```

Give it: the diff (or the files changed), the spec list, and the test
results. Nothing else — no narrative, no context, no "here's what I did".

### Triage (autonomous — human only on genuine conflicts)

- **BLOCKER that is safe to fix** (a wrong value, a missing test, a broken
  gate) → **fix it yourself**, add a regression test, re-run the suite. No
  user checkpoint.
- **SUGGESTION that is safe and clearly better** → apply it. If it is a
  taste call, note it and move on.
- **QUESTION / ambiguous finding** → investigate; if it resolves, resolve it.
- **Escalate to the user ONLY on genuine conflicts** — conflicting
  requirements, product-level tradeoffs, scope conflicts, or a finding that
  contradicts an approved decision. State the conflict plainly and propose a
  resolution; never silently pick a side.

### Rules

1. **Fresh context is the point** — the reviewer must not have seen your
   reasoning; do not pre-answer its questions.
2. **Read-only tools** — the reviewer never edits; it reports, you fix.
3. **Its findings are claims** — verify each blocker against the code/test
   before acting (M5). A reviewer can be wrong too.
4. **Record it** — the review + triage outcome goes in the delivery report
   (06b Rule 17): what was found, what was fixed, what was escalated.
5. **Small work: none.** The reviewer gate is large-work only; small work
   relies on the standard gates (06b DoD).
6. **A reviewer that did not run is `not run`** — timeout, crash or empty output
   gets one retry, then `not run`, in the status table. It is never counted as a
   reviewer that found nothing, because "no findings" and "nobody looked" are
   different results and the delivery report must tell them apart.
7. **Citations must resolve before a report is accepted** — every `file:lines` a
   reviewer cites is checked for existence and range. A report that cites what it
   did not read is `not run`, not a pass (04-adversarial: cite or abstain).
8. **A/B duplication only at the blocker boundary** (`review.abForBlockers`) —
   two instances of one lens when blockers were addressed and the cost of a missed
   blocker is real. Anywhere else it is refused.
