/**
 * Every piece of evidence a gate demands must have a producer.
 *
 * Three tickets in a row were this one bug wearing different clothes: the health
 * gate demanded a verdict only a pi slash command could produce; the completion
 * gate demanded browser verification that no registered tool could record; the
 * delivery report rendered sections whose kinds nothing ever wrote. Each time the
 * run was steered at a gap its own hands could not close, which is exactly the
 * unwarranted loop the process rules forbid.
 *
 * So this suite pins the invariant structurally instead of waiting for the next
 * ticket:
 *
 *  1. every ledger kind has a producer reachable in the shipped package;
 *  2. every kind a GATE requires has one too (the kinds that actually block);
 *  3. the tools that produce them are registered, not merely defined;
 *  4. and the browser rules themselves refuse what they must refuse — a tool that
 *     accepts "I verified it" is the same bug pointing the other way.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ENTRY_KINDS, createLedger, validateEntry } from "../lib/gates/ledger.mjs";
import { evidenceCoverage, coverageGap } from "../lib/gates/evidence-coverage.mjs";
import {
  verifyGap, naGap, browserDriven, placeholderReason, OBSERVATION_TOOLS, verifyEntry, naEntry,
} from "../lib/gates/browser-evidence.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  if (cond) { console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fail++; }
};

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
};

const DRIVEN = [{ tool: "browser_navigate" }, { tool: "browser_screenshot" }];

console.log("=== 1. the browser rules refuse what they must refuse ===");
{
  const good = { page: "/checkout", action: "clicked pay", assertion: "order id appears" };
  chk("a real verification is accepted", verifyGap(good, DRIVEN) === null, String(verifyGap(good, DRIVEN)));
  chk("NEGATIVE: a verification with no browser in the room is refused", /no browser call was made/.test(verifyGap(good, []) || ""), String(verifyGap(good, [])));
  chk("NEGATIVE: daemon chatter is not driving a page", verifyGap(good, [{ tool: "browser_diagnose" }, { tool: "browser_logs" }]) !== null);
  chk("NEGATIVE: a screenshot alone counts — someone looked", verifyGap(good, [{ tool: "browser_screenshot" }]) === null);
  for (const field of ["page", "action", "assertion"]) {
    const partial = { ...good, [field]: "" };
    chk(`NEGATIVE: a verification without ${field} is refused`, new RegExp(field).test(verifyGap(partial, DRIVEN) || ""), String(verifyGap(partial, DRIVEN)));
  }
  chk("NEGATIVE: whitespace is not an assertion", verifyGap({ ...good, assertion: "   " }, DRIVEN) !== null);
  chk("the three fields are what make it repeatable", /reviewer can repeat it/.test(verifyGap({ page: "", action: "", assertion: "" }, DRIVEN) || ""));

  chk("a real n/a is accepted", naGap({ reason: "server-side retry policy only; no UI consumes this module" }) === null, String(naGap({ reason: "server-side retry policy only; no UI consumes this module" })));
  for (const bad of ["n/a", "N/A", "none", "na", "not applicable", "no", "nothing", "no ui", "no browser involved"]) {
    chk(`NEGATIVE: "${bad}" is not a reason a reviewer can check`, naGap({ reason: bad }) !== null, String(naGap({ reason: bad })));
  }
  chk("NEGATIVE: an empty reason is refused", naGap({}) !== null && naGap({ reason: "   " }) !== null);
  chk("NEGATIVE: a one-word reason is refused", placeholderReason("unrelated") === true);
  // Punctuation-only strips to nothing. Without the empty check it would fall past
  // every rule and be accepted as a considered reason.
  chk("NEGATIVE: punctuation is not a reason either", placeholderReason("!!!") === true && placeholderReason("???") === true);
  chk("NEGATIVE: a reason that is only symbols is refused at the gate too", naGap({ reason: "!!!" }) !== null, String(naGap({ reason: "!!!" })));
  chk("NEGATIVE: an empty list of browser calls never counts as driven", browserDriven([]) === false && browserDriven(undefined) === false);
  chk("the observation list is the one that proves a page was seen", OBSERVATION_TOOLS.includes("browser_navigate") && !OBSERVATION_TOOLS.includes("browser_diagnose"));
  chk("entries carry the kind the gate looks for", verifyEntry(good).kind === "browser-verify" && naEntry({ reason: "x y z" }).kind === "browser-na");
  chk("and they are trimmed, so padding cannot smuggle an empty field past the validator", verifyEntry({ ...good, page: "  " }).page === "");
  // The bug class ASF has already been bitten by twice: `String(undefined)` is the
  // literal "undefined", which reads like a value and passes a presence check.
  chk("a missing field never becomes the string 'undefined'", verifyEntry({}).page !== "undefined" && verifyEntry({}).page === "", JSON.stringify(verifyEntry({})));
  chk("and neither does a missing n/a reason", naEntry({}).reason !== "undefined" && naEntry({}).reason === "", JSON.stringify(naEntry({})));
}

console.log("=== 2. the ledger still refuses what it always refused ===");
{
  const ledger = createLedger();
  chk("a browser-verify without an assertion is rejected by the ledger too", /assertion/.test(String(validateEntry({ kind: "browser-verify", page: "/x", action: "clicked" }))), String(validateEntry({ kind: "browser-verify", page: "/x", action: "clicked" })));
  chk("a browser-na without a reason is rejected by the ledger too", /reason/.test(String(validateEntry({ kind: "browser-na" }))));
  const ok = ledger.append(verifyEntry({ page: "/x", action: "clicked", assertion: "it worked" }));
  chk("and a complete one is accepted", ok.ok === true, String(ok.error));
  chk("a clean-room without a result is rejected — 'we installed it' with no outcome is not a result", /result/.test(String(validateEntry({ kind: "clean-room", package: "p" }))), String(validateEntry({ kind: "clean-room", package: "p" })));
  chk("and a clean-room result must be pass or fail", /result/.test(String(validateEntry({ kind: "clean-room", package: "p", result: "probably" }))), String(validateEntry({ kind: "clean-room", package: "p", result: "probably" })));
  chk("a clean-room that passed is accepted", validateEntry({ kind: "clean-room", package: "p", result: "pass" }) === null, String(validateEntry({ kind: "clean-room", package: "p", result: "pass" })));
  chk("a spec-transition with no evidence is rejected — a status change nobody can support is the claim the floor refuses", /evidence/.test(String(validateEntry({ kind: "spec-transition", specId: "spc-1", status: "met" }))), String(validateEntry({ kind: "spec-transition", specId: "spc-1", status: "met" })));
}

console.log("=== 3. every kind a gate demands has a producer in the shipped package ===");
{
  // The invariant lives in lib/gates/evidence-coverage.mjs so the release check and a
  // running session can ask the same question. This suite therefore does two things:
  // it asserts the answer, and it asserts that the shipped module and an independent
  // derivation here agree — otherwise a bug in the shipped module would simply be
  // agreed with instead of caught.
  const coverage = evidenceCoverage(ROOT, ENTRY_KINDS);
  const ledgerSrc = read("lib/gates/ledger.mjs");
  const settleSrc = read("lib/gates/settle.mjs");
  const required = new Set(["suite-run", "health-run"]);
  for (const m of `${ledgerSrc}\n${settleSrc}`.matchAll(/(?:has|kind ===)\s*\(\s*"([a-z-]+)"/g)) required.add(m[1]);
  for (const m of `${ledgerSrc}\n${settleSrc}`.matchAll(/"([a-z-]+)"/g)) {
    const k = m[1];
    if (ENTRY_KINDS.includes(k) && new RegExp(`(has|missing|latest|kind ===)[^\\n]*"${k}"`).test(`${ledgerSrc}\n${settleSrc}`)) required.add(k);
  }
  chk("the required set is derived, not hand-waved", required.has("browser-verify") && required.has("health-run"), [...required].join(","));
  chk("the shipped module derives the same required set", [...required].sort().join(",") === [...coverage.required].sort().join(","), coverage.required.join(","));
  chk("it looked at real source, not an empty directory", coverage.files > 20, `${coverage.files} files`);

  for (const kind of ENTRY_KINDS) {
    const where = coverage.producers[kind] || [];
    chk(`producer for "${kind}"`, where.length > 0, where.join(",") || "NONE — this kind can never be recorded");
  }
  chk("no ledger kind is an orphan", coverage.orphans.length === 0, coverage.orphans.join(","));
  chk("no REQUIRED kind is an orphan (the gate-loop bug, structurally)", coverage.requiredOrphans.length === 0, coverage.requiredOrphans.join(","));
  chk("a sound install reports no gap", coverageGap(coverage) === null, JSON.stringify(coverageGap(coverage)));

  // The failure mode has to be reachable or the check is decoration: a required kind
  // with no producer must come back as a gap that says no run can close on it.
  const broken = coverageGap({ ...coverage, requiredOrphans: ["browser-verify"] });
  chk("a required kind with no producer IS a gap", !!broken && /no run can close on it/.test(broken.gap + broken.remedy), JSON.stringify(broken));
  const dead = coverageGap({ ...coverage, orphans: ["something-dead"], requiredOrphans: [] });
  chk("an unrequired orphan is reported, not blocking", !!dead && /dead weight/.test(dead.remedy), JSON.stringify(dead));
}

console.log("=== 3b. the coverage checker really can say 'no producer' ===");
{
  // A checker that always answers "yes, it has a producer" passes every positive
  // assertion above — three mutations of evidence-coverage.mjs did exactly that, and
  // the suite called them green. So the checker is tested against fixtures where the
  // answer is known to be NO: a kind nothing writes, and a kind only the ledger itself
  // mentions (which must not count — the ledger cannot certify its own kinds).
  const fix = fs.mkdtempSync(path.join(os.tmpdir(), "asf-cov-"));
  const put = (rel, text) => {
    const abs = path.join(fix, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  };
  put("package.json", '{"name":"fixture"}');
  put("index.ts", 'export default function activate() {}\n');
  put("lib/gates/ledger.mjs", 'export const ENTRY_KINDS = ["suite-run","health-run","browser-verify","orphan-kind"];\nconst RENDERERS = { "suite-run": 1, "health-run": 1, "browser-verify": 1, "orphan-kind": 1 };\nconst define = (k) => ({ kind: "browser-verify" });\n');
  put("lib/gates/settle.mjs", 'if (ledger.has("suite-run")) {}\nif (ledger.has("health-run")) {}\nif (ledger.has("browser-verify")) {}\n');
  // suite-run and health-run genuinely produced; browser-verify produced ONLY by the
  // ledger (must not count); orphan-kind produced nowhere at all.
  put("lib/extension/handlers/tool-result.ts", 'append({ kind: "suite-run", command: "x" });\nappend({ kind: "health-run", scanned: 1 });\n');

  const cov = evidenceCoverage(fix, ["suite-run", "health-run", "browser-verify", "orphan-kind"]);
  chk("a kind produced nowhere IS reported", cov.orphans.includes("orphan-kind"), cov.orphans.join(","));
  chk("and the ledger mentioning its own kind does not count as producing it",
    cov.orphans.includes("browser-verify"), `orphans=${cov.orphans.join(",")} producers=${JSON.stringify(cov.producers["browser-verify"])}`);
  chk("a genuinely produced kind is NOT falsely reported", !cov.orphans.includes("suite-run") && !cov.orphans.includes("health-run"), cov.orphans.join(","));
  chk("a required kind with no producer lands in requiredOrphans", cov.requiredOrphans.includes("browser-verify"), cov.requiredOrphans.join(","));
  chk("an unrequired orphan stays out of requiredOrphans", !cov.requiredOrphans.includes("orphan-kind"), cov.requiredOrphans.join(","));
  chk("and the gap says no run can close on it", /no run can close on it/.test(JSON.stringify(coverageGap(cov))), JSON.stringify(coverageGap(cov)));
  fs.rmSync(fix, { recursive: true, force: true });
}

console.log("=== 4. the tools that produce them are registered, not merely defined ===");
{
  const index = read("index.ts");
  const toolFiles = walk("lib/extension/tools");
  const registeredNames = toolFiles.flatMap((f) => [...read(f).matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]));
  for (const name of ["asf_health", "asf_decisions", "asf_browser_verify", "asf_browser_na"]) {
    chk(`${name} is defined as a tool`, registeredNames.includes(name), registeredNames.join(","));
  }
  chk("and index.ts registers every tool file it has", toolFiles.every((f) => {
    const importer = f.replace(/^lib\//, "./lib/").replace(/\.ts$/, ".ts");
    return index.includes(importer) || !/registerTool|pi\.registerTool/.test(read(f));
  }), toolFiles.filter((f) => !index.includes(f.replace(/^lib\//, "./lib/"))).join(","));
  chk("the browser tools are wired in, not left sitting in a file", /registerBrowserTools\(pi\)/.test(index));
  chk("the verification tool cannot be talked into an optional assertion", /assertion:\s*Type\.String/.test(read("lib/extension/tools/browser.ts")) && !/assertion:\s*Type\.Optional/.test(read("lib/extension/tools/browser.ts")));
  chk("and the n/a reason is required too", /reason:\s*Type\.String/.test(read("lib/extension/tools/browser.ts")));
  // The observers moved into their own module, so a text assertion that reads only
  // the handler file would fail on code that is simply elsewhere. Read the handlers
  // as a set: what matters is that the observation exists somewhere in the layer that
  // watches tool calls, not which file it happens to sit in.
  const handlerText = walk("lib/extension/handlers").map(read).join("\n");
  chk("the browser observer records what the session did, from the tool call itself", /runtime\.browserCalls\.push/.test(handlerText));
  chk("a spec transition is observed from the real call, not asserted by the agent", /kind: "spec-transition"/.test(handlerText));
  chk("clean-room evidence comes from a command that ran, with its exit code", /kind: "clean-room"/.test(handlerText) && /result: isError \? "fail" : "pass"/.test(handlerText));
  chk("the definition of done no longer promises evidence nothing can produce", !/clean-room install" \}/.test(read("lib/extension/types.ts")));
}

console.log("=== 6. the reverse direction: every kind ASF emits is accepted somewhere ===");
{
  // Section 3 asks "does every kind a gate demands have a producer". The other direction
  // was never asked, and it was broken: `steer`, `park`, `run-open` and the rest were sent
  // through the LEDGER validator, which knows only the eight judged kinds, so every
  // lifecycle event came back `unknown entry kind` and was written to the transcript as
  // `asf-evidence-rejected`. A fake failure on every event is how a real one gets missed.
  // Read the vocabulary out of the source rather than importing the .ts: this suite's
  // contract is "the shipped text agrees with itself", and an import that silently
  // resolved to null would turn the negative control into a pass.
  const gsSrc = read("lib/extension/gate-state.ts");
  const eventList = /EVENT_KINDS = new Set\(\[([^\]]*)\]\)/.exec(gsSrc);
  const EVENT_KINDS = eventList ? [...eventList[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]) : null;
  chk("the lifecycle vocabulary is readable", Array.isArray(EVENT_KINDS) && EVENT_KINDS.length >= 10, String(EVENT_KINDS && EVENT_KINDS.length));
  const emitted = new Set();
  for (const rel of [...walk("lib/extension"), ...walk("lib/gates")]) {
    // Scoped to the calls that actually record evidence. A bare `kind: "work-item"` is
    // also how the input-channel router names a routing decision — matching every `kind:`
    // in the tree would file that as a broken evidence kind and the control would fail
    // for a reason that has nothing to do with the invariant.
    for (const m of read(rel).matchAll(/appendEvidence\(\s*\{[\s\S]{0,300}?kind:\s*"([a-z-]+)"/g)) emitted.add(m[1]);
  }
  chk("ASF emits more kinds than the ledger judges (so the two vocabularies are real)", emitted.size > ENTRY_KINDS.length, `${emitted.size} emitted vs ${ENTRY_KINDS.length} judged`);
  const known = new Set([...ENTRY_KINDS, ...(EVENT_KINDS || [])]);
  const orphans = [...emitted].filter((k) => !known.has(k));
  chk("NEGATIVE: no emitted kind is unknown to both vocabularies", orphans.length === 0, orphans.join(", ") || "none");
  // Behavioural, not textual: the earlier version grepped for the routing and passed even
  // when the early return was deleted (so the event still fell through to the ledger and
  // was rejected). Loading the real module is the only way to ask what it DOES.
  const written = [];
  const { createJiti } = await import("jiti");
  // moduleCache ON here (the harness runs it OFF): `setPiRef` and `getPiRef` must be the
  // same module instance, or the probe writes into a pi-ref nobody reads and every
  // "was it written?" assertion below passes for the wrong reason.
  const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: true });
  const piRef = await jiti.import("../lib/extension/pi-ref.ts");
  piRef.setPiRef({ appendEntry: (t, d) => written.push({ type: t, data: d }) });
  const ev = await jiti.import("../lib/extension/evidence.ts");
  const evSrc = read("lib/extension/evidence.ts");
  chk("the kind decides the channel", /ENTRY_KINDS\.includes\(kind\)[\s\S]*EVENT_KINDS\.has\(kind\)/.test(evSrc) || /EVENT_KINDS\.has\(kind\)/.test(evSrc));
  const steered = ev.appendEvidence({ kind: "steer", at: new Date().toISOString(), gate: "test", text: "x" });
  chk("a lifecycle event is accepted as history", steered.ok === true && steered.event === true, JSON.stringify(steered).slice(0, 90));
  chk("and it is written as an event, not as rejected evidence", written.some((w) => w.type === "asf-event") && !written.some((w) => w.type === "asf-evidence-rejected"), written.map((w) => w.type).join(","));
  chk("NEGATIVE: it is not counted as gate evidence", createLedger().latest("steer") === null);
  written.length = 0;
  const bogus = ev.appendEvidence({ kind: "definitely-not-a-kind", at: new Date().toISOString() });
  chk("NEGATIVE: a genuinely unknown kind is still rejected, not silently kept", !bogus.ok && written.some((w) => w.type === "asf-evidence-rejected"), JSON.stringify(bogus).slice(0, 70));
  written.length = 0;
  const judged = ev.appendEvidence({ kind: "suite-run", command: "bash test/run-all.sh", exitCode: 0, durationMs: 10, testCount: 3, at: new Date().toISOString() });
  chk("a judged kind still goes to the ledger", judged.ok === true && !judged.event, JSON.stringify(judged).slice(0, 60));
  for (const k of ["steer", "park", "run-open", "run-close", "passive"]) {
    chk(`"${k}" is history, not gate evidence`, !ENTRY_KINDS.includes(k) && !!EVENT_KINDS && EVENT_KINDS.includes(k));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
export default fail === 0;
