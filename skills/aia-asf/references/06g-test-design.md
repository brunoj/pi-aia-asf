# 06g — Test Design: Risk-Based Derivation & Determinism

> **Read when:** Phase 6 large work (writing the test plan) or when the logic
> under test is non-trivial (branching, state, boundaries, external
> interactions).
> **Skip when:** small work; simple linear code where the standard test-first
> rules in 06b suffice.
>
> **Scale note:** this file is about *which tests to write and how to keep
> them reliable* — it never adds ceremony; it replaces guesswork.

Source: ISTQB test design techniques; Kaner's risk-based testing; the
determinism rules distilled from flaky-test failures.

---

## 1. Risk-based test derivation

Test effort follows **risk = likelihood × impact**, not coverage for its own
sake. Derive the test list from the spec's risk profile:

1. **List the risks** (from Phase 4 adversarial analysis): what can break,
   how likely, how bad.
2. **Score each** (High/Medium/Low on both axes).
3. **Test High × High first** — those get the most thorough technique set.
4. **Low × Low** gets a smoke check or nothing — do not gold-plate.

**Technique selection** (use when the shape matches):

| Technique | Use when | Example |
|---|---|---|
| Equivalence partitioning | Inputs fall into classes that behave the same | age ranges, status enums |
| Boundary value analysis | Classes have edges | min/max/just-below/just-above |
| Decision table | Multiple conditions combine into outcomes | discount rules, permission matrix |
| State transition | Behavior depends on state | order lifecycle, connection states |
| All-pairs | Many parameters, few interactions | config combos, browser × OS |
| Scenario/use-case | User journeys | end-to-end flows |
| Error guessing | Known weak spots | empty input, unicode, huge payloads, concurrency |
| Branch/decision coverage | High-risk logic | the gate conditions themselves |
| MC/DC | Safety-critical conditions | anything that can cause data loss |

**DoD line (large work):** *"the test list is derived from the risk profile —
High×High risks have the strongest tests; the derivation is stated in the
plan."*

## 2. Determinism rules (flaky tests are defects)

A flaky test is a **defect in the test**, not an inconvenience. Fix it
immediately; never "re-run into green" (06b Rule 11).

1. **Inject the clock** — no `Date.now()`/`new Date()` in logic under test;
   pass time in (or a clock interface).
2. **Seed randomness** — RNGs take an explicit seed; no `Math.random()` in
   tested logic.
3. **Own the data** — tests create their own fixtures/DB state; never depend
   on pre-existing or shared data.
4. **Poll, don't sleep** — wait for a condition with a bounded poll (with
   timeout), never a fixed `sleep` that races.
5. **No order dependence** — each test passes alone and in any order; no
   shared mutable global state between tests.
6. **No real network in unit tests** — external calls are faked at the seam
   (06c Rule 4); integration tests are explicit and bounded.
7. **Bound every wait** — every wait/poll carries a hard timeout (06b Rule
   15); a test that can hang is a broken test.
8. **Time zones / locales** — pin the environment (UTC, fixed locale) where
   behavior depends on it.
9. **Parallelism is opt-in** — tests that share resources run serially; only
   independent tests run in parallel.

**DoD line:** *"the suite is deterministic: no flaky test is tolerated; a
flaky test is fixed or deleted, never retried into green."*

## 3. Invariant and non-effect tests (P27)

Every other rule in this file asks *did the thing you wanted happen?* For
persistence work that question is not enough, because a model defect is exactly
an unintended effect on something outside the specification. The suite that let
327 action items vanish was green: the template saved, the response was 200, and
the table that emptied was never populated nor inspected.

For any change that writes to a store, add the tests that ask *what must not
have happened*:

1. **Survival test.** Seed the rows that reference what you are editing or
   deleting — with **production-shaped data**, because a cascade only fires when
   the rows exist — and assert they survive. If the child is an instance (06j
   §1), this test is the executable form of that decision.
2. **Non-effect assertion.** Snapshot the row/document counts of every table or
   collection the change does *not* name, and assert they are unchanged. One
   helper, applies to every write path, and it catches the whole class rather
   than the one case you imagined.
3. **Zero-row invariant.** Write the invariant as a query that must return
   nothing (orphans, duplicates on the business identity, a completed row with no
   completion time) and run it in the suite. Objective, store-agnostic, and it
   documents the rule as code.
4. **Two-user authorization test.** Two identities, objects owned by each, and
   every operation attempted across the boundary — read, update, delete, export,
   admin. A UUID is not an authorization check.

These are the hard gate for any store that exposes no constraints to scan
(06j §5) — where there is no schema to inspect, the invariant test is the only
thing that can tell you the model is wrong.

**DoD line:** *"for every store write the change introduces, the suite asserts
what must NOT change, not only what should."*

## 4. Where this applies in ASF

- **Phase 5 (PLAN.md):** the test plan states the risk-derived test list
  (which risks, which techniques, which tests), and names the invariant and
  non-effect tests for any store write (§3).
- **Phase 6 (implementation):** write tests with the technique that matches
  the shape; keep them deterministic per the rules above.
- **Phase 7 (verification):** a flaky test blocks delivery (it is a defect).

## Anti-patterns

- ❌ Testing everything "for coverage" instead of what can actually break
- ❌ `sleep(5000)` instead of polling for the condition
- ❌ Tests that depend on the order they run in
- ❌ Real network calls inside unit tests
- ❌ Re-running a flaky test until it passes
- ❌ Tests that pass only on the developer's machine (locale/timezone)
- ❌ A green suite that never populated the table the change destroys (06j)
- ❌ Asserting only the intended effect, never the non-effect (06j)
