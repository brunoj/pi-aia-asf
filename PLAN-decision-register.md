# ASF — Durable Decision Register (ADR subsystem)

Status: **proposal, awaiting Gate 5 approval.** Nothing below is implemented.
Author: ASF assistant · 2026-11-09

## Goal

Decisions ASF makes while working — architecture, boundaries, tooling, "state lives in one
JSONL per project", "never spawn via npx", "the gate's own config wins" — become a
**structured, versioned, human-editable record that ASF consults on every later run**, so
that actions taken much later are designed *against* the decision instead of re-deriving it.

## Problem (measured, not assumed)

| What exists | Where | Who consults it later |
|---|---|---|
| `## Decisions (ADRs — one per significant decision)` | `skills/aia-asf/SKILL.md:175`, template at `references/05-plan.md:23-38` | nobody |
| `PLAN.md` | repo root, one per task | Gate 5 approval (`lib/extension/commands/session.ts:68`) and the drift gate (`lib/gates/drift.mjs`), both **during that task only** |
| "move them to `docs/decisions/NNNN-<slug>.md`" | `references/05-plan.md:36` | **nothing** — that string appears exactly once in the repo, in the sentence that suggests it |

So ASF already advertises a decision directory that no code reads. The consequence is
visible in this project's own history: choices get re-litigated session after session
(tool resolution order was re-derived wrong once and shipped as 0.17.1; the health-gate
toolchain was re-decided three times), and a user who wants to overrule a decision has no
file to edit.

**Root cause.** A decision is written where only the *current task* reads it, in prose with
no identity, no status, no scope, and no link to the code it governs.

## Research — how this is usually done

* **Nygard 2011** (*Documenting Architecture Decisions*): one file per decision in the repo,
  title / context / decision / status / consequences; reversed decisions are **kept** and
  marked superseded — "the history is the point".
* **MADR 4.0.0** (2024-09-17, adr.github.io/madr): `docs/decisions/NNNN-title-with-dashes.md`,
  YAML front matter for `status`/`date`, sections `Context and Problem Statement`,
  `Considered Options`, `Decision Outcome` ("Chosen option X, because …"). Scientific
  basis: Kopp/Zdun/Reichl, *MADR: Format and Tool Support* (ZEUS 2018).
* **Y-statement** (Zdun et al., *Sustainable Architectural Decisions*): one-sentence
  decision form — "In the context of …, we chose … among alternatives … to achieve …".
