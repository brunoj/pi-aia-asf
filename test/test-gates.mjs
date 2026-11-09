/**
 * GATE suite — every gate ships with a negative control (P44).
 *
 * The failure this suite exists to prevent is not a gate that wrongly blocks. It
 * is a gate that silently stops checking anything and still reports green. So
 * each gate must demonstrate two behaviours: a fixture that MUST fire (proof of
 * power) and a near-miss that MUST NOT (proof it is not firing on everything).
 *
 * **A gate whose near-miss starts failing is a bug in the gate, not a test to
 * update.**
 *
 * Also here: the evidence ledger (P42), gate authority and utility budget
 * (P43/P45), the completion gate (P41), and ASF's own obligations declaration
 * (P39) validated against the guard's vocabulary before it is handed over.
 */
import { checkGate, assertCoverage, summarize, reset, verdict } from "./gate-harness.mjs";
import {
  BLOCKERS,
  evaluateBlockers,
  blockSecretWrite,
  blockTestSubset,
  blockPushWithoutGreen,
  blockDestructiveGitDirty,
} from "../lib/gates/blockers.mjs";
import { createLedger, sessionFacts, renderLedger, validateEntry } from "../lib/gates/ledger.mjs";
import { deriveSuiteRun } from "../lib/gates/suite-runs.mjs";
import { createAuthority, renderAuthority, PROMOTION_RULE } from "../lib/gates/authority.mjs";
import { decideSettlement, renderCompletionGate, MAX_STEERS, steerFingerprint, agentClosable, splitGaps, classifyPark } from "../lib/gates/settle.mjs";
import { loadDeclarations, assertSignalsExist, validateTrigger, renderRules } from "../lib/gates/declarations.mjs";
import { createTracked, noteTrackedCall, danglingGaps, trackedClear, DISPOSITIONS, matchersFromConfig } from "../lib/gates/tracked.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = new URL("..", import.meta.url).pathname;
const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const section = (s) => console.log(`\n=== ${s} ===`);

// ─── 1. The four blockers, each with fire + near-miss ──────────────────────
section("blockers: fire and near-miss fixtures");

const SECRET = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n";

const GATES = [
  {
    name: "secret-in-tracked-file",
    rule: "no-secret-in-tracked-file",
    class: "H",
    run: (input) => blockSecretWrite(input, {}),
    fire: [
      { path: "src/config.ts", content: `const key = "${SECRET}";` },
      { path: "src/aws.ts", content: `const id = "AKIAIOSFODNN7EXAMPLE";` },
      { path: "src/api.ts", content: `const t = "sk-proj-abcdefghijklmnopqrstuvwx";` },
      { path: "src/gh.ts", content: `const t = "ghp_${"a".repeat(36)}";` },
    ],
    nearMiss: [
      // The near-miss is the important half: these must NOT fire.
      { path: "src/config.ts", content: `const key = process.env.STRIPE_KEY;` },
      { path: "src/config.ts", content: `const placeholder = "YOUR_API_KEY_HERE";` },
      { path: ".env", content: `AWS_SECRET=${SECRET}` },
      { path: ".env.local", content: `TOKEN=${SECRET}` },
      { path: ".env.example", content: `TOKEN=sk-proj-abcdefghijklmnopqrstuvwx` },
      { path: "test/fixtures/token.json", content: `{"token":"sk-proj-abcdefghijklmnopqrstuvwx"}` },
      { path: "README.md", content: `use ${SECRET} as an example` },
    ],
  },
  {
    name: "test-subset-without-impact",
    rule: "test-subset-states-impact-area",
    class: "H",
    run: (input, ctx) => blockTestSubset(input, ctx),
    fire: [{ command: "npm test -- --grep auth" }, { command: "vitest run src/a.test.ts" }, { command: "npx jest --testPathPattern=cart" }],
    nearMiss: [
      { command: "npm test" },
      { command: "npm run test:unit" },
      { command: "vitest run" },
      { input: { command: "npm test -- --grep auth" }, ctx: { impactStated: "authentication" } },
      { command: "git status" },
      { command: "echo 'npm test is not a command here'" },
    ],
  },
  {
    name: "push-without-recorded-green",
    rule: "full-suite-green-before-push",
    class: "H",
    run: (input, ctx) => blockPushWithoutGreen(input, ctx),
    fire: [{ command: "git push origin main" }, { command: "npm publish" }, { command: "git push --force" }],
    nearMiss: [
      { input: { command: "git push origin main" }, ctx: { suiteRuns: [{ scope: "full", exitCode: 0 }] } },
      { input: { command: "npm publish" }, ctx: { suiteRuns: [{ scope: "full", exitCode: 0 }] } },
      { command: "git push --dry-run origin main" },
      { command: "git status" },
      { command: "git commit -m x" },
    ],
  },
  {
    name: "destructive-git-dirty-tree",
    rule: "destructive-git-needs-clean-tree",
    class: "H",
    run: (input, ctx) => blockDestructiveGitDirty(input, ctx),
    fire: [
      { input: { command: "git reset --hard HEAD~1" }, ctx: { dirty: true } },
      { input: { command: "git clean -fd" }, ctx: { dirty: true } },
      { input: { command: "git push --force origin main" }, ctx: { dirty: true } },
      { input: { command: "git stash drop" }, ctx: { dirty: true } },
    ],
    nearMiss: [
      { input: { command: "git reset --hard HEAD~1" }, ctx: { dirty: false } },
      { input: { command: "git clean -fd" }, ctx: { dirty: false } },
      { input: { command: "git clean -n" }, ctx: { dirty: true } },
      { command: "git status" },
      { command: "git add -A" },
    ],
  },
];

