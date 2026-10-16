# Prototype: the measurement half of P30/P31

Not shipped code. This is the evidence behind the numbers quoted in
[../performance-blind-spots.md](../performance-blind-spots.md) §2.4 and in
**P30**/**P31** of [../improvement-proposals.md](../improvement-proposals.md),
kept so a reviewer can reproduce them instead of taking them on trust. Run from
this directory with the Node version ASF actually has (measured on v22.22.1,
4 cores — `node:bench` does not exist there, which is one of the things this
prototype proves ASF cannot rely on).

```
node gate.mjs 40      # statistical gate vs naive thresholds, N=40 trials
node nplus1.mjs       # query-count (N+1) and plan-scan probes
```

## What each file is

| file | purpose |
|---|---|
| `stats.mjs` | ~40 lines: Wilcoxon rank-sum (Mann–Whitney U, normal approximation with tie correction) and a Hodges–Lehmann log-median ratio. This is the "comparison policy" `node:bench` explicitly leaves to a higher-level tool. |
| `gate.mjs` | the trial loop: 10 warmups, 30 samples, the two variants **interleaved in randomized order in one process**, then the gate. Compares three verdict rules on a synthetic workload with a *known* amount of extra work injected: the statistical gate (p < 0.01 and ratio > 1.05), a naive "median +15%" rule, and "median +10%". Also reports the observed coefficient of variation. |
| `nplus1.mjs` | the two built-in tripwires, on `node:sqlite`: a query counter wrapped at `prepare()` (a lazy per-author fetch counts 11 queries at n=10 and 41 at n=40 ⇒ scales with data ⇒ N+1; the eager version stays at 2 and 2), and a plan scan (`SCAN post` before the index, `SEARCH post USING INDEX post_author (author_id=?)` after). |

## What the runs showed (quiet machine, load average ≈ 2.7)

| condition | statistical gate | naive +15% | naive +10% | median CV |
|---|---|---|---|---|
| candidate identical to baseline | 0/40 | 0/40 | 0/40 | 2.3% |
| +10% work | 40/40 | **0/40** | 21/40 | 1.6% |
| +20% work | 40/40 | 40/40 | 40/40 | 1.5% |

Under three competing CPU hogs (killed afterwards; a shared machine was not left
burning):

| condition | statistical gate | naive +15% | naive +10% | median CV |
|---|---|---|---|---|
| identical | 0/25 | 2/25 | 2/25 | **50.2%** |
| +10% work | **13/25** | 2/25 | 10/25 | 46.9% |
| +20% work | **16/25** | 22/25 | 23/25 | 55.6% |

## The three conclusions drawn from it

1. **Significance + effect size beats a threshold.** On a quiet machine the
   statistical gate never fired on unchanged code and caught a 10% regression
   that the ±15% rule missed in every single trial — which is why P31's
   measurement contract forbids percentage thresholds as the verdict.
2. **Contention destroys power, so the gate must refuse to run.** With load on
   the box, detection of a real 10% regression collapsed to 13/25 while the naive
   rule began firing on unchanged code. Hence `skipped: machine busy` in P30 —
   no verdict, no pass, no fail — and reporting the observed CV with every
   number.
3. **The cheap checks are genuinely cheap and genuinely objective.** Query count
   and plan scan need no third-party tool and run in milliseconds, which is what
   makes them phase 1 and makes "too slow for the loop" an invalid objection to
   P34's always-run tier. The plan parser is a *warning* only, because SQLite's
   own documentation forbids depending on that output format.

Deliberate limitations (this is a measurement probe, not the gate): the workload
is synthetic and CPU-bound; the load generators are crude; `node:sqlite` prints
an `ExperimentalWarning` on Node 22; and the harness has no GC/multimodality
inspection of the kind `node:bench`'s docs recommend, which is a phase-2 item.
