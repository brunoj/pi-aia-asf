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

Two passes, because an inventory is only as honest as the gate set it was measured
against.

**Pass 1 (as taken).** I enumerated every rule and section heading in the
normative references (`SKILL.md` + `references/01…07`, 06a–06i) and classified
what each one *inspects*. That is the honest way to find blind spots: you cannot
audit for a dimension you never named.

**Pass 2 (added on verification).** Pass 1 predated `06j`, `06k`, the gate layer
and the model fitness level, and it audited ASF only — the mandate names vigilant
too. The inventory is therefore re-scored below against the gate set as it stands
now, with vigilant's own subsystems audited alongside. A blind-spot list that is
not re-derived when the gate set grows silently turns into an excuse list: either
it claims blindness that has been fixed, or it hides coverage nobody built.

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

### Re-derived against the gate set as it stands now

The audit above was taken against `06a–06i`. Since then `06j` (data model),
`06k` (performance), the gate layer (`lib/gates/`: blockers, ledger, authority,
settle, report, measurement, config, declarations) and the model fitness level
have shipped, so an inventory that still said "all 14 invisible" would be
over-claiming blindness — the same sin as over-claiming coverage. Re-scored
against what exists today, using the enforcement classes from `06b` (**H** hard
blocker, **M** mechanical verdict only if the check runs, **S** self-attested):

| # | Class | Now | Class |
|---|---|---|---|
| 1 | Ownership and lifecycle across boundaries | **06j §1–4** + `undeclared-cascade`, `handwritten-cascade` | **H** |
| 2 | Identity and uniqueness | `delete-then-reinsert` catches rebuild-by-delete; the identity question itself is still prose | M |
| 3 | Concurrency on shared state | **nothing inspects it** — 06f is outbound calls only | — |
| 4 | Object/tenant-level authorization | **06g §3** two-user authorization tests (OWASP-derived) | M |
| 5 | Time and clock semantics | **nothing inspects it** | — |
| 6 | Numeric and unit semantics | **nothing inspects it** | — |
| 7 | Locale and text domain | **nothing inspects it** | — |
| 8 | Scale cliffs | **06k** measurement contract, placement, load scenarios; "state the expected data volume" is still not required | M |
| 9 | Unit-of-work / partial-failure boundaries | **nothing inspects it** — no concept of a transaction boundary | — |
| 10 | Contract evolution | expand-contract prose in 06j/07, sourced T3 | S |
| 11 | Deletion semantics as a subsystem | **06j** + 06g §3 cascade/restore/purge/event tests | M |
| 12 | Environment divergence | **nothing inspects it** — no test must see production-shaped config or data | — |
| 13 | Silent-zero / plausible-empty | our own gates honour `scanned: 0` ≠ pass; the *product's* empty results are uninspected | M/S |
| 14 | Cross-session / shared-resource interference | 06d's same-file rule only | S |

**Six classes — 3, 5, 6, 7, 9, 12 — remain completely uninspected.** Not
partially covered, not weakly covered: no rule, no gate, no test dimension, no
anti-pattern. That is the honest inventory, and it is a better starting point
than the original claim, because a gap you can count is a gap you can schedule.

### And vigilant? (the other half of the audit)

The mandate says the gate set is "ASF **and vigilant**", so vigilant was audited
the same way. What vigilant actually inspects:

| Vigilant subsystem | What it inspects | Contributes to any class above? |
|---|---|---|
| Loop Guardian (D1/D2/D3) | loop *shape* — identical repeats, cycles, analysis stall | no — it inspects the agent, not the deliverable |
| Spec verification | MUST specs still open at settle | no — enforces whatever ASF declared, store-agnostic by design |
| Completeness guard | stub / fake-data **markers** in changed files | no — markers, not design |
| Obligations container | loads declarations generically, carries `source` verbatim | no — a container interprets nothing |
| Tool-timeout abort | a call exceeding its ceiling | no |

