# Modularity & Maintainability Standard (MANDATORY)

Distilled from Bruno's own development philosophy — honed on the Tunnel project
and its modules (smart-router, autoroute, feature-extractor, heuristic-engine) —
and reinforced by established software-engineering research: **Single Source of
Truth (SSOT)**, **testability as a design property**, and **ports-and-adapters
(hexagonal) seams**.

These rules exist because violating them caused real pain in those sessions:
code "thrown on a heap", duplicated logic, hardcoded model attributes, modules
that could not be tested outside the server, and regressions that broke
existing functionality. Each rule below carries the lesson.

---

## Rule 1 — Small, well-readable modules, plugged in where needed

> *"You throw a bunch of code and functionality on a heap, instead of making
> smaller, well-readable modules and plugging them in where needed."* — Tunnel sessions

- One module = one responsibility. If a file does two unrelated things, split it.
- A module must be **readable top to bottom** by someone new: clear names,
  short functions, no 500-line god-files.
- **Plug in, don't embed**: the host system imports and wires modules; it does
  not copy their logic inline.
- Extraction triggers (any of these → extract a module):
  - a function/concern exceeds ~100 lines or 3 levels of nesting
  - the same logic is needed by two call sites
  - you cannot explain what the file does in one sentence
  - you are about to debug the same area a second time

## Rule 2 — One implementation for shared functionality (single escalation path)

> *"Make a separate module for ... communication and use IT instead of having
> that function integrated in there."* — Tunnel sessions