* **Agent-specific practice** (Harbor, 2026-10-06; AsDecided, 2026-08-03):
  1. *An agent follows a decision only if it is in context while the code is written.*
     "Available is not in context" is named as failure mode #1, ahead of format.
  2. Decision in the **title and first sentence**; `status` in front matter (an agent will
     not reliably infer it from a bottom paragraph); **name the code it governs**
     (`Applies to: services/payments/webhooks/`) so it can be scoped later.
  3. **Index, don't import.** Vercel's agent evals (2026-01) report a compressed docs index
     in `AGENTS.md` at 100% pass while a skill holding the same material went uninvoked in
     56% of cases; `@`-importing a whole ADR directory loads every ADR into every session.
  4. Machine fields beyond MADR: `id`, `status`, `owners`, `scope`, affected capabilities,
     retrieval terms, `supersedes`, `enforcement`, `exceptions`, review dates — and
     *"when no objective check exists, say so"*; *"do not convert every ADR into a gate"*;
     record **what would reopen** the decision, not only what is true today.
  5. Staleness is failure mode #2: if a reversal is not written back into the old record,
     both look current, and (per Claude Code's own memory docs) a model facing two
     contradictory rules "may pick one arbitrarily".
* **CI practice for ADRs** (whychose ADR action, 2026-04): lint **four mechanical failure
  modes only** — structure (missing headings, empty sections, bad front matter), numbering
  (collisions, gaps), **supersession integrity (bidirectional)**, stale index. Nightly
  supersession check catches what a path filter misses. "CI is for things that are obviously
  wrong; judgement is a PR-review concern."
* **Spec-driven development** (Kiro `requirements.md` / `design.md` / `tasks.md`; GitHub
  Spec Kit; OpenSpec; Fowler 2025 on SDD): durable design rationale is kept *beside* the
  per-feature spec, not inside it. ASF already has the per-task "what" (pi-vigilant specs) —
  the durable "why/which option" is the missing third store.

## Design

### 1. The store — in the repo, plain Markdown, verbatim-editable

### 0. One home: `.asf/` — the directory that already exists

ASF already writes `.asf/config.json`. **Every** file ASF authors goes under that same
directory; no second ASF namespace is introduced.

```
.asf/
  config.json                 tracked   (unchanged location — already ASF's)
  decisions/                  tracked   NNNN-<slug>.md, one per decision
    INDEX.md                          generated index (never hand-edited)
  PLAN.md                     tracked   the current plan (root PLAN.md still read)
  .gitignore                  tracked   written by ASF: `state/`
  state/<projectKey>/         ignored   run state + evidence ledger
```

Two rules keep this honest:

* **Durable is tracked, telemetry is not.** `.asf/.gitignore` (written by ASF, committed)
  excludes `state/` only. Evidence is append-only and would otherwise leave every project
  permanently dirty — which would defeat the "tree is clean" precondition ASF requires before
  an irreversible action. Decisions and the plan are knowledge and belong in review.
* **Hidden must still be discoverable.** A dot-directory is invisible to a human browsing the
  repo, a documented ADR failure mode. So the index is generated, the run card names the path,
  and `AGENTS.md`/`README` get a one-line pointer when ASF first writes a register.

**Migration, never orphaning.** `.asf/config.json` keeps working (same file). A root `PLAN.md`
is still read — Gate 5 must not break mid-task. Machine-local state under
`~/.pi/agent/asf/state/<projectKey>/` is read as a fallback and **copied, not moved**, on first
use of the new location (the pi-vigilant legacy-store rule: copy, record where it came from,
never re-copy over newer data).

### 1. The store — in the repo, plain Markdown, verbatim-editable

`.asf/decisions/0007-retry-provider-webhooks-on-5xx-only.md` (config `decisions.dir` overrides
for a project that keeps MADR files in `docs/decisions/`). Git-tracked, reviewed with the code
that implements it, edited by the user with any editor — **there is no database and no cache
that could outrank the file**. The file *is* the record.

### 2. The format — Markdown body for humans, front matter for ASF

```markdown
---
id: ADR-0007
status: accepted            # proposed|accepted|superseded|deprecated|retired|rejected
title: Retry provider webhooks on 5xx and timeouts only
decided: 2026-11-09
applies_to: [services/payments/webhooks/**]   # what this governs (globs)
tags: [webhooks, retries, payments]           # retrieval terms
owners: [bruno]
supersedes: ADR-0012        # bidirectional, validated
review_by: 2027-05-01       # optional; overdue => reported
reopens_when: provider adds idempotency keys
enforced: false             # true only when `checks` exist and pass
checks: [test/test-webhook-retry.mjs]
specs: [spc-1794…]           # pi-vigilant specs this decision serves
plan: PLAN-egm-adoption.md
---

## Decision
Retry on 5xx and timeouts, never on 4xx. Max 3 attempts, exponential backoff, same
idempotency key on every attempt.

## Context
A 4xx means our request is wrong; retrying repeats a bad request during an outage.

## Options considered
- **Retry all failures** — rejected: amplifies outages, double-charges on non-idempotent 4xx.
- **No retries** — rejected: transient 5xx from the provider are routine and self-healing.

## Consequences
Consumers must be idempotent on the provider event id (ADR-0009 covers the ledger writer).

## Reopens when
The provider ships native idempotency keys, or retries exceed 1% of request budget.
```

* **`## Decision` first, rule in the first sentence** — an agent skimming an index sees the
  rule, not a topic. `Options considered` needs ≥2 real options (ASF's existing rule:
  *"a decision with only one option is not a decision"*, `05-plan.md:37`).
* **Front matter is parsed by ASF's own minimal parser** (flat scalars, inline arrays, block
  lists — ~60 lines + tests). No YAML dependency: a project's parser must not change what
  ASF's gate reads, exactly as the health gate writes its own eslint config and runs
  `--no-config-lookup`. Unsupported syntax is **reported, never silently misread** (precedent:
  a broken config file is reported, never treated as "no config").

