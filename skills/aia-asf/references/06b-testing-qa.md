# Testing & QA Standard (MANDATORY)

These rules are distilled from real failures in production sessions (pi-vigilant,
pi-aia-asf, pi-aia-browser, conversense, betamaxx). Each rule exists because
skipping it **shipped a broken artifact**. They are not optional.

---

## Rule 1 — Test the ARTIFACT you ship, not the source you wrote

Source passing ≠ shipped thing working. The packaging layer is a real failure surface.

> **Real failure:** `pi-aia-browser` 0.1.0. All source tests passed. But `package.json`
> declared `"postinstall": "node scripts/install-browser.mjs"` while the `files`
> allowlist omitted `scripts/`. The published tarball had no such file → every
> `npm install` aborted with `MODULE_NOT_FOUND`. The package was **100% broken for
> every user** while every source test was green.

Required before declaring a package done:

```bash
npm pack                       # or the equivalent build
tar tzf <pkg>-<ver>.tgz        # inspect the ACTUAL file list
```

- Verify every file the manifest/scripts reference is present in the list.
- Extract to a clean temp dir and load/run it from there.
- For anything installable: install it **from the registry/tarball**, not the repo.

## Rule 2 — Assert the OBSERVABLE END STATE, not intermediate artifacts

"Files are in the right place" and "config is correct" do not prove the feature works.

> **Real failure:** the `aia-asf` skill. Files shipped correctly, `pi.skills` manifest
> correct, description under the length limit — all intermediate checks passed. But the
> YAML description contained an unquoted colon (`The flow is: classify...`), so the
> frontmatter failed to parse and pi **silently skipped the skill**. It was invisible to
> the agent even with an explicit `--skill` path.

Ask: *what would the user observe?* Then assert exactly that.

| Weak (intermediate) | Strong (observable) |
|---|---|
| SKILL.md exists, manifest lists it | Agent reports the skill as available |
| Extension file present | Tool appears in the tool list and executes |
| Server process running | Real request returns correct response |
| Config contains the key | Behavior driven by the key actually changes |

## Rule 3 — Probe for SILENT failures

The worst bugs raise no error. Loaders skip malformed input; caches serve stale data.

- After any config/manifest/frontmatter change, **verify it parsed** (parse it yourself).
- Never treat "no error" as "it worked" — demand positive confirmation.
- Validate machine-read files with a real parser, not by eyeballing:

```bash
python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]).read())" file.yaml
node -e "JSON.parse(require('fs').readFileSync('f.json','utf8'))"
```

## Rule 4 — Read the ACTUAL error before changing anything

> **Real failure:** on the `MODULE_NOT_FOUND` install error the first fix was a *guess*
> at the `files` array. It happened to be right, but the reinstall still failed and the
> real signal — `Cannot find module '.../scripts/install-browser.mjs'` plus a stale npm
> cache — was sitting in the log the whole time.

1. Find and read the real error (log file, stderr, exit code).
2. State the root cause in one sentence.
3. Only then edit.

Never fix by pattern-matching on symptoms. Never retry unchanged and hope.

## Rule 5 — Clean-room verification (defeat caches and local state)

Your machine lies: caches, stale installs, leftover globals, symlinks.

```bash
npm cache clean --force
cd $(mktemp -d) && npm install <pkg>@<version>   # fresh dir, explicit version
```

- Verify the **installed version** is the one you just published.
- Remove/disable old copies first — a stale duplicate can serve your test and fake a pass.
- Confirm *which* copy answered (distinct log path, version string, marker).

> **Real failure:** a stale npm cache kept serving the broken 0.1.0 after 0.1.1 was
> published; the install kept failing with an error already fixed.

## Rule 6 — Every fixed bug gets a REGRESSION test

A bug fixed without a test will return. For each fix, add an assertion that fails on
the old code and passes on the new one, and keep it in the permanent suite.

## Rule 7 — Test triggers AND non-triggers

For anything conditional (skills, auto-activation, gates, hooks), correctness is
two-sided. Half a test suite hides half the bugs.

- **Triggers**: every case that must activate, activates.
- **Non-triggers**: every case that must NOT activate, stays silent (Q&A, one-liners,
  casual talk, unrelated domains).
- **Boundaries**: the ambiguous cases — assert it asks rather than guesses.

## Rule 8 — Test state machines for deadlock and bad transitions

> **Real failure:** pi-vigilant gated a write on "all specs resolved", but the cooldown
> suppressed that very write → permanent deadlock. Found only by simulating the full
> multi-turn sequence.

- Drive the real sequence of transitions, not one isolated call.
- Check terminal states are reachable, and no state can block its own exit.
- Test repeat/idempotent invocations and out-of-order calls.

## Rule 9 — Browser testing is mandatory for any web surface

API/curl checks do not replicate what a human sees. Via `pi-aia-browser`:

1. `browser_init`, `browser_navigate` to the running app
2. Walk each key user journey with real clicks/typing
3. Assert rendered DOM content (`browser_dom`), not just HTTP 200
4. Check console errors via `browser_js`
5. `browser_screenshot` for the record; check mobile + desktop viewports

A 200 response with a blank or broken page is a **failure**.

## Rule 10 — Definition of done (all must hold)

- [ ] Typecheck/build passes
- [ ] Full test suite green (not a subset)
- [ ] Regression test added for every bug fixed this cycle
- [ ] Triggers **and** non-triggers tested for conditional behavior
- [ ] Shipped artifact inspected (`npm pack` file list) and installed clean-room
- [ ] Observable end state verified as a user would experience it
- [ ] Web surfaces exercised through a real browser
- [ ] Every MUST spec `met` with concrete evidence (`update_spec_status`)
- [ ] Unverifiable specs → `partial` + asked the user (never self-certified)

## Rule 11 — Report honestly

- Never claim a test passed that you did not run.
- Never say "verified" for something inferred or assumed.
- If a check was skipped or inconclusive, **say so explicitly** and say why.
- Distinguish "tests pass" from "feature works for the user" — Rule 2.
- If you discover you shipped something broken, say it plainly and fix it first.
