---
id: ADR-0009
status: accepted
title: "Backfill reports where decisions live; it never writes the rationale"
decision: "`asf_decisions action=bootstrap` and the once-per-run offer list candidate sources; only the agent writes records, and `origin: backfill` requires `source: [path or commit]` to be accepted."
decided: 2026-11-10
applies_to: ["lib/decisions/backfill.mjs", "lib/extension/handlers/observe-decisions.ts", "lib/decisions/schema.mjs#checkAcceptance"]
tags: [decisions, backfill, register, fabrication]
from_spec: spc-1794257925181-57154
user_instructed: 
plan: 
origin: agent
source: ["lib/decisions/backfill.mjs", "lib/decisions/schema.mjs#checkAcceptance"]
supersedes: []
reopens_when: a project's decisions exist only in people's heads, where there is no artifact to cite and an interview is the only source
enforced: true
checks: [test/test-backfill.mjs]
---

## Decision

ASF recovers a project's decision register by **reporting**, not by writing. It answers the
three questions it can answer from files and git alone — is there a register, what evidence
exists to recover decisions from, and which of that evidence a record already covers — and
the agent writes the records. Acceptance is enforced by the schema, not by a prompt:
`origin: backfill` is accepted immediately **only** with `source: [path or commit]`; without
provenance it is demoted to `proposed`, which the register deliberately never enforces, and
`check` shows it as a notice.

## Context and Problem Statement

The requirement reads "ASF writes one at the first opportunity by analysing what is already
there". The trap is in *analysing*: a model can produce a fluent rationale for a choice
nobody made, and a register of invented rationale is worse than an empty one — it gets cited
later as history. The register's whole value is that a line in it means somebody chose
something.

## Options considered

- **ASF generates the records from configs and commits** — rejected: it is the fabrication
  the spec's own wording invites, and it would be cited as fact by every later run.
- **A backfill gap that blocks settlement until records exist** — rejected: "go analyse the
  repo" has no end, so it is the shape of a run that never closes, and it would hold every
  new project's first run hostage.
- **Report the candidates, let the agent write, and make provenance the price of acceptance**
  — chosen: ASF does the part it can prove, the agent does the part that needs
  understanding, and the schema is what stops the gap being closed with invented text.

## Consequences

- The offer fires **once per run** on the first source mutation (`runtime.backfillOffered`,
  reset when a run opens), and the run card carries one line while the register is empty.
  Guidance that repeats every turn stops being read.
- Idempotency comes from the records themselves — coverage is read from `source[]` /
  `applies_to` on disk, not from a marker file that can lie — so a second pass offers only
  what is genuinely uncovered.
- A docs-only project is never offered a backfill: with no code, an empty register is honest.
- A recovered record is accepted without a human promotion, so an unattended run can finish;
  its provenance is what a later reader audits.
- `asf_decisions action=bootstrap` is a thin wrapper over the report; the rule lives in
  `lib/decisions/backfill.mjs`, which is why `applies_to` names the module and not the tool.
- `check` now surfaces an unprovenanced recovered record as a notice. Silence would let the
  weak proposal live forever; an error would be wrong, because a proposal is allowed to be
  weak.