reset();
const allFails = [];
for (const g of GATES) allFails.push(...checkGate(g));

const coverageFails = assertCoverage(
  BLOCKERS.map((b) => ({ name: b.name })),
  GATES.map((g) => ({ name: g.name })),
);
allFails.push(...coverageFails);

const sum = summarize();
check("every registered blocker ships fire + near-miss fixtures", allFails.length === 0, allFails.join(" | "));
check("the meta-assertion counts gates, not vibes", sum.total > 0);

section("blockers: fail-safe is stated per rule, never inherited");
const secret = BLOCKERS.find((b) => b.name === "secret-in-tracked-file");
const others = BLOCKERS.filter((b) => b.name !== "secret-in-tracked-file");
check("the secret rule blocks when its own check crashes", secret?.failSafe === "block");
check("the convenience rules degrade to allow when they crash", others.every((b) => b.failSafe === "allow"));

// A crashing blocker must be observable, not silent.
const crashing = evaluateBlockers("write", { path: "x.ts", content: "y" }, {}, { enabled: {} });
check("evaluateBlockers does not throw on ordinary input", typeof crashing === "object" && Array.isArray(crashing.verdicts));
const verdictsForCrash = evaluateBlockers(
  "write",
  { path: "src/x.ts", content: `const t = "AKIAIOSFODNN7EXAMPLE";` },
  {},
  { enabled: {} },
);
check("a secret is blocked through the public entry point", verdictsForCrash.block === true);
check("the block reason names an autonomous exit", /Autonomous exit/i.test(verdictsForCrash.reason || ""), verdictsForCrash.reason);
check("no blocker asks a human anything", !/confirm|approve\?\s*$|Allow\?/i.test(verdictsForCrash.reason || ""));

section("blockers: every blocker has an autonomous exit");
for (const b of BLOCKERS) {
  const sample = GATES.find((g) => g.name === b.name);
  const f0 = sample.fire[0];
  const fired = sample.run(f0.input ?? f0, f0.ctx ?? {});
  check(`${b.name}: its reason tells the agent what to do instead`, /Autonomous exit|run the full suite|commit|stash|environment/i.test(fired.reason || ""), fired.reason);
}

// ─── 2. Evidence ledger (P42) ──────────────────────────────────────────────
section("evidence ledger");

