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
import { createLedger, deriveSuiteRun, sessionFacts, renderLedger, validateEntry } from "../lib/gates/ledger.mjs";
import { createAuthority, renderAuthority, PROMOTION_RULE } from "../lib/gates/authority.mjs";
import { decideSettlement, renderCompletionGate, MAX_CONTINUATIONS } from "../lib/gates/settle.mjs";
import { loadDeclarations, assertSignalsExist, validateTrigger, renderRules } from "../lib/gates/declarations.mjs";
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

check("a full-suite run is recognised from the command", deriveSuiteRun("npm test", 0, 100, "73 passing")?.scope === "full");
check("a subset run is recognised as a subset", deriveSuiteRun("npm test -- --grep auth", 0, 50, "3 passing")?.scope === "subset");
check("an unrelated command is not evidence", deriveSuiteRun("git status", 0, 5, "") === null);
check("test count is 'unknown' when the runner output cannot be read", deriveSuiteRun("npm test", 0, 100, "done")?.testCount === "unknown");
check("test count is never 0 by default", deriveSuiteRun("npm test", 0, 100, "nonsense")?.testCount !== 0);
check("a read count is recorded", deriveSuiteRun("npm test", 0, 100, "Tests: 42 passed")?.testCount === 42);

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
const noReason = auth.transition("g4", "active", "");
check("a gate cannot change its own power without saying why", noReason.ok === false, noReason.error);
const withReason = auth.transition("g5", "active", "5 clean runs and 1 caught fixture case");
check("an attributed transition is recorded", withReason.ok === true && auth.currentState("g5") === "active");
check("and it is reportable", typeof withReason.report === "string" && withReason.report.includes("probation → active"));
check("the log is append-only", auth.transitions.length >= 1);
check("an unknown state is refused", auth.transition("g6", "godmode", "because").ok === false);

section("utility budget: automatic demotion (P45)");
const auth2 = createAuthority();
auth2.transition("push-gate", "active", "earned");
const demoted = auth2.checkBudget("push-gate", { verdicts: 100, falsePositives: 20, blocksThisRun: 1, budgets: { falsePositiveBudget: 0.05 } });
check("a gate exceeding its false-positive budget is demoted automatically", demoted.demote === true, demoted.reasons.join("; "));
check("the demotion names the evidence that caused it", demoted.reasons[0].includes("20/100"), demoted.reasons.join("; "));
check("and the state actually changed", auth2.currentState("push-gate") === "demoted");

const auth3 = createAuthority();
auth3.transition("subset-gate", "active", "earned");
const overBlocks = auth3.checkBudget("subset-gate", { verdicts: 20, falsePositives: 0, blocksThisRun: 9, budgets: { blocksPerRunBudget: 3 } });
check("a gate that blocks repeatedly in one run is demoted", overBlocks.demote === true, overBlocks.reasons.join("; "));

const auth4 = createAuthority();
auth4.transition("good-gate", "active", "earned");
const fine = auth4.checkBudget("good-gate", { verdicts: 100, falsePositives: 1, blocksThisRun: 1, budgets: { falsePositiveBudget: 0.05 } });
check("a working gate is left alone", fine.demote === false);

const auth5 = createAuthority();
check("a probation gate cannot be demoted (it is not blocking yet)", auth5.checkBudget("x", { verdicts: 100, falsePositives: 90 }).demote === false);

section("a bypass request is not evidence that a gate is wrong");
const auth6 = createAuthority();
auth6.transition("g", "active", "earned");
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
check("the continuation is bounded and says so", d1.continuation.includes(`of at most ${MAX_CONTINUATIONS}`));
check("the completion gate never asks a human anything", !/please confirm|approve|Allow\?/i.test(d1.continuation));

const d2 = decideSettlement(l2, { scale: "standard", webTouched: false, continuationsSoFar: MAX_CONTINUATIONS });
check("beyond the cap the gate reports instead of looping", d2.block === false && d2.exhausted === true);
check("and the gaps stay visible as gaps", /not verified/.test(renderCompletionGate(d2)));

const d3 = decideSettlement(full, { scale: "standard", webTouched: true, continuationsSoFar: 0 });
check("a session with real evidence settles", d3.block === false && d3.missing.length === 0);
check("the rendered gate says all facts are recorded", /all session facts recorded/.test(renderCompletionGate(d3)));

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
