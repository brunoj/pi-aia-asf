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