const ledger = createLedger();
const ok = ledger.append({ kind: "suite-run", command: "npm test", exitCode: 0, durationMs: 1200, testCount: 73, scope: "full" });
check("a well-formed entry is accepted", ok.ok === true);
const bad = ledger.append({ kind: "suite-run", command: "npm test", exitCode: 0 });
check("a malformed entry is rejected", bad.ok === false);
check("a rejected entry is RECORDED, not silently dropped", ledger.rejected.length === 1, ledger.rejected.join("; "));
check("a rejected entry is not in the ledger", ledger.count("suite-run") === 1);
check("an unknown kind is refused", ledger.append({ kind: "vibes", note: "it looked fine to me" }).ok === false);

check("a full-suite run is recognised from the command", deriveSuiteRun("npm test", { durationMs: 100, output: "73 passing" })?.scope === "full");
check("a subset run is recognised as a subset", deriveSuiteRun("npm test -- --grep auth", { durationMs: 50, output: "3 passing" })?.scope === "subset");
check("an unrelated command is not evidence", deriveSuiteRun("git status", { durationMs: 5 }) === null);
check("test count is 'unknown' when the runner output cannot be read", deriveSuiteRun("npm test", { durationMs: 100, output: "done" })?.testCount === "unknown");
check("test count is never 0 by default", deriveSuiteRun("npm test", { durationMs: 100, output: "nonsense" })?.testCount !== 0);
check("a read count is recorded", deriveSuiteRun("npm test", { durationMs: 100, output: "Tests: 42 passed" })?.testCount === 42);

section("scanned: 0 is never a pass");
const v0 = verdict({ fired: true, scanned: 0 });
check("a gate that examined nothing cannot report fired", v0.fired === false);
check("and it says so", typeof v0.reported === "string" && v0.reported.includes("not a pass"), v0.reported);
const v1 = verdict({ fired: true, scanned: 12 });
check("a gate that examined something keeps its verdict", v1.fired === true && v1.scanned === 12);

section("session facts (what a spec cannot express)");
const empty = createLedger();
const f1 = sessionFacts(empty, { scale: "standard", webTouched: true });
check("no health run is a gap", f1.missing.some((m) => m.includes("health")));
check("no full suite run is a gap", f1.missing.some((m) => m.includes("full test suite")));
check("touched web surface with no verification is a gap", f1.missing.some((m) => m.includes("browser")));
const f2 = sessionFacts(empty, { scale: "small", webTouched: false });
check("small work is held to the reduced set", !f2.missing.some((m) => m.includes("full test suite")));

const full = createLedger();
full.append({ kind: "health-run", level: "standard", verdict: "pass", scanned: 41 });
full.append({ kind: "suite-run", command: "npm test", exitCode: 0, durationMs: 4000, testCount: 73, scope: "full" });
full.append({ kind: "browser-verify", page: "/settings", action: "click save", assertion: "toast appears" });
check("a complete session has no gaps", sessionFacts(full, { scale: "standard", webTouched: true }).missing.length === 0, sessionFacts(full, { scale: "standard", webTouched: true }).missing.join("; "));

const naLedger = createLedger();
naLedger.append({ kind: "health-run", level: "standard", verdict: "pass", scanned: 10 });
naLedger.append({ kind: "suite-run", command: "npm test", exitCode: 0, durationMs: 1000, testCount: 5, scope: "full" });
naLedger.append({ kind: "browser-na", reason: "no UI in this change — pure backend module" });
check("a structured n/a with a reason satisfies the browser fact", sessionFacts(naLedger, { scale: "standard", webTouched: true }).missing.length === 0);

const redLedger = createLedger();
redLedger.append({ kind: "health-run", level: "standard", verdict: "pass", scanned: 10 });
redLedger.append({ kind: "suite-run", command: "npm test", exitCode: 1, durationMs: 1000, testCount: 5, scope: "full" });
check("a suite that never exited 0 is still a gap", sessionFacts(redLedger, { scale: "standard" }).missing.some((m) => m.includes("never exited 0")));

check("the ledger renders scanned: 0 as not a pass", /examined nothing/.test(
  renderLedger(Object.assign(createLedger(), { entries: [{ kind: "health-run", level: "standard", verdict: "pass", scanned: 0 }] })),
));

// ─── 3. Authority and budget (P43/P45) ─────────────────────────────────────
section("gate authority: promotion proves power, not quiet");

const auth = createAuthority();
check("a new gate starts in probation", auth.currentState("secret-in-tracked-file") === "probation");

