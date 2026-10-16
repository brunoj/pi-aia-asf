# 06j — The Data Model Gate

**Status: mandatory for large work (gate blocks), advisory for small work.**

The model is a design artifact and it must be reviewed as one. **Code review is
not model review.** Everything else in the ASF inspects code (06c, 06e),
behaviour (06b, 06g), resilience (06f), security posture (06h) or completeness
(06i) — and a model defect is none of those. It is a wrong assumption about what
entities exist, who owns them, what must always be true of them, and what may
happen to them.

This reference exists because a gate set that verifies only *intended effects*
cannot see a model defect: a model defect **is** an unintended effect on
something outside the specification. The case that produced it: an admin
unticked one checkbox on a template and saved; the endpoint rebuilt the
template by deleting its questions; `ON DELETE CASCADE` took every organisation's
generated action items with them; the suite was green, because the suite never
created a single action item. See
[docs/research/model-blind-spots.md](../../../docs/research/model-blind-spots.md).

**When this applies:** any change that **writes to a store** — schema, migrations,
ORM/entity definitions, repositories, or a handler that persists. The trigger is
what the change WRITES, not where the diff lives; if your diff touches none of
those, say `n/a: no persistence touched, because <reason>` and move on.
"If it's only a backend change" is not an argument — the model *is* the backend.
Same inversion as Rule 19 and Rule 9: **when uncertain whether the model is
touched, it is touched.**

## 1. Ownership classes — the vocabulary that was missing

Every relationship you touch gets classified. The class decides the delete
semantics; the reason nobody got this wrong *on purpose* is that nobody was
ever asked.

| Class | The child is… | Delete semantics | Example |
|---|---|---|---|
| **composition** | nothing without the parent; exists only as part of it | `CASCADE` legitimate | a step row belonging to one template version |
| **instance** | a **fact about someone else** that merely cites the parent | **never `CASCADE`** — `SET NULL` / `RESTRICT`, detach-and-keep | an action item an organisation generated *from* a template |
| **ledger** | a record of something that happened; correctness forbids erasure | **hard delete forbidden** — void / compensate / append | payment, completion, status change, audit entry |
| **unclassified** | you have not decided | treat as **instance** | — |

The fail-safe default is the expensive direction: an undeclared relationship is
an *instance*, so `CASCADE` is not available to you until you argue for it. This
is deliberate. Rebuild-by-delete is not written by people who think cascades are
wrong; it is written because it is the shortest code path that syncs rows —
what the literature calls designing for *compositional convenience*. A rule that
only says "don't" loses to convenience; the default has to be the safe side.

**The test for instance vs composition is one question:** *if the parent is
deleted, must this row still exist?* If the answer is "the customer's data would
be wrong without it", it is an instance and the cascade is a bug you have not
found yet.

## 2. The ownership declaration (the required artifact)

Every relationship touched by the change gets a declaration — in the migration
or schema file, next to the constraint, and in the plan's data-model section:

```sql
-- asf-model: org_action_items -> checklist_questions = instance
--   owner: the organisation; survives template edits; FK is SET NULL.
ALTER TABLE org_action_items
  ADD CONSTRAINT fk_item_question FOREIGN KEY (question_id)
  REFERENCES checklist_questions (id) ON DELETE SET NULL;
```

Whatever your store or ORM calls it — a FK action, a relation option, a mapping
attribute, a delete dependency — the declaration is the same three facts: the
class, the owner, the survival answer.

Rules about the artifact:

- **No declaration ⇒ not reviewed ⇒ not done.** Absence is not neutral. This is
  the same mechanism as Rule 19's impact statement: "certain" that is not
  written down is a feeling.
- `ON DELETE CASCADE` (or `dependent: :destroy`, `onDelete: "cascade"`,
  `on_delete="CASCADE"`) **requires** a declaration naming the owner and saying
  why the child is composition. If you cannot write that sentence, the child is
  an instance.
- A deliberate exception uses `asf-model-accept: <reason>` — a non-empty reason,
  on the same or the line above. That is the only way to pass the gate with a
  finding open, and it is greppable, so an accepted exception stays visible.
  Silence is never a waiver.
- **The value is forcing the decision, not the answer.** A declaration that
  concludes "`CASCADE` is correct here" is a pass, not a failure. What the gate
  refuses is that nobody was asked.

## 3. Model rules

**M1 — Every relationship has a named owner and a survival answer.** Per
relationship touched: who creates the child, who may delete it, does it survive
its parent, and why. Unclassified means instance (§1).

