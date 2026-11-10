/**
 * The health verdict counts what ran, not what was planned.
 *
 * Betamaxx ticket 6aeda49e, second half. `scanned` used to be `rows.length`,
 * and `rows` includes every metric that was *planned* — including the ones that
 * never ran because a tool was missing. Three things followed from that, and
 * each has a check here:
 *
 *  1. the ledger's "examined nothing, not a pass" rule was unreachable, so a run
 *     that measured nothing was recorded as a nine-metric audit;
 *  2. the tool's summary line contradicted the report printed directly above it
 *     ("NOT healthy — 8 metric(s) skipped" then "9 metric(s) measured");
 *  3. the number had to come from `verdict()`'s own `ran`, which counts
 *     pass+fail and deliberately EXCLUDES error rows — counting
 *     `status !== "skipped"` would put the report and the ledger back out of
 *     agreement, which is the bug being fixed.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runHealth } from "../lib/code-health/index.mjs";
import { verdict } from "../lib/code-health/report.mjs";
import { measuredMetrics, measureSummary, healthRunEntry, recordLine } from "../lib/code-health/measure.mjs";
import { projectKey, __clearProjectCache } from "../lib/project.mjs";
import { createLedger, renderLedger } from "../lib/gates/ledger.mjs";

let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  if (cond) { console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fail++; }
};

const row = (key, status) => ({ key, status, metric: key, value: null, violations: 0, detail: "" });
const ROWS = ["complexity", "cognitiveComplexity", "maxLinesPerFunction", "maxDepth", "maxParams", "maxFileLines", "duplication", "circularDependencies", "modelFindings"];

function fixture() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-hrec-")));
}

/** A project with source; `deps.tools` decides whether anything can run. */
function sourceProject() {
  const root = fixture();
  fs.writeFileSync(path.join(root, "a.ts"), "export const a = 1;\n");
  return root;
}

