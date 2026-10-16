# Performance: the quality dimension ASF does not measure

**Status**: research record (user directive, this round). Companion proposals:
**P28–P37** in [improvement-proposals.md](improvement-proposals.md). Nothing in
this file is normative — it is evidence and gap analysis; the normative text
lands in `skills/` only after the PO/user approves the proposals (P22).

**Directive**: *"ASF has reasonable security checks and tests… performance
testing and optimization are missing. Performance issues should be treated as
highly important and may justify architectural redesign. ASF should generally be
inclined to search online for authoritative sources when it needs to deepen its
knowledge while building software."*

**Headline finding**: performance is the one quality dimension where ASF is
silent *and* where coding agents are measurably weakest. On 81 real-world
performance bug-fixing tasks, a state-of-the-art coding agent succeeded **~3%**
of the time; adding performance-aware instructions and benchmarking tooling
raised it to **~20%** — a ~7× gain from *instructions and measurement*, exactly
the two things ASF is made of
([PerfBench, arXiv:2509.24091](https://arxiv.org/abs/2509.24091), read in
full). Honest scope of that number: PerfBench's 81 tasks are curated from
popular **.NET** repositories on GitHub (screened from ~1 200 .NET repos with
>10 stars), so the exact percentages are .NET-specific and the benchmark's own
authors stress "room for improvement" remains; the transferable claim is the
**~7× gap between an unaided agent and one given performance-aware instructions
plus measurement tooling**, which is a statement about agent behaviour, not
about a language. ASF's apparatus is strong where agents are already strong
(functional behaviour, structure, security hygiene) and absent exactly where
agents fail without help.

---

## 1. What the standards require (and ASF does not ask for)

**ISO/IEC/IEEE 25010:2023** defines a product quality model of **nine
characteristics, "further subdivided into subcharacteristics"** that "provide a
reference model for the quality of the products to be specified, measured and
evaluated", for use across the lifecycle by developers, acquirers and evaluators
([ISO abstract, fetched](https://www.iso.org/standard/78176.html) — the clause
text itself is paywalled, so the sub-characteristic wording below is taken from
the 2011 model as carried by the arc42 quality model
([arc42 Performance](https://quality.arc42.org/qualities/performance), fetched).
*Performance efficiency* is one of those characteristics:

| Sub-characteristic | Standard's definition | ASF today |
|---|---|---|
| **Time behaviour** | response/processing times and throughput rates meet requirements | no place to state one, no test that asserts one |
| **Resource utilization** | amounts and types of resources used meet requirements | nothing measures heap/RSS/connections/queries |
| **Capacity** | maximum limits of system parameters meet requirements | no breaking-point is ever established |

ASF *can* express these — `capture_spec` has a `performance` area, and
`05-plan.md` has one example row (`1000 concurrent users → p95 < 2s`). But it is
an example, not an obligation: no phase requires a performance scenario, no DoD
line mentions one, no gate measures one. The spec gate will accept
`met` on a performance spec whose evidence is "looks fast" — vigilant requires
evidence to be **present**, not to be a measurement, and that boundary is
correct (06j §7): what crosses to the loop guard is the obligation, never the
check. So the measurement obligation has to be created on the ASF side.
Security got the same treatment before P15–P18 (a bullet in the adversarial
checklist) and is now a threat model + ASVS DoD + automated gates; performance
is at the "one bullet" stage — and it does not even have the bullet.

**The scenario format already in ASF is the right one.** SEI/ATAM quality
attribute scenarios (stimulus → response → *measure*) are the standard way to
make performance a requirement rather than a wish
([SEI ATAM collection](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/)),
and ATAM's whole purpose is to expose **architectural risks** relative to
quality-attribute goals — the vocabulary ASF needs for "this is an architecture
problem, not a loop problem".

---

## 2. What "measuring performance" actually means (the validity rules)

This is where an agent without guidance silently produces fiction. Every rule
below has a source, and every one of them is currently unenforced in ASF.

### 2.1 Averages lie; the tail is the product

*The Tail at Scale* (Dean & Barroso, CACM 2013 —
[full text](https://cacm.acm.org/research/the-tail-at-scale/)) is not about
supercomputers; it is the argument that **p50 is a marketing number**:

> "consider a system where each server typically responds in 10ms but with a
> 99th-percentile latency of one second… If a user request must collect
> responses from 100 such servers in parallel, then **63% of user requests will
> take more than one second**."

Their measured Google service (root → intermediate → very many leaves): "the
99th-percentile latency for a single random request to finish, measured at the
root, is 10ms. However, the 99th-percentile latency for all requests to finish is
**140ms**, and the 99th-percentile latency for 95% of the requests finishing is
70ms, meaning that waiting for the slowest 5% of the requests to complete is
responsible for **half of the total 99%-percentile latency**"
([PDF](https://courses.cs.duke.edu/cps296.4/fall13/838-CloudPapers/dean_longtail.pdf),
read in full). Consequences for ASF:

- A performance scenario must name **which percentile** and **at what load**.
- Fan-out (N+1, parallel fetches, chatty services, an ORM that issues one query
  per row) is a *tail amplifier*, not a throughput issue — the reason N+1 is a
  first-class defect and not a code smell.
- Causes are structural: shared resources, background daemons/compaction/GC,
  synchronised disruption, and **multiple layers of queueing** — which is why
  tail fixes are usually architecture decisions (hedged requests, timeouts,
  prioritised queues, time-slicing long requests), i.e. the escalation case.

### 2.2 A load generator can lie by omission

**Coordinated omission** (Gil Tene; [wrk2 README](https://github.com/giltene/wrk2))
is the defect where a closed-loop load generator stops issuing requests while a
slow response is outstanding, so the slowest samples are *never sampled*. The
measured p99 is then not an estimate of the system's p99 — it is an estimate of
the load generator's patience. Requirements this imposes on any ASF load test:

- **open-loop / constant-throughput** arrival (target rate, not "as fast as
  possible"), with latency measured from the *intended* send time;
- **lossless recording** (HDR-style histogram) so high percentiles are real;
- runs long enough to be meaningful (wrk2's calibration alone is 10 s — "runs
  shorter than 10–20 seconds may not present useful information").

"as fast as it can go, report the mean" is the default behaviour of a naive
script and produces a confident, wrong number. That is an 06i
(no invented facts) violation with extra steps.

### 2.3 Micro-benchmarks need the runtime's own rules

Node's official benchmark runner states the discipline explicitly
([`node:bench`, Stability 1.0 / Early
Development](https://nodejs.org/api/bench.html)):

- default **ten warmup invocations** because JIT tiering makes early samples
  meaningless; "a fixed warmup count does not guarantee a stable optimization
  state; inspect raw `samples` and increase `warmup`";
- **measurement integrity**: "a statistically consistent result does not prove
  that a benchmark measured the intended work" — the engine can delete unused
  work; make results observable outside the measured interval, batch enough
  operations to amortise timer reads, inspect samples for GC pauses and
  multimodality;
- **the runner deliberately does not do pass/fail comparison** — it exposes raw
  samples so that "comparison policy can remain in higher-level tools", and
  suggests Welch's t-test or rank-based tests, effect sizes, uncertainty, and
  correction for multiple benchmarks; and it warns in the same breath: "the
  runner executes benchmarks serially, but it does not provide process
  isolation. Other work in the process, JIT compilation, garbage collection, CPU
  frequency changes, and system load can all affect results. **Keep raw samples
  when comparing results and investigate noisy or skewed distributions rather
  than treating a confidence interval as a pass/fail threshold.**"

ASF *is* that higher-level tool, and the runner explicitly leaves the gate — the
part ASF exists to do — to us. **But it is not available to ASF today.** The
module is `added: v26.9.0` (verified in the Node source metadata) at
Stability 1.0 / Early Development, importable only as `node:bench` and only with
`--experimental-bench`; the machine ASF runs on is **v22.22.1**, where
`require('node:bench')` throws `ERR_UNKNOWN_BUILTIN_MODULE` (verified locally),
and `pi-aia-asf/package.json` declares no `engines` field at all. A gate that
shells out to `node --experimental-bench` is a gate that fails closed on every
real project. Two consequences for P30:

- the bench metric must ship its own ~40-line harness (hrtime sampling + warmup
  + the statistics below), or use a pinned library (Tinybench reports median,
  stddev, margin of error and percentiles and has no dependencies
  ([tinybench](https://github.com/tinylibs/tinybench)); Vitest already bundles
  it ([features](https://vitest.dev/guide/features)) — relevant because every
  ASF project in the corpus uses Vitest);
- whatever is used, the *comparison policy* is ASF's job, and `node:bench`'s
  documented rules (ten warmups, inspect raw samples for GC pauses and
  multimodality, amortise timer reads, make results observable so the engine
  cannot delete the work) are the specification for that harness.

### 2.4 Noise is not your enemy; unquantified noise is

Layout/alignment effects can swamp a benchmark. Stabilizer states the problem
in one sentence that should govern any ASF benchmark (Curtsinger & Berger,
**ASPLOS'13**, [PDF](https://people.cs.umass.edu/~emery/pubs/stabilizer-asplos13.pdf),
read in full):

> "caches and branch predictors make performance dependent on machine-specific
> parameters and the exact layout of code, stack frames, and heap objects. **A
> single binary constitutes just one sample from the space of program layouts,
> regardless of the number of runs.** Since compiler optimizations and code
> changes also alter layout, it is currently impossible to distinguish the
> impact of an optimization from that of its layout effects."

Stabilizer's fix (re-randomising code/stack/heap at runtime, which also makes
layout effects Gaussian and therefore ANOVA-able) is out of reach for a Node
extension — but the *discipline* transfers, and it is what P30's harness must do
instead: many samples, warmup until the optimisation state settles, **the two
variants measured interleaved and in randomized order inside one process** (the
same insight as the duet procedure, and the reason it buys 5×–37× accuracy), and
a reported CV so a reader can see whether the comparison was ever load-bearing.
A single run of a single build is not evidence at all, in either direction.

Production practice converged on the same conclusion: continuous performance
systems do **change-point detection and statistical tests**, not percentage
thresholds — Mozilla's Perfherder (t-test based), Apache Otava
([otava.apache.org](https://otava.apache.org/)), and a live research line on CPD
for performance regressions
([arXiv:2606.18377](https://arxiv.org/abs/2606.18377),
[arXiv:2610.09023](https://arxiv.org/abs/2610.09023)).

A "±15% is a regression" rule (the usual first guess, and what the AWS guidance
illustrates for *investigation* triggers) is a triage heuristic, not a verdict:
on a noisy CI machine it fires on unchanged code and gets switched off, and on a
quiet machine it hides a real 12% loss. The gate must be **statistical
significance + effect size**, with the raw samples retained.

The measured failure rate of the naive alternative, from the sources read in
full:

- **MongoDB's CI system** (Apache Otava): two threshold-based regression systems
  were tried first and "neither system was sufficient" — the false-positive rate
  reached **99%** under one counting; run-to-run variation is usually under 10%
  but *some tests fluctuate 20% or more*, so no single threshold fits
  ([Otava](https://otava.apache.org/), read in full).
- **Mozilla Perfherder**, after a year of production data: **12.5%** of alert
  groups are false positives and about **6.8%** contain regressions the t-test
  missed; 25 change-point methods plus 15 ensembles were evaluated against a
  174-series set annotated by eleven engineers, and ensemble voting bought an
  **11% F1** improvement
  ([arXiv:2606.18377](https://arxiv.org/abs/2606.18377), abstract read).
- **Shared/cloud machines** (Laaber, Scheuner & Leitner, 4.5 M data points, Java
  and Go on AWS/GCE/Azure vs bare metal): the coefficient of variation of
  repeated identical runs ranges from **0.03% to over 100%** depending on
  benchmark and instance; both standard comparison tests "falsely report high
  numbers of performance changes … when in fact neither the benchmark nor
  production code has changed and the sample size (e.g., a single instance) is
  low"; and only **78–83%** of benchmark/environment combinations can detect a
  slowdown at all when test and control run on *different* instances. The
  mitigations are specific and cheap to copy: **test and control on the same
  instances, in randomized order, ≥ 10 instances**, Wilcoxon rank-sum (which
  beat overlapping bootstrap CIs on both sensitivity and cost), and an accepted
  false-positive budget of **≤ 5% of 100 simulations**
  ([Laaber et al., ACM](https://doi.org/10.1007/978-3-030-45981-9_14),
  [preprint PDF](https://research.chalmers.se/publication/511491/file/511491_Fulltext.pdf),
  read in full). Running the two artefacts *together* on the same machine — the
  duet procedure — improves accuracy by **2.3–12.5× (5.03× average)** on
  ScalaBench/DaCapo and **23.8–82.4× (37.4× average)** on SPEC CPU 2017
  ([Koucký et al., ICPE'20 / arXiv:2001.05811](https://arxiv.org/abs/2001.05811),
  read in full).

**ASF's own reproduction of the problem** (this machine, 4 cores, load average
≈ 2.7 — i.e. the normal condition of a shared development box, not a lab). A
~60-line harness (10 warmups, 30 samples, randomized interleaving of the two
variants, Wilcoxon rank-sum with tie correction + Hodges–Lehmann log-median
ratio; the harness is committed under
[`prototype-perf-gate/`](prototype-perf-gate/README.md) so these numbers are
reproducible rather than asserted) was run against a synthetic
workload with a *known* amount of extra work injected:

| condition | statistical gate fires | naive "median +15%" fires | naive "median +10%" fires | median CV |
|---|---|---|---|---|
| quiet, candidate identical to baseline | 0/40 | 0/40 | 0/40 | 2.3% |
| quiet, +10% work | 40/40 | 0/40 | 21/40 | 1.6% |
| quiet, +20% work | 40/40 | 40/40 | 40/40 | 1.5% |
| under 3 competing CPU hogs, identical | 0/25 | 2/25 | 2/25 | **50.2%** |
| under load, +10% work | **13/25** | 2/25 | 10/25 | 46.9% |
| under load, +20% work | **16/25** | 22/25 | 23/25 | 55.6% |

Three findings that directly shape P30/P31:

1. The statistical gate is strictly better than a threshold on quiet machines:
   zero false fires and it detects a 10% regression the ±15% rule misses every
   time.
2. **Under contention it loses power** (13/25 for a real 10% regression) while
   the naive threshold starts firing on unchanged code — exactly the failure
   mode the literature predicts. So the gate must *refuse to run* on a busy
   machine (check load average against core count, or the measured CV) and say
   `skipped: machine busy`, never silently pass or silently fail.
3. The gate is cheap: a 30-sample trial is seconds, so "too expensive for the
   loop" is not a valid excuse — the expensive part is the load test, not the
   comparison.

### 2.5 Percentiles, environment, and the lab/field split

Any performance claim must carry: percentile set (p50/p95/p99 minimum), sample
count, environment (runtime version, CPU, concurrent load, dataset size), and
whether it is **lab** (synthetic, controlled) or **field** (real users). Web
performance has formalised this as Core Web Vitals with explicit thresholds at
the **75th percentile** — LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1
([Google](https://developers.google.com/search/docs/appearance/core-web-vitals)).
The generalisable part is not the numbers, it is the shape: *a named metric, a
percentile, a threshold, and a declared measurement context.*

---

## 3. "Load testing" is eight different questions

The AWS reference taxonomy ([Performance Testing on AWS — Understanding Test
Types](https://docs.aws.amazon.com/solutions/latest/performance-testing/understanding-test-types.html))
is the clearest statement of what each test type is *for*; ASF has no vocabulary
for any of them:

| Test type | Question | Load pattern | Duration | Cadence |
|---|---|---|---|---|
| Smoke | is it fundamentally working? | 1–5 VUs | 1–2 min | every deploy |
| Baseline | what is our known-good profile? | expected average | 15–30 min | after infra/arch change |
| Load | can we hold expected peak? | ramp to peak, hold | 15–60 min | before release |
| Stress | where does it break? | ramp past peak to failure | to breaking point | quarterly / after arch change |
| Endurance (soak) | does it degrade over time? | moderate, sustained | 4–24 h | monthly / after leak fixes |
| Scalability | does it scale linearly? | 1×, 2×, 4×, 8× steps | 30 min/step | after scaling changes |
| Spike | can it absorb a burst? | instant jump, then back | 5–15 min | before known events |
| Volume | how does data size bite? | normal load, huge data | 30–60 min | before migrations/bulk ops |

Two of these are structurally important for ASF and are not "load tests" at all:

- **Baseline** converts "is this fast?" into "is this *different* from what we
  expect?" — the only form that can gate a build.
- **Scalability** is the only one that answers an *architecture* question.
  "Sub-linear scaling (throughput gains diminish at higher load) indicates a
  shared resource bottleneck: a database lock, a singleton connection, or a
  component that cannot be horizontally scaled." And on the stress side, AWS
  spells the consequence out: "A Lambda concurrency throttle means you need
  reserved concurrency **or architecture redesign**", "document the breaking
  point and the failure mode. When the breaking point increases over time, your
  architecture is improving. When it decreases, something regressed." That is
  the moment where tuning is the wrong answer, stated by a vendor guide ASF can
  cite.

The quantified version of that judgement is **Gunther's Universal Scalability
Law** — `C_p = p / (1 + σ(p − 1) + κp(p − 1))`, with **σ** the contention term
(Amdahl-style serialisation) and **κ** the coherency term (the cost of keeping
replicas consistent, which makes throughput *fall*, not just flatten, as you add
capacity) ([arXiv:0808.1431](https://arxiv.org/pdf/0808.1431), read in full). A
high σ says "you have a serialisation point"; a high κ says "your
replication/caching design is fighting you". Both are architecture findings with
a number attached, which is precisely what an escalation trigger needs to be
non-negotiable.

---

## 4. Performance bugs are a distinct defect class — with a taxonomy

ASF's gates are behavioural (06b), structural (06c/06e), completeness (06i),
model-shaped (06j) and security-shaped (06h). Performance bugs pass all of them
because **the program is correct, just wasteful**:

- **Root causes cluster at boundaries**: "the majority of real-world performance
  bugs… are covered by only a couple of root-cause categories. Common patterns
  do exist and performance is mostly lost at **call sites and function
  boundaries**" (Jin, Song & Lu,
  **PLDI'12**, June 11–16 2012, Beijing —
  [PDF](https://pages.cs.wisc.edu/~shanlu/paper/pldi118-jin.pdf), read in full)
  — the same boundary-obsession as 06c's deep modules, but for cost instead of
  complexity. The study's own numbers, verified against the PDF, are the ones
  that justify gates rather than taste: **109** real performance bugs from
  Apache, Chrome, GCC, Mozilla and MySQL; **two thirds** were introduced by
  developers' *wrong understanding of workload or of an API's performance
  features* (i.e. an agent guessing instead of looking it up — the exact
  failure P33 exists for); **more than a quarter** were not born buggy but
  became inefficient when the workload or the API changed underneath correct
  code; **almost half** needed inputs with *both* a special feature and a large
  scale to expose them (which is why a functional test at n=3 never sees them);
  **almost half** of the fix patches contained a rule reusable elsewhere; and
  the recurring structural patterns include *uncoordinated functions* (more
  than a third) and *skippable function* (more than a quarter).
- **Taxonomy**: effects / causes / contexts. TANDEM reviewed 49 papers
  reporting real-world performance bugs and publishes a dataset of **125** fully
  documented bugs across Java, C, SQL and more, classified by *effect* (time,
  memory, energy), *cause* (source-code structure, misuse/misunderstanding of
  operations, redundancy of code, …) and *context* (project type, language,
  generalisability) — an open-access, reusable classification to aim a detector
  at ([Sánchez et al., IEEE Access 2020, DOI 10.1109/ACCESS.2020.3000928](https://doi.org/10.1109/ACCESS.2020.3000928),
  [PDF](https://rodin.uca.es/handle/10498/23466), read in full). Note "energy"
  as a first-class effect: resource utilisation is not only a cost question.
- **Categories in the wild**: memory management (most prevalent), concurrency,
  algorithmic inefficiency, I/O, build tooling. PerfBench's own taxonomy over
  its 81 .NET tasks: memory management 33 (18 excessive allocations, 15 leaks),
  concurrency/threading 14, inefficient algorithms and data structures 14, I/O
  and serialization 12 (10 of them serialization), build/analysis tools 8 —
  i.e. **four of the five categories are invisible to every current ASF gate**
  ([PerfBench, Table 3](https://arxiv.org/abs/2509.24091), read in full).
- **Detectable patterns exist, and a *small* number of them already pays.** The
  closest precedent for what P30 phase 1 proposes: a study of 70 real performance
  bugs in eight large Android apps produced bug patterns, and a Soot-based static
  analyser implementing just **two** of them found **126 instances in 18 of 29
  applications (1.1 M lines of Java)** — **68 confirmed by developers as
  previously unknown performance issues and 20 fixed on the spot**
  ([Liu, Jin, Fan, Liu, Xu & Deng, ICSE'14](https://sqlab-sustech.github.io/files/paper/ICSE2014.pdf),
  read in full; Android scope stated). Two objectively checkable patterns beat
  "we thought about performance". The same line of work continues with pattern
  inference from real developer commits
  ([IEEE ICSME'19](https://ieeexplore.ieee.org/document/8987574), orientation
  only) and, on the diagnosis side, PerfSig, which detects anomalies across
  system metrics, logs and function call traces and uses information-theoretic
  causal analysis to name the **root-cause function** (evaluated on 20 real bugs
  in six systems)
  ([He et al., ICSE'22](https://jhe16.github.io/files/ICSE22.pdf), read in full)
  — the model for what an ASF performance finding should output: a location and a
  cause, not "it got slower".
- **Coverage of performance tests is its own metric**, distinct from code
  coverage, and its cost is measurable. The first empirical study of it analysed
  the performance-test suites of **28 open-source systems**: JMH benchmarks
  achieve **about 8.8% method coverage on average — four times less than the
  JUnit tests** of the same systems — while the suites cost **62× the execution
  time** of the functional suites, and higher coverage comes with yet more
  execution time
  ([Imran, Cortellessa, Di Ruscio, Rubei & Traini, EASE 2024](https://riccardorubei.github.io/files/C_2024_2.pdf),
  read in full). That single pair of numbers is the whole cost argument for
  P34: performance tests are *expensive and thin*, so ASF must make the cheap
  checks unconditional and schedule the expensive ones, and must never let a
  whole category be skipped because the expensive one was. A follow-up shows
  better performance-test coverage finds more performance issues
  ([EMSE 2025](https://link.springer.com/article/10.1007/s10664-025-10712-3)).
  ASF measures statement/branch/mutation coverage of *functional* tests and has
  no notion of covering the hot paths.

**The stack ASF actually builds in has a well-documented failure set.** Node:
blocking the event loop and starving the worker pool
([official guide](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop)).
Databases: over-fetching, **missing indexes**, full table scans, N+1 through
lazy/fluent relation loading, per-request client construction → **connection
pool exhaustion**, and inserts done 50 000 at a time instead of in batches of
1000 ([Prisma query optimization](https://www.prisma.io/docs/orm/v7/prisma-client/queries/advanced/query-optimization-performance);
`relationLoadStrategy: "join"`, dataloader batching, `createMany`).

**Honest scoping note.** Prisma and MySQL were read as the clearest *written*
statements of these failure modes, but neither appears anywhere in the projects
ASF actually guards: the corpus uses **`pg`** and **`better-sqlite3`**
(betamaxx/platform), **`mongodb`** (betamaxx/platform, conversense) and
**express** (clear_story, pt-clone) — no Prisma, no MySQL. So the plan-scan
metric was re-grounded on the engines that are really present, and each engine
names its tripwire mechanically:

- **MySQL 8.4**: `EXPLAIN` showing `type: ALL` is a full table scan and the
  causes are enumerated
  ([Avoiding Full Table Scans](https://dev.mysql.com/doc/refman/8.4/en/table-scan-avoidance.html));
  `possible_keys` (candidates) is *independent of table order* and `key` is the
  index actually chosen, and `key` can be an index absent from `possible_keys`
  ([EXPLAIN output](https://dev.mysql.com/doc/refman/8.4/en/explain-output.html))
  — so "no index used" must be read from `key`, not from `possible_keys`.
- **PostgreSQL**: the plan is a tree of nodes whose leaves are scan nodes
  (sequential / index / bitmap index); the top line carries the total estimated
  cost the planner minimises, and for machine consumption the docs say to use
  the **JSON/XML/YAML output format** rather than parsing the text art
  ([Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html),
  read in full) — `Seq Scan` on a large table is the tripwire.
- **SQLite**: each table read reports `SCAN` (full-table, *including* the
  index-ordered case) or `SEARCH` (a subset), with the index name and the
  covered `WHERE` terms
  ([EXPLAIN QUERY PLAN](https://www.sqlite.org/eqp.html)) — verified live on
  this machine: `select * from post where author_id=5` gives `SCAN post`
  before the index and `SEARCH post USING INDEX post_author (author_id=?)`
  after. **But** the same page carries an explicit warning: the output "is
  intended for interactive debugging only", "the output format may change
  between SQLite releases", "applications should not depend on the output
  format", and it *did* change substantially in 3.24.0 and again in 3.36.0. A
  plan-scan rule built on it is therefore a **warning, never a hard failure**,
  and must degrade to `scanned: 0` rather than a pass. (`node:sqlite` is still
  experimental on Node 22 and prints an `ExperimentalWarning`, which is also
  why the probe must not treat that module's stability as guaranteed.)
- **MongoDB**: `explain()` returns a tree of stages whose leaves name the access
  path — `COLLSCAN` (collection scan) vs `IXSCAN` (index) — so the tripwire is
  the same shape as SQL's; note `explain` **ignores the plan cache** and stops
  the planner caching the winning plan, so an explain-based check must not be
  used as a proxy for production plan choice
  ([explain results](https://www.mongodb.com/docs/manual/reference/explain-results/),
  read in full).
- **Counting queries without a proxy** (this is what makes the N+1 check
  objective rather than a guess): the MongoDB Node driver emits
  `commandStarted`/`commandSucceeded`/`commandFailed` events with `commandName`
  and `duration` when the client is constructed with `monitorCommands: true`
  ([monitoring](https://www.mongodb.com/docs/drivers/node/current/monitoring-and-logging/monitoring/));
  `pg` exposes per-query timing through the same event-emitter pattern; and
  `node:sqlite` can be wrapped at `prepare()` — verified live, a lazy
  per-author post fetch counted **11 queries at n=10 and 41 at n=40** (count
  grows with data ⇒ N+1) while the two-query eager version stayed at **2 and
  2**.

Every one of those is *objectively detectable* — a query-count that grows with
result size, a plan whose leaf is a full scan (`Seq Scan` / `SCAN` / `COLLSCAN`)
on a table above a row threshold, a synchronous API in a request path, an
unbounded list parameter. None of them is currently detected by any ASF gate, and
none of them makes a functional test fail — which is the whole point: the test
suite is green while the system is slow.

---

## 5. Optimization discipline: the anti-premature-optimization machinery

The literature's answer to "make it fast" is not "try things": it is *locate the
bottleneck, then apply the tactic at the right layer*.

- **USE method** (Gregg — [the method](https://www.brendangregg.com/usemethod.html)):
  "for every resource, check utilization, saturation, and errors" — a checklist
  that "solves about 80% of server issues with 5% of the effort", and the
  counter-intuitive corollary that **low average utilization does not mean no
  saturation** (5-minute averages hide 100% seconds). It is a *diagnostic*
  checklist, which is what an agent needs when told "the report page is slow".
- **Four golden signals** (SRE —
  [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)):
  latency, traffic, errors, saturation — plus the symptom/cause split ("my
  responses are slow" vs "CPUs are overloaded by a bogosort"). ASF's 06f already
  borrows observability from this book; performance is the same chapter.
- **SEI performance tactics** (Bass/Clements/Kazman, *Software Architecture in
  Practice* §5.4 —
  [chapter text](https://people.ece.ubc.ca/matei/EECE417/BASS/ch05lev1sec4.html))
  give the *architecture-level* option set, and are the missing vocabulary for
  "redesign":
  - **Resource demand**: increase computational efficiency, reduce computational
    overhead, manage event rate, bound execution times, **bound queue sizes**;
  - **Resource management**: **introduce concurrency**, **maintain multiple
    copies of data or computation** (replication, caching), increase available
    resources;
  - **Resource arbitration**: scheduling policy, priority assignment,
    pre-emption points.
  Their framing of latency is exactly the diagnosis ASF should force: response
  time = **resource consumption + blocked time**, where blocked time comes from
  contention, unavailability, or dependency on other computation ("if these two
  sources are read sequentially, the latency will be higher than if they are
  read in parallel").

A finding that can only be closed by a *resource-management or arbitration*
tactic is, by definition, not a code cleanup. That is the formal basis for the
escalation ladder in P32.

---

## 6. Performance and security are the same defect seen from two sides

**The strongest evidence for this is inside the standard ASF already claims.**
06h's DoD says "use OWASP ASVS 5.0 as the checklist source", and ASVS 5.0 itself
makes performance requirements at the level ASF defaults to for internet-facing
work (L2), read from the official chapter files
([OWASP/ASVS 5.0/en](https://github.com/OWASP/ASVS/tree/master/5.0/en)):

- **15.1.3 (L2)** — documentation must identify functionality that is
  "time-consuming or resource-demanding", how to prevent loss of availability
  from overusing it, and **how to avoid building a response that takes longer
  than the consumer's timeout**; named defences are asynchronous processing,
  queues, and **limiting parallel processes per user and per application**.
- **15.2.2 (L2)** — those defences must be *implemented*, not just written down.
- **5.2.1 (L1)** — accept only files "of a size which it can process without
  causing a loss of performance or a denial of service attack".
- **4.3.1 (L2)** — query allowlist / depth limiting / amount limiting / cost
  analysis against expensive nested queries (data-layer DoS).
- **2.4.1 (L2)** — anti-automation against excessive calls causing "quota
  exhaustion, rate-limit breaches, denial-of-service, or overuse of costly
  resources".
- **13.1.2 / 13.1.3 / 13.2.6 (L3)** — documented **connection-pool limits and
  behaviour at the limit**, and a documented **resource-management strategy for
  every external system** (databases, file handles, threads, HTTP connections)
  including **timeouts**, release, and retry limits/delays/back-off, with short
  timeouts and disabled-or-limited retries on synchronous HTTP "to prevent
  cascading delays and resource exhaustion" — and the code must follow it.
- **16.5.2 (L2)** — keeps operating securely when external resource access fails
  (circuit breakers, graceful degradation); **15.4.4 (L3)** — allocation
  policies must prevent **thread starvation**; **1.4.3 (L2)** — resources are
  released.

So the obligation is not new: ASF's security DoD already covers it and cannot
currently be satisfied, because no phase identifies resource-demanding
functionality, states a per-user concurrency limit, or checks a pool limit,
timeout or retry policy. (06h's chapter table also maps to ASVS **4.0** numbering
while labelled 5.0 — see P36 — which is how requirements like these stay
invisible.) The consequence for the proposals is that P28/P29/P30 do not need to
invent a mandate: they need to make an existing one checkable, and the same
abuse-case load run becomes the evidence for both gates (P37).

The vendor/practice layer says the same thing from the other direction. ASF's
security one-liner already contains a performance clause it never
measures: *"no unbounded resource use on user-controlled input"* (06h §0).
OWASP treats it as a requirement. API Security Top 10 **API4:2023 Unrestricted
Resource Consumption** states the API is vulnerable if *any one* of these limits
is missing or set inappropriately — execution timeouts, maximum allocable memory,
maximum file descriptors, maximum processes, maximum upload file size, **number
of operations in a single client request** (e.g. GraphQL batching), **number of
records per page returned in a single response**, and third-party provider
spending limits — with prevalence "Widespread" and detectability "Easy", and
notes the impact is not only DoS but *operational cost* (cloud bills, per-request
third-party charges)
([OWASP API4:2023](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/),
read in full; the 2019 edition of the same item was "Lack of Resources & Rate
Limiting", CWE-770/CWE-400). Its worked example is precisely the ASF case: a
UI lists 200 users via `?page=1&size=200`, an attacker sends `size=200000`, the
database falls over and the API stops serving anyone
([2019 edition, same scenario](https://api-security.owasp.org/editions/2019/en/0xa4-lack-of-resources-and-rate-limiting/),
read in full). The DoS cheat sheet adds the architectural half: analyse the
component inventory for "potential places where DoS attacks can cause problems
and… any single points of system failures, which can range from programming
related errors to **resource exhaustion**", and scale **up** or **out** or apply
bulkheading/redundancy — i.e. it treats resource exhaustion as a design finding,
which is the same conclusion P32 reaches from the performance side
([OWASP DoS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html),
read in full). Node's own guide makes the identity explicit: blocking a thread on
"evil input" is *both* a throughput problem and "a Denial of Service attack"
([Don't Block the Event Loop](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop),
read in full).

The practical consequence: the *same* measurement serves both gates. A load test
that finds the p99 cliff is also the abuse-case test 06b's security DoD asks
for; an unbounded `findMany()` is simultaneously a performance bug and a DoS
surface. ASF should not build two systems for this — it should make the
performance gate the measurement half of the security claim that is already
being asserted.

---

## 7. The research-behaviour half of the directive

*"ASF should generally be inclined to search online for authoritative sources."*
`02-research.md` already says "**Never plan architecture on memory alone**" —
but it is scoped to Phase 2 of **large** work, its search templates are shallow
(`<topic> best practices 2026`), and it has no notion of source authority. The
consequence is that during Phase 6 an agent states thresholds, tool behaviour and
library semantics from parametric memory. That is a known, measured failure mode
for code-producing LLMs — including "knowledge-conflicting hallucinations" such
as **non-existent API parameters** that evade linters and fail at runtime
([ACM](https://dl.acm.org/doi/10.1145/3793655.3793725);
[arXiv:2409.20550](https://arxiv.org/abs/2409.20550)).

Notably, the numbers in this very document are the kind of thing that must not
come from memory: "p95 < 2s" invented from memory is a fabricated requirement;
INP's 200 ms threshold, Core Web Vitals' p75 rule, wrk2's 10 s calibration floor
and `node:bench`'s ten warmups are all facts that were looked up. The rule ASF
needs is not "search more", it is "**a normative number must have a source, and
a source has a tier**" (P33).

**This round is the cautionary tale, and it is recorded rather than hidden.**
The first draft of this document cited the Jin/Song/Lu paper as OOPSLA'12 (it is
**PLDI'12**), and proposed a `bench` gate built on `node:bench` — which cannot
run on this machine at all, because the module is `added: v26.9.0` and the local
runtime is v22.22.1 (`ERR_UNKNOWN_BUILTIN_MODULE`, verified). Both came from
memory rather than lookup, both were plausible, and both would have shipped as
normative ASF text. The verification pass that fixed them is exactly the
behaviour P33 wants made mandatory — including the part where a fetched source
contradicts the claim it was fetched to support.

---

## 8. Gap analysis — what ASF has, what it lacks

| Capability | Security (reference model) | Performance (today) |
|---|---|---|
| Normative reference | `06h-security.md` (threat model, ASVS DoD, supply chain, agent surface) | **none** — `performance` exists only as a spec-area label |
| Requirement format | STRIDE matrix + threat registry | one example row in `05-plan.md` (`p95 < 2s`) |
| Adversarial lens | "Security lens (always applied)" | no performance lens |
| DoD line | ASVS chapters × level, recorded in plan | none |
| Automated gate | `npm audit`/osv-scanner/gitleaks in `/asf health` | nothing measures time, resources or capacity |
| Requirements inside a standard ASF already claims | ASVS chapters, checked (though mis-numbered — P36) | **ASVS 5.0 has them (15.1.3, 15.2.2, 5.2.1, 4.3.1, 2.4.1, 16.5.2 at L2; 13.1.2/13.1.3/13.2.6/15.4.4 at L3) and ASF never reaches them** → P37 |
| Baseline & trend | n/a | none |
| Blocking rule | open High threat ⇒ blocks delivery unless accepted | n/a |
| Abuse-case test | required by 06b security DoD | n/a |
| Escalation to architecture | n/a (security findings do not usually restructure the system) | **n/a — and for performance this is the normal outcome** |

Secondary gaps found while mapping this:

1. **No performance lens in Phase 4.** The adversarial checklist has security,
   architecture, code-quality and traceability lenses "always applied". Nothing
   asks "what is the cost of this design at 10× load, and where does it break?"
2. **No cost in the model.** 06j governs what the data model *means*; nothing
   governs what it *costs* — the same relation, the same file, the same owner:
   a relation that is legal but eagerly loaded per row is a model decision with
   a latency consequence (Tail-at-Scale amplification, §2.1).
3. **The delivery report has no performance field.** 06b Rule 17 requires spec
   status + evidence, test results, skipped checks, not-tested register. A
   delivery summary can be fully compliant while saying nothing about time or
   resources — so "nobody measured" leaves no trace (06i's principle, unapplied
   to performance).
4. **`06f-stability.md` stops short.** It already reaches for metrics ("latency…
   No metrics system → skip, and say so") for external calls, but treats them as
   observability, not as a gate.

---

## 9. Proposals (detail in improvement-proposals.md)

| ID | Proposal | Priority | Effort |
|---|---|---|---|
| **P28** | Performance scenarios are mandatory where a cost surface exists (SEI scenario format → MUST specs) | high | S |
| **P29** | New `06k-performance.md`: the performance reference (one-line DoD + measurement validity + test-type menu + USE diagnostics + SEI tactics + stack traps + perf↔DoS) | high | M |
| **P30** | `performance` level in the Code Health Gate, in four phases: (1) query-count (N+1) tripwire + plan-scan warning, (2) bench-vs-baseline with statistics, (3) resource ceilings, (4) load/web thresholds — reusing existing levels/config/baseline machinery; ASF's own harness because `node:bench` needs Node ≥ 26.9.0 | high | L (phased) |
| **P31** | The measurement contract: percentiles + samples + environment + statistical comparison; a perf claim without a measurement is an 06i violation | high | S |
| **P32** | **Escalation ladder**: measured findings that cannot be closed locally reopen the architecture (ATAM risk + ADR + ATAM-lite re-run + structural option set); open High performance finding blocks delivery unless explicitly accepted | high | M |
| **P33** | Research-first upgrade to `02-research.md`: authority tiers, search triggers, citation rule for normative numbers, applies in Phase 6 and at all scales | high | S |
| **P34** | Cost ceiling & CI placement: cheap gates always, expensive tests scheduled; perf tests are never excludable by subset selection when a hot path is touched; un-runnable tests are reported as skipped, never green | medium | S |
| **P35** | DoD + report fields + tests: 06b Rule 21, Rule 10 checkbox, delivery-report performance field, `QA_CHECKLIST` item, `test/test-perf-gate.mjs` | high | M |
| **P36** | **Bug fix**: 06h's ASVS chapter table is ASVS 4.0 numbering under a 5.0 label, so the ASVS DoD is unfalsifiable as written; correct to real 5.0 chapters + pin it with a test | high | S |
| **P37** | ASVS 5.0 already contains performance requirements at ASF's default L2 (15.1.3, 15.2.2, 5.2.1, 4.3.1, 2.4.1, 16.5.2, 1.4.3) and L3 (13.1.2, 13.1.3, 13.2.6, 15.4.4) — name them and make one abuse-case run evidence both gates | high | M |

**Scale rule holds**: small work gets the one-line DoD and (where a hot path is
touched) the cheap built-in tripwires. Load/stress/soak/scalability are large-work
or scheduled activities. Nothing here adds a minute of ceremony to a typo fix.

---

## 10. Deliberately not proposed

- **No p999 SLO theatre for internal tools.** Thresholds come from the project's
  own scenario or a cited source, never invented by the gate.
- **No mandatory load-test harness for small work**, and no perf tool that must
  be installed to pass — same rule as the model gate: a missing tool is reported
  (`missingTool`, `scanned: 0`), never silently green.
- **No performance-metric heuristics that fire on a guess.** A gate that fires on
  a name gets rationalised around or switched off, and the real rule dies with it
  (the P27 lesson, applied in advance).
- **No second observability stack.** Metrics are 06f's job; the gate consumes
  what exists and says what is missing.
- **No "optimize everything" mandate.** SEI tactics and USE are diagnostic tools
  for a *declared* target; without a scenario there is nothing to optimise
  against, and premature optimization stays the root of much evil.
- **No architecture redesign on a single noisy measurement.** Escalation
  requires a statistically supported finding at a declared load — otherwise the
  factory starts rewriting services because a CI box was busy. The prototype
  makes this concrete: under contention, a real 10% regression was detected only
  13 times in 25. "Refuse to conclude" is the correct behaviour, not a weaker gate.
- **No hard gate on parsed plan output.** SQLite's docs forbid depending on the
  EXPLAIN QUERY PLAN format (it changed in 3.24.0 and 3.36.0) and `node:sqlite`
  is still experimental on Node 22; a gate that breaks when a runtime changes its
  debug output teaches people to delete gates.
- **No new security checklist alongside ASVS.** P37 names clauses in the standard
  06h already claims rather than adding a second list — one obligation, one
  source of truth, one measurement evidencing both gates.

---

## 11. Verification plan (what will be checked, not asserted)

Per the standing rule that prose an agent can rationalise around is not a gate:

1. **The naive-measurement fixture fails**: a benchmark that reports only a mean,
   or a load script that closes the loop, is rejected by the measurement contract.
2. **The N+1 fixture fails**: a hot operation whose query count grows with result
   size is caught at the configured ceiling; the eager-loaded negative control is
   silent.
3. **The scan fixture is reported**: `Seq Scan` / `SCAN` / `COLLSCAN` above the
   row threshold is reported with `file:line`/query text; `scanned: 0` is
   *reported*, never passed. Plan parsing is a **warning**, not a hard failure,
   because SQLite's own docs forbid depending on its output format — so the test
   asserts "a full scan is named" and "an unparseable plan is announced", not
   "the build breaks". The hard-failing metric is `queryBudget`, which counts
   driver events rather than parsing plans.
4. **A regression is caught and a fluctuation is not**: seeded 20% regression →
   gate fails; seeded run-to-run noise within variance → gate passes (this is the
   negative control that a ±15% rule cannot pass). Already reproduced in the
   prototype: 0/40 false fires and 40/40 detection at +10% when quiet.
5. **A busy machine produces no verdict**: with competing CPU load, the harness
   reports `skipped: machine busy` and does **not** fail or pass — the prototype
   showed detection of a real 10% regression collapsing from 40/40 to 13/25 while
   a naive threshold began firing on unchanged code, so this test is what keeps
   the gate from being switched off in CI.
5. **Escalation is mechanical**: a sub-linear scaling fixture produces an
   architectural risk + ADR requirement + blocked delivery, and cannot be closed
   by raising a threshold (mirrors 06e Rule 2 "fix the cause, not the threshold").
6. **Wiring is grepped**: 06k exists and is indexed in SKILL.md; the Phase 4
   performance lens, the Rule 21 DoD, the report field and the QA_CHECKLIST item
   are all asserted to exist, with a negative control per item.
7. **Small work is unaffected**: the scale rule is asserted (a small-work run
   requires no load test).
8. **The ASVS map is pinned (P36)**: every `V<n> (topic)` pair in 06h is asserted
   against the real ASVS 5.0 chapter list, with a negative control (a 4.0-style
   pair fails). This is the test whose absence let the table drift.
9. **The shared evidence is shared (P37)**: one abuse-case run is asserted to
   satisfy both the security clause and the performance scenario — an unbounded
   page-size fixture fails the abuse-case check and the `queryBudget` gate from
   the same measurement, and a fixture with no outbound timeout is reported
   against 13.1.3 rather than silently passing.
