# 06k — Performance: The Measurement Contract, Placement, and Load Scenarios

> **Read when:** Phase 4/5 for **large work**; any change that adds a query, a
> loop over a collection, a background job, a cache, or a user-facing endpoint;
> any spec containing a number; any security finding whose compensating control
> is a limit.
> **Skip when:** small work with no new query, no new endpoint, and no numeric
> claim in the spec.
>
> **Scale note:** the *measurement contract* applies at both scales. If you
> write a number down, you owe its contract — even in a small change. The load
> scenarios below are the large-work part.

Sources are marked **T1** (fetched and read), **T2** (measured locally, in this
repo), **T3** (reasoned, not verified). See
[02-research.md](02-research.md) and
[docs/research/performance-gates.md](../../../docs/research/performance-gates.md).

---

## 0. One-line DoD (applies to ALL work, both scales)

> **"No numeric performance claim without its measurement contract; no
> performance regression verdict without a statistical comparison on a machine
> that is not busy."**

---

## 1. Why this reference exists

A performance claim is the easiest thing in the world to fake without meaning to,
and ASF had no defence against it: a DoD line said *"performance targets from
the spec are met"*, nothing in the codebase measured anything, and the agent
wrote "met".

The literature and our own measurements agree on why a bare number is worthless:

- Repeated identical runs on the same hardware have shown coefficients of
  variation from **0.03% to over 100%**. A single measurement is a sample of one
  from a distribution you have not characterised. (T1)
- Standard threshold tests **false-fire on unchanged code** at low sample
  counts. (T1)
- A naive **±15% threshold missed a real 10% regression in 40 of 40 trials** in
  our own runs; a ±10% threshold missed it in 19. Significance plus effect size
  caught all 40. (T2)
- Under competing CPU load, detection of that same regression fell from **40/40
  to 13/25**. A busy machine does not have a verdict. (T2)

So the gate is not a threshold. It is **significance plus effect size, measured
interleaved, on a quiet machine** — and an incomplete claim is reported rather
than accepted.

---

## 2. The measurement contract (Rule 21) — normative

**A number without its contract is not a specification. Report it as incomplete;
do not accept it, and do not quietly drop it.**

**And a measurement without a target is not a verdict.** ASF does not decide a
consumer's SLA. `perf.target` is the one parameter in the table that ships **no
default**, and with nobody having declared one the output is the literal string
`no-default: needs a declared target` — never a silent pass, and never a number
ASF made up. A perfectly well-formed measurement that has nothing to compare
against has told you something and concluded nothing; say that.

| Claim type | Required, all of it |
|---|---|
| **Latency** | percentile · load it was measured at · sample count · environment · lab or field · **the target it is judged against** |
| **Throughput** | arrival model (closed-loop or open-loop) · duration · environment · sample count · **the target it is judged against** |
| **Regression** | statistical comparison · interleaved randomized measurement · retained raw samples · observed CV · sample count · environment |

Wrong, and how it must be reported:

```
spec: "search p95 < 2s"
ASF : ⚠ incomplete performance claim (latency): missing load, samples,
      environment, labOrField — a latency claim needs a percentile, the load it
      was measured at, the sample count, the environment, and whether it is lab
      or field.
```

The arrival model is not pedantry. A **closed-loop** load generator never has
more in flight than its thread count, so when the system slows the generator
throttles itself and hides the problem; an **open-loop** generator keeps
arriving. This is coordinated omission, and it changes the reported latency by
orders of magnitude at the point where a system is overloaded — which is exactly
the region a capacity decision cares about. (T1)

**`scanned: 0` is never a pass.** A performance check that examined nothing
reports `scanned: 0` and says so. It is not green.

---

## 3. Performance placement (Rule 22) — the tiering is the deliverable

The question is not "should we benchmark" but **which check earns its cost where**.

### Tier 1 — CI-cheap (every commit, budget `perf.cheapBudgetSeconds`, default 60 s)

| Check | What it catches | Cost |
|---|---|---|
| **Query-count tripwire** | N+1: issue count grows with n | milliseconds (T2: an N+1 fixture issued 11 queries at n=10 and 41 at n=40) |
| **Query plan scan** | full scans, missing indexes, joins without predicates | milliseconds |
| **One bounded load scenario** | a coarse regression signal | seconds |

