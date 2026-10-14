# Model Blindness — what the ASF cannot see, and what solid engineering does about it

Research behind **P27 (Model Gate)**. Triggered by a production incident in a
client project: an admin toggled one checkbox off on a checklist template and
saved. The endpoint rebuilt the template by deleting its steps and questions,
`org_action_items.question_id` carried `ON DELETE CASCADE`, and the generated
action items of **every organisation** went with them. No usable production
backup existed; recovery replayed saved answers through the app's generators
(46 → 327 items) and silently lost all completion state.

The user's framing, which governs this document:

> this is just initially poor engineering that ASF should not have allowed in
> the first place.

and

> not the symptom management you started with first, but preventing bad design
> that can lead to this.

So this document is **not** about backups, dry-runs or rollback. It is about
why our gate set let the design through, and what other designs are currently
passing for the same reason.

---

## Part 1 — Deliverable 1: the blind-spot inventory

### Method

I enumerated every rule and section heading in the normative references
(`SKILL.md` + `references/01…07`, 06a–06i) and classified what each one
*inspects*. That is the honest way to find blind spots: you cannot audit for a
dimension you never named.

What the ASF inspects today, by dimension:

| Dimension | Where |
|---|---|
| Packaging / artifact integrity, clean-room | 06b R1, R5 |
| Observable behaviour, end state, operator outcome | 06b R2, R12, R13, R14 |
| Silent failure, error reading | 06b R3, R4 |
| Regression, triggers **and** non-triggers | 06b R6, R7 |
| State machines / deadlock | 06b R8 |
| Browser verification of touched surfaces | 06b R9 |
| DoD gate, honest reporting | 06b R10, R11, R17 |
| Bounded waits, timeouts | 06b R15 |
| Determinism / flakiness | 06b R16, 06g §2 |
| Escaped-defect loop, test selection | 06b R18, R19 |
| Modules, depth, SSOT, config, complexity, boundaries | 06c R1–R7, R8, R9 |
| Code smells (5 groups) | 06c P09 |
| Delegation, independent review | 06d |
| Objective metrics (complexity, lines, duplication, cycles, deps, secrets) | 06e |
| Outbound-call resilience, error design, observability | 06f |
| Risk-based test derivation | 06g §1 |
| Threat model, ASVS, supply chain, agent tool surfaces | 06h |
| Completeness: no stubs, no fabricated data | 06i |
| Isolation, commits, drift, evidence-over-claims | 06-implementation |
| Release policy | 07 |
| Intake, research, ADRs, quality attributes, ATAM-lite, traceability | 01, 02, 04, 05 |

**Every one of these is code-shaped or behaviour-shaped.** There is no
dimension in the entire gate set that inspects a *model* — the set of
assumptions about what entities exist, who owns them, what must always be true
of them, and what may happen to them.

### The 14 classes currently invisible

Each is a class of defect that (a) is common in practice, (b) passes every
existing ASF gate, and (c) is not covered even partially. The incident is one
instance of class 1.

**1. Ownership and lifecycle across entity boundaries.** *The incident.* Who
creates this row, who may delete it, and does it survive its parent? No gate
asks. A `CASCADE` from a business fact to a configuration row is invisible to
every metric we own.

**2. Identity and uniqueness.** What makes two rows *the same thing*? In the
incident, recovery had to dedupe restored items by `org + title` — a business
identity rule that lived nowhere except in a human's head and, belatedly, in a
recovery script. A unique constraint would have made it a fact the database
enforced. Nothing in ASF asks the identity question, so nothing notices when
the answer is unenforced.

**3. Concurrency on shared state.** Lost updates (two writers read the same
row, second write silently discards the first), check-then-act, read-modify-write
across HTTP requests. 06f governs *outbound* calls — timeouts, retries,
circuit breakers — and says nothing about *inbound* concurrent writers. It is
worse than silent: 06f tells you to retry retryable operations, which invites
repeated execution of an operation nobody checked was safe to repeat
concurrently.

**4. Object- and tenant-level authorization.** 06h is threat-model and ASVS
shaped: input validation, secrets, supply chain, agent tool surfaces. It has no
*authorization matrix* — who may act on **which row**. This is the #1 API
vulnerability class (OWASP API1, BOLA/IDOR) and it is structurally invisible to
a test suite with one user and one tenant. The incident report shows the
"non-admin denied" test written *after* the incident.

