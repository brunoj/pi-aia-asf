# Research Sources

All sources consulted for this research engagement, grouped by pillar. Fetched
directly unless noted (search-snippet only = title/abstract from search results,
used for orientation, not load-bearing).

## Architecture (10-architecture.md)

| Source | URL | Used for |
|---|---|---|
| ISO/IEC/IEEE 42010:2022 (arc42 quality model summary) | https://quality.arc42.org/standards/iso-42010 | A1 key concepts |
| ISO/IEC/IEEE 42010:2022 official (ISO OBP) | https://www.iso.org/obp/ui/#!iso:std:74393:en | A1 (cross-check) |
| arc42 template overview | https://arc42.org/overview/ | A2 12 sections |
| arc42 docs (section pages) | https://docs.arc42.org/ | A2 (referenced) |
| MADR — Markdown Architectural Decision Records | https://adr.github.io/madr/ | A4 template + lifecycle |
| SEI ATAM collection (CMU SEI) | https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/ | A3 9 steps, outputs |
| Thoughtworks — Fitness function-driven development | https://www.thoughtworks.com/insights/articles/fitness-function-driven-development | A8 fitness functions |
| Evolutionary architecture (Ford/Parsons/Kua) | https://evolutionaryarchitecture.com/ ; https://www.thoughtworks.com/en-us/insights/books/building-evolutionaryarchitectures-second-edition | A8 |
| C4 model diagrams | https://c4model.com/diagrams | A5 zoom levels |
| ISO/IEC 25010:2023 (arc42 quality model) | https://quality.arc42.org/standards/iso-25010 | A6 nine characteristics |
| arc42 — How to specify quality requirements (SEI scenario template + Q42 two-tier) | https://quality.arc42.org/articles/specify-quality-requirements | A7 scenario format |
| Ousterhout, Stanford CS190 modular design notes (Winter 2018) | https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign | A9 deep modules, information hiding, martyr principle |
| Parnas, On the Criteria To Be Used in Decomposing Systems into Modules | https://www.cs.umd.edu/class/spring2003/cmsc838p/Design/criteria.pdf (referenced by Ousterhout; direct fetch 404 — cited via Ousterhout) | A9 |
| A Philosophy of Software Design — summary | https://www.janmeppe.com/blog/a-philosophy-of-software-design-john-ousterhout/ | A9 complexity, TDD critique |
| Modules Should Be Deep (Valente) | https://softengbook.org/articles/deep-modules | A9 deep vs shallow |

## Software craft (20-software-craft.md)

| Source | URL | Used for |
|---|---|---|
| Ousterhout CS190 notes (as above) | | C1–C2 |
| Refactoring.Guru code smells catalog | https://refactoring.guru/refactoring/smells | C3 smell groups |
| Release It! (Nygard 2nd ed.) — detailed summary | https://system-design.space/en/chapter/release-it-book | C4 stability patterns |
| Twelve-Factor App | https://12factor.net/ | C5 |
| Thoughtworks fitness functions (as above) | | C6 observability |
| Fowler on method size / semantic distance (quoted via Valente) | https://softengbook.org/articles/deep-modules | C2, C8 |

## Testing & QA (30-testing-qa.md)

| Source | URL | Used for |
|---|---|---|
| ISO/IEC/IEEE 29119 (Wikipedia overview of parts) | https://en.wikipedia.org/wiki/ISO/IEC_29119 | T1 parts, techniques, controversy |
| ISO/IEC/IEEE 29119-1:2022 (ISO OBP; JS-only, used via search abstract) | https://www.iso.org/obp/ui/en/#!iso:std:81291:en | T1 risk-based testing quote |
| ISO/IEC/IEEE 29119-2 (ISO page) | https://www.iso.org/standard/79428.html | T1 processes |
| Stryker .NET configuration docs | https://stryker-mutator.io/docs/stryker-net/configuration/ | T2 thresholds/break, levels, since/baseline |
| Mutation testing vs coverage (Yuri Kan) | https://yrkan.com/blog/mutation-testing-coverage/ | T2 score bands, coverage theater, CI integration |
| Mutation testing lecture (Korea Univ., search snippet) | https://plrg.korea.ac.kr/courses/aaa705/2024_1/slides/lec7-handout.pdf | T2 adequacy score (snippet) |
| Testing pyramid vs diamond (Code4IT) | https://www.code4it.dev/architecture-notes/testing-pyramid-vs-testing-diamond/ | T3 |
| Flaky tests & non-determinism (ArchMan) | https://archman.dev/docs/anti-patterns-and-pitfalls/flaky-tests-and-non-determinism | T4 taxonomy + fixes |
| Characterization test (Wikipedia) | https://en.wikipedia.org/wiki/Characterization_test | T5 |
| Contract testing / Pact (search results) | https://helpmetest.com/blog/pact-testing-guide/ ; https://archman.dev/docs/quality-attributes/testability/contract-and-consumer-driven-tests | T6 |