**M2 — Never `CASCADE` from a business fact to a configuration row.** Deleting a
template, a setting, a catalogue entry or a plan must not delete artefacts a
human or an organisation produced. `SET NULL`, `RESTRICT`, or detach-and-keep.
If the child carries an owner (an org, tenant, user or account reference) or
human-authored state (`title`, `status`, `completed_at`, `amount`), assume
instance and make the argument explicitly.

**M3 — No rebuild-by-delete where the child has inbound references or
row-attached state.** "Delete all the children, insert them again" destroys row
identity, breaks anything pointing at those rows, and silently loses state that
lives on the row (`completed_at`, status history, counters, attachments). Upsert
on a **stable identity** instead. Note what the fix in the originating incident
was: reattach by `question_number` — i.e. *give the row an identity that
survives a rebuild*. If you are about to write delete-then-insert in one
transaction, stop; the gate has a fitness function for exactly this shape.

**M4 — Invariants the database can express, live in the database.** Unique,
not-null, foreign-key and check constraints are enforced by a layer that cannot
forget, be bypassed by a script, or be missed by a new join. Application-level
validation is a *claim*; a constraint is a *guarantee*, and it is the only
guarantee that holds for the caller who reaches the table directly. "There's no
compiler error for *you forgot `WHERE tenant_id`*" — so put the boundary where
forgetting is impossible (constraint, RLS policy, scoped accessor), not in
discipline.

**M5 — If the business says two rows cannot be the same thing, something must
enforce that.** A unique constraint (scoped to live rows where tombstones
exist), not a dedupe in a handler and certainly not a dedupe in a recovery
script. State the identity rule before you implement the write path.

**M6 — Reference across aggregates by identity, and change one aggregate per
transaction.** A direct reference into another aggregate is an invitation to
modify both in one commit. If you do not hold the reference, you cannot
accidentally cascade through it. Where two aggregates must agree, do it through
an explicit follow-up operation, not through a shared transaction.

**M7 — Destructive lifecycle is a designed subsystem.** For each relationship
where deletion is possible, decide *which* of these it is: cascade, block until
empty, detach-and-keep, tombstone, or void-and-append. Then:

- **Restore is an operation with checks**, not a timestamp flip — cascades fired,
  unique keys were reused, downstream systems reacted.
- Retention and purge are decided, not drifted into.
- Deletion propagates as an event to anything that caches or indexes it.
- Blocking is a legitimate answer. "You cannot delete the template while 327
  organisations have items generated from it" is a fine product behaviour and a
  much better default than discovering the answer in production.

**M8 — A wrong-but-plausible empty result must be loud.** A filter that matches
nothing — missing tenant context, wrong date, a forgotten tombstone predicate —
returns *success with no rows*, which reads as an empty day and not as a defect.
Instrument the boundary itself: log when the enforcement context is missing, and
alert on that pattern. Turning a silent failure mode into a noisy one is a design
requirement, not observability polish.

## 4. Legitimate exceptions — declared, never silent

Like 06i, the rule is not "never deviate", it is "never deviate quietly". Each
of these is legitimate **when written down**:

- A genuine composition where `CASCADE` is right (declare the owner).
- A rebuild-by-delete on a table with no inbound references and no row-attached
  state (say which table, and why both are absent).
- Application-level validation instead of a constraint, where the rule spans
  tables or needs the request context (say why the DB cannot express it).
- A hard delete required by law, with the anonymise-plus-tombstone shape
  described in the research notes.
- An `asf-model-accept:` for a legacy constraint you are not changing in this
  ticket — with the reason and, ideally, the ticket that will.

What is never legitimate: an undeclared cascade, an unclassified relationship, a
rebuild-by-delete nobody justified, or a scan finding read back as a clean
deliverable. **A model finding you chose to accept is a decision; a model
finding you did not look at is a hole.**

## 5. Prove it is real (Phase 7)

Two mechanisms, and both must run — the prose catches what the machine cannot
judge, the machine catches what the prose can be talked around.

**Objective fitness functions** — `/asf health` runs the `model` level
([06e-code-health.md](06e-code-health.md)). Built in, deterministic, no external
tool. It fails on a cascade with no ownership declaration, and on the
delete-then-reinsert signature over one table or collection. Objectivity is the
requirement: "is this ownership correct?" is judgment and stays in review, while
"does this file declare a cascade with no `asf-model:` tag?" is measurable.

**It is a tripwire, not an authority — and it is store-agnostic by design.** The
defect is not SQL-shaped. An instance inheriting its parent's lifecycle happens
in a relational FK action, in an ORM mapping attribute, in a document store's
delete dependency, in a key-value prefix wipe, or in a loop someone wrote to
delete children by hand. Three rules run:
`undeclared-cascade` (a cascade declaration with no ownership declaration),
`delete-then-reinsert` (rebuild-by-delete over one table or collection), and
`handwritten-cascade` — the shape a cascade takes in a store that has **no
constraint to declare it in**, where the decision exists only as code someone
wrote: a multi-delete driven by a reference to *another* entity.