**5. Time and clock semantics.** Timezones, DST, naive vs aware timestamps,
"today" in which zone, date arithmetic, wall clock vs monotonic. 06g requires an
injected clock — for *determinism*, which is test hygiene — and has no rule
about time *semantics*. A bug that only fires in the hour after a DST change
passes every gate we have.

**6. Numeric and unit semantics.** Money as float; rounding strategy and *where*
it is applied; currency or unit carried in a field that does not mention it;
percent vs fraction; integer division; summing values in mixed units. (This
session I nearly reported a disk figure computed by `du -sh | awk` — summing
`K`, `M` and `G` strings as numbers. Class 6 is not hypothetical; it is
something agents do to themselves.)

**7. Locale and text domain.** The affected product is Dutch. Hardcoded strings,
date and number formats, collation and sort order, plural rules, encoding,
field-length limits, accents and emoji. The entire stack has zero i18n
awareness — no rule, no test dimension, no anti-pattern.

**8. Scale cliffs.** Correct at 10 rows, fatal or wrong at 100 000: unbounded
loads, N+1, in-memory joins, missing index, `count(*)` on a hot path. Nothing
requires you to *state the expected data volume* and test near it. 06f's
"bounded result sets" covers responses from other people's services, not your
own queries.

**9. Unit-of-work and partial-failure boundaries.** What happens when step 3 of
5 fails? Is the operation atomic, and is that claim true? Side effects (email,
webhook, queue publish) issued inside a database transaction that then rolls
back. 06f is per-call resilience; it has no concept of a transaction boundary.

**10. Contract evolution.** A payload or shared-type change that breaks an
existing consumer; client and server drifting; no N-1 compatibility thinking
about what runs simultaneously in production. P20 flags "contract changes
without migration notes" as a *process* violation, which is not the same as a
design discipline.

**11. Deletion semantics as a subsystem.** The incident is one instance of a
wider class: destructive lifecycle operations are simply under-designed. Soft
vs hard delete, restore as a real operation rather than a timestamp flip,
retention and purge, uniqueness against tombstones, GDPR erasure versus audit
retention, deletion as an event downstream systems learn about.

**12. Environment divergence.** Passes in dev, breaks in prod because config,
secrets, flags or data shape differ. 06c Rule 3 (config drives behaviour) is
adjacent but does not require any test to see production-shaped configuration
or production-shaped data.

**13. Silent-zero / plausible-empty.** A filter that matches nothing — missing
tenant context, wrong date, a forgotten tombstone predicate — returns success
with no rows. Rule 3 probes silent *failures*; this is the opposite animal: a
result that looks legitimate. Postgres RLS, when misconfigured, "silently
returns zero rows instead of failing loudly" and the debugging advice is to
think to check a session variable. Nothing in our stack treats a wrong-but-
plausible empty result as a defect class.

**14. Cross-session and shared-resource interference.** Several agents on one
machine sharing processes, ports, databases, queues and temp directories. We
were bitten twice in one session: a host-wide `pkill -f` nearly destroyed a
peer application's live orchestrator, and two apps shared one Redis instance
differing only by `db` index. 06d's rule ("never run parallel subagents against
the same file") is far narrower than the actual hazard surface.

### The meta-blind spot (the actual finding)

Strip the classes apart and one pattern remains:

> **Every gate we own asserts the intended effect. Not one asserts the
> non-effect.**

`Rule 2` asserts the observable end state you wanted. `Rule 12` asserts the
operator-facing outcome. `Rule 14` asserts the feature works through the real
entry point. Our own suites contain 300+ assertions and not one of them says
*"nothing else changed."*

That is precisely why the incident's test suite was green. The template saved
correctly. The response was 200. The end state of the thing under test was
exactly as specified. Only `org_action_items` — a table the test never
populated and never inspected — went from 327 rows to 46.

A gate set that verifies only intended effects cannot see a model defect,
because a model defect *is* an unintended effect on something outside the
specification.

---

## Part 2 — Deliverable 2: what established engineering practice does

Findings below are grouped by the mechanism they suggest, not by source.

### 2.1 Aggregates: the model question was formalised decades ago

Vernon's *IDDD* ("Red Book") gives four aggregate design rules, quoted via the
ArchiLab summary of ch. 10:

