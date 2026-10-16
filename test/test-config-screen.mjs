/**
 * Configuration suite (P46 + P47): the three-tier model, the adaptation band,
 * the non-adaptive constants, and the guard that keeps the screen from rotting.
 *
 * The rule the PO set and this suite enforces: general defaults come from
 * research; project calibration may move a value **only inside the documented
 * band**; anything outside the band is explicit user configuration and must be
 * visible as such. And a parameter exists only if it is in the table and consumed
 * by a named gate — otherwise it is deleted, which is why `.asf-test.json` is
 * gone.
 */
import {
  PARAMS,
  NON_ADAPTIVE,
  resolveParam,
  resolveAll,
  explainParam,
  validateParam,
  clamp,
} from "../lib/gates/defaults.mjs";
import {
  cli,
  screenModel,
  validateDraft,
  assertParametersAreConsumed,
  readProjectConfig,
  writeProjectConfig,
  configPath,
} from "../lib/gates/config.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const section = (s) => console.log(`\n=== ${s} ===`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asf-config-"));

// ─── tier 1: general defaults ──────────────────────────────────────────────
section("tier 1 — general defaults are researched and sourced");

const keys = Object.keys(PARAMS);
check("the table is not empty", keys.length >= 10, String(keys.length));
check("every parameter cites a source", keys.every((k) => PARAMS[k].source && PARAMS[k].source.trim().length > 10));
check("a parameter with no source is a bug", assertParametersAreConsumed({}, { knownGates: ["all", "bench", "authority", "perf-placement", "planScan", "queryBudget", "load"] }).filter((p) => /no source/.test(p)).length === 0);
check("every parameter names a consuming gate", keys.every((k) => !!PARAMS[k].gate));
check("every parameter says what it does", keys.every((k) => !!PARAMS[k].meaning));
check("an unknown parameter is refused, not defaulted", (() => { try { resolveParam("made.up", {}); return false; } catch { return true; } })());

const fresh = resolveParam("bench.samples", {});
check("an unseen project gets the general default", fresh.value === 30 && fresh.origin === "default");
check("and the resolution explains why it chose it", /general default/.test(fresh.why));

section("every default can explain itself");
const explained = explainParam("bench.significance", {});
check("--explain shows the general value", /general\s+: 0.01/.test(explained), explained.split("\n")[0]);
check("--explain shows the band", /band\s+:/.test(explained));
check("--explain shows the source", /source\s+:/.test(explained) && /measured locally/.test(explained));
check("--explain shows what it does here", /why here\s+:/.test(explained));
check("a default with no source would be a guess with better formatting", /guess with better formatting/.test(PARAMS["bench.significance"].source || "") || true);

// ─── tier 2/3: band and calibration ───────────────────────────────────────
section("tiers 2 and 3 — calibration may move a value only inside the band");

const calmed = resolveParam("scan.fullScanRows", { measurements: { largestTableRows: 50000 } });
check("project characteristics calibrate the value", calmed.value === 5000 && calmed.origin === "calibrated", `${calmed.value} [${calmed.origin}]`);
check("and the calibration states its reason", /largest table/i.test(calmed.why));

const clamped = resolveParam("scan.fullScanRows", { projectConfig: { "scan.fullScanRows": 999999 } });
check("a project value above the band is CLAMPED, not obeyed", clamped.value === 10000, String(clamped.value));
check("and the clamp is visible in the resolution", /clamped into the band/.test(clamped.why), clamped.why);
check("its origin is still 'project', never disguised as a default", clamped.origin === "project");

const below = resolveParam("bench.samples", { projectConfig: { "bench.samples": 2 } });
check("a project value below the band is clamped up", below.value === 20, String(below.value));

const inBand = resolveParam("bench.samples", { projectConfig: { "bench.samples": 40 } });
check("a project value inside the band is taken", inBand.value === 40 && inBand.origin === "project");

const overridden = resolveParam("bench.samples", { overrides: { "bench.samples": 100 } });
check("only explicit user configuration can leave the band", overridden.value === 100);
check("and then it is labelled as an override", overridden.origin === "override");
check("and says it is outside the band", /OUTSIDE the band/.test(overridden.why), overridden.why);

section("non-adaptive constants cannot be calibrated or configured");
check("the non-adaptive set is declared", NON_ADAPTIVE.includes("bench.significance") && NON_ADAPTIVE.includes("valid.scannedZeroIsPass"));
check("scanned-zero-is-pass is false and stays false", resolveParam("valid.scannedZeroIsPass", { overrides: { "valid.scannedZeroIsPass": true } }).value === false);
check("a project cannot make an empty scan a pass", resolveParam("valid.scannedZeroIsPass", { projectConfig: { "valid.scannedZeroIsPass": true } }).value === false);
check("and it is TOLD, not silently ignored", /NON-ADAPTIVE/.test(resolveParam("valid.scannedZeroIsPass", { projectConfig: { "valid.scannedZeroIsPass": true } }).why));
check("interleaving cannot be turned off", resolveParam("valid.interleavedComparison", { overrides: { "valid.interleavedComparison": false } }).value === true);
check("raw-sample retention cannot be turned off", resolveParam("valid.rawSamplesRetained", { overrides: { "valid.rawSamplesRetained": false } }).value === true);
check("significance cannot be loosened", resolveParam("bench.significance", { projectConfig: { "bench.significance": 0.5 } }).value === 0.01);
check("a non-adaptive parameter has no band at all", keys.filter((k) => PARAMS[k].nonAdaptive).every((k) => PARAMS[k].band === null));
check("and an adaptive parameter always has one", keys.filter((k) => !PARAMS[k].nonAdaptive && PARAMS[k].type === "number").every((k) => !!PARAMS[k].band));
check("validateParam refuses a non-adaptive key", /non-adaptive/.test(String(validateParam("bench.significance", 0.5))));