The distinction that makes `handwritten-cascade` decidable rather than
judgemental is the **reference**. `deleteOne({ _id: id })` is a row removing
itself; `deleteMany({ userId })` is one entity deciding the fate of another. The
first does not fire — a rule that fires on ordinary deletes gets switched off and
the coverage goes with it, which is why the near-miss fixtures matter more than
the fire fixtures. A fire asks for a **declaration**; it does not claim the
ownership is wrong, and that judgement stays in review.

**The pattern set is illustrative and the standard does not enumerate products.**
The categories above are the standard; the dialects the scanner happens to
recognise are an implementation detail in `lib/code-health/model.mjs`, reported
per finding so you can see what it looked at. A project whose store is not in
that set adds its own spelling with `model.extraCascadePatterns` /
`model.extraHandWrittenPatterns` rather than waiting for a release — and a
recognised dialect is not a coverage promise. If your persistence layer speaks a
shape the scanner does not know, that is a `scanned: 0` you must say out loud,
not a clean bill of health.

**Where the store has no constraint to inspect, the scan has nothing to attach
to and the invariant tests below are the only hard gate** — say which of the two
you relied on, and if the scan reported `scanned: 0`, say that too. A clean scan
means the tripwire caught nothing, not that the model is sound.

**Invariant and non-effect tests** — [06g-test-design.md](06g-test-design.md) §3:
survival tests, non-effect assertions, zero-row invariant queries, two-user
authorization tests. These are what a model rule looks like when it stops being
an opinion, and they are the part that works against any store.

## 6. Definition of Done — model

- [ ] Every relationship the change touches is classified (composition /
      instance / ledger) with a named owner and a survival answer.
- [ ] Every `CASCADE` in the diff is declared as a composition, or carries
      `asf-model-accept:` with a reason.
- [ ] No rebuild-by-delete over rows with inbound references or row-attached
      state, or it is declared with why both are absent.
- [ ] Business invariants the DB can express are constraints, not handler code.
- [ ] Identity rule stated and enforced where the business says rows cannot
      duplicate.
- [ ] Deletion semantics decided per relationship (§M7), including restore.
- [ ] `/asf health` `model` level passes, or every finding is accepted with a
      reason and shown; if the level scanned nothing, that is said out loud.
- [ ] Invariant and non-effect tests exist for the touched relationships
      (06g §3) and are green — and they are the gate, not the scan, where the
      store exposes no constraints.
- [ ] Or: `n/a: no persistence touched, because <reason>`.

## 7. Who enforces this

ASF states the obligation; the loop guard enforces completion **generically**.
When a change touches persistence, capture the model obligations as MUST specs
(`capture_spec`) — the ownership decision per relationship, the invariant and
non-effect tests, the scan result — and mark each `met` with evidence, not
assertion. The guard then verifies those specs at settle exactly as it verifies
any specification that arrives from any source, and refuses "done" while a MUST
spec is open.

Keep model knowledge on this side of the boundary. The guard does not know what
a cascade is, does not look at schemas, and must not have to — the day it
inspects your data model is the day it stops being usable outside this factory.
What crosses the boundary is the **specification**, never the check.

## Anti-patterns

- **The instance that inherited its parent's lifecycle** — a fact about a
  customer deleted because a setting changed. (M1, M2)
- **Rebuild-by-delete as the implementation of "sync"** — shortest path, worst
  blast radius. (M3)
- **Business rules that exist only in the service layer** — true until a script,
  a backfill, a second endpoint or a new join bypasses them. (M4)
- **Identity enforced by a `Set` in memory** — dedupe in code where a unique
  constraint belongs. (M5)
- **One transaction spanning two aggregates** — the cascade's favourite vehicle.
  (M6)
- **`CASCADE` chosen because the store or ORM defaulted to it** — a default is
  not a decision. (M1, §2)
- **"It's only a backend change"** — the model *is* the backend; the diff
  location is not the trigger. (§When this applies)
- **A green suite that never populated the affected table** — a test that cannot
  observe the destruction is not a test of it. (06g §3)
- **Trusting a clean scan** — the tripwire is pattern-shaped and store-shaped;
  it is not proof. (§5)
- **Silent zero** — a missing filter reported as an empty day. (M8)
- **Reading a scan exception as a clean deliverable** — an accepted finding is a
  decision you must show, not a pass you may claim. (§4)
- **Asking the loop guard to understand the model** — it verifies that specs are
  done; teaching it cascade vocabulary puts a domain check in a general tool.
  Capture the obligation as a spec instead. (§7)