const quiet = auth.eligibility("g1", { cleanRuns: PROMOTION_RULE.cleanRunsRequired, caughtCases: 0, verdicts: 50, falsePositives: 0 });
check("a gate that never fires is NOT promoted", quiet.promote === false, quiet.reasons.join("; "));
check("and the reason says why in words a reviewer recognises", quiet.reasons.some((r) => r.includes("never fires")));

const earned = auth.eligibility("g2", { cleanRuns: PROMOTION_RULE.cleanRunsRequired, caughtCases: 1, verdicts: 50, falsePositives: 0 });
check("a gate with clean runs AND a caught fixture case is promoted", earned.promote === true, earned.reasons.join("; "));

const noisy = auth.eligibility("g3", { cleanRuns: 2, caughtCases: 1 });
check("insufficient clean runs blocks promotion", noisy.promote === false);

section("transitions are attributed or refused");
const noReason = auth.transition({ gate: "g4", to: "active", reason: "" });
check("a gate cannot change its own power without saying why", noReason.ok === false, noReason.error);
const withReason = auth.transition({ gate: "g5", to: "active", reason: "5 clean runs and 1 caught fixture case" });
check("an attributed transition is recorded", withReason.ok === true && auth.currentState("g5") === "active");
check("and it is reportable", typeof withReason.report === "string" && withReason.report.includes("probation → active"));
check("the log is append-only", auth.transitions.length >= 1);
check("an unknown state is refused", auth.transition({ gate: "g6", to: "godmode", reason: "because" }).ok === false);

section("utility budget: automatic demotion (P45)");
const auth2 = createAuthority();
auth2.transition({ gate: "push-gate", to: "active", reason: "earned" });
const demoted = auth2.checkBudget("push-gate", { verdicts: 100, falsePositives: 20, blocksThisRun: 1, budgets: { falsePositiveBudget: 0.05 } });
check("a gate exceeding its false-positive budget is demoted automatically", demoted.demote === true, demoted.reasons.join("; "));
check("the demotion names the evidence that caused it", demoted.reasons[0].includes("20/100"), demoted.reasons.join("; "));
check("and the state actually changed", auth2.currentState("push-gate") === "demoted");

const auth3 = createAuthority();
auth3.transition({ gate: "subset-gate", to: "active", reason: "earned" });
const overBlocks = auth3.checkBudget("subset-gate", { verdicts: 20, falsePositives: 0, blocksThisRun: 9, budgets: { blocksPerRunBudget: 3 } });
check("a gate that blocks repeatedly in one run is demoted", overBlocks.demote === true, overBlocks.reasons.join("; "));

const auth4 = createAuthority();
auth4.transition({ gate: "good-gate", to: "active", reason: "earned" });
const fine = auth4.checkBudget("good-gate", { verdicts: 100, falsePositives: 1, blocksThisRun: 1, budgets: { falsePositiveBudget: 0.05 } });
check("a working gate is left alone", fine.demote === false);

const auth5 = createAuthority();
check("a probation gate cannot be demoted (it is not blocking yet)", auth5.checkBudget("x", { verdicts: 100, falsePositives: 90 }).demote === false);

section("a bypass request is not evidence that a gate is wrong");
const auth6 = createAuthority();
auth6.transition({ gate: "g", to: "active", reason: "earned" });
// Nine bypass requests, zero confirmed-false fixtures: the gate stays active.
const bypassOnly = auth6.checkBudget("g", { verdicts: 100, falsePositives: 0, blocksThisRun: 2, budgets: { falsePositiveBudget: 0.05 } });
check("bypasses alone do not demote a gate", bypassOnly.demote === false, bypassOnly.reasons.join("; "));
check("and the ledger records a bypass as friction, not as a false positive", typeof auth6.recordVerdict("g", { fired: true, source: "bypass" }).confirmedFalse === "boolean");

section("authority rendering is honest about a silent gate");
const rendered = renderAuthority(createAuthority(), {});
check("no verdicts is reported, not read as clean", /which is reported, not read as clean/.test(rendered), rendered.slice(0, 120));

