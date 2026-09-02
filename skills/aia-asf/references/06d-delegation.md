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

### Interaction with ASF gates

Delegation changes **who does the work**, never **what must be proven**:

- Specs, traceability, and the `/asf verify` gate remain the **parent's** responsibility. A subagent cannot discharge a spec.
- The QA standard (06b) applies to delegated work identically. "A subagent did it" is not evidence.
- Subagent findings enter the record as **claims** until verified against code or tests.
- For LARGE work, the approval gate is unaffected: no subagent may start implementation before plan approval.