### 3. Getting the decision into context — the part that actually fails

| Layer | What it costs | Mechanism |
|---|---|---|
| **Index at run open** | bounded, ~1 line per active decision | generated `.asf/decisions/INDEX.md` + a compact index injected with the run card: `ADR-0007 accepted — Retry provider webhooks on 5xx only (services/payments/webhooks/**)`. Superseded rows show `[superseded by ADR-0017]`. Own ceiling in `lib/skill-budget.mjs` (proposed 1,024 B, ≤20 rows, active-only), build fails on breach |
| **Path-scoped steer** | zero until relevant | a `tool_call` about to edit a file matching an accepted decision's `applies_to`, which this run has not read ⇒ steer once: *"ADR-0007 governs `services/payments/webhooks/retry.ts`: retry on 5xx and timeouts only. Read `decisions/0007-….md` before changing this file."* |
| **Plan-time consultation** | one read | Phase 3/5 must consult the register before proposing an approach and cite `ADR-NNNN` in `.asf/PLAN.md`; a plan that contradicts an accepted decision without superseding it is a finding |
| **Query tool** | on demand | `asf_decisions { action: list \| get \| match, path?, query? }` |

The card itself stays at its 1,536-byte ceiling; the index is a separate budgeted injection,
and only decisions whose `applies_to` intersect files this run touched may appear on the card
(cap 2 lines).

### 4a. Who may set `status: accepted` (Gate 5: the agent — when sufficiently instructed)

Unattended operation forbids a human promotion step, and a rubber stamp is worthless, so
`accepted` is granted by **evidence, not permission**. A record may be `accepted` only with one
of:

| Source | Meaning |
|---|---|
| `from_spec: spc-…` | a spec that exists in the project's spec store (pi-vigilant) |
| `user_instructed: "<verbatim quote>"` | the user's own words, non-empty |
| `plan: .asf/PLAN.md` + Gate 5 recorded approved | an approved plan *is* sufficient instruction |
| `origin: backfill` + `source: [...]` | recovered from the project's own artifacts, with evidence |

`accepted` with none of the four is a **finding** (blocking on `decisions/**`); anything else
stays `proposed`. `proposed` records appear in the index marked as such and are never enforced
and never gate a run — only `accepted` decisions steer. More than 3 agent-authored `accepted`
decisions in one run is reported as noise. The user's override is plain git: edit or delete the
file, history preserved.

### 4b. Lifecycle and adaptation

* `proposed → accepted → superseded|deprecated|retired`, `rejected` for never-adopted options.
  Distinct statuses stop a reversed idea being resurrected by semantic similarity.
* **Supersession is bidirectional and validated** (old → new *and* new → old), the failure
  mode CI exists for.
* `review_by` overdue, or `applies_to` paths that no longer exist ⇒ **reported, not blocking**
  (like health findings): *"ADR-0012 governs `lib/legacy/`, which no longer exists."*
* `reopens_when` is the adaptation hook: when a run's work satisfies it, ASF raises a
  *closable* gap — "ADR-0007's reopen condition is now met; supersede it or record why not".

### 5. Gates — opt-in, honest about what is enforcement

| Check | Blocking? | Why |
|---|---|---|
| `decisions:check` — schema, required headings, empty sections, duplicate ids, numbering collisions/gaps, supersession integrity, unknown status, unparseable front matter | yes, on `decisions/**` changes | mechanical, agent-closable |
| **Cite-or-record at settle** — a run that changed files under an accepted decision's scope must cite the decision (evidence/plan/progress) or record a new/superseding one | yes | the only check that makes the register load-bearing; closable in one tool call either way |
| `enforced: true` requires `checks` that exist and pass | yes | reuses the `obligations.d` P44 discipline (declaration ↔ test agree) and "scanned: 0 is never a pass" |
| `accepted` with no instruction source (spec / quote / approved plan / backfill evidence) | yes, on `decisions/**` | stops self-accepted decisions that exist only to satisfy a gate |
| Two accepted decisions with overlapping `applies_to` and no supersession relation | **no** — reported | semantic conflict is a human call; ASF must not pretend to resolve it |
| Overdue review / governed path deleted | **no** — reported | staleness is information, not a stop |