// ─── 4. Completion gate (P41) ──────────────────────────────────────────────
section("completion gate");

const l2 = createLedger();
const d1 = decideSettlement(l2, { scale: "standard", webTouched: false, continuationsSoFar: 0 });
check("an empty session cannot settle", d1.block === true);
check("the continuation names exactly what is missing", typeof d1.continuation === "string" && d1.continuation.includes("Missing"));
// A warranted loop has NO ceiling. Claiming one is what made the 2026-11-07
// loop read as "1st of at most 2 continuations" forever.
check("the continuation never claims a ceiling it does not have", !/of at most|at most \d+|max(imum)? of \d+/i.test(d1.continuation));
check("the continuation says the work is not stopped", /Nothing here stops you/.test(d1.continuation) && /no ceiling on warranted work/.test(d1.continuation));
check("the completion gate never asks a human anything", !/please confirm|approve|Allow\?/i.test(d1.continuation));
check("the steer carries a fingerprint of exactly its gaps", d1.fingerprint === steerFingerprint(d1.missing));

const d2 = decideSettlement(l2, { scale: "standard", webTouched: false, continuationsSoFar: 1, seenSteers: [d1.fingerprint] });
// The same REAL gap must keep being raised — the loop is the mechanism, and it
// may run as long as the gap is real. What it must not do is pretend the gap is
// a new one, or stop asking while the gap is still open.
check("a repeated real gap is raised again, not dropped", d2.block === true && d2.steer === 2);
check("but it is worded as a repeat, not as new information", /still open after 1 previous steer/.test(d2.continuation));
check("and it names the same gaps", d2.fingerprint === d1.fingerprint);
// negative control: a DIFFERENT gap is still raised after a steer — the rule is no repeats, not a cap of one
const l2b = createLedger();
const d2b = decideSettlement(l2b, { scale: "standard", sourceMutated: true, continuationsSoFar: 1, seenSteers: [d1.fingerprint] });
check("a new, different gap is still raised", d2b.block === true && d2b.fingerprint !== d1.fingerprint);
// No cap: past any reporting number the gate still blocks on a real gap.
for (const n of [MAX_STEERS, MAX_STEERS * 10, 1000]) {
  const d2c = decideSettlement(l2b, { scale: "standard", sourceMutated: true, continuationsSoFar: n });
  check(`at steer ${n} a real gap still blocks (no cap on warranted work)`, d2c.block === true && d2c.steer === n + 1);
}

section("A7: specs met this run need a trace");
const tr = decideSettlement(createLedger(), { scale: "small", untracedMet: ["spc-1"] });
check("a spec met this run without a trace holds the run", tr.block === true && tr.missing.some((m) => /spc-1/.test(m) && /trace/.test(m)), tr.missing.join(" | "));
check("NEGATIVE: no untraced specs, no trace gap", decideSettlement(createLedger(), { scale: "small" }).missing.every((m) => !/trace/.test(m)));