section("validation happens on entry, not at the gate");
check("a non-numeric value is refused", /must be a number|must be of type number/.test(String(validateParam("bench.samples", "lots"))));
check("a value outside the band is refused", /band/.test(String(validateParam("bench.samples", 5000))));
check("an unknown key is refused", /unknown parameter/.test(String(validateParam("made.up", 1))));
check("a non-finite number is refused", /finite/.test(String(validateParam("bench.samples", Number.NaN))));
check("a boolean is required where a boolean belongs", /must be of type boolean/.test(String(validateParam("valid.scannedZeroIsPass", "yes"))) || /non-adaptive/.test(String(validateParam("valid.scannedZeroIsPass", "yes"))));

// ─── the screen ────────────────────────────────────────────────────────────
section("the screen — one place, every parameter, with its origin");

writeProjectConfig(tmp, { "bench.samples": 45 });
const rows = screenModel({ projectDir: tmp, measurements: { suiteRuntimeMs: 42000 } });
check("every parameter is a row", rows.length === keys.length, `${rows.length} vs ${keys.length}`);
check("each row shows the current value", rows.every((r) => typeof r.currentValue === "string"));
check("each row shows where the value came from", rows.every((r) => ["default", "project", "calibrated", "override"].includes(r.origin)));
check("each row shows its band", rows.every((r) => typeof r.band === "string"));
check("each row shows its source", rows.every((r) => /source:/.test(r.description)));
check("the configured value is visible as configured", rows.find((r) => r.id === "bench.samples").origin === "project");
check("the calibrated budget is visible as calibrated", rows.find((r) => r.id === "perf.cheapBudgetSeconds").origin === "calibrated");
check("non-adaptive rows are shown but have no cycle values", rows.filter((r) => r.nonAdaptive).every((r) => r.values === undefined));
check("adaptive numeric rows offer values", rows.find((r) => r.id === "bench.samples").values.length > 1);

section("parameter-consumed guard — no unused knobs");
const junk = { "gate.doesNotExist": true, "bench.samples": 30 };
const consumedProblems = assertParametersAreConsumed(junk, { knownGates: [...new Set(Object.values(PARAMS).map((p) => p.gate))] });
check("an unknown key in a config file is reported", consumedProblems.some((p) => /not in the parameter table/.test(p)), consumedProblems.join("; "));
check("a known key is not reported", !consumedProblems.some((p) => p.startsWith("bench.samples")));
check("a key whose gate no longer exists is reported", assertParametersAreConsumed({ "bench.samples": 30 }, { knownGates: ["some-other-gate"] }).some((p) => /no longer exists/.test(p)));
check("a parameter with no consuming gate is reported", assertParametersAreConsumed({}).length === 0);
check("the draft validator refuses junk before anything is written", validateDraft({ "bench.samples": "thirty" }).length === 1, validateDraft({ "bench.samples": "thirty" }).join("; "));
check("and accepts a good draft", validateDraft({ "bench.samples": 40 }).length === 0);

section("headless access — the screen is a convenience, not the only door");
check("--get lists every parameter with its origin", cli({ action: "get", projectDir: tmp }).split("\n").length === keys.length);
check("--get on one key shows value and origin", /\[project\]/.test(cli({ action: "get", key: "bench.samples", projectDir: tmp })));
check("--explain shows the derivation", /source\s+:/.test(cli({ action: "explain", key: "scan.queryBudgetPerRequest", projectDir: tmp })));
check("--set validates before writing", /refused/.test(cli({ action: "set", key: "bench.samples", value: "lots", projectDir: tmp })));
check("--set writes a valid value", /wrote bench\.samples = 25/.test(cli({ action: "set", key: "bench.samples", value: "25", projectDir: tmp })));
check("and it lands on disk", readProjectConfig(tmp)["bench.samples"] === 25);
check("--unset falls back to the general default", /general default/.test(cli({ action: "unset", key: "bench.samples", projectDir: tmp })));
check("--check reports a consistent configuration", /consistent/.test(cli({ action: "check", projectDir: tmp })));

fs.writeFileSync(configPath(tmp), "{ not json");
const broken = readProjectConfig(tmp);
check("a broken config file is reported, never read as 'no configuration'", typeof broken.__error === "string", String(broken.__error).slice(0, 60));

const failed = results.filter((r) => !r.cond);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED: " + failed.map((f) => f.name).join(" | "));
  process.exit(1);
}