`decisions.enabled` (default on for large work, off for small) and per-project config, so
small fixes never pay for the ceremony.

### 6. What a decision file must never be able to do

The user edits these files verbatim, and ASF feeds them to an agent — so they are an
**instruction injection surface** and are treated as such:

1. A decision constrains **what is built**. It can never relax ASF's own gates, the stop
   policy, or the irreversibility floor. The loader ignores unknown keys; prose that reads
   like a bypass ("skip the suite", "ignore the gate", "publish anyway") is flagged as a
   finding for the human, never obeyed.
2. **Nothing in a decision file is executed.** `checks` names test files ASF runs through its
   own suite runner, nothing more — no hooks, no shell, no `command` field. (This is the
   single most important line in the design.)
3. The register is repo-trusted, exactly like `AGENTS.md`/`CLAUDE.md` today; that boundary is
   stated in the docs rather than implied.

### 7. Boundaries with the stores ASF already has

| Store | Question it answers | Lifetime |
|---|---|---|
| **Specs** (pi-vigilant, shared project key) | what the deliverable must have, verifiably | per task |
| **Decisions** (new) | which option was chosen, what was rejected, what follows, when it reopens | durable, cross-task |
| **PLAN.md** | how this task will be executed | per task; on completion its significant decisions are **promoted** into the register — the plan is the draft, the register is the record |
| **`obligations.d`** | what ASF declares it enforces | ASF's own, verified against tests |
| **Evidence ledger** | what actually happened | append-only per run |

### 8. Anti-cargo-cult

`## Options considered` needs ≥2 real options; the index line must be a **rule, not a topic**
("Retry webhooks on 5xx only", not "Webhooks" — MADR/Harbor both: titles are the retrieval
surface); more than 3 new ADRs in one run is reported as noise; a decision whose `decision`
line merely restates its `title` is a finding.

### 9. Backwards compatibility — the register writes itself

A project with no register must not have to be migrated by hand, and a project that already
keeps ADRs must not be told it has none. So the register **bootstraps itself from what is
already there**, at the first opportunity.

**When.** At run open ASF looks for the configured directory. If absent (and the run is not
`small`), the card's next step becomes the backfill — one bounded, completable action, never
a blocking gap: *"No decision register. Backfill it now: `asf_decisions {action: bootstrap}`,
then continue."* It runs **once per project** (a marker in the run state plus the directory's
existence), so it can never loop.

**What it reads.** Everything the project already says about itself:

| Source | Recovered as |
|---|---|
| `decisions/`, `docs/decisions/`, `docs/adr/`, `doc/arch/`, `adr/` in any dialect (MADR, Nygard, eADR, inline `**Status:**`) | **adopted**, not rewritten — fields mapped, ids assigned, gaps reported |
| `PLAN*.md` `## Decisions` sections | decisions with real options already written |
| `README.md` architecture/stack sections, `docs/` | technology and boundary decisions |
| `package.json` / manifests + lockfile | dependency choices — only when the code shows the alternative was rejected (e.g. an explicit comment, a removed dep in git history) |
| `git log` reverts, `CHANGELOG.md` reversals | the *supersession* history |
| Code that encodes a rule (a guard, a resolver order, a rejection) + its comment | the decision the code implies — `applies_to` from the file itself |
| pi-vigilant specs, `obligations.d` | `specs:` links and which decisions are enforced |

**Honesty rules — the part that decides whether this is trusted at all.**

1. **Provenance is mandatory.** Every recovered record carries `origin: backfill` and
   `source:` entries pointing at the file, line or commit it came from. A record with no
   evidence is not written.