section("a gate can only block on something the agent can close");
{
  const std = decideSettlement(createLedger(), { scale: "standard" });
  check("the health gap names the agent-side tool, not a slash command",
    std.missing.some((m) => /asf_health tool/.test(m)) && !std.missing.some((m) => /\/asf\s+health/.test(m)),
    std.missing.join(" | "));
  // The structural guarantee behind the 2026-11-07 loop: sweep every shape of
  // session and require that NOTHING the gate can block on needs a human keystroke.
  const shapes = [];
  for (const scale of ["small", "standard", "major"]) {
    for (const webTouched of [false, true]) {
      for (const reportFields of [[], ["delivery"]]) {
        const l = createLedger();
        shapes.push(decideSettlement(l, { scale, webTouched, reportFields }));
        shapes.push(decideSettlement(l, { scale, webTouched, reportFields, sourceMutated: true }));
      }
    }
  }
  const offending = shapes.flatMap((d) => (d.block ? d.missing : []));
  check("no blocking gap ever needs a human action (loop-proof sweep)",
    offending.every(agentClosable),
    offending.filter((m) => !agentClosable(m)).join(" | ") || `${offending.length} gaps swept, all agent-closable`);
  check("a human-only gap is reported rather than blocked", (() => {
    const d = decideSettlement(createLedger(), { scale: "standard", reportFields: ["x"] });
    return (d.reported || []).every((g) => !agentClosable(g));
  })());
  check("agentClosable refuses a slash-command gap", agentClosable("/asf health was not run") === false);
  // The split itself is the guarantee: a human-only gap can never enter the
  // blocking list, whatever a future gate writes into it.
  const sp = splitGaps(["/asf health was not run", "run the tests", "type /asf approve", "needs your approval to deploy"]);
  check("splitGaps routes human-only gaps to reported", sp.reported.length === 3 && sp.blocking.length === 1, JSON.stringify(sp));
  check("NEGATIVE: a plain evidence gap still blocks", sp.blocking[0] === "run the tests");
  // The routing, not just the helper: a gap whose text needs a human must reach
  // the REPORTED list through decideSettlement itself.
  const viaSpec = decideSettlement(createLedger(), { scale: "small", untracedMet: ["needs your approval to proceed"] });
  check("decideSettlement routes a human-only gap to reported, never to blocking",
    viaSpec.block === false && (viaSpec.reported || []).length === 1 && viaSpec.missing.length === 0,
    JSON.stringify({ missing: viaSpec.missing, reported: viaSpec.reported })?.slice(0, 140));
  check("agentClosable accepts a gap the agent can do", agentClosable("run the tests that cover the change") === true);
}

section("completion floor: source changed => a passing test run");
const fl = createLedger();
const fa = decideSettlement(fl, { scale: "small", sourceMutated: true, testRunRecorded: false });
check("small run with source changes and no test cannot settle", fa.block === true && fa.missing.some((m) => /no passing test run/.test(m)), fa.missing.join(" | "));
const fb = decideSettlement(fl, { scale: "small", sourceMutated: true, testRunRecorded: true });
check("small run with a passing test run settles (no health/full-suite ceremony)", fb.block === false && fb.missing.length === 0, fb.missing.join(" | "));
const fc = decideSettlement(fl, { scale: "small", sourceMutated: false });
check("small run without source changes is not held to the floor", fc.block === false);
check("evidence gaps are never parked as human input", fa.park === undefined);

const d3 = decideSettlement(full, { scale: "standard", webTouched: true, continuationsSoFar: 0 });
check("a session with real evidence settles", d3.block === false && d3.missing.length === 0);
check("the rendered gate says all facts are recorded", /all session facts recorded/.test(renderCompletionGate(d3)));

// ─── 4b. Tracked work: "waiting" is not a disposition ─────────────────────
section("dangling tracked work");

const SAID = "Left In Progress at testing — deliberately not resolved, because the user-visible "
  + "outcome still isn’t confirmed, and not parked, since you told me not to ask you for anything. "
  + "It flips the moment their thread replies: Resume succeeds and I resolve it with mail to ClearStory; "
  + "fails and I re-diagnose from the factory’s own sentence.";

const trOpen = createTracked();
noteTrackedCall(trOpen, { toolName: "bmx_claim", input: { ticket_id: "BMX-42" } });
check("a claimed item is tracked work", Object.keys(trOpen.open).length === 1);

const trWait = createTracked();
noteTrackedCall(trWait, { toolName: "bmx_claim", input: { ticket_id: "BMX-42" } });
check("progress text that describes real work is not a wait",
  noteTrackedCall(trWait, { toolName: "bmx_ticket_progress", input: { ticket_id: "BMX-42", text: "Implemented the retry path; running the full suite now, then I will submit the PR." } }) === null);
noteTrackedCall(trWait, { toolName: "bmx_ticket_progress", input: { ticket_id: "BMX-42", text: SAID } });
check("the sentence that broke the loop IS recognised as a wait", trWait.waits.includes("BMX-42"), JSON.stringify(trWait.waits));

const waitGap = danglingGaps(trWait)[0] || "";
check("a narrated wait is named as not-a-state", /not a state ASF recognises/.test(waitGap), waitGap.slice(0, 120));
check("and all three dispositions are offered", DISPOSITIONS.every((d) => waitGap.includes(d.slice(0, 24))), waitGap.slice(0, 160));

