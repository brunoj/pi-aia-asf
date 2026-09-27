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

## ASF artifacts used as the prism

- `skills/aia-asf/SKILL.md`
- `skills/aia-asf/references/01-intake.md`, `02-research.md`, `04-adversarial.md`,
  `05-plan.md`, `06-implementation.md`, `06b-testing-qa.md`, `06c-code-quality.md`,
  `06d-delegation.md`, `06e-code-health.md`, `07-release.md`
- `index.ts` (commands, QA_CHECKLIST, M1 validation)