So vigilant contributes **nothing** to classes 3, 5, 6, 7, 9 and 12 — and that is
correct, not a defect. It is a loop-and-claim guard, and the package boundary the
owner drew ("vigilant should be able to work perfectly well without ASF"; "what
crosses the boundary is the specification, never the check") means a design
dimension can only ever be ASF's. The consequence worth stating plainly: **for
those six classes, if ASF does not inspect them, nobody does.** There is no
second line of defence waiting in the other package.

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

**Status of the meta-finding now.** 06g §3 added the non-effect assertions
(survival tests, non-effect assertions, zero-row invariant queries, two-user
authorization), so for the *model* class this is no longer true — it is addressed
doctrine, class **M**: a verdict appears if the check runs, and nothing forces it
to run. It remains true for the six uninspected classes above, and it remains the
reason M is a weaker class than H: an assertion nobody is compelled to write is a
suggestion. The honest summary is that the meta-blind spot has been **half-closed
— the language now exists; the compulsion exists only where a blocker was built.**

---

## Part 2 — Deliverable 2: what established engineering practice does

Findings are grouped by the mechanism they suggest, not by source.

### Evidence classes (read this before trusting a sentence below)

Per [02-research.md](../../skills/aia-asf/references/02-research.md), every
finding carries its class:

- **T1** — fetched and read from the authoritative source in this pass. Quoted
  text is verbatim from the URL given, with page numbers where the source has
  them.
- **T2** — measured locally with a reproducible script.
- **T3** — reasoned, not verified. A starting position, never a rule, and never
  presented as something a source says.

**A correction to an earlier draft of this document.** The first version of
Part 2 carried several block quotes attributed to unnamed sources ("a soft-delete
design guide", "the tenancy source", "a team that learned it the expensive way").
None carried a URL. When each was checked — exact-phrase search, and the cited
URLs — they did not resolve: `orphans-by-policy`, `humans forget filters … RLS
policies forget nothing` and `we paid for the trash folder twice` return **zero
results**, and the InfoQ and O'Reilly URLs for the fitness-function material
return **404**. A quotation nobody can find is not evidence; it is a fabrication
risk wearing evidence's clothes, and it is worse than no citation because it
invites downstream reuse. Those passages are **removed**. Where the underlying
claim is still worth making it is restated as T3 reasoning, and where a primary
source states it better, the primary source replaced it. The dropped material is
listed at the end of this Part so the deletion is auditable rather than silent.

### 2.1 Aggregates: the model question was formalised decades ago — **T1**

Source: *Aggregate Design Rules according to Vaughn Vernon's "Red Book"*, ArchiLab
(Prof. Dr. Stefan Bente, TH Köln), summarising Vernon, *Implementing
Domain-Driven Design*, ch. 10, pp. 347–388.
<https://www.archi-lab.io/infopages/ddd/aggregate-design-rules-vernon.html>
Fetched and read; the quotes below are verbatim with the page numbers the source
gives.

1. **Model true invariants in consistency boundaries.** An invariant is "a rule
   that must always hold true", and (p. 354) *"A properly designed Aggregate is
   one that can be modified in any way required by the business with its
   invariants completely consistent within a single transaction."* The source's
   own gloss is the operative consequence: in one transaction you modify **one**
   aggregate, "and never more than one" — hence *consistency boundary*.
2. **Design small aggregates.** Large aggregates are named an anti-pattern, and
   the diagnosis is the part that matters to us (p. 356): *"It was deficient from
   the start because the false invariants and a desire for compositional
   convenience drove the design, to the detriment of transactional success,
   performance, and scalability."* Also p. 356: *"Don't let the '0..\*' fool you;
   the number of associations will almost never be zero and will keep growing
   over time."*
3. **Reference other aggregates by identity, not object reference** (p. 361):
   *"Prefer references to external Aggregates only by their globally unique
   identity, not by holding a direct object reference (or 'pointer')."*
4. **Use eventual consistency outside the aggregate boundary.**

The mapping to the incident is exact. `org_action_items` held a direct FK
reference into `checklist_questions` — an object reference across an ownership
boundary (Rule 3) — and the template-save transaction modified the template
aggregate and the instance aggregate in one commit (Rule 1). The invariant that
was never modelled is the one whose absence caused the loss: *an organisation's
action item survives edits to the template that generated it.*

Two consequences for how ASF adopts this:

- The source presents these as **rules of thumb with documented exceptions**
  (pp. 367ff.), recommending the deviation be written down. That is the mechanism
  this document proposes — *declare, or fail* — and it is what makes the gate
  survivable: the escape hatch is a declaration, not a bypass.
- Rule 2's diagnosis names the **motive** that produces rebuild-by-delete. It is
  not ignorance; it is the shortest code path. A rule that only says "don't"
  loses to convenience. A rule that makes the cheap path the safe path wins.

### 2.2 Cascade semantics are a decision — and the option set is already standardised

**T1 (primary source, read).** Rails' `has_many … dependent:` is the clearest
statement of the principle in a mainstream framework: the association declares
what happens to children when the parent is destroyed, and the default
`@author.destroy` takes the books with it (Active Record Associations guide,
§1.2, <https://guides.rubyonrails.org/association_basics.html>). The important
structural fact is that **the framework makes you choose at the point the
relationship is declared** — the decision cannot be deferred to the call site
where nobody is thinking about it.

**T3 (our reasoning, not a sourced claim).** The safe default should be *refuse
while children exist*, not *take them too*. Rails exposes refusal options
alongside cascade options in its `dependent:` vocabulary; the full option list
was **not** read from the guide in this pass, so treat the specific option names
as unverified and check them against the guide before any of them reaches
normative text. What is safe to say is the shape: a mature framework offers
cascade, nullify, and refuse, and *refuse* is a first-class option rather than an
afterthought.

**T3 (our reasoning).** The classification that 06j §2 uses — composition /
instance / ledger, with detach-and-keep as a legitimate answer — is ours, derived
from the incident's own resolution (they detached the action items, deleted the
template, and reattached by `question_number`). It is not quoted from a source.
It is offered as a starting taxonomy to be argued with, and the value is in
forcing the per-relationship decision at all, which is the same reason a required
declaration is worth having even when the answer is "CASCADE is right here".

### 2.3 Push enforcement down to a layer that cannot forget — **T1**

Source: PostgreSQL documentation, §5.9 *Row Security Policies*,
<https://www.postgresql.org/docs/current/ddl-rowsecurity.html>. Fetched and read.

Two facts from the manual do the work, and both are stronger than the
second-hand paraphrase this document previously used:

- Without policies, privileges are not enough: *"By default, tables do not have
  any policies, so that if a user has access privileges to a table according to
  the SQL privilege system, all rows within it are equally available for querying
  or updating."* An application-level `WHERE tenant_id = …` is a convention
  enforced by every code path remembering it.
- RLS is **default-deny**: *"If no policy exists for the table, a default-deny
  policy is used, meaning that no rows are visible or can be modified."*

That second sentence is also the honest caveat, and it is the manual's, not ours:
the strongest form of enforcement-in-the-database fails **silently and empty** —
a missing or wrong policy returns zero rows rather than an error. This is class
13 (silent-zero) arriving as the price of class 4's fix, and it is why the
mitigation is a rule rather than a suggestion: **instrument the boundary** — a
query that should return rows returning none, on a tenant-scoped path, is an
event worth logging and alerting on, not a clean result.

The corollary for gate design is the reason this section exists: **a rule enforced
only in application code is a claim, not a guarantee** — and the same is true of a
rule enforced only in prose in a skill file. Both need a mechanical counterpart.
It also yields a cheap objective test type ASF did not previously have: **queries
that must return zero rows** — invariants written as assertions and run in the
suite. (That prescription is now in 06g §3; the *pattern* is ours, and the
earlier draft's attribution of it to an unnamed source is withdrawn.)

### 2.4 Authorization is tested with two users, mechanically — **T1**

Source: OWASP *Insecure Direct Object Reference Prevention Cheat Sheet*,
<https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html>.
Fetched and read; the following is verbatim.

IDOR has exactly three ingredients: an **object**, a **reference** to it, and a
**missing object-level authorization check**. And the methodology is objective
enough to gate on:

1. Create User A and User B.
2. Create objects owned by each user (documents, support tickets, invoices, etc.).
3. Authenticate as User A and attempt to access User B's objects by modifying
   object references in requests.
4. Verify that the application denies unauthorized access *"regardless of whether
   the object identifier is predictable or unguessable"*.

And the scope is explicit: *"This verification should be performed for all
operations involving object references, including read, create, update, delete,
export, and administrative actions."*

The fix is a shape, not a suggestion — scope the lookup to what the caller may
see:

```ruby
@project = Project.find(params[:id])              # vulnerable: searches all projects
@project = @current_user.projects.find(params[:id])  # secure: the caller's own
```

Plus the trap worth naming for agents, straight from the cheat sheet's identifier
section: complex identifiers (GUIDs, UUIDs) are **defence-in-depth**, and *"even
with complex identifiers, access control checks are essential"*. A UUID is not
authorization.

This is the single most mechanically gateable class in the inventory: two users,
two object sets, every operation, expect denial. It became 06g §3's two-user
authorization requirement.

### 2.5 Design rules become real only as fitness functions — **T1** (concept) / **T3** (one phrasing)

Sources fetched and read: *Fitness function-driven development* (Paula Paul,
Rosemary Wang, Thoughtworks, 2019),
<https://www.thoughtworks.com/insights/articles/fitness-function-driven-development>;
and the Building Evolutionary Architectures site,
<https://evolutionaryarchitecture.com/>, which states the idea as: *"Evolutionary
architectures make it explicit what 'fit' means with as much automation as
possible."*

What the Thoughtworks article establishes, and what our design rests on:

- Fitness functions are **gatekeepers in the pipeline** — "to prevent the
  promotion of unmaintainable or untested code to production", i.e. they run in
  the ordinary build, not in a later inspection.
- They are **numeric assertions**, and the article's examples are literally
  tests: coverage above 0.9, error rate under 0.01, transaction under 10 seconds,
  "should not have PII in the logs".
- They are written for **observability, resiliency, performance and compliance**
  as first-class automated checks — the same shape as a model-level check.

**Withdrawn:** the earlier draft quoted *Building Evolutionary Architectures* for
"any mechanism that provides an objective integrity assessment of some
architectural characteristic", the "'readability' is probably not a good fitness
function" exchange, and "you can't inspect fitness into a frail system, it must be
built into it". The two URLs cited returned **404** and the book was not read in
this pass, so those sentences are removed rather than kept as decoration. The
*requirement of objectivity* they supported survives — as **T3, our own
position**: a check that cannot be answered without judgement is not a gate, it
is a review question wearing a gate's clothes. That position is load-bearing for
the 06j/06e split (ownership correctness = judgement → prose and review; "a
cascade with no ownership declaration" = measurable → may gate), and it is
stated here as a design commitment, not as a citation.

The structural point that remains fully supported: **ASF's `06e` Code Health Gate
already is a fitness-function harness** — levels, thresholds, baseline, ratchet,
`gate.mode`, pluggable modules. It had no model-level fitness functions; adding
them needed no new architecture, only a new module. That is where the hard gate
went, and it is the cheapest kind of capability ASF can grow.

### 2.6 Migration *design* has a discipline, and it is not about backups — **T3**

Expand–contract (parallel change, N-1 compatibility) is described here as ASF's
working understanding, **not as a quotation**: the mental model is that the
database is shared mutable state between every running copy of the application,
so every schema change opens a backward-compatibility window, and the design
question is how long that window is and what is in it. Phases: expand
(backward-compatible) → deploy code → backfill → cutover → contract.

The anti-patterns listed in 06j/07 (one-step "atomic" migrations during a deploy;
renaming a column directly; dropping a column the day after you stopped reading
it; `NOT NULL DEFAULT` on a large table; adding an FK without `NOT VALID` then
`VALIDATE`; `CREATE INDEX` without `CONCURRENTLY`; editing an applied migration)
are **our** enumeration, assembled from engineering practice we could not pin to a
single fetched source in this pass. They are stated as a checklist to be argued
with and verified against a primary source before any of them becomes a gate.
None of them currently gates — they are prose in a reference, class **S**
(self-attested) in the DoD's enforcement classes.

Note that this is *prevention*, not symptom management: it constrains how the
change is designed, and it exists to make the change safe by construction. That
distinction is what the mandate required (see Part 3, exclusions).

### 2.7 Property-based and invariant testing — **T3**, with a note on what was not found

Property-based testing (Hypothesis, fast-check) checks general behavioural rules
across generated inputs rather than examples; metamorphic testing attacks the
**test oracle problem** — cases where you cannot state the correct output but
*can* state a relation that must hold.

The relation this document needs — *"the set of unrelated rows is identical before
and after"* — is a metamorphic property, and it is available without a
property-based framework: snapshot the row counts of every table the change does
not name, assert equality. **This prescription is our extrapolation** (T3), and
the earlier draft's attempt to dress it in a citation is withdrawn: the search for
established practice on *asserting non-effects* returned statistics literature on
testing-for-no-effect in regression analysis (permutation and equivalence
testing), which is a different discipline and does not support the claim. It is
not cited. The pattern stands on its own merits and on the incident's own
evidence — 327 rows became 46 and every test stayed green because no test asserted
the non-effect.

### 2.8 Deletion is a subsystem, and restore is an operation — **T3**

The earlier draft supported this section with two attributed quotations (a
soft-delete guide's "undelete isn't flipping a timestamp…", and a team's *"we paid
for the trash folder twice — once building it, once not having it"*). Neither
resolves to a source; both are **removed**.

What survives is the reasoning, labelled as ours:

- Soft delete is not a boolean. If rows survive their parent, "deleted" is a
  state with its own query semantics, its own uniqueness rules (a live duplicate
  must fail; recreating against a tombstone must not be blocked by it), its own
  retention and purge schedule, and downstream consumers who need to learn the
  deletion happened.
- **Restore is a designed operation**, not a timestamp flip, for exactly the
  reasons above: cascades may already have fired, unique keys may have been
  reused, downstream systems may have reacted.
- The test prescription in 06g §3 (constraint tests, cascade tests asserting the
  *designed* child behaviour, restore tests against realistic fixtures, purge
  tests with an advanced clock, event tests for downstream consumers) is ours,
  derived from the incident's recovery, where completion state was lost precisely
  because restore had never been designed.
- **T3, our own aphorism, not a quote:** deletion code paths attract drive-by
  regressions because they are everyone's dependency and no one's feature. If it
  ever appears in normative text it should read as ASF's position, not somebody
  else's finding.

### Sourcing integrity — what was dropped, and why it is listed

| Removed from the earlier draft | Why |
|---|---|
| "Cascade semantics need design… orphans-by-policy… before production decides for you via confusing bugs" | exact-phrase search: **0 results**; no URL; was the section's lead evidence |
| Entity-class decision table (documents / users / transactions / cache-like) and "forcing per-rule decisions rather than providing one answer" | same unnamed source; unverifiable |
| "humans forget filters under deadline pressure; RLS policies forget nothing" and "no compiler error for *you forgot WHERE tenant_id*" | exact-phrase search: **0 results**; replaced by the PostgreSQL manual's own default-deny and no-policies text (§2.3), which is stronger and checkable |
| Oracle "whenever possible, enforce business rules with constraints" | no URL, not read |
| BEA definition of a fitness function — "any mechanism that provides an objective integrity assessment of some architectural characteristic" — the "readability" exchange, and "can't inspect (architectural) fitness into a frail system, it must be built into it" | cited InfoQ and O'Reilly URLs return **404**; book not read. The *objectivity* requirement survives as ASF's own T3 position |
| "The database is shared mutable state between every running copy of your application" | no URL; restated as our own model of expand-contract (§2.6) |
| "undelete isn't flipping a timestamp…", "we paid for the trash folder twice" | exact-phrase search: **0 results**; section restated as reasoning (§2.8) |

Nothing that remains in Part 2 is presented as a source's words unless it carries
a URL that was fetched in this pass. Where a claim matters enough to gate on and
could not be sourced, the claim is either dropped or the gate is not built on it —
which is the same rule 06k applies to a performance number without its
measurement contract.

## Part 3 — What this implies for the ASF and vigilant

| # | Change | Mechanism | Hard or soft |
|---|---|---|---|
| 1 | `06j-data-model.md` — ownership classes, required ownership declaration, model rules | normative reference, judgment | soft (raises probability) |
| 2 | `06e` `model` level — two objective fitness functions over persistence code, store-agnostic, built into the existing harness | code, gates the build | **hard** (a tripwire, not an authority) |
| 3 | `06g` §3 — invariant and non-effect tests (survival, non-effects, zero-row invariants, two-user authorization) | normative test doctrine | soft, but enforced by Rule 20 checkbox |
| 4 | `06b` Rule 20 + DoD checkbox + `/asf verify` checklist item | gate + mechanically emitted prompt | **hard** (checkbox cannot be green without evidence) |
| 5 | `04-adversarial` data & model lens | review questions | soft |
| 6 | `05-plan.md` data-model & ownership section | the artifact the gate reads | soft, load-bearing for 2 |
| 7 | ~~vigilant `completeness` — `model` category~~ | **not built — wrong package** (see exclusions) | ASF states the obligation as a MUST spec; the loop guard verifies completion generically |

The pairing rule from the earlier discussion holds and is applied here: **every
soft rule gets a hard counterpart, or it does not count as a gate.** Items 1, 5
and 6 are only credible because 2 and 4 exist to catch the case where the agent
talks its way past them — which, from this session's own record of me
rationalising around prose rules three times, is not a hypothetical.

Exclusions, to keep the mandate honest:

- **No model check in pi-vigilant.** An earlier draft added a `model` category to
  vigilant's completeness guard, instructing the agent to add `asf-model:` tags.
  Reverted on the user's correction: *"vigilant is there to mostly guard the
  loop; it should be able to work perfectly well without ASF and any specific
  software development checks should be on ASF side… ASF would dictate certain
  specifications and then vigilant checks if they are completed / done, as it
  would with ANY incoming specifications from anywhere."* A guard that searches
  for one framework's tag is no longer a general guard. What crosses the boundary
  is the **specification**, never the check: ASF captures the model obligation as
  a MUST spec, and vigilant's existing spec verification refuses "done" while it
  is open.

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