2. **Recovered records are `proposed`, never `accepted`.** They inform the agent and appear
   in the index; they do not gate until a human promotes them (`/asf decisions review` walks
   them in one sitting). A model will happily record a guess as a decision — so a guess is
   allowed to exist, but not to block.
3. **No invented rationale.** If the alternatives cannot be recovered, the record says
   `options: not documented (recovered)` rather than manufacturing strawmen; ASF's own rule
   stands — a decision with one option is not a decision, so it is skipped, not padded.
4. **Non-destructive and idempotent.** Existing files are never modified or overwritten;
   a second backfill writes nothing new; adoption of a foreign dialect adds front matter to
   *copies* only when the user asks, otherwise the dialect is read as-is via config.
5. **Bounded.** Top ~10 by significance (governed-path breadth, how often the area is touched,
   whether a guard depends on it), not 200 trivia records; the rest are reported as candidates.

**Dogfood.** ASF's own register is produced this way: the standing decisions this project has
re-litigated — project identity by git root, tools resolved ASF-first by absolute path, the
gate's own config wins, publish floor = completion floor, no stops, waiting is not a
disposition — are recovered from this repo's code and comments with their provenance, and
ASF's first release of the feature ships them.

## Adversarial review

| Attack / accident | Mitigation | Proof |
|---|---|---|
| Register grows until it is context pollution | index-only injection, own byte ceiling, active-only, cap 20 rows | budget test fails the build |
| Agent ignores it anyway (the real risk) | path-scoped steer + cite-or-record at settle + plan-time citation | test: editing a governed file without reading ⇒ steer; settling without citing ⇒ gap |
| Two records contradict, agent picks arbitrarily | bidirectional supersession validation; overlap heuristic reported | fixture with one-sided supersession fails `decisions:check` |
| User hand-edits break the schema | reported with file+line, never read as "no decisions" | fixture with malformed front matter ⇒ reported, decisions still counted |
| User edits a decision to disable a gate | unknown keys ignored; bypass prose flagged; nothing executed | test: `status: accepted` + "ignore the completion gate" ⇒ finding raised, gate still blocks |
| Agent writes trivia to satisfy the gate | ≥2 options, rule-not-topic, >3/run reported | test: 4th ADR in one run ⇒ reported |
| Gate theatre (`enforced: true`, no real check) | `checks` must exist and pass; P44 discipline | test: `enforced: true` with missing/empty check ⇒ fail |
| Decision outlives its code | governed-path existence check, `review_by` | test: delete governed dir ⇒ reported, not blocking |
| Parallel threads claim the same number | numbers assigned at write from max+1; collision is a reported finding (ASF worktrees make CI-style rebase advice useless) | test: two threads write 0007 ⇒ numbering finding |
| Another tool's ADR dialect (eADR, `**Status:**` inline) | `decisions.dir` + `decisions.status_key`/`decision_heading` config; validation reports unknown shapes rather than skipping | test: MADR-native file validates without config |
| Backfill hallucinates decisions the project never made | `origin: backfill` + mandatory `source:` evidence; `proposed` never gates; no fabricated options | test: a record without provenance is refused; a recovered record cannot be `accepted` |
| Backfill stomps a hand-written register | never writes over an existing file; second run is a no-op | test: fixture with a human file + backfill ⇒ file byte-identical, no duplicate id |
| Backfill runs on every session and burns context/tokens | once-per-project marker + directory existence; skipped for `small` runs | test: second bootstrap writes nothing |
| Backfill buries the project in trivia | significance ranking, cap ~10, remainder reported as candidates | test: 30-candidate fixture writes ≤10 |
| Foreign-dialect adoption silently mis-reads a file | unknown shapes are reported, never skipped as "no decisions" | test: eADR fixture yields mapped fields + a report line |
| Agent self-accepts trivia to satisfy the cite-or-record gate | `accepted` needs spec/quote/approved-plan/backfill evidence; >3 per run reported | test: `accepted` with no source ⇒ finding; 4th accepted ADR in one run ⇒ reported |
| A backfilled decision steers the project somewhere it never chose | `origin: backfill` + mandatory `source:`; supersede works from run one; user overrides in git | test: recovered record cites a real file/commit; superseding it keeps the old record |
| Register needs a human before the run can finish (breaks unattended) | no gate waits on a person; `proposed` never blocks; backfill accepts immediately; once-per-project trigger | test: clean checkout + one spec ⇒ run closes, register written, nothing parked |
| `.asf/state/` leaves the tree permanently dirty and blocks irreversible actions | `.asf/.gitignore` excludes `state/` only; durable files stay tracked | test: after a run, `git status --porcelain` is empty while `.asf/decisions/` is tracked |