export async function run() {
  console.log("=== 1. verdict() is the single definition of 'measured' ===");
  const cfg = { enabled: true, thresholds: {}, duplication: { maxPercent: 100 } };
  const allSkipped = ROWS.map((k) => row(k, "skipped"));
  const v0 = verdict(allSkipped, cfg);
  chk("every metric skipped -> ran 0", v0.ran === 0, `ran=${v0.ran}`);
  chk("and skipped is reported, not hidden", v0.skipped === ROWS.length, `skipped=${v0.skipped}`);

  const oneRan = [row("complexity", "pass"), ...ROWS.slice(1).map((k) => row(k, "skipped"))];
  const v1 = verdict(oneRan, cfg);
  chk("1 measured + 8 skipped -> ran 1", v1.ran === 1, `ran=${v1.ran}`);

  const withError = [row("complexity", "pass"), row("duplication", "error"), ...ROWS.slice(2).map((k) => row(k, "skipped"))];
  const v2 = verdict(withError, cfg);
  chk("an error row is NOT counted as measured", v2.ran === 1, `ran=${v2.ran}, errors=${v2.errors}`);
  chk("and the naive 'not skipped' count would have been wrong", oneRan.filter((r) => r.status !== "skipped").length === 1 && withError.filter((r) => r.status !== "skipped").length === 2);

  console.log("=== 2. runHealth exposes those counts (they used to be thrown away) ===");
  const root = sourceProject();
  try {
    const measured = await runHealth(root, []);
    chk("rows are the PLANNED metrics", Array.isArray(measured.rows) && measured.rows.length > 0, `rows=${measured.rows?.length}`);
    chk("ran is what actually measured", Number.isFinite(measured.ran), `ran=${measured.ran}`);
    chk("with a toolchain, rows and ran are different numbers and both are true",
      measured.rows.length === 9 && measured.ran > 0 && measured.ran <= measured.rows.length, `rows=${measured.rows.length} ran=${measured.ran}`);
    chk("a metric that does not apply is neither ran nor skipped (modelFindings)",
      measured.rows.length - measured.ran - measured.skipped >= 0, `ran=${measured.ran} skipped=${measured.skipped}`);

    // The defect's shape: no tools resolvable, so every metric is planned and
    // none run. rows.length would have recorded this as a nine-metric audit.
    const none = await runHealth(root, [], { tools: {} });
    chk("no toolchain -> rows still 9, ran 0 (the exact defect)", none.rows.length === 9 && none.ran === 0, `rows=${none.rows.length} ran=${none.ran} skipped=${none.skipped}`);
    chk("skipped is carried out too", none.skipped === 8, `skipped=${none.skipped}`);
    chk("the report itself says nothing was measured", /no metric could run|skipped/i.test(none.text), none.text.split("\n").filter((l) => /skipped|no metric/i.test(l))[0]?.trim().slice(0, 70));
    chk("and the entry built from it says scanned 0", healthRunEntry(none, "standard").scanned === 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log("=== 3. the entry that gets recorded says what was measured ===");
  const e0 = healthRunEntry({ healthy: true, exitCode: 0, ran: 0, skipped: 8 }, "standard");
  chk("nothing measured -> scanned 0", e0.scanned === 0, `scanned=${e0.scanned}`);
  chk("the entry is a health-run the ledger accepts", e0.kind === "health-run" && e0.verdict === "pass");
  const line0 = recordLine({ ...e0, skipped: 8, recorded: true, error: "" });
  chk("the summary line claims no measurement", /0 metric\(s\) measured/.test(line0), line0.slice(0, 70));
  chk("it names the skipped count", /8 skipped/.test(line0));
  chk("and it refuses to read as a pass", /not a pass/.test(line0));

  const line1 = recordLine({ ...healthRunEntry({ healthy: true, exitCode: 0, ran: 1, skipped: 8 }, "standard"), skipped: 8, recorded: true, error: "" });
  chk("1 measured + 8 skipped -> scanned 1", healthRunEntry({ healthy: true, exitCode: 0, ran: 1, skipped: 8 }, "standard").scanned === 1);
  chk("the summary agrees with the report's own wording", /1 metric\(s\) measured, 8 skipped/.test(line1), line1.slice(0, 60));

  const recErr = healthRunEntry({ healthy: false, exitCode: 1, ran: 1, skipped: 7 }, "major");
  chk("an error row does not inflate the count", recErr.scanned === 1 && recErr.verdict === "fail", `scanned=${recErr.scanned} verdict=${recErr.verdict}`);

  chk("measuredMetrics treats a missing count as zero, not as rows", measuredMetrics({}) === 0 && measuredMetrics({ ran: 3 }) === 3);
  chk("measureSummary never claims a measurement it cannot support", /0 metric\(s\) measured/.test(measureSummary({}, "standard")));

  console.log("=== 3b. the real asf_health tool records the honest number ===");
  {
    const tool = (typeof globalThis.__tools !== "undefined" ? globalThis.__tools : []).find((t) => t.name === "asf_health");
    chk("asf_health is registered", !!tool);
    if (tool) {
      const root = sourceProject();
      const prev = process.cwd();
      process.chdir(root);
      __clearProjectCache();
      try {
        const out = await tool.execute("tc-hrec", { level: "standard" });
        const text = String(out?.content?.[0]?.text || "");
        const summary = (text.split("\n").filter((l) => /verdict:/.test(l))[0] || "");
        const claimed = Number((summary.match(/(\d+) metric\(s\) measured/) || [])[1]);
        chk("the tool records a real measurement here", out?.details?.scanned > 0, `scanned=${out?.details?.scanned}`);
        chk("the summary line's number IS the recorded number (the contradiction this fixes)",
          claimed === out?.details?.scanned, `line says ${claimed}, record says ${out?.details?.scanned} — ${summary.slice(0, 60)}`);
        chk("and it still records (an honest number beats a missing entry)", /recorded as evidence/.test(text));
        chk("the summary never silently claims zero over a real audit", !/0 metric\(s\) measured/.test(summary));
      } finally {
        process.chdir(prev);
        __clearProjectCache();
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(path.join(os.homedir(), ".pi", "agent", "skills", "aia-asf", "projects", projectKey(root)), { recursive: true, force: true });
      }
    }
  }

  console.log("=== 4. the ledger's 'examined nothing' rule is reachable again ===");
  const led = createLedger();
  led.append({ kind: "health-run", level: "standard", verdict: "pass", scanned: 0 });
  const rendered = renderLedger(led);
  chk("scanned 0 renders as 'examined nothing, not a pass'", /examined nothing, not a pass/.test(rendered), rendered.split("\n").find((l) => /health/.test(l))?.trim().slice(0, 80));
  led.append({ kind: "health-run", level: "standard", verdict: "pass", scanned: 9 });
  chk("a real audit does not carry that warning", (renderLedger(led).match(/examined nothing/g) || []).length === 1);

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exit(1);
}