1. **Model true invariants in consistency boundaries.** An invariant is a rule
   that must *always* hold; a properly designed aggregate "can be modified in
   any way required by the business with its invariants completely consistent
   within a single transaction" — hence *one aggregate per transaction*.
2. **Design small aggregates.** Large aggregates are named an anti-pattern, and
   the cause is diagnostic: "the false invariants and a desire for compositional
   convenience drove the design". Also: "Don't let the `0..*` fool you; the
   number of associations will almost never be zero and will keep growing."
3. **Reference other aggregates by identity, not object reference.** "If you
   don't hold any reference, you can't modify another Aggregate. So the
   temptation to modify multiple Aggregates in the same transaction could be
   squelched by avoiding the situation in the first place."
4. **Use eventual consistency outside the aggregate boundary.**

The mapping to the incident is exact. `org_action_items` held a direct FK
reference into `checklist_questions` — an object reference across an ownership
boundary (Rule 3) — and the template-save transaction modified both the template
aggregate and the instance aggregate in one commit (Rule 1). The invariant that
was never modelled is the one whose absence caused the loss: *an organisation's
action item survives edits to the template that generated it.*

Two further points from the same source matter for how we adopt this:

- These are **Architecture Principles, not absolute rules** — defaults you may
  deviate from *with a documented reason*, and the source explicitly recommends
  **ADRs** for the deviation. That is the mechanism I want (declare, or fail),
  and it is independently recommended.
- Rule 2's diagnosis — *compositional convenience* — names the motive that
  produces rebuild-by-delete. It is not ignorance; it is the shortest code path.
  A rule that only says "don't" loses to convenience. A rule that makes the
  cheap path the safe path wins.

### 2.2 Cascade semantics are a decision, and "nobody decided" is the failure mode

The strongest single sentence found, from a soft-delete design guide:

> **Cascade semantics need design:** deleting a parent while children stay live
> creates orphans-by-policy; decide per relationship (cascade tombstones, block
> deletion until empty, or detach-and-keep) **before production decides for you
> via confusing bugs.**

That is our incident, written by someone else, in 2026. It also enumerates the
complete option set that the affected team had not considered: cascade, block,
or **detach-and-keep** — and detach-and-keep is precisely the fix they shipped
(detach actions, delete the template, reattach by `question_number`).

Rails' option matrix shows the industry already has this vocabulary and we
borrowed none of it: `dependent: :destroy`, `:delete_all`, `:nullify`,
`:restrict_with_exception`, `:restrict_with_error`, `:destroy_async`. The
existence of **`restrict_*`** is the important part — the safe default is *refuse
the deletion while children exist*, not *take them too*.

The same guide's decision table is directly reusable as an ASF classification:

| Entity class | Undo expected? | Retention? | Verdict |
|---|---|---|---|
| Documents / projects | yes | sometimes | soft delete + purge schedule |
| Users / accounts | rarely, but compliance | yes (GDPR tension) | anonymise + tombstone stub |
| Transactions / payments | **no — correctness forbids** | absolutely | **hard delete forbidden**; void/adjust |
| Cache-like ephemera | nobody cares | no | hard delete immediately |

And its uniqueness section validates the *mechanism* I propose, in its own
words: inventorying every business rule when adopting tombstones matters because
"the exercise's value is **forcing per-rule decisions rather than providing one
answer**." A required declaration is valuable even when the answer is
"CASCADE is right here", because the alternative is that nobody was asked.

### 2.3 Push enforcement down to a layer that cannot forget

Three independent sources converge on one principle: **layering beats
vigilance.**

- On tenancy: "you're trusting every code path to correctly apply a filter that
  is invisible to the database… There's no compiler error for *you forgot
  WHERE tenant_id*." Fix: Postgres row-level security, or schema-per-tenant —
  "humans forget filters under deadline pressure; RLS policies forget nothing."
- On constraints: database-level enforcement is "the only reliable guarantee of
  data quality across heterogeneous access paths", because a caller with direct
  table access bypasses the application but not the schema. Oracle's own
  guidance: "whenever possible, enforce business rules with constraints."
- On soft deletes: repository filter → database view → RLS policy → scheduled
  consistency audits ("queries that SHOULD return zero").

