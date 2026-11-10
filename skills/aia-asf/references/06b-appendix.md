> **Read when:** you are applying 06b Rule 9 (browser verification) or Rule 15 (bounded waits) and need the full procedure behind the rule statement.
> **Skip when:** you are not doing browser verification, bounded waits or inner-loop test selection.

# Testing Standard — Procedures (detail for 06b Rules 9 and 15)

This file carries the long-form procedures. The **rules themselves stay in
`06b-testing-qa.md`** and are always-read; nothing here is optional detail that a
rule depends on being absent — if a rule needs it, the rule states the requirement.

## Browser testing procedure

API/curl checks do not replicate what a human sees. Via `pi-aia-browser`:

1. `browser_init`, `browser_navigate` to the running app
2. Walk each key user journey with real clicks/typing
3. Assert rendered DOM content (`browser_dom`), not just HTTP 200
4. Check console errors via `browser_js`
5. `browser_screenshot` for the record; check mobile + desktop viewports

A 200 response with a blank or broken page is a **failure**.

**Recording it — `asf_browser_verify` / `asf_browser_na`.** The completion gate
requires browser evidence whenever a UI file is touched, and these two tools are
the only hands that give it. Neither takes your word for what ASF can check itself:

- `asf_browser_verify {page, action, assertion}` is **refused** if the session made
  no `browser_*` call at all. ASF sees every tool call, so a verification with no
  browser in the room is a claim about a page nobody opened. It is also refused if
  any of the three fields is missing — `page` + `action` + `assertion` is the
  minimum a reviewer can go and repeat. `browser_diagnose` and `browser_logs` do not
  count as having driven a page: they report on the daemon, not on the surface.
- `asf_browser_na {reason}` is **refused** when the reason is a placeholder
  (`n/a`, `none`, `not applicable`, one word). The point of a structured n/a is a
  sentence a reviewer can disagree with; "n/a" is not one, and without that rule the
  n/a is simply an exit around the gate.

A gate that accepts "I verified it" measures nothing, which is worse than no gate:
it reads as coverage.

**The trigger is what the change TOUCHES, not whether the project "has a UI".**
A deliverable-level trigger lets a small edit slide: "I only changed a helper"
is exactly the change that reaches a rendered surface unnoticed. So the
question is never *does this project have a UI* — it is **can this change reach
one**. Anything below counts as touched, and must be exercised through the
browser:

- a page, route, component, widget, form, or template
- anything that changes what is rendered: markup, styling, copy, formatting,
  date/number/currency rendering, truncation, empty and error states
- client-side state, routing, data fetching the view depends on
- an API, serializer or query **that a UI consumes** (server-side changes are
  not exempt just because the diff is in `src/server/`)
- auth/permission paths that gate what a user sees, and uploads/downloads
  a user triggers from a page

**When uncertain, browser-test it — same inversion as Rule 19.** If you cannot
argue that the change provably cannot reach a rendered surface, treat it as
touched. "It's only a backend change" is not an argument; naming the render
path it cannot affect is. The cheap direction to be wrong in must be the safe
one, so uncertainty costs a browser run, never a skipped one.

**This happens in the Phase 6 build loop, per change — not at final
verification.** Open the touched interface in the browser *before committing
that change*, while the context is warm and the defect is one edit wide.
Deferring it to Phase 7 means the gate is the first time anyone has looked, by
which point the cause is buried in the whole change. If the loop run was a
Rule 19 subset, the browser/E2E suite for a touched surface is **never
excludable** — selection may drop unrelated suites, never the one that looks at
what you just changed.

**Evidence, not assertion.** A browser run is reported with what was actually
done: the page/URL opened, the action taken, and what was asserted — or
explicitly `n/a: no rendered surface touched, because <reason>`. "Browser
tested" with no page and no action named is not evidence (Rule 11). If
`pi-aia-browser` is unavailable, **say so** and name what you did instead;
never let a missing tool read as a passed check.

**Silent async paths are the priority.** Fire-and-forget enrichment (an async
budgeted analysis that fills in a card title after render) fails silently — the
page renders, nobody notices the enrichment never landed. For any async/silent
surface: ingest through the real flow, then **wait for the enrichment to appear**
and assert it (e.g. ingest a report, wait for `agent_title` on the card). If it
never arrives, the wiring is dead — that is a failed test.

## Enforcement classes

Every item above carries a class, and the class is shown in the rendered report
so nobody can present a self-attested item as a verified one:

| Class | Meaning | Who enforces it |
|---|---|---|
| **H** | **hard** — cannot be declared done without satisfying it | a `tool_call` blocker refuses the action (06b Rule 23) |
| **M** | **mechanical verdict** — produced only if the check is run | a gate; `scanned: 0` means it did not run, and that is not a pass |
| **S** | **self-attested** — an expectation, never a blocker | you, and the reviewer sees that it was you |

The rendered checklist and delivery report come from
`lib/gates/report.mjs`, which assembles them from the ledger, the gate verdicts
and the authority state. **A gap stays visible as a gap.** The honest
alternative to a green tick that means nothing is a line that says it was not
verified.

### Every waiting call carries its own explicit timeout

This applies to **every tool call or command that waits on the system** — not
just the obviously slow ones. Testing is where this bites hardest: a test
harness, dev server, daemon, browser launch, or watcher can block forever on a
port, a lock, a prompt, or a process that never exits.

- Shell: `timeout <seconds> <command>` — always.
- Tool calls: pass the tool's explicit `timeout` parameter — always.
- Pick the bound from the **stated expected duration**, with headroom. A test
  suite you expect to take 30s gets ~120s, not 3000s.
- "I'll just run it and see" is the failure mode this rule exists to prevent.

