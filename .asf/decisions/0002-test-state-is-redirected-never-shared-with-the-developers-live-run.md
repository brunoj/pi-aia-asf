---
id: ADR-0002
status: accepted
title: "Test state is redirected, never shared with the developer's live run"
decision: "Run state is redirected by `ASF_STATE_ROOT` and the test harness always sets it, so no suite can write a developer's live run state."
decided: 2026-11-10
applies_to: [lib/home.mjs, test/harness.mjs, test/test-decisions.mjs]
tags: [testing, state, isolation]
from_spec: 
user_instructed: 
plan: 
origin: backfill
source: ["lib/home.mjs:homeStateDir", "test/harness.mjs:ASF_STATE_ROOT", "test/test-decisions.mjs"]
supersedes: []
reopens_when: 
enforced: true
checks: [test/test-decisions.mjs]
---

## Decision

`homeStateDir` honours `ASF_STATE_ROOT`; `test/harness.mjs` sets it to a fresh temp directory before the extension loads. No suite may write the real state tree.

## Context

A suite that forgot to `chdir` wrote into the developer's live run state: `/etc/passwd` and a scratch path appeared in the real run's `filesTouched`, and the reviewer saw them in the run card. State is the one thing a test corrupts with no visible failure — the assertion passes and only the user's screen is wrong.

## Options considered

- **Tell suite authors to always chdir** — rejected: a convention whose failure mode is silent user-visible corruption.
- **Mock the state module** — rejected: the real merge and monotonic-merge logic would go unexercised.

## Consequences

The full suite is provably inert against real state, verified by diffing the state tree across a `run-all`. Debugging against real state still works by exporting `ASF_STATE_ROOT`. `test-decisions.mjs` pins both the real layout and the override, so the isolation cannot silently defeat the assertion sitting next to it.