## Security (40-security.md)

| Source | URL | Used for |
|---|---|---|
| NIST SP 800-218 SSDF v1.1 | https://csrc.nist.gov/pubs/sp/800/218/final ; https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf | S1 PO/PS/PW/RV |
| SSDF explained (practice groups + evidence) | https://safeguard.sh/resources/blog/nist-ssdf-secure-software-development-framework | S1 evidence chain |
| OWASP Top 10:2025 | https://owasp.org/Top10/2025 | S2 |
| OWASP ASVS 5.0 (chapter/level index) | https://security-resilience.ai/asvs/index.html ; https://owasp.org/www-project-application-security-verification-standard | S3 |
| STRIDE threat modeling + DFD + threats-as-code | https://tomodahinata.com/en/blog/threat-modeling-stride-data-flow-diagram-secure-design-practical-guide | S4 |
| Threat Modeling Manifesto | https://www.threatmodelingmanifesto.org/ | S4 (referenced) |
| SLSA v1.0 levels | https://slsa.dev/spec/v1.0/levels | S5 |
| OWASP GenAI — LLM Top 10 2025 | https://genai.owasp.org/llm-top-10/ | S6 |
| NIST SP 800-218A (GenAI SSDF profile) | https://csrc.nist.gov/Projects/ssdf | S6 (referenced) |
| OWASP AI Agent Security Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html | S7, A7 |

## AI-era (50-ai-era.md)

| Source | URL | Used for |
|---|---|---|
| OWASP AI Agent Security Cheat Sheet (as above) | | A7 |
| Fowler/Böckeler — Understanding Spec-Driven Development | https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html | A5 |
| LLM Coding Workflow Best Practices 2026 (compendium; cites Stack Overflow 2025, Sonar 2026, DORA 2025, Octoverse 2025) | https://baeseokjae.github.io/posts/llm-coding-workflow-best-practices-2026/ | A1–A4, A8 |
| Spec-driven development (arXiv paper, search snippet) | https://arxiv.org/pdf/2602.00180 | A5 (snippet) |

## Performance (performance-blind-spots.md → P28–P37)

Fetched = read the page this session. Snippet = title/abstract from search
results (orientation only, not load-bearing).