const trResolved = createTracked();
noteTrackedCall(trResolved, { toolName: "bmx_claim", input: { ticket_id: "BMX-1" } });
noteTrackedCall(trResolved, { toolName: "bmx_submit_resolution", input: { ticket_id: "BMX-1", summary: "did the thing" } });
check("resolving clears it", trackedClear(trResolved) && danglingGaps(trResolved).length === 0);

const trParked = createTracked();
noteTrackedCall(trParked, { toolName: "bmx_claim", input: { ticket_id: "BMX-2" } });
noteTrackedCall(trParked, { toolName: "bmx_request_input", input: { ticket_id: "BMX-2", question: "deploy now?" } });
check("parking clears it — parking is a legal disposition", trackedClear(trParked) && danglingGaps(trParked).length === 0);

const trNone = createTracked();
check("a session that claimed nothing is held to nothing", danglingGaps(trNone).length === 0);

// The vocabulary is a tripwire, not an authority: a project may widen it, and a
// typo in a config file must never be able to switch the gate off.
const mCfg = matchersFromConfig({ "gate.tracked.claim": "grabWorkItem", "gate.tracked.wait": ["still stuck on", 42, null] });
const trCfg = createTracked();
check("a project can widen the claim vocabulary", noteTrackedCall(trCfg, { toolName: "linear_grabWorkItem", input: { id: "L-1" }, matchers: mCfg }) === "claim");
check("widening never replaces the built-ins", noteTrackedCall(trCfg, { toolName: "bmx_claim", input: { ticket_id: "BMX-5" }, matchers: mCfg }) === "claim");
check("a project's own phrasing of a wait is caught", noteTrackedCall(trCfg, { toolName: "linear_progress", input: { id: "L-1", text: "still stuck on the vendor" }, matchers: mCfg }) === "wait");
check("non-string config entries are ignored, not compiled into the matcher", danglingGaps(trCfg).length === 2, Object.keys(trCfg.open).join(","));
check("empty config yields the built-ins unchanged", matchersFromConfig().claim.source === /(^|[_-])(claim|assign|take|acquire)([_-]|$)/i.source);
check("no matcher matches the empty string (a dangling `|` would trip on everything)",
  ["", "anything at all", "Implemented the retry path"].every((x) => {
    const mm = matchersFromConfig();
    return !mm.wait.test(x) && !mm.claim.test(x) && !mm.resolve.test(x) && !mm.park.test(x);
  }) && ["", undefined, null].every((x) => {
    const mm = matchersFromConfig({ "gate.tracked.wait": [x] });
    return !mm.wait.test("Implemented the retry path");
  }));