A **30-sample statistical trial runs in seconds**, so 60 s buys real coverage
rather than a token gesture. (T2)

### Tier 2 — scheduled deep (nightly / pre-release, budget `perf.scheduledBudgetSeconds`, default 900 s)

The §5 scenarios: scalability, stress, soak, resource ceiling.

**Do not put Tier 2 in the per-commit path.** A deep suite that runs on every
commit gets switched off within a week, and then the coverage that *would* have
earned its place is gone too. Placement is the difference between a gate that
survives and a gate that gets disabled.

---

## 4. The comparison — how a regression verdict is produced

Non-negotiable, because these are what make the verdict mean anything:

1. **Warm up** before sampling (default 10 iterations — the documented default
   of Node's own benchmarking runner. T1).
2. **Interleave** test and control in one process in **randomized order**, so
   drift and cache effects hit both arms. (T1)
3. **Retain raw samples.** A verdict that cannot be re-derived cannot be
   audited. (T1)
4. **Test significance and effect size together.** Our shipped values:
   **p < 0.01** (Mann–Whitney U) **and** a Hodges–Lehmann log-median ratio
   **> 1.05**. (T2)
5. **Refuse on a busy machine.** If load average exceeds
   `bench.loadAverageFactor` × cores, report `skipped: machine busy` and produce
   **no verdict** — neither pass nor fail. (T2)

These five are **non-adaptive**: a project may not calibrate its way out of a
valid comparison. It may only make the comparison more patient — more samples,
more warmups, a bigger wall-clock budget, all inside documented bands
(`/asf config`).

---

## 5. The load scenarios (large work)

Every scenario states its arrival model, duration, environment, and whether it
is lab or field. A scenario without those is not run; it is reported as
incomplete.

### 5.1 Scalability — the shape, not a single number

Run at **at least 3 load steps** (5 preferred). Throughput should rise
approximately linearly with load; a plateau means a shared resource is the
bottleneck. Report throughput **and** latency **and** saturation together —
throughput alone hides a latency cliff, and latency alone hides a throughput
plateau. (T1: sub-linear scaling indicates a shared resource bottleneck.)

### 5.2 Stress — find the knee, then break it deliberately

Increase load until failure and record: the load at first degradation, the load
at failure, **the failure mode**, and **the recovery behaviour**. "It returned
500s and recovered in 40 s when load was removed" is a result. "It fell over" is
not. A system that fails slowly and recovers is often preferable to one that
cascades — say which you have.

### 5.3 Soak — hours, not seconds

Run a sustained moderate load for **≥ 1 hour** (≥ 8 h before a release). Watch
for memory growth, connection leaks, file-descriptor exhaustion, latency
drift. These are invisible to a 10-minute test, which is the entire reason this
scenario exists separately.

### 5.4 Resource ceiling

Declare the limits first — connection pool size, max concurrent requests, heap —
then run **at** the limit and verify the application behaves as documented
(queueing, shedding, erroring) rather than degrading unpredictably. This is the
performance evidence for ASVS **13.1.2** and **13.1.3** (§7).

### 5.5 Spike and breakpoint

- **Spike:** jump from idle to high load instantly. Measures queueing behaviour
  and whether the system sheds load or drowns.
- **Breakpoint:** ramp continuously until it breaks; report the knee.

### 5.6 The abuse case (shared with security — run once, evidence both)

One run against the **most expensive endpoint the untrusted input can reach**,
at abusive volume. It is simultaneously: the stress scenario, the ASVS
availability evidence (§7), and the security abuse-case test in 06h. **Run it
once; cite the same evidence in both places.** Duplicating it is how one of the
two quietly stops being run.

---

## 6. Escalation — `asf-perf-accept`

A missed performance target is escalated, never self-approved. An
`asf-perf-accept` is **invalid** unless it carries all of:

1. the **target** and the **measured** value;
2. the **load it was measured at**;
3. the **scenario** it was measured against (§5, with its contract);
4. the **named structural alternative** and **its cost**;
5. a **human signature**.

**An agent-authored acceptance is invalid.** The party that missed the target is
not the party that may waive it.

"Reduce the target to the measured value" is not an alternative; it is deleting
the specification. The alternative must be structural — an index, a cache, a
queue, a denormalisation, a bound — with its cost stated so the human can
refuse it knowingly.

---

## 7. ASVS performance requirements (the security overlap)

These are ASVS 5.0 requirements, verified against the source project at tag
`v5.0.0_release`. They are **security** requirements, and they are **performance**
requirements, and ASF refuses to maintain two lists of them.

| ASVS 5.0 | Requires | ASF evidence |
|---|---|---|
| **15.1.3** (L2) | Documentation identifies time-consuming or resource-demanding functionality, how to prevent availability loss from overuse, and how to avoid building a response longer than the consumer's timeout; defences may include asynchronous processing, queues, and limiting parallel processes per user and per application | the §5 scenario set names the expensive endpoints; the plan records the defences |
| **15.2.2** (L2) | Defences against loss of availability from that functionality are **implemented**, per the documented decisions | the stress scenario (§5.2) exercises them |
| **13.1.2** | For each service used, documentation defines the **maximum concurrent connections** (connection pool limits) and behaviour at the limit, including fallback/recovery | the resource ceiling (§5.4) runs at the declared limit |
| **13.1.3** | **Resource-management strategies** for every external system or service: release procedures, timeout settings, failure handling, and retry logic with limits, delays and **back-off algorithms**; synchronous HTTP must mandate short timeouts and disabled or strictly limited retries | the ceiling scenario plus the soak's leak checks |
| **13.2.6** | Actual per-connection configuration matches the documentation: max parallel connections, behaviour at max, connection timeouts, retry strategies | the ceiling scenario's assertions |
| **4.3.1** | A query allowlist, depth limiting, amount limiting, or **query cost analysis** prevents expensive nested queries (data-layer DoS) | the query-plan scan (§3) plus the abuse case (§5.6) |
| **15.4.4** (L3) | Resource allocation policies prevent **thread starvation**; fair access, thread pools | the ceiling scenario at the pool limit |
| **15.4.3** (L3) | Locks used consistently so threads do not get stuck waiting on each other or retrying endlessly | the soak's latency drift plus the stress failure-mode record |
| **16.5.2** | The application **continues to operate securely when external resource access fails** — circuit breakers or graceful degradation | the stress scenario's recovery record |

**The rule:** one abuse-case load run satisfies the security DoD line in 06h and
the performance scenario here. The evidence is shared, never duplicated.

---

## 8. Gates (each ships with a fire fixture and a near-miss fixture)

| Gate | Fires on | Near-miss that must NOT fire | Fail-safe |
|---|---|---|---|
| `measurement-contract` | a numeric claim missing any contract field | the same claim with its contract | report, never block |
| `queryBudget` | queries per request above `scan.queryBudgetPerRequest` | a request inside the budget | report |
| `planScan` | a plan row count above `scan.fullScanRows` | an index seek | report |
| `load` | throughput-per-load linearity below `scale.linearity` | linear scaling | report |
| `bench` | p < `bench.significance` **and** ratio > `bench.effectRatio` | unchanged code | report |
| `escalation-evidence` | an `asf-perf-accept` missing any §6 field | a complete, human-signed acceptance | report |

**A gate whose near-miss starts failing is a bug in the gate, not a test to
update.** Every gate above also has a fire fixture: a gate that silently stops
checking anything fails the suite instead of reporting green.

---

## 9. Where this applies

- **Phase 2 (research):** the arrival model and the load steps are decided here,
  not invented at verification time.
- **Phase 3 (specs):** every numeric claim gets its contract or is reported
  incomplete (Rule 21).
- **Phase 5 (PLAN.md):** Tier 1 / Tier 2 placement and budgets recorded.
- **Phase 6 (implementation):** the query tripwire and plan scan run per commit;
  the expensive endpoints are identified for §5.
- **Phase 7 (verification):** Tier 2 scenarios run; the abuse case run once and
  cited in both 06h and here; `/asf gates` output included in the delivery
  report.

## 10. Anti-patterns

- **A single measurement presented as a fact.** Sample of one from an
  uncharacterised distribution.
- **A ±% threshold as the verdict.** It is triage, not a verdict; see §1.
- **Closed-loop load presented as capacity.** Coordinated omission hides the
  overload region.
- **Benchmarking on a busy CI box and reporting "clear".** No verdict exists.
- **A 10-minute "soak".** Soak means hours; that is the whole point.
- **Reducing the target to the measured value and calling it met.**
- **A performance checklist maintained alongside ASVS.** One list, §7.