- **Every shared capability lives in exactly one authoritative module.**
  Everything else imports it. No copies, no re-implementations, no
  "parallel systems working side by side" (*"I want an integrated system, not a
  dual system working side by side"*).
- This is the **Single Source of Truth** (SSOT) principle: every piece of
  knowledge exists in exactly one place; every other reference *points* to it.
- SSOT checklist before shipping (from research on SSOT):
  - Is any value/logic defined in more than one place?
  - If this changes tomorrow, how many files do I touch? (Answer: **one**.)
  - Would a new developer know where the authoritative version lives?
- Escalation paths included: if a request can escalate (to a stronger model,
  a fallback, a retry, an admin), there is **one** escalation path module that
  every caller routes through — not ad-hoc escalation logic scattered per
  caller.

## Rule 3 — No hardcoding; config drives behavior

> *"DO NOT hard-code attributes of models ... stuff in the brackets is specific
> to opus, but not necessarily to any model we will add."* — Tunnel sessions

- Model names, thresholds, limits, timeouts, URLs, feature flags: all load from
  config, never literal in logic.
- If you hardcode a value that another system (or a future system) might share,
  you have created a second source of truth — see Rule 2.
- The module must behave the same for any config input; its logic is
  config-agnostic.

## Rule 4 — Testable outside the host, then integrated verbatim

> *"MAKE IT TIGHT AND MODULAR AND FULLY TESTABLE OUTSIDE OF THE SERVER. TEST
> EVERYTHING 100% ANALOGOUS TO HOW IT WORKS ON THE SERVER ... THEN INTEGRATE
> BACK INTO THE SERVER."* — Tunnel sessions

- A module must run standalone: a test script imports and primes it **with the
  exact same calls** the host would make.
- **Same modules in tests and production** — never a "test copy" of logic.
  Tests import the production module; the host imports the same module.
  (*"It should be imported in [the host] and used there with no changes — a
  separate test script importing and priming the module can be created for
  testing."*)
- **Testability is a design property, not a testing task** (research): if a
  business rule needs a running server + real DB to validate, the architecture
  is wrong. Core logic should run as plain functions with injected fakes.
- Build **seams** (ports-and-adapters): core logic depends on interfaces
  (clock, IDs, persistence, external calls, message publishing), not on
  concrete infrastructure. Adapters live at the edge.
- Verification flow: develop → test standalone (100% analogous) → **integrate
  into the host verbatim** → re-test in place.

## Rule 5 — Refactor what is too complex to understand

> *"REFACTOR WHAT IS TOO COMPLEX FOR YOU TO UNDERSTAND!"* — Tunnel sessions

- Complexity you cannot explain is a defect, not a badge of honor.
- When you find yourself running "rounds like a moron" debugging something,
  **stop and refactor the module** instead of patching blind.
- Refactor gate (when to invest): only refactor when it makes debugging and
  individual component testing easier and faster, with the data you already
  have. Not refactoring for its own sake; refactoring for **testability and
  clarity**.
- Refactoring techniques that directly serve this (research-validated):
  **Extract Method** (break long functions into named steps), **Extract Class/
  Module** (group related logic), **Replace Conditional with Polymorphism**
  (turn nested conditionals into modular dispatch), **Remove Duplication**
  (collapse copies into one implementation).

## Rule 6 — Layer with clear boundaries, and document them

> *"Refactor the layering for readability completely, test everything in
> detail, and do a writeup for the layered system."* — Tunnel sessions

- Define layers (e.g., handler → router → modules → backends) with one-way
  dependency rules. No layer reaches across another.
- **Do a writeup**: a short architecture doc (in the repo) stating what each
  module is, what it uses, how and why, and where truth lives (the SSOT map).
  (*"Properly document the modules and the main scaffolding to always have a
  clear idea what is happening where."*)
- Research on architecture fitness: keep the "core" boring and deterministic
  (no framework/IO inside); edges translate to and from infrastructure.

## Rule 7 — Debug observability: full I/O logging, replayable

> *"Shouldn't you also log somewhere the FULL input and outputs of the whole
> chain (during debug only) including headers and bodies ... and then
> comparing, since the lateral test just works?"* — Tunnel sessions

- During debug: log the **full input and output of the whole chain** (headers,
  bodies, intermediate steps) to disk — not just errors.
- Side tests must log identically, so you can **compare** a passing lateral
  test against a failing production call and see the divergence.
- Keep captured real traffic and **replay it through the structure**
  (*"using stored message data and replaying it through the structure"*) to
  reproduce and fix without the live host.
- Logging must be enough that long-term debugging works from log files and the
  stored corpus alone.

## Rule 8 — Nothing may break existing functionality

> *"Nothing may break already existing functionality in the server."* — Tunnel sessions

- Modularity changes and refactors are **behavior-preserving**: same inputs,
  same outputs, same side effects.
- After any restructuring, run the existing tests + a regression pass over the
  previous behavior before declaring done.
- This is the SSOT/refactor safety net: refactoring restructures *structure*,
  never *behavior*.

---

## Where this applies in ASF

- **Phase 4 (adversarial)**: challenge the design — is there duplication?
  Where is the single source of truth? Is the module testable outside the
  host? What breaks if a config value changes?
- **Phase 5 (PLAN.md)**: the Architecture/Design section must name the modules,
  their boundaries, the one-way dependencies, where shared truth lives, and
  how each module is tested standalone.
- **Phase 6 (implementation)**: apply Rules 1–8 as you build; extract modules
  when triggers fire; write the architecture doc alongside the code.
- **Phase 7 (verification)**: the DoD checklist includes: no duplicated shared
  logic (Rule 2), no hardcoded config values (Rule 3), every module tested
  standalone with the same calls (Rule 4), architecture doc written (Rule 6),
  existing functionality still green (Rule 8).

## Anti-patterns

- ❌ One giant file / god-object that "does everything"
- ❌ Copy-pasting shared logic instead of importing the one module
- ❌ A "test version" of a module that differs from the production version
- ❌ Hardcoded model names, thresholds, URLs in logic instead of config
- ❌ Escalation/fallback logic re-implemented per caller instead of one path
- ❌ Refactoring "for fun" without the testability/debugging payoff
- ❌ Shipping a module that cannot run outside the host
- ❌ Skipping the architecture writeup ("the code is self-documenting")