The corollary for our gate design: **a rule enforced only in application code is
a claim, not a guarantee** — and the same is true of a rule enforced only in
prose in a skill file. Both need a mechanical counterpart. It also gives us a
cheap, objective test type we do not have: **queries that must return zero rows**
(invariants as SQL assertions, run in the suite).

One honest caveat from the tenancy source, which we should pass on rather than
hide: RLS "is invisible until it isn't" — a wrong policy returns zero rows
silently, and connection poolers reset session variables between transactions.
Enforcement-in-the-database is not free, and *class 13 (silent-zero)* is the
price of the strongest version of it. The mitigation the source gives is worth
adopting verbatim as a rule: **instrument the boundary itself** — log when the
context is missing, alert on the pattern, "turn a silent failure mode into a
noisy one."

### 2.4 Authorization is tested with two users, mechanically

The OWASP IDOR cheat sheet reduces the class to three ingredients — an object, a
reference to it, and a **missing object-level authorization check** — and gives a
methodology that is objective enough to gate on:

1. Create User A and User B.
2. Create objects owned by each.
3. Authenticate as A, attempt to read/update/delete/export B's objects by
   manipulating the reference.
4. Verify denial "regardless of whether the object identifier is predictable or
   unguessable", **for every operation** including administrative ones.

Its fix is a shape, not a suggestion: scope the lookup to what the caller may
see (`@current_user.projects.find(params[:id])`, not `Project.find(params[:id])`).
And the trap worth naming for agents: **a UUID is not authorization** — complex
identifiers are defence-in-depth, and access control is still required.

### 2.5 Design rules become real only as fitness functions

From *Building Evolutionary Architectures* (Ford, Parsons, Kua, Sadalage), via
InfoQ: a fitness function is "any mechanism that provides an **objective**
integrity assessment of some architectural characteristic". Three points from it
are load-bearing for this proposal:

- **Objectivity is the requirement, and opinion disqualifies a check.**
  "'readability' is probably not a good fitness function: *your code does not
  look readable to me*." Good ones are numeric: "we have 17 violations within
  our tolerable range of 20", "two unwanted dependencies between modules".
- They run **as unit tests** (ArchUnit being the reference tool), so they join
  the ordinary suite and give fast feedback — governance "shifted left" into the
  build rather than an inspection weeks later.
- "You can't inspect (architectural) fitness into a frail system, it must be
  built into it."

Our `06e` Code Health Gate **already is a fitness-function harness** — levels,
thresholds, baseline, ratchet, `gate.mode`, pluggable modules (P17 added supply
chain and secrets that way). It simply has no model-level fitness functions.
That is where the design gate belongs, and it means the hard gate needs no new
architecture — only a new module.

The objectivity requirement also disciplines *which* model rules may gate.
"Is this ownership correct?" is not objective and must stay prose + review.
"Does this file contain `ON DELETE CASCADE` and no ownership declaration?" is
objective and may gate. That line decides the split between 06j (judgment) and
06e (measurement).

### 2.6 Migration *design* has a discipline, and it is not about backups

Expand-contract (a.k.a. parallel change, N-1 compatibility) rests on a mental
model worth adopting wholesale:

> **The database is shared mutable state between every running copy of your
> application.** … every schema change creates a backward-compatibility window.
> The question is how long that window is and what's in it.

Phases: expand (backward-compatible) → deploy code → backfill → cutover →
contract. The named anti-patterns are design rules, not operational advice:
one-step "atomic" migrations during a deploy; renaming a column directly;
dropping a column the day after you stopped reading it; `NOT NULL DEFAULT` on a
large table; adding an FK without `NOT VALID` then `VALIDATE`; `CREATE INDEX`
without `CONCURRENTLY`; and **editing an applied migration** — history is
append-only.

Note that this is *prevention*, not symptom management: it constrains how the
change is designed, and it exists to make the change safe by construction.

### 2.7 Property-based and invariant testing

Property-based testing (Hypothesis, fast-check) checks general behavioural rules
across generated inputs rather than examples, and metamorphic testing attacks the
**test oracle problem** — cases where you cannot state the correct output but
*can* state a relation that must hold. The relation "the set of unrelated rows is
identical before and after" is exactly a metamorphic property, and it is
available to us without a property-based framework: snapshot the row counts of
every table the change does not name, assert equality.

