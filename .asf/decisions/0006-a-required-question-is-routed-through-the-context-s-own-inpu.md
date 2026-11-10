---
id: ADR-0006
status: accepted
title: "A required question is routed through the context's own input channel"
decision: "When input ASF genuinely cannot supply is required, route the ask through the session's own channel: with a work item claimed and a park tool registered, park THAT item with THAT tool and keep going; otherwise ask once in the conversation. Never block a ticket session on a CLI question."
decided: 2026-11-10
applies_to: [lib/gates/input-channel.mjs, lib/extension/handlers/settle.ts#handlePark, lib/extension/handlers/tool-call.ts#refusalReason, lib/gates/tracked.mjs#PARK_RE]
tags: [input-routing, gates, betamaxx, long-loops]
from_spec: 
user_instructed: "Long loops should always keep running until resolution or absolutely requiring user input. If working on a betamaxx ticket, user input is requested by moving the ticket to input required, etc — so user input should be context aware."
plan: 
origin: backfill
source: ["lib/gates/input-channel.mjs", "lib/extension/handlers/settle.ts:handlePark", "lib/extension/handlers/tool-call.ts:refusalReason"]
supersedes: []
reopens_when: a session has two legitimate input channels at once (a ticket and a linked project), where one question may need to go to both
enforced: true
checks: [test/test-input-channel.mjs]
---

## Decision

`lib/gates/input-channel.mjs` is the single place that decides where a legitimate ask goes. Both park sites — the completion gate's park (`handlePark`) and the third identical refusal (`refusalReason`) — render their message through `routeAsk(question, channel)`, where `channel` comes from `resolveInputChannel({ tracked, tools, config })`.

The channel is derived, never hard-coded to a vendor:

- the open items come from the tracked-work observer already maintained in `runtime.tracked`;
- the park tool comes from `pi.getAllTools()`, filtered by the same `gate.tracked.park` matcher tracked work uses, so one config key widens both;
- `INPUT_FIRST` prefers a tool that asks (`request_input` / `needs_input`) over one that parks for a verdict;
- `NOT_ASK` excludes review flags: `flag_review` means "this is not a real issue", and routing a question through it tells the PO the work is invalid when it is merely blocked.

Neither branch may tell the agent to stop: both end on "keep going with every part of the work that does not depend on the answer".

## Context

ASF already refused to stop for anything the agent could do itself, but when stopping *was* legitimate it said only "ask the PO through the project's input channel (for ticket work: park the ticket)". That is a hint, not a route: in a live ticket session it leaves the question in a CLI nobody is watching while the ticket system has a needs-input queue built for exactly this, and the run blocks on a human who cannot see it.

Found while wiring this: `bmx_flag_review` was absent from `PARK_RE`, so an agent that flagged a ticket for review still had the item counted as open and was steered to park it — a false alarm on a disposition already taken, and the one steer that no amount of extra work can satisfy.

## Options considered

- **Hard-code `bmx_request_input`** — rejected: ASF would name a tool that may not be installed, and a Linear or Jira session would get the wrong instruction. Deriving it from registered tools plus the existing matcher means a new tracker needs no ASF change.
- **Let the agent detect its own context in prose** — rejected: it is a gate rule, and a rule that depends on the agent remembering to notice its situation is a suggestion.
- **Treat `flag_review` as an ask channel** — rejected: it changes the meaning of the message the PO receives.
- **Let the park stop the run** — rejected: parking is a marker on the item, not a state of the run.

## Consequences

A ticket-session park now says "call `bmx_request_input` on work item X" and the fallback says "ask it in the conversation, once" — both followed by "keep going". The resolved channel is stored in the entry's `details` so a reviewer can see what ASF thought the context was. If no park tool is registered the fallback is explicit ("no tool to park it is registered") rather than silent, so a missing integration is visible. `flag_review` now closes tracked work, so a flagged ticket no longer produces a dangling-work gap.