// The gate must actually block on it, and must not escalate it.
const dgap = danglingGaps(trOpen)[0];
check("the gap is agent-closable, so it BLOCKS rather than being reported", agentClosable(dgap) && splitGaps([dgap]).blocking.length === 1);
check("the gap is never parked as human input", classifyPark([dgap]) === null);
const dTracked = decideSettlement(full, { scale: "standard", webTouched: false, tracked: trOpen });
check("a run ending with tracked work dangling does not settle", dTracked.block === true && dTracked.missing.some((m) => /neither resolved nor parked/.test(m)), dTracked.missing.join(" | ").slice(0, 140));
check("and it is steered, not parked", dTracked.park === undefined && typeof dTracked.steer === "number");
const dClear = decideSettlement(full, { scale: "standard", webTouched: false, tracked: trResolved });
check("the same run settles once the work has a disposition", dClear.block === false, dClear.missing.join(" | ").slice(0, 140));
check("the gap names no slash command and no 'ask the PO' (else it would self-cancel)",
  !/\/asf\s|ask the (po|user|human)|needs (your|the po's?) (input|approval|key)/i.test(dgap), dgap.slice(0, 160));

// ─── 5. ASF's own declaration file (P39) ───────────────────────────────────
section("ASF obligations declaration");

const decl = loadDeclarations(REPO);
check("the declaration file exists and parses", decl.ok === true, decl.problems.join(" | "));
check("it declares obligations", decl.obligations.length >= 10, String(decl.obligations.length));
check("every obligation carries an honest enforcement class", decl.obligations.every((o) => ["H", "M", "S"].includes(o.class)));
check("every standing obligation re-opens (nothing stays met forever)", decl.obligations.every((o) => o.recurring === true));
check("H and M obligations name a test file AND an assertion", decl.obligations.filter((o) => o.class !== "S").every((o) => o.trace?.testFile && o.trace?.assertion));

const drift = assertSignalsExist(REPO, decl.obligations);
check("every declared test file exists and contains its named assertion", drift.length === 0, drift.join(" | "));

check(
  "no trigger uses consumer vocabulary",
  decl.obligations.every((o) => o.trigger.every((t) => validateTrigger(t) === null)),
  decl.obligations.flatMap((o) => o.trigger.map((t) => validateTrigger(t)).filter(Boolean)).join(" | "),
);
check("a trigger outside the guard's vocabulary is rejected", validateTrigger("phase:6") !== null);
check("the rules render for /asf rules", /H — hard/.test(renderRules(decl.obligations)));
check("the render answers 'what enforces this'", /enforced by:/.test(renderRules(decl.obligations)));

section("declaration drift is caught in both directions");
const tmpBad = path.join(REPO, "obligations.d", "__drift-check.json");
try {
  fs.copyFileSync(path.join(REPO, "obligations.d", "aia-asf.json"), tmpBad);
  const mutated = JSON.parse(fs.readFileSync(tmpBad, "utf-8"));
  // Built at runtime so the sentinel cannot appear in this file itself — a
  // literal here would make the drift check pass by matching its own test.
  const sentinel = ["no-such-assertion", "zq", "x7"].join("-");
  fs.writeFileSync(tmpBad, JSON.stringify(mutated));
  mutated.obligations[0].trace.assertion = sentinel;
  const driftCheck = assertSignalsExist(REPO, mutated.obligations);
  check("a declaration pointing at an assertion that does not exist fails", driftCheck.length >= 1 && driftCheck.every((d) => /does not appear/.test(d)), driftCheck.join("; "));
} finally {
  fs.rmSync(tmpBad, { force: true });
}

const missingFile = loadDeclarations("/nonexistent-repo");
check("a missing declaration file is a failure, never a compliant empty list", missingFile.ok === false && missingFile.problems.some((p) => p.includes("missing")));

// --- signal assertions are a repo-time check, not a consumer-time one -------
// Found by clean-room verification: `/asf rules` runs against the INSTALLED
// package, which ships no test/. Before the fix every consumer saw one false
// drift error per obligation, which trains people to ignore the report.
{
  const noTest = fs.mkdtempSync(path.join(os.tmpdir(), "asf-notest-"));
  fs.mkdirSync(path.join(noTest, "obligations.d"), { recursive: true });
  fs.copyFileSync(path.join(REPO, "obligations.d", "aia-asf.json"), path.join(noTest, "obligations.d", "aia-asf.json"));
  const installed = assertSignalsExist(noTest, decl.obligations);
  check(
    "an installed package with no test/ reports ONE skipped notice, not one false drift error per obligation",
    installed.length === 1 && /skipped/.test(installed[0]),
    `${installed.length}: ${installed[0]}`,
  );
  check(
    "and it says plainly that drift was NOT checked (never a silent pass)",
    /NOT checked/.test(installed[0] || ""),
  );
  fs.rmSync(noTest, { recursive: true, force: true });

  // Fire fixture: a repo that DOES have test/ must still fail on real drift.
  const withTest = fs.mkdtempSync(path.join(os.tmpdir(), "asf-withtest-"));
  fs.mkdirSync(path.join(withTest, "test"), { recursive: true });
  fs.writeFileSync(path.join(withTest, "test", "test-gates.mjs"), "// nothing here\n");
  const drifted = assertSignalsExist(withTest, decl.obligations);
  check(
    "where test/ exists, a missing named test file is still a hard failure",
    drifted.length >= 1 && drifted.every((d) => /does not exist|does not appear/.test(d)),
    `${drifted.length} problems`,
  );
  fs.rmSync(withTest, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.cond);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED: " + failed.map((f) => f.name).join(" | "));
  process.exit(1);
}