*Honest note on sourcing:* my search for established practice on asserting
non-effects returned statistics literature on "testing for no effect" in
regression analysis (permutation and equivalence testing). That is a different
discipline and I am not citing it as support. The practice above is my
extrapolation from metamorphic testing and from the "queries that should return
zero" pattern in §2.3, not a claim that a canonical source prescribes it.

### 2.8 Restore is an operation, not a timestamp

From the same deletion guide: "undelete isn't flipping a timestamp when cascades
fired, unique keys were reused, or downstream systems reacted to the deletion
event — treat restore as an operation with checks." And the retrospective from a
team that learned it the expensive way after losing a customer workspace to an
integration bug: **"we paid for the trash folder twice — once building it, once
not having it."**

The test-suite prescription from that guide is the most concrete artifact found
and is adopted nearly directly: filtered-query tests across *every* repository
path; constraint tests (recreate a live duplicate must fail, recreate against a
tombstone must succeed); **cascade tests verifying parent deletion produces
exactly the designed child behaviour**; restore tests against realistic
fixtures; purge tests with an advanced clock; event tests for downstream
consumers. And its reason for running them on every migration touching flagged
tables: "deletion code paths attract drive-by regressions because they're
everyone's dependency and no one's feature."

---

## Part 3 — What this implies for the ASF and vigilant

| # | Change | Mechanism | Hard or soft |
|---|---|---|---|
| 1 | `06j-data-model.md` — ownership classes, required ownership declaration, model rules | normative reference, judgment | soft (raises probability) |
| 2 | `06e` `model` level — two objective fitness functions over persistence code, store-agnostic, built into the existing harness | code, gates the build | **hard** (a tripwire, not an authority) |
| 3 | `06g` §3 — invariant and non-effect tests (survival, non-effects, zero-row invariants, two-user authorization) | normative test doctrine | soft, but enforced by Rule 20 checkbox |
| 4 | `06b` Rule 20 + DoD checkbox + `/asf verify` checklist item | gate + mechanically emitted prompt | **hard** (checkbox cannot be green without evidence) |
| 5 | `04-adversarial` data & model lens | review questions | soft |
| 6 | `05-plan.md` data-model & ownership section | the artifact the gate reads | soft, load-bearing for 2 |
| 7 | vigilant `completeness` — `model` category, precise cascade-without-declaration pattern | runtime call-out on the session diff | semi-hard (fails open, notifies) |

The pairing rule from the earlier discussion holds and is applied here: **every
soft rule gets a hard counterpart, or it does not count as a gate.** Items 1, 5
and 6 are only credible because 2 and 4 exist to catch the case where the agent
talks its way past them — which, from this session's own record of me
rationalising around prose rules three times, is not a hypothetical.

Two deliberate exclusions, to keep the mandate honest:

- **No pattern catalogue.** The scanner recognises a small illustrative set of
  cascade spellings across relational, ORM-mapped and document forms, and a
  project adds its own dialect with `model.extraCascadePatterns`. The gate is the
  obligation — *a cascade requires a declaration* — not the size of the
  recogniser. A list of stores, ORMs and helper-function names would imply a
  coverage nobody can maintain, in a factory that builds any kind of software.
- **No heuristics posing as rules.** An earlier draft of the scanner added
  "cascade into a table that has an owner column" and "a named recursive-delete
  helper". Both were dropped: the first infers ownership from a column name, the
  second from a function name. A gate that fires on a guess gets rationalised
  around or switched off, and either way the real rule dies with it. Ownership is
  judgment (06j prose + review); what gates is the absence of a declaration.
- **No backup/restore/rollback machinery.** Out of scope by the user's
  instruction; it is symptom management.
- **No `tool_call` blocker on destructive commands.** That was my first
  proposal, and the user's redirect was correct: blocking `DROP TABLE` at the
  tool boundary treats an agent-caused hazard while leaving the human-caused
  trigger (a checkbox on an admin page) entirely unaddressed. Deferred, and not
  part of P27.

### Where the blind-spot inventory goes

Classes 1, 2, 3, 4, 11 and 13 are addressed by P27 (they are model-shaped and
mechanically checkable). Classes 5–10 and 12, 14 are **recorded, not silently
dropped**: they are real gaps, they are individually too large to fold into this
change, and naming them in the normative text as *known-uninspected* is itself
worth something — an agent that knows the dimension exists can at least be
prompted about it. They are logged as P28 candidates in
[review-decisions.md](review-decisions.md) rather than left in this file.
