/**
 * PO policy: "If no scale, assume small."
 *
 * Before 0.17.13 a run with no recorded scale was judged STANDARD (unless an earlier
 * `/asf small` in the same process had flipped a global flag), while the run card
 * printed the raw field. So one session could read "small" on the card and be steered
 * at standard's ceremony — `/asf health` and the full suite — by the gate. These checks
 * pin the policy at every layer that decides it, and pin that card and gate agree.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createLedger, sessionFacts } from "../lib/gates/ledger.mjs";
import { decideSettlement } from "../lib/gates/settle.mjs";
import { __clearProjectCache } from "../lib/project.mjs";

const HEALTH = /code health gate/;
const SUITE = /full test suite/;

export async function run({ loadTs, invokeCommand }) {
  let pass = 0, fail = 0;
  const chk = (n, c, d) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); c ? pass++ : fail++; };
  const { currentScale, cardFor } = await loadTs("lib/extension/run.ts");

  console.log("=== 1. the judged scale ===");
  chk("a run with no scale is judged small", currentScale({ phase: "implementation" }) === "small", currentScale({ phase: "implementation" }));
  chk("no run at all is judged small", currentScale(null) === "small" && currentScale(undefined) === "small");
  chk("explicit large still judges major", currentScale({ scale: "large" }) === "major");
  chk("explicit standard still judges standard", currentScale({ scale: "standard" }) === "standard");
  chk("explicit small judges small", currentScale({ scale: "small" }) === "small");
  // The old fallback read a process-wide flag, so an unscaled run's verdict depended
  // on what an EARLIER run had done. The policy is about the run, not the process.
  chk("the process-wide flag is gone, not merely ignored", !fs.readFileSync(new URL("../lib/extension/runtime.ts", import.meta.url), "utf8").includes("lastScaleWasSmall"));

  console.log("=== 2. an unscaled run settles as small ===");
  const unscaled = { phase: "implementation" };
  const ledger = createLedger();
  const facts = sessionFacts(ledger, { scale: currentScale(unscaled) });
  chk("sessionFacts does not demand /asf health", !facts.missing.some((m) => HEALTH.test(m)), facts.missing.join(" | "));
  chk("sessionFacts does not demand the full suite", !facts.missing.some((m) => SUITE.test(m)), facts.missing.join(" | "));
  const d = decideSettlement(ledger, { scale: currentScale(unscaled) });
  chk("decideSettlement lets it settle", d.block === false && d.missing.length === 0, d.missing.join(" | "));
  // A caller that forgets to pass a scale must get the floor, not a ceremony nobody chose.
  chk("sessionFacts with no scale at all defaults to the floor", !sessionFacts(ledger).missing.some((m) => HEALTH.test(m) || SUITE.test(m)));
  chk("decideSettlement with no scale at all defaults to the floor", decideSettlement(ledger, {}).block === false, decideSettlement(ledger, {}).missing.join(" | "));
  // The floor itself still holds: changed source still needs a real test run.
  const floor = decideSettlement(ledger, { scale: currentScale(unscaled), sourceMutated: true, testRunRecorded: false });
  chk("but the small floor still blocks changed source with no test run", floor.block === true, floor.missing.join(" | "));

  console.log("=== 3. the change cannot quietly widen ===");
  const std = sessionFacts(ledger, { scale: currentScale({ scale: "standard" }) });
  chk("explicit standard still demands /asf health", std.missing.some((m) => HEALTH.test(m)), std.missing.join(" | "));
  chk("explicit standard still demands the full suite", std.missing.some((m) => SUITE.test(m)));
  const major = decideSettlement(ledger, { scale: currentScale({ scale: "large" }) });
  chk("explicit large still blocks without health and the full suite", major.block === true && major.missing.some((m) => HEALTH.test(m)) && major.missing.some((m) => SUITE.test(m)), major.missing.join(" | "));

  console.log("=== 4. the card prints the scale the gate judges by ===");
  const card = cardFor({ phase: "implementation", runId: "r1" });
  chk("an unscaled run's card says small", /^ASF run — implementation \(small/m.test(card), card.split("\n")[0]);
  chk("and never 'unset' or 'standard'", !/\((unset|standard)/.test(card.split("\n")[0]), card.split("\n")[0]);
  chk("an explicit large run's card says major, matching the gate", /\(major/.test(cardFor({ phase: "implementation", scale: "large" }).split("\n")[0]));
  chk("an explicit standard run's card says standard", /\(standard/.test(cardFor({ phase: "implementation", scale: "standard" }).split("\n")[0]));

  console.log("=== 5. the reachable scale-less path: /asf verify ===");
  // setPhase only writes scale when the caller passes one, and /asf verify passes
  // none — so `/asf verify` on a fresh project opens a run with NO scale. That run
  // must be judged small, and the output must say so rather than print "unset".
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asf-scale-"));
  const prev = process.cwd();
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    process.chdir(dir);
    __clearProjectCache();
    const { loadState } = await loadTs("lib/extension/state.ts");
    const { projectName } = await loadTs("lib/extension/paths.ts");
    const { setPhase } = await loadTs("lib/extension/commands/session.ts");
    await setPhase({}, { phase: "verification" });
    const st = await loadState(projectName());
    chk("setPhase without a scale leaves the field unset (the path exists)", !!st.current && st.current.scale === undefined, JSON.stringify(st.current?.scale));
    chk("and that run is judged small", currentScale(st.current) === "small");
    const out = (await invokeCommand("asf", "verify")).text;
    chk("/asf verify says the unset scale is judged small", /Scale: unset — judged small/.test(out), out.split("\n").find((l) => l.startsWith("Scale")) || out.slice(0, 120));
    chk("and does not run large-only gates on it", !/SPEC-TO-CODE TRACEABILITY/.test(out));
    const status = (await invokeCommand("asf", "status")).text;
    chk("/asf status shows the judged scale too", /scale: unset — judged small/.test(status), status.split("\n").find((l) => l.includes("scale")) || "");
  } finally {
    process.chdir(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail === 0;
}
