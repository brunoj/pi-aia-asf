/**
 * The parallelism switch (P47) — rebuilt after the original uncommitted suite was lost.
 *
 * The point of these checks is the *default*: a switch whose off-state is ambiguous
 * turns every plan into an argument, and a wrong "yes" costs both time and tokens.
 */
import fs from "node:fs";
import path from "node:path";
import { readParallelSwitch, PARALLEL_DEFAULT, MAX_CONCURRENT_CAP } from "../lib/parallel-estimate.mjs";

const chk = (name, cond, detail) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) process.exitCode = 1;
};

export async function run({ extDir }) {
  const base = path.join(extDir, "skills", "aia-asf");
  const skill = fs.readFileSync(path.join(base, "SKILL.md"), "utf8");
  const deleg = fs.readFileSync(path.join(base, "references", "06d-delegation.md"), "utf8");
  const lib = fs.readFileSync(path.join(extDir, "lib", "parallel-estimate.mjs"), "utf8");

  console.log("=== 1. the default is single-agent ===");
  chk("the default is exported as false", PARALLEL_DEFAULT === false, String(PARALLEL_DEFAULT));
  const off = readParallelSwitch({});
  chk("with no config, parallel is OFF", off.enabled === false, off.reason);
  chk("the reason says it is the default", /default OFF/i.test(off.reason), off.reason);
  chk("a truthy-looking string is not enough", readParallelSwitch({ config: { parallel: { enabled: "yes" } } }).enabled === false);

  console.log("=== 2. the switch is config-driven ===");
  const on = readParallelSwitch({ config: { parallel: { enabled: true, maxConcurrent: 3 } } });
  chk("parallel.enabled turns it on", on.enabled === true, on.reason);
  chk("maxConcurrent is honoured", on.maxConcurrent === 3, String(on.maxConcurrent));
  chk("maxConcurrent is capped at the hardware", readParallelSwitch({ config: { parallel: { enabled: true, maxConcurrent: 99 } } }).maxConcurrent === MAX_CONCURRENT_CAP);
  chk("a nonsense maxConcurrent falls back to 3", readParallelSwitch({ config: { parallel: { enabled: true, maxConcurrent: "lots" } } }).maxConcurrent === 3);

  console.log("=== 3. the one-run override does not persist ===");
  const env = readParallelSwitch({ env: { ASF_PARALLEL: "1" } });
  chk("ASF_PARALLEL=1 enables one run", env.enabled === true, env.reason);
  chk("and says so in the reason", /does not persist/.test(env.reason), env.reason);
  chk("without it, back to off", readParallelSwitch({ env: {} }).enabled === false);

  console.log("=== 4. no hidden dependency on an orchestration plugin ===");
  chk("the estimator imports no plugin", !/pi-intercom|subagent/i.test(lib), "stays install-safe without one");
  chk("SKILL.md states the default is OFF", /Parallel threads \(config switch, default OFF\)/.test(skill));
  chk("06d routes the decision through the estimator", deleg.includes("lib/parallel-estimate.mjs"));
  chk("06d states the default", deleg.includes("`parallel.enabled` is **off by default**"));
}