| Source | URL | Used for | Access |
|---|---|---|---|
| PerfBench: Can Agents Resolve Real-World Performance Bugs? (Garg, Zilouchian Moghaddam, Sundaresan) | https://arxiv.org/abs/2509.24091 | headline agent evidence (81 .NET tasks, OpenHands ~3% → OpenHands-Perf-Agent ~20%); five bug categories with counts (.NET-only caveat stated) | fetched (PDF read) |
| ISO/IEC/IEEE 25010:2023 — Product quality model | https://www.iso.org/standard/78176.html | nine characteristics, "specified, measured and evaluated"; clause text paywalled → sub-characteristics taken from arc42 | fetched (abstract only) |
| arc42 Quality Model — Performance | https://quality.arc42.org/qualities/performance | time behaviour / resource utilization / capacity definitions, verbatim from ISO 25010 | fetched |
| SEI/ATAM — Architecture Tradeoff Analysis Method collection | https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/ | "a method for evaluating software architectures relative to quality attribute goals… expose architectural risks"; nine steps; risks / non-risks / **sensitivity points** / tradeoff points → the vocabulary and the re-run for P32 | fetched |
| Bass/Clements/Kazman, *Software Architecture in Practice* §5.4 Performance Tactics | https://people.ece.ubc.ca/matei/EECE417/BASS/ch05lev1sec4.html | resource demand / resource management / resource arbitration; latency = resource consumption + blocked time | fetched |
| Dean & Barroso — The Tail at Scale (CACM 2013) | https://cacm.acm.org/research/the-tail-at-scale/ | fan-out tail amplification (1-in-100 → 63%); causes of variability; tail-tolerant techniques | fetched |
| Google SRE — Monitoring Distributed Systems (four golden signals) | https://sre.google/sre-book/monitoring-distributed-systems/ | latency/traffic/errors/saturation; symptom vs cause; white- vs black-box monitoring | fetched |
| Gregg — The USE Method | https://www.brendangregg.com/usemethod.html | utilization/saturation/errors checklist; "80% of server issues with 5% of the effort"; 5-minute averages hide 100% seconds | fetched |
| Nielsen — Response Times: 3 Important Limits | https://www.nngroup.com/articles/response-times-3-important-limits/ | 0.1 s / 1 s / 10 s thresholds as the *user-perception* basis for a time-behaviour budget | fetched |
| Tene — wrk2 (constant throughput, HdrHistogram, coordinated omission) | https://github.com/giltene/wrk2/blob/master/README.md | open-loop/constant-throughput requirement; lossless recording; 10 s calibration floor | fetched |
| Node.js — Benchmark runner (`node:bench`) | https://nodejs.org/api/bench.html | warmup/JIT guidance, measurement integrity, runner delegates comparison policy → Welch/rank tests, effect size, multiple-comparison correction; **added v26.9.0 + `--experimental-bench`, absent on local v22.22.1** | fetched |
| Node.js — Don't Block the Event Loop (or the Worker Pool) | https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop | Node trap list (blocking APIs, CPU work, thread-pool starvation); "evil input" that blocks a thread *is* DoS | fetched |
| Node.js — Performance measurement APIs (`perf_hooks`) | https://nodejs.org/api/perf_hooks.html | `eventLoopUtilization()` as the saturation signal for `resourceCeiling` | fetched |
| Node.js — CLI reference (`--cpu-prof`) | https://nodejs.org/api/cli.html | built-in profiler for the locate-the-bottleneck step (no new tooling) | fetched |
| Tinybench | https://github.com/tinylibs/tinybench | dependency-free harness with stddev, margin of error and percentiles — candidate bench substrate | fetched |
| Vitest — Features | https://vitest.dev/guide/features | benchmarks already available via Tinybench in the test runner every ASF project uses | fetched |
| AWS — Performance Testing on AWS: Understanding Test Types | https://docs.aws.amazon.com/solutions/latest/performance-testing/understanding-test-types.html | eight test types + load pattern/duration/cadence; baseline semantics; sub-linear ⇒ shared bottleneck; ±15% as an *investigation* trigger only | fetched |
| Gunther — Universal Scalability Law | https://arxiv.org/pdf/0808.1431 | `C_p = p / (1 + σ(p−1) + κp(p−1))`; σ contention / κ coherency; throughput can *fall* with added capacity → quantitative escalation trigger | fetched (PDF read) |
| Curtsinger & Berger — Stabilizer: Statistically Sound Performance Evaluation (ASPLOS'13) | https://people.cs.umass.edu/~emery/pubs/stabilizer-asplos13.pdf | "a single binary constitutes just one sample from the space of program layouts, regardless of the number of runs"; layout effects dwarf other variance; re-randomisation makes them Gaussian | fetched (PDF read) |
| Laaber, Scheuner & Leitner — Performance test variability in public clouds (IEEE/ISSRE) | https://research.chalmers.se/publication/511491/file/511491_Fulltext.pdf | CV 0.03%→>100%; both standard comparison tests false-fire on unchanged code at low sample size; only 78–83% of benchmark/env combos detect a slowdown at all across different instances; test+control on same instances in randomized order, ≥10 instances, Wilcoxon rank-sum, FP ≤5% | fetched (PDF read) |
| Koucký, Vokáč et al. — Duet measurement procedure (ICPE'20) | https://arxiv.org/abs/2001.05811 | measuring both variants together on the same machine: accuracy 2.3–12.5× (5.03× avg) ScalaBench/DaCapo, 23.8–82.4× (37.4× avg) SPEC CPU 2017 → basis for interleaved A/B in one process | fetched (PDF read) |
| Apache Otava — Continuous performance engineering at MongoDB | https://otava.apache.org/ | threshold-based regression detection reached ~99% false positives; run-to-run variation usually <10% but some tests >20%; change-point detection over stored results | fetched (PDF read) |
| Besbes et al. — Change-point detection for performance anomaly detection at Mozilla (Perfherder) | https://arxiv.org/abs/2606.18377 | 12.5% of alert groups false positives, ~6.8% contain missed regressions; 25 CPD + 15 ensembles on 174 engineer-annotated series; ensembles +11% F1 | fetched (abstract) |
| Costa et al. — Evaluating change-point detection methods for software performance regression analysis | https://arxiv.org/abs/2610.09023 | CPD as the accepted method for perf time series; properties of performance measurement data | fetched (abstract) |
| Jin, Song & Lu — Understanding and Detecting Real-World Performance Bugs (**PLDI'12**) | https://pages.cs.wisc.edu/~shanlu/paper/pldi118-jin.pdf | 109 bugs (Apache/Chrome/GCC/Mozilla/MySQL); two thirds from wrong understanding of workload or API performance features; >1/4 born correct; ~half need special feature **and** large scale; ~half of patches carry reusable rules; uncoordinated functions >1/3, skippable function >1/4 | fetched (PDF read) |
| Sánchez et al. — TANDEM: A Taxonomy and a Dataset of Real-World Performance Bugs (IEEE Access 2020) | https://doi.org/10.1109/ACCESS.2020.3000928 | 49-paper review → 125 documented bugs; effects (time/memory/energy) × causes × contexts | fetched (PDF read) |
| Liu, Jin, Fan, Liu, Xu & Deng — Characterizing and Detecting Performance Bugs for Smartphone Applications (ICSE'14) | https://sqlab-sustech.github.io/files/paper/ICSE2014.pdf | **the precedent for a cheap static perf gate**: 70 real bugs from 8 large Android apps → patterns; a Soot-based analyser (PerfChecker) with just **two** patterns found **126 instances in 18 of 29 apps (1.1 M LoC)**, 68 confirmed by developers as previously unknown, 20 fixed on their suggestions. Android scope stated | fetched (PDF read) |
| Inferring Performance Bug Patterns from Developer Commits (ICSME'19) | https://ieeexplore.ieee.org/document/8987574 | patterns recoverable from real fixes | snippet (orientation only) |
| He, Lin, Gu, Yeh & Zhuang — PerfSig: Extracting Performance Bug Signatures via Multi-modality Causal Analysis (ICSE'22) | https://jhe16.github.io/files/ICSE22.pdf | anomaly detection over system metrics + logs + function call traces, information-theoretic causal analysis to pinpoint the root-cause function; evaluated on 20 real-world bugs in six systems → the shape of a perf *diagnosis*, not a guess | fetched (PDF read) |
| Imran, Cortellessa, Di Ruscio, Rubei & Traini — An Empirical Study on Code Coverage of Performance Testing (EASE'24) | https://riccardorubei.github.io/files/C_2024_2.pdf | JMH suites: ~8.8% method coverage on average, 4× less than JUnit, **62× the execution time**; coverage/time trade-off → the cost case for P34 | fetched (PDF read) |
| Same authors — Is code coverage of performance tests related to source code features? (EMSE 2025) | https://link.springer.com/article/10.1007/s10664-025-10712-3 | higher perf-test coverage ⇒ more performance issues found; no generalizable characteristics of perf-tested code (so heuristics for "what to benchmark" do not exist) | fetched |
| Prisma — Query optimization (v7) | https://www.prisma.io/docs/orm/v7/prisma-client/queries/advanced/query-optimization-performance | n+1, `relationLoadStrategy: "join"`, dataloader batching, bulk ops, single client / pool exhaustion, over-fetching. **Not in the ASF corpus** — read as the clearest written statement of the failure modes, not as the target stack | fetched |
| MySQL 8.4 — Avoiding Full Table Scans | https://dev.mysql.com/doc/refman/8.4/en/table-scan-avoidance.html | `EXPLAIN type: ALL` = full scan, and the four conditions that cause it | fetched |
| MySQL 8.4 — EXPLAIN output | https://dev.mysql.com/doc/refman/8.4/en/explain-output.html | `possible_keys` is independent of table order; `key` is the index actually chosen and may be absent from `possible_keys` → read "no index" from `key` | fetched |
| PostgreSQL — Using EXPLAIN | https://www.postgresql.org/docs/current/using-explain.html | plan-node tree, `Seq Scan` tripwire, use the JSON/XML/YAML format for machine analysis | fetched |
| SQLite — EXPLAIN QUERY PLAN | https://www.sqlite.org/eqp.html | `SCAN` vs `SEARCH` semantics; **explicit warning that applications must not depend on the output format** (changed in 3.24.0, 3.36.0) → plan-scan is a warning, never a hard gate | fetched |
| MongoDB — explain() results | https://www.mongodb.com/docs/manual/reference/explain-results/ | `COLLSCAN` vs `IXSCAN` stages; `explain` ignores and suppresses the plan cache | fetched |
| MongoDB Node.js driver — Monitor application events | https://www.mongodb.com/docs/drivers/node/current/monitoring-and-logging/monitoring/ | `monitorCommands: true` → `commandStarted/Succeeded/Failed` with `commandName` + `duration` = the query-count seam for the N+1 check | fetched |
| Grafana k6 — Thresholds | https://grafana.com/docs/k6/latest/using-k6/thresholds/ | thresholds as codified SLOs with pass/fail and non-zero exit code for CI (`ThresholdsHaveFailed = 99` in `errext/exitcodes/codes.go`) | fetched |
| Google — Core Web Vitals | https://developers.google.com/search/docs/appearance/core-web-vitals | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; real-world (field) measurement; the named-metric + percentile + threshold shape | fetched |
| OWASP API Security Top 10 — API4:2023 Unrestricted Resource Consumption | https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/ | the objective list of missing limits (timeouts, memory, fds, processes, upload size, operations per request, **records per page**, third-party spend); `size=200` → `size=200000` scenario; cost as well as DoS | fetched |
| OWASP API Security Top 10 — API4:2019 Lack of Resources & Rate Limiting | https://api-security.owasp.org/editions/2019/en/0xa4-lack-of-resources-and-rate-limiting/ | CWE-770/CWE-400 lineage; the same unbounded-pagination attack in its earlier wording | fetched |
| OWASP Cheat Sheet — Denial of Service | https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html | resource exhaustion as a single-point-of-failure/design finding; scale up/out, bulkhead, redundancy → P32's architecture language | fetched |
| ISTQB Certified Tester Performance Testing (CT-PT) | https://istqb.org/certifications/certified-tester-performance-testing-ct-pt/ | syllabus areas as the shape of the discipline: failure modes and causes, metrics collected, aggregating results, key sources of metrics, performance risk by architecture category, tasks across the lifecycle | fetched |
| Zhang et al. — LLM Hallucinations in Practical Code Generation | https://arxiv.org/abs/2409.20550 | repository-level hallucination taxonomy; RAG-based mitigation works across all six models studied → P33 authority tiers + "look it up" rule | fetched (abstract) |
| Detecting and Correcting Hallucinations in LLM-Generated Code (knowledge-conflicting) | https://dl.acm.org/doi/10.1145/3793655.3793725 | non-existent API parameters evade linters → P33 | snippet (orientation only) |
| OWASP ASVS 5.0 — chapter list | https://github.com/OWASP/ASVS/tree/master/5.0/en | the 17 real 5.0 chapters (V1 Encoding and Sanitization … V17 WebRTC), which shows 06h's table is 4.0 numbering under a 5.0 label → P36 | fetched (repo file list) |
| OWASP ASVS 5.0 — V13 Configuration, V15 Secure Coding and Architecture, V16 Security Logging and Error Handling, V1–V6, V8 | https://github.com/OWASP/ASVS/tree/master/5.0/en | the performance requirements already inside ASF's claimed DoD: 15.1.3/15.2.2 (L2), 5.2.1 (L1), 4.3.1/2.4.1/16.5.2/1.4.3 (L2), 13.1.2/13.1.3/13.2.6/15.4.4 (L3) → P37 | fetched (chapter files read) |
| ASF's own reproduction (this machine, 4 cores, load ≈ 2.7) | committed harness: [`prototype-perf-gate/`](prototype-perf-gate/README.md) (`stats.mjs`, `gate.mjs`, `nplus1.mjs`) | statistical gate: 0/40 false fires and 40/40 detection at +10% when quiet; under three competing CPU hogs CV ≈ 50% and detection drops to 13/25 while a naive ±15% threshold starts firing on unchanged code; N+1 query count 11→41 vs 2→2; SQLite `SCAN`→`SEARCH USING INDEX` | measured (reproducible) |

## Enforcement (enforcement-blind-spots.md → P38–P45)

Fetched = read the page/PDF this session. Snippet = title/abstract from search
results (orientation only, not load-bearing).

| Source | URL | Used for | Access |
|---|---|---|---|
| IFScale — *How Many Instructions Can LLMs Follow at Once?* | https://arxiv.org/abs/2507.11538 | 68% accuracy at 500-instruction max density (best frontier model); per-model accuracy table at 10/50/100/250/500 (claude-opus-4 100/100/94.6/67.9/44.6; claude-sonnet-4 100/98/94.4/77.2/42.9; gpt-4.1 98/98.8/95.4/74/48.9; llama-4-scout 100/54.4/27.2/9.3/6.7); three decay patterns (threshold/linear/exponential); primacy bias "towards earlier instructions"; **Omission:Modification ratio rising to 5–6:1 — the failure mode at density is complete instruction dropping**; std dev grows with density (claude-opus-4 0.0%→14.0%) | fetched (PDF read) |
| LIFBench / LIFEVAL (ACL 2025 long, 20 models, 6 length intervals) | https://aclanthology.org/2025.acl-long.803.pdf | 2,766 instructions, three long-context scenarios, eleven tasks; instruction-following **stability**; LIFEVAL is rubric-based "without reliance on LLM-assisted assessments or human judgment" — the benchmark authors did not trust a model to grade compliance | fetched (PDF read) |
| VEPA — Verified Evolving Formal Policy for Lifelong LLM Agent Guardrails (Google Cloud AI Research / DeepMind / UNC) | https://arxiv.org/html/2610.12813v1 | guardrails should make "inspectable, reproducible, and deterministic allow-or-refuse decisions **before potentially irreversible agent actions**"; neural vs formal guardrails (neural: "non-deterministic and non-verifiable… can be ambiguous, contradict themselves, and regress"); **separation of generation, verification and authority** — LLM proposes, deterministic verifier admits only structurally valid conflict-free rules, evidence-aware authority layer activates and can revoke; ASSEBench-Safety/-Security, ATBench | fetched (HTML full text) |
| The AI Agent Code of Conduct — Automated Guardrail Policy-as-Prompt Synthesis | https://arxiv.org/html/2509.23994v1 | the **"policy-to-practice" gap** between human-readable policy and machine-enforceable rules; policy tree (VALINP/INVALINP/VALOUT/INVALOUT) verified by a separate judge LLM, compiled to few-shot classifiers returning strict JSON → ALLOW/BLOCK/ALERT; CONSECA just-in-time contextual security (static policies "overrestrict or overallow"); **cautionary numbers: policy-tree detection recall 53.3% (o1), 17.8%, 8.9%, 4.4% (Claude 3.5)** — reading rules out of prose misses most of them | fetched (HTML full text) |
| The Task Shield — Enforcing Task Alignment (ACL 2025 pp. 29680–29697) | https://aclanthology.org/2025.acl-long.1435.pdf | reframes agent security "from preventing harmful actions to ensuring **task alignment**, requiring every agent action to serve user objectives"; test-time verification of "whether each instruction and tool call contributes to user-specified goals"; **ASR 2.07% with 69.79% utility** on GPT-4o / AgentDojo. *Scope: threat model is indirect prompt injection, not rule compliance — the transferable part is the position (verify per action, before the action, against a goal the agent did not author)* | fetched (PDF read) |
| CaMeL — Defeating Prompt Injections by Design (Google / DeepMind / ETH) | https://arxiv.org/abs/2503.18813 | enforcement lives in a **system layer around the LLM**, not the prompt; control and data flow extracted from the trusted query so untrusted data "can never impact the program flow"; **capability** notion enforcing "security policies when tools are called"; **77% of tasks with provable security vs 84% undefended** — the honest utility tax of gating | fetched (abstract) |
| AgentDojo — evaluation framework for prompt injection attacks/defences | https://arxiv.org/abs/2406.13352 | 97 realistic tasks, 629 security test cases; baseline finding "state-of-the-art LLMs fail at many tasks (even in the absence of attacks)" — compliance is not free with no adversary present | fetched (abstract) |
| Pi — Extensions documentation (local install) | file:///usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md | the enforcement surface ASF does not use: `tool_call` "can mutate input or block execution" (`{ block: true, reason }`); `user_bash` handler failure "blocks the command rather than falling through"; **`agent_before_settle` is "the final actionable boundary: it can append entries and request one continuation"**; `agent_settled` "final and notification-only"; `turn_end` actionable; `exposure: "hidden"` to withdraw a tool; `pi.appendEntry()` = "durable data excluded from model context"; annotations "are not verified"; fail-safe: "a `tool_call` handler failure blocks the tool" | fetched (read locally) |
| Pi — Security documentation (local install) | file:///usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/security.md | the default is no enforcement: Pi "does not ask for approval before every tool call"; "Project trust does not limit what tool calls can access or affect" — so an ASF gate is a choice with a friction cost, not a flag to flip | fetched (read locally) |
| Pi extension examples (local install) | `examples/extensions/confirm-destructive.ts`, `claude-rules.ts` | the two patterns side by side: hook-based cancellation (`session_before_switch` → `{ cancel: true }`) vs prose-based rule listing (rules folder listed in the system prompt for the model to read) — ASF has only ever written the second | fetched (read locally) |
| ASF self-audit (this repo) | `skills/aia-asf/` + `index.ts` + `test/` | **measured**: 24,869 words / 2,714 lines / 29 numbered rules / 198 normative markers / 603 instruction lines / 41 checklist items / 19 DoD items; **0 `pi.on()` handlers, 2 `registerCommand`, 0 `registerTool`**; Phase-6 mandatory set 15,480 words / 123 normative markers, 20,695 / 165 with the on-demand set; DoD audit **4 H / 3 M / 15 S**; `/asf verify` emits the checklist (`index.ts:382-392` "Do not tick anything you did not run"); existing security tests assert string presence (`test-improvements.mjs:88` looks for `"Security line (06h)"`) | measured (reproducible) |
| Vigilant continuation-discipline precedent | `pi-vigilant/index.ts` `agent_end` / `agent_settled` handlers | the documented production deadlock: waiting inside `agent_settled` for the resumed run's own `agent_settled` blocks the handler forever — the constraint P41 must respect; bounded continuation with epoch/run-id guards is the pattern to reuse rather than reinvent | measured (code read) |

## ASF artifacts used as the prism

- `skills/aia-asf/SKILL.md`
- `skills/aia-asf/references/01-intake.md`, `02-research.md`, `04-adversarial.md`,
  `05-plan.md`, `06-implementation.md`, `06b-testing-qa.md`, `06c-code-quality.md`,
  `06d-delegation.md`, `06e-code-health.md`, `07-release.md`
- `index.ts` (commands, QA_CHECKLIST, M1 validation)

## Model blindness (model-blind-spots.md — P27)

Evidence classes per [02-research.md](../../skills/aia-asf/references/02-research.md):
**T1** fetched and read in this pass · **T2** measured locally, reproducible ·
**T3** reasoned, not verified — a starting position, never a rule.

| Source | URL | Used for | Class |
|---|---|---|---|
| ArchiLab — *Aggregate Design Rules according to Vaughn Vernon's "Red Book"* (Prof. Dr. Stefan Bente, TH Köln) | https://www.archi-lab.io/infopages/ddd/aggregate-design-rules-vernon.html | §2.1 Vernon's four aggregate rules, quoted verbatim with page numbers (ch. 10 pp. 347–388; p. 354 "properly designed Aggregate… invariants completely consistent within a single transaction"; p. 356 "false invariants and a desire for compositional convenience drove the design"; p. 356 "Don't let the 0..* fool you"; p. 361 "Prefer references to external Aggregates only by their globally unique identity"; exceptions pp. 367ff.) | **T1** fetched + read |
| OWASP — *Insecure Direct Object Reference Prevention Cheat Sheet* | https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html | §2.4 the three IDOR ingredients; the 4-step two-user methodology verbatim ("Create User A and User B… denies unauthorized access regardless of whether the object identifier is predictable or unguessable"); scope "read, create, update, delete, export, and administrative actions"; scoped-lookup fix `@current_user.projects.find(params[:id])`; "even with complex identifiers, access control checks are essential" → became 06g §3 two-user authorization | **T1** fetched + read |
| PostgreSQL docs — §5.9 *Row Security Policies* | https://www.postgresql.org/docs/current/ddl-rowsecurity.html | §2.3 push-enforcement-down, from the manual's own words: without policies "all rows within it are equally available"; **default-deny** "If no policy exists for the table… no rows are visible or can be modified" — which is also the source of the silent-zero caveat that class 13 prices | **T1** fetched + read |
| Thoughtworks — *Fitness function-driven development* (Paula Paul, Rosemary Wang, 2019) | https://www.thoughtworks.com/insights/articles/fitness-function-driven-development | §2.5 fitness functions as pipeline gatekeepers ("prevent the promotion of unmaintainable or untested code to production"); numeric assertion examples (coverage >0.9, error rate <0.01, transaction <10s, "should not have PII in the logs"); observability/resiliency/performance/compliance as automated checks | **T1** fetched + read |
| Building Evolutionary Architectures (site) | https://evolutionaryarchitecture.com/ | §2.5 "Evolutionary architectures make it explicit what 'fit' means with as much automation as possible" | **T1** fetched + read |
| Rails Guides — *Active Record Associations* §1.2 | https://guides.rubyonrails.org/association_basics.html | §2.2 the framework makes the cascade decision at the point the relationship is declared (`has_many :books, dependent: :destroy`; `@author.destroy` takes the books) | **T1** fetched + read (the full `dependent:` option list was **not** read — see withdrawn below) |
| ASF self-audit, current gate set | `skills/aia-asf/references/06b` (23 rules), `06c` (9 rules), `06j`, `06k`, `lib/gates/` (blockers, ledger, authority, settle, report, measurement, config, declarations), `lib/code-health/model.mjs` (`MODEL_RULES`), `pi-vigilant/lib/` (loop-guardian, completeness, obligations) | Part 1 pass-2 re-scoring of the 14 classes to H/M/S; the vigilant subsystem audit and the "for classes 3,5,6,7,9,12 nobody else inspects them" conclusion | **T2** measured, reproducible |

### Withdrawn — cited in an earlier draft, could not be verified, removed

Recorded so the deletion is auditable and nobody re-imports them from an old
revision. Each was checked by exact-phrase search and by fetching the URL cited.

| Removed claim | Check result |
|---|---|
| "Cascade semantics need design… orphans-by-policy… before production decides for you via confusing bugs" (unnamed "soft-delete design guide") | exact-phrase search **0 results**; no URL. Was §2.2's lead evidence |
| Entity-class decision table + "forcing per-rule decisions rather than providing one answer" | same unnamed source; unverifiable |
| "humans forget filters under deadline pressure; RLS policies forget nothing"; "no compiler error for *you forgot WHERE tenant_id*" | exact-phrase search **0 results**; replaced by the PostgreSQL manual's own text (§2.3), which is checkable and stronger |
| Oracle "whenever possible, enforce business rules with constraints" | no URL; not read |
| BEA definition of a fitness function ("objective integrity assessment of some architectural characteristic"), the "readability" exchange, "can't inspect fitness into a frail system" | cited InfoQ + O'Reilly URLs return **HTTP 404**; book not read. The objectivity requirement survives as an explicit **T3** ASF position, not a citation |
| "The database is shared mutable state between every running copy of your application" | no URL; restated as our own expand-contract model (§2.6, **T3**) |
| "undelete isn't flipping a timestamp…"; "we paid for the trash folder twice — once building it, once not having it"; "deletion code paths attract drive-by regressions…" | exact-phrase search **0 results**; §2.8 restated as reasoning, its aphorisms labelled ours |
| Rails `dependent:` full option list (`:nullify`, `:restrict_with_exception`, `:restrict_with_error`, `:destroy_async`) | the guide was fetched but the options section was **not** read in this pass — option names must be verified against the guide before any reaches normative text; the *shape* (cascade / nullify / refuse all exist, refuse is first-class) is what §2.2 now claims |
| Statistics literature on testing-for-no-effect (permutation / equivalence testing) | different discipline; never supported the non-effect claim; not cited |

**Rule this section enforces:** nothing in `model-blind-spots.md` is presented as
a source's words unless it carries a URL fetched and read in this pass. A claim
that could not be sourced is either dropped, or the gate is not built on it — the
same discipline 06k applies to a performance number without its measurement
contract.
