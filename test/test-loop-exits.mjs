/**
 * The loop exits (0.21.0).
 *
 * A real run was steered at one uncloseable completion-gate gap 2,349 times.
 * The gate detected the repeat — and used that knowledge only to rephrase the
 * message, while the one exit that fitted (a park) was reachable only through
 * four regexes matched against ASF's own gap wording. This file pins the four
 * things that had to change so that class of loop cannot come back:
 *
 *   1. a red suite is split into "inherited" and "caused", measured, not claimed;
 *   2. a gate that measured nothing is reported, never passed, never blocking;
 *   3. a project's `gate.mode: "warn"` is honoured without calling red code healthy;
 *   4. an identical ask escalates to a park instead of being re-issued forever.
 */

import { createLedger } from "../lib/gates/ledger.mjs";
import { decideSettlement, REPEAT_LIMIT, MAX_RUN_STEERS } from "../lib/gates/settle.mjs";
import { parseFailing, failuresInheritedFromBaseline, deriveSuiteRun } from "../lib/gates/suite-runs.mjs";

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + String(detail).slice(0, 110) : ""}`);
}
function section(s) {
  console.log(`\n=== ${s} ===`);
}

/** A ledger with every ordinary floor already satisfied. */
function cleanLedger() {
  const l = createLedger();
  l.append({ kind: "health-run", level: "standard", verdict: "pass", scanned: 9 });
  l.append({ kind: "suite-run", command: "bash test/run-all.sh", exitCode: 0, durationMs: 1000, testCount: 10, failing: [], scope: "full" });
  return l;
}

// ─── 1. failing tests are read from the runners ────────────────────────────
section("1. the failing test names come from the runner's own output");
{
  const pytest = parseFailing(`\nFAILED tests/a.py::test_float32 - TypeError: float32 is not JSON serializable\nFAILED tests/b.py::test_load\nERROR tests/c.py::test_async\n3 failed, 47 passed\n`);
  check("pytest FAILED/ERROR names are read", pytest.length === 3 && pytest[0].includes("tests/a.py::test_float32"), pytest.join(" | "));

  const jest = parseFailing(`FAIL src/x.test.js\n  ✕ adds numbers (3 ms)\n  ✓ ignores nothing\n`);
  check("jest ✕ is read and ✓ is not", jest.length === 1 && jest[0].startsWith("adds numbers"), jest.join(" | "));

  const vitest = parseFailing(`× parses the payload\n   · skipped case\n`);
  check("vitest × is read", vitest.length === 1 && vitest[0] === "parses the payload", vitest.join(" | "));

  const mocha = parseFailing(`  1) suite › renders the card\n`);
  check("mocha's numbered failure is read without its counter", mocha.length === 1 && mocha[0] === "suite › renders the card", mocha.join(" | "));

  const node = parseFailing(`✖ settles the run (12.4 ms)\n`);
  check("node --test ✖ is read, timing stripped", node.length === 1 && node[0] === "settles the run", node.join(" | "));

  const ansi = parseFailing(`\u001b[31m✕ coloured failure\u001b[39m\n`);
  check("ANSI colour does not hide a failure", ansi.length === 1 && ansi[0] === "coloured failure", ansi.join(" | "));

  check("a green run yields no failing names", parseFailing("10 passing (2s)\nAll tests passed").length === 0);
  check("deriveSuiteRun carries the failing names", (deriveSuiteRun("pytest -q", { exitCode: 1, output: "FAILED tests/a.py::t" }) || {}).failing?.[0] === "tests/a.py::t");
}

// ─── 2. inherited red vs caused red ────────────────────────────────────────
section("2. a suite that was already red is not this run's blocker");
{
  const baseline = { kind: "baseline-run", command: "pytest -q", exitCode: 1, failing: ["tests/a.py::test_old", "tests/b.py::test_old2"], scope: "full", head: "abc1234567" };
  const red = { kind: "suite-run", command: "pytest -q", exitCode: 1, failing: ["tests/a.py::test_old"], scope: "full" };

  const inherited = failuresInheritedFromBaseline(red, baseline);
  check("a failure present in the baseline is inherited", inherited.ok === true, JSON.stringify(inherited));

  const caused = failuresInheritedFromBaseline({ ...red, failing: ["tests/a.py::test_old", "tests/new.py::test_regression"] }, baseline);
  check("a NEW failure is not excused by the baseline", caused.ok === false && /not in the baseline/.test(caused.why || ""), caused.why);

  const noBase = failuresInheritedFromBaseline(red, null);
  check("without a baseline, inheritance cannot be claimed", noBase.ok === false && /asf_baseline/.test(noBase.why || ""), noBase.why);

  const unreadable = failuresInheritedFromBaseline({ ...red, failing: [] }, baseline);
  check("unparseable failures cannot claim inheritance either", unreadable.ok === false && /could not be read/.test(unreadable.why || ""), unreadable.why);

  const green = failuresInheritedFromBaseline({ ...red, exitCode: 0 }, baseline);
  check("a green run is not an inheritance question", green.ok === false && /not red/.test(green.why || ""));
}

section("2b. the completion gate weighs inherited red as debt, caused red as a blocker");
{
  // No green full run in these fixtures: the gate judges the LAST full run, and a
  // green one earlier in the session would be a different question.
  const redLedger = (failing, baseline) => {
    const l = createLedger();
    l.append({ kind: "health-run", level: "standard", verdict: "pass", scanned: 9 });
    l.append({ kind: "suite-run", command: "pytest -q", exitCode: 1, durationMs: 900, testCount: 50, failing, scope: "full" });
    if (baseline) l.append({ kind: "baseline-run", command: "pytest -q", exitCode: 1, durationMs: 900, failing: ["tests/a.py::test_old"], scope: "full", head: "abc1234567" });
    return l;
  };
  const opts = { scale: "standard", sourceMutated: true, testRunRecorded: true };

  const d = decideSettlement(redLedger(["tests/a.py::test_old"], true), opts);
  const suiteGap = (d.missing || []).find((g) => /full test suite/.test(g)) || "";
  check("an inherited red does not block", suiteGap === "", d.missing.join(" | "));
  check("but it is reported as unverified debt", (d.reported || []).some((r) => /inherited from the recorded baseline/.test(r)), (d.reported || []).join(" | "));
  check("and the report never calls it green", !(d.reported || []).some((r) => /green/.test(r)));

  const d2 = decideSettlement(redLedger(["tests/a.py::test_old", "tests/new.py::test_regression"], true), opts);
  check("a regression still blocks, with the reason", (d2.missing || []).some((g) => /full test suite/.test(g) && /not in the baseline/.test(g)), d2.missing.join(" | "));

  const d3 = decideSettlement(redLedger(["tests/a.py::test_old"], false), opts);
  check("red with no baseline blocks and says how to close it", (d3.missing || []).some((g) => /full test suite/.test(g) && /asf_baseline/.test(g)), d3.missing.join(" | "));

  // green-then-red is a red session
  const l4 = redLedger(["tests/a.py::test_old"], true);
  l4.append({ kind: "suite-run", command: "pytest -q", exitCode: 0, durationMs: 900, testCount: 50, failing: [], scope: "full" });
  l4.append({ kind: "suite-run", command: "pytest -q", exitCode: 1, durationMs: 900, testCount: 50, failing: ["tests/a.py::test_old"], scope: "full" });
  const d4 = decideSettlement(l4, opts);
  check("a session that finished red is judged red, not its earlier green", (d4.reported || []).some((r) => /inherited from the recorded baseline/.test(r)), d4.reported.join(" | "));
}

// ─── 3. a gate that measured nothing ───────────────────────────────────────
section("3. not-measured is reported, never passed, never blocking");
{
  const l = cleanLedger();
  l.append({ kind: "health-run", level: "standard", verdict: "not-measured", scanned: 0 });
  const d = decideSettlement(l, { scale: "standard" });
  check("a not-measured verdict does not block", !(d.missing || []).some((g) => /health/.test(g)), d.missing.join(" | "));
  check("it is reported as unverified", (d.reported || []).some((r) => /did not measure anything/.test(r)), (d.reported || []).join(" | "));
  check("and the ledger accepts the kind", l.count("health-run") === 2);

  const l2 = cleanLedger();
  const bad = l2.append({ kind: "health-run", level: "standard", verdict: "passed", scanned: 0 });
  check("a made-up verdict is refused", bad.ok === false, String(bad.error));
}

section("3b. gate.mode warn is honoured without calling red code healthy");
{
  const l = cleanLedger();
  l.append({ kind: "health-run", level: "standard", verdict: "fail", scanned: 9, mode: "warn" });
  const d = decideSettlement(l, { scale: "standard" });
  check("the project's warn policy is respected", !(d.missing || []).some((g) => /health gate measured violations/.test(g)), d.missing.join(" | "));
  check("the code is still reported as NOT healthy", (d.reported || []).some((r) => /verdict: fail/.test(r) && /NOT healthy/.test(r)), (d.reported || []).join(" | "));

  const l2 = cleanLedger();
  l2.append({ kind: "health-run", level: "standard", verdict: "fail", scanned: 9 });
  const d2 = decideSettlement(l2, { scale: "standard" });
  check("without that policy a fail still blocks at small scale too", (d2.missing || []).some((g) => /health gate measured violations/.test(g)), d2.missing.join(" | "));
}

// ─── 4. the ladder ─────────────────────────────────────────────────────────
section("4. an identical ask escalates to a park instead of looping forever");
{
  const l = createLedger();
  const first = decideSettlement(l, { scale: "standard", continuationsSoFar: 0 });
  check("the first ask blocks and works normally", first.block === true && !first.park);
  const fp = first.fingerprint;

  const counts = {};
  const bump = () => { counts[fp] = (counts[fp] || 0) + 1; };
  bump();
  const second = decideSettlement(l, { scale: "standard", continuationsSoFar: 1, seenSteers: [fp], steerCounts: counts });
  check("the second identical ask still pushes the agent to work", second.block === true && !second.park);
  bump();
  const third = decideSettlement(l, { scale: "standard", continuationsSoFar: 2, seenSteers: [fp], steerCounts: counts });
  check(`up to ${REPEAT_LIMIT} identical asks are tolerated`, third.block === true && !third.park);
  bump();
  const fourth = decideSettlement(l, { scale: "standard", continuationsSoFar: 3, seenSteers: [fp], steerCounts: counts });
  check("past the limit it is PARKED, not re-asked", fourth.block === false && !!fourth.park, JSON.stringify({ block: fourth.block, park: !!fourth.park }));
  check("the park says who decides", /PO/.test(fourth.park?.question || ""), fourth.park?.question);
  check("the park names the gaps it is escalating", (fourth.park?.question || "").includes("Missing") || (fourth.park?.question || "").length > 20);
  check("the park reason is a scope/waiver reason", /scope|waiver/.test(fourth.park?.reason || ""), fourth.park?.reason);
  check("the ladder is bounded and small", REPEAT_LIMIT <= 5, `REPEAT_LIMIT=${REPEAT_LIMIT}`);

  // ── 4b. the coarse bound: gaps that never repeat ───────────────────────────
  // The ladder counts per fingerprint, and the fingerprint is the WHOLE missing
  // set — so a gap set that keeps changing never repeats and never escalates.
  // With a dozen kinds of gap the subsets run into the thousands; the block path
  // has no other bound. This is the general form of the 2,349-steer hole.
  const rot = createLedger();
  let rotated = null;
  for (let i = 0; i < MAX_RUN_STEERS; i++) {
    rotated = decideSettlement(rot, { scale: "standard", continuationsSoFar: i, seenSteers: [`fp-${i}`], steerCounts: { [`fp-${i}`]: 1 } });
    if (rotated.park) break;
  }
  check("a gap set that never repeats still blocks while there is budget", rotated?.block === true && !rotated?.park, JSON.stringify({ block: rotated?.block, park: !!rotated?.park }));
  const exhausted = decideSettlement(rot, { scale: "standard", continuationsSoFar: MAX_RUN_STEERS, seenSteers: [], steerCounts: {} });
  check("NEGATIVE: past the run's steer budget it does not ask again", exhausted.block === false && !!exhausted.park, JSON.stringify({ block: exhausted.block, park: !!exhausted.park }));
  check("the budget park names the run that will not close", /steered/.test(exhausted.park?.question || ""), (exhausted.park?.question || "").slice(0, 80));
  check("and its reason is the budget, not a gap pattern", exhausted.park?.reason === "steer-budget-exhausted", exhausted.park?.reason);
  check("and it puts the decision in the PO's hands", /PO/.test(exhausted.park?.question || ""), (exhausted.park?.question || "").slice(0, 80));
  check("the budget is large enough for real work but not unbounded", MAX_RUN_STEERS > REPEAT_LIMIT * 4 && MAX_RUN_STEERS <= 100, `MAX_RUN_STEERS=${MAX_RUN_STEERS}`);

  // A DIFFERENT gap set is a different fingerprint: the ladder must not punish
  // an agent that made progress and then hit a new wall.
  const l2 = cleanLedger();
  const a = decideSettlement(l2, { scale: "standard", continuationsSoFar: 3, seenSteers: ["some-other-fingerprint"], steerCounts: { "some-other-fingerprint": 9 } });
  check("a fresh gap set starts its own count", !a.park || a.fingerprint !== "some-other-fingerprint");
}

section("5. the continuation no longer promises an endless re-ask");
{
  const l = createLedger();
  const first = decideSettlement(l, { scale: "standard", continuationsSoFar: 0 });
  const fp = first.fingerprint;
  const d = decideSettlement(l, { scale: "standard", continuationsSoFar: 1, seenSteers: [fp], steerCounts: { [fp]: 1 } });
  check("the repeat path is actually taken", /identical ask/.test(d.continuation || ""), (d.continuation || "").slice(-120));
  check("it stops saying 're-raised until it is closed'", !/re-raised until it is closed/.test(d.continuation || ""), (d.continuation || "").slice(-160));
  check("it stops saying only an unobtainable action is ever parked", !/Only an action ASF cannot take is ever parked/.test(d.continuation || ""));
  check("and it tells the agent the ask escalates", /parked for the PO/.test(d.continuation || ""));
}

const failed = results.filter((r) => !r.cond);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