## Milestones

* **M1 — one home + store + parser**: `.asf/` consolidation (`decisions/`, `PLAN.md`,
  `state/`, `.gitignore`) with legacy fallbacks and copy-not-move migration;
  `lib/decisions/{schema,parse,store,paths}.mjs`; `decisions:check`. Exit: unit tests incl.
  malformed, unknown-key, one-sided-supersession, duplicate-id, numbering, legacy-config and
  legacy-state fixtures; a mid-flight run still finds its state.
* **M2 — discovery**: index generation + budgeted injection with the run card; `asf_decisions`
  tool; path-scoped read-before-edit steer. Exit: `test-decisions.mjs` + active-process
  section driving real `tool_call`s; mutation tests for each guard.
* **M3 — completion coupling**: cite-or-record gap in `decideSettlement` (agent-closable, so
  it can never become the 2026-11-07 kind of loop); plan-time consultation in Phase 3/5.
* **M4 — lifecycle**: supersede flow (`asf_decisions {action: supersede}`), staleness reports,
  `reopens_when` gap, promotion from the plan at completion, and the **acceptance evidence
  rules** of §4a.
* **M5 — backfill (the backwards-compatibility requirement)**: `asf_decisions
  {action: bootstrap}`, the once-per-run trigger from the card, the source scanners, dialect
  adoption, provenance + `origin: backfill`, the significance cap, idempotency.
  Exit: fixtures for empty project / MADR project / eADR project / human-written project;
  second bootstrap writes nothing; a record without `source:` is refused.
* **M6 — docs + dogfood**: `references/05-plan.md` rewritten to point at the register (its
  current `docs/decisions/` sentence becomes true), `06c`/`06i` lines, and **ASF's own
  register produced by its own backfill** — the standing decisions this project has
  re-litigated (project key by git root; tools resolved ASF-first by absolute path; the gate's
  own config wins; publish floor = completion floor; no stops; waiting is not a disposition).

## Definition of done

`decisions:check` clean on ASF's own register, **which was produced by the backfill, not
hand-written**; a clean checkout of a project with no register gets a populated one on its
first ASF run without being asked; every guard mutation-tested; `test-decisions.mjs`
green; active-process steers proven with real `pi -p`; full suite + typecheck + health gate +
docs audit green; always-read budget still inside 76,000 B; released via `npm run release` and
dogfooded on the next ASF feature.

## Approved (Gate 5, 2026-11-09)

1. **One home**: `.asf/` — the directory ASF already uses for config. Every ASF-authored file
   lives there (`config.json`, `decisions/`, `PLAN.md`, `state/`); no new namespace. Legacy
   `.asf/config.json`, root `PLAN.md` and machine-local state stay readable and migrate.
2. **Acceptance**: the agent may set `accepted`, but only against sufficient instruction — a
   spec id, the user's verbatim words, an approved plan, or backfill evidence. Without one of
   those it is `proposed` and is never enforced.
3. **Strictness**: path-scoped read-before-edit steer on for large runs; cite-or-record at
   settle blocks.
4. **Scope**: per git repo — decisions version with the code they govern.
5. **Unattended**: backfilled decisions are `accepted` immediately; **after receiving a
   specification ASF must be able to run to completion with no human in the loop** — no gate,
   backfill or lifecycle rule may park on a person.
