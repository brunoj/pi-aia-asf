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
  // The kinds that actually BLOCK a run: the completion gate's web rule and the
  // delivery report. A kind nobody requires is dead weight; a kind required with no
  // producer is an unclosable gap, which is the bug this whole suite exists to stop.
  const ledgerSrc = read("lib/gates/ledger.mjs");
  const settleSrc = read("lib/gates/settle.mjs");
  const required = new Set(["suite-run", "health-run"]);
  for (const m of `${ledgerSrc}\n${settleSrc}`.matchAll(/(?:has|kind ===)\s*\(\s*"([a-z-]+)"/g)) required.add(m[1]);
  for (const m of `${ledgerSrc}\n${settleSrc}`.matchAll(/"([a-z-]+)"/g)) {
    const k = m[1];
    if (ENTRY_KINDS.includes(k) && new RegExp(`(has|missing|latest|kind ===)[^\\n]*"${k}"`).test(`${ledgerSrc}\n${settleSrc}`)) required.add(k);
  }
  chk("the required set is derived, not hand-waved", required.has("browser-verify") && required.has("health-run"), [...required].join(","));

  // Producers: any shipped file that CREATES the entry. ledger.mjs only defines,
  // validates and renders, so it never counts as a producer of its own kinds.
  const files = [...walk("lib"), "index.ts"].filter((f) => !f.endsWith("gates/ledger.mjs"));
  const sources = files.map((f) => ({ f, src: read(f) }));
  const producersOf = (kind) => sources.filter(({ src }) => new RegExp(`kind:\\s*"${kind}"`).test(src)).map(({ f }) => f);

  const orphans = [];
  for (const kind of ENTRY_KINDS) {
    const where = producersOf(kind);
    if (!where.length) orphans.push(kind);
    chk(`producer for "${kind}"`, where.length > 0, where.join(",") || "NONE — this kind can never be recorded");
  }
  chk("no ledger kind is an orphan", orphans.length === 0, orphans.join(","));

  const requiredOrphans = [...required].filter((k) => !producersOf(k).length);
  chk("no REQUIRED kind is an orphan (the gate-loop bug, structurally)", requiredOrphans.length === 0, requiredOrphans.join(","));
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

console.log(`\n${pass} passed, ${fail} failed`);
export default fail === 0;
