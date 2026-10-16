# Phase 2 — Research Playbook

Goal: decisions based on current facts, with sources. Never plan architecture on memory alone.

## When research is mandatory

- New project: full research
- Significant feature: medium research (packages/libraries, similar implementations)
- Major bugfix: only if scope/tech changes
- Refactor: best practices for target architecture

## Search templates (web_search)

- `<topic> best practices 2026`
- `<topic> vs <alternative> comparison`
- `<topic> npm package` / `npm search <topic>` (via bash)
- `how to implement <feature> <language>`
- `<framework> <version> release notes`
- `reference implementation <topic> open source`

## Extraction (web_fetch / batch_web_fetch)

- Fetch the 2–3 most relevant results (batch_web_fetch for parallel).
- Extract: what it is, version, license, maintenance status, adoption, key trade-offs.
- For npm packages: check `npm view <pkg>` (version, license, weekly downloads, dependencies) — fast and authoritative.

## Decision criteria for packages

1. License compatible (MIT/Apache preferred)
2. Maintained (recent release, active issues)
3. Mature enough (v1+ or widely adopted)
4. Dependency footprint reasonable
5. Fits the project's constraints (browser? node? size?)

## Output

Research summary with:
- **Findings** (each with source URL)
- **Recommendation** (approach + packages, with rationale)
- **Alternatives considered** (one line each, why rejected)

## Research gate

Present summary + recommendation → ask: "proceed with this approach, or adjust?" → only proceed on agreement.

## Evidence classes — T1 / T2 / T3 (P28)

Every research finding is labelled with **how it is known**. An unlabelled
finding is a guess with a nicer citation, and the ASF reference files are read
by an agent who cannot tell the difference unless you tell it.

| Class | Meaning | What it may be used for |
|---|---|---|
| **T1** | **Fetched and read** from the authoritative source (specification, official docs, standard text, vendor documentation). Quote or URL recorded. | Stating a requirement, a default, or a rule as fact. |
| **T2** | **Measured locally**, in this repo, with a reproducible script. Method and numbers recorded. | Setting a threshold, a default, or a claim about what a method detects. |
| **T3** | **Reasoned, not verified.** Inference from adjacent knowledge, convention, or a plausible model. | A starting value, explicitly labelled as one — never a rule. |

**Rules:**

1. **A default that cannot explain itself is a guess with better formatting.**
   Every shipped default cites its class and its source. `/asf config --explain
   <key>` prints it.
2. **A T3 value is never presented as a rule.** It is a starting value to be
   justified or replaced, and the text says so (e.g. `scan.fullScanRows`, whose
   source reads *"no fetched source sets this; it is a starting value to be
   justified or replaced, and is labelled as such"*).
3. **T3 is where the risk is.** When the evidence for a rule is T3, say it in the
   same sentence as the rule, not in a footnote.
4. **Never cite a document you did not read.** If a claim came from memory and
   memory is not verifiable, it is T3 — label it, or go fetch it and make it T1.
   (This rule exists because a chapter table in this very repo was written from
   memory, was wrong, and nobody noticed until a test pinned it.)
5. **A standard's numbering is only as good as the version you checked.** For
   ASVS the authoritative check is the source project at a release tag, not a
   summary page.

### Recording format

```
- **T1** Node's benchmarking runner performs ten warmup runs before sampling.
  https://nodejs.org/docs/latest-v26.x/api/benchmark.html
- **T2** A ±15% threshold missed a real +10% regression in 40/40 trials;
  p<0.01 + Hodges–Lehmann ratio>1.05 caught 40/40.
  scripts/bench-validation.mjs
- **T3** A 5-second per-command timeout is a reasonable starting point for
  linters. No fetched source sets this; it is a starting value.
```
