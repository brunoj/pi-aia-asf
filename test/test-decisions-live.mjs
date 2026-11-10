/**
 * The decision register, live.
 *
 * `test-decisions.mjs` proves the library. This suite proves the feature: that
 * the register reaches the agent through the run card, that an unread decision
 * governing a file about to be edited produces exactly one steer, that reading
 * it ends the steer, and that a run which changed governed code without citing
 * anything cannot close — all of it driven through the real handlers, because a
 * library nobody calls is how a feature ships dead.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { projectKey, __clearProjectCache } from "../lib/project.mjs";
import { homeStateDir } from "../lib/home.mjs";
import { splitGaps } from "../lib/gates/settle.mjs";
import { loadRegister, indexForCard } from "../lib/decisions/store.mjs";

let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  if (cond) { console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fail++; }
};

const originalCwd = process.cwd();

function project(prefix) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `asf-dec-live-${prefix}-`)));
  __clearProjectCache();
  const key = projectKey(root);
  return {
    root,
    key,
    decisionsDir: path.join(root, ".asf", "decisions"),
    write(rel, text) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, text);
      return abs;
    },
    cleanup() {
      try { process.chdir(originalCwd); } catch { /* gone */ }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(homeStateDir(root, key), { recursive: true, force: true });
    },
  };
}

/** A hand-written accepted record — the shape a human would leave behind. */
function record(id, title, appliesTo, extra = "", decision = "") {
  const rule = decision || `do it this way: ${title}`;
  return `---
id: ${id}
status: accepted
title: ${title}
decision: ${rule}
decided: 2026-11-09
applies_to: ["${appliesTo}"]
origin: user
user_instructed: "we do it this way, no exceptions"
${extra}}
---

## Decision
${rule}

## Context and Problem Statement
Why this exists at all, stated once.

## Options considered
- **A** — the one taken.
- **B** — the one not taken.

## Consequences
Positive and negative, both.
`;
}

const textOf = (entries, type) => (entries || []).filter((e) => e.customType === type).map((e) => String(e.content || "")).join("\n");

export async function run({ events }) {
  const on = (ev) => events.filter((e) => e.ev === ev).map((e) => e.fn);
  const toolCall = async (toolName, input, id = `tc-${Math.random()}`) => {
    let out;
    for (const fn of on("tool_call")) out = (await fn({ toolName, input, toolCallId: id })) || out;
    return out;
  };
  const settle = async (entries = []) => {
    let out;
    for (const fn of on("agent_before_settle")) {
      out = await fn({ type: "agent_before_settle", outcome: "completed", entries, context: { canContinue: false } });
    }
    return out;
  };
  const tool = (name) => (typeof globalThis.__tools !== "undefined" ? globalThis.__tools : []).find((t) => t.name === name);
  // Steers are delivered ONCE each (deduped by text), so counting them means
  // collecting every settle's entries, not just the newest settle's.
  const steerLog = [];
  const settleAll = async (entries = []) => {
    const out = await settle(entries);
    for (const e of (out?.entries || [])) if (e.customType === "asf-steer") steerLog.push(String(e.content || ""));
    return out;
  };
  const steerCount = (re) => steerLog.filter((t) => re.test(t)).length;

  console.log("=== 1. the tool is registered (a gate needs agent-side hands) ===");
  const decTool = tool("asf_decisions");
  chk("asf_decisions is registered as an AGENT TOOL", !!decTool, `tools=${(globalThis.__tools || []).map((t) => t.name).join(",")}`);
  chk("it exposes the moments the register matters", ["list", "get", "match", "record", "supersede", "check"].every((a) => JSON.stringify(decTool?.parameters || {}).includes(a)));

  console.log("=== 2. the index rides the run card ===");
  const p = project("card");
  process.chdir(p.root);
  __clearProjectCache();
  try {
    for (const fn of on("session_start")) await fn({});
    fs.mkdirSync(p.decisionsDir, { recursive: true });
    fs.writeFileSync(path.join(p.decisionsDir, "0001-boundary.md"), record("ADR-0001", "never import from lib/gates into lib/extension", "src/**"));

    await toolCall("write", { path: "src/a.ts", content: "export const a = 1;\n" });
    const first = await settleAll([]);
    const card = textOf(first?.entries, "asf-run-card");
    chk("the run card carries the decision index", /decisions in force/i.test(card), card.split("\n").find((l) => l.includes("ADR-0001")) || "no line");
    chk("the index line states the RULE, not the topic", /never import from lib\/gates/.test(card));
    chk("the card names the action that reads it", /asf_decisions/.test(card));

    console.log("=== 3. read-before-edit: one steer, and reading it ends it ===");
    chk("touching governed code without reading the decision steers", steerCount(/ADR-0001 governs/) === 1, steerLog.join(" | ").slice(0, 90));
    chk("the steer names the action that closes it", steerCount(/action=get id=ADR-0001/) === 1);

    await toolCall("edit", { path: "src/b.ts", oldText: "1", newText: "2" });
    await settleAll([]);
    chk("the same decision does not steer twice", steerCount(/ADR-0001 governs/) === 1, `count=${steerCount(/ADR-0001 governs/)}`);

    const got = await decTool.execute("t-get", { action: "get", id: "ADR-0001" });
    chk("action=get returns the record's own text", /Options considered/.test(String(got?.content?.[0]?.text || "")));
    await toolCall("edit", { path: "src/c.ts", oldText: "1", newText: "2" });
    await settleAll([]);
    chk("after reading it, editing governed code is silent", steerCount(/ADR-0001 governs/) === 1, `count=${steerCount(/ADR-0001 governs/)}`);

    console.log("=== 4. cite-or-record: the completion floor ===");
    const blocked = await settleAll([]);
    const gate = textOf(blocked?.entries, "asf-completion-gate");
    chk("changed governed code with no citation cannot close", /ADR-0001/.test(gate) && /cited|record/i.test(gate), gate.split("\n").find((l) => l.includes("ADR-0001")) || gate.slice(0, 90));
    const gaps = splitGaps([{ gate: "decisions", gap: "this run changed code an accepted decision governs (src/a.ts → ADR-0001) and never cited it", remedy: "cite ADR-0001 or record a decision of its own" }]);
    chk("and the gap is agent-closable, so it stays blocking", gaps.blocking.length === 1 && gaps.reported.length === 0);

    await toolCall("write", { path: "docs/approach.md", content: "we follow ADR-0001 here\n" });
    const cited = await settleAll([]);
    chk("citing the decision closes that gap", !/never cited it or recorded/i.test(textOf(cited?.entries, "asf-completion-gate")));

    console.log("=== 5. recording through the tool ===");
    const rec = await decTool.execute("t-rec", {
      action: "record",
      title: "the publish floor is the completion floor",
      decision: "never push without the last full suite run green after the last edit",
      applies_to: ["lib/gates/**"],
      user_instructed: "the publish floor must be the completion floor",
      body: "## Decision\nnever push without the last full suite run green after the last edit\n\n## Context and Problem Statement\nA stale green used to satisfy the floor.\n\n## Options considered\n- **any green** — rejected.\n- **last full run** — taken.\n\n## Consequences\nPushes are rarer and honest.\n",
    });
    chk("a well-formed record is written", /Recorded ADR-0002/.test(String(rec?.content?.[0]?.text || "")), String(rec?.content?.[0]?.text || "").slice(0, 60));
    chk("it lands in the register", fs.existsSync(path.join(p.decisionsDir, "0002-the-publish-floor-is-the-completion-floor.md")));
    const bad = await decTool.execute("t-bad", {
      action: "record",
      title: "unproved claim",
      decision: "everything is fine",
      applies_to: ["lib/**"],
      status: "accepted",
      origin: "agent",
      body: "## Decision\neverything is fine\n\n## Context and Problem Statement\nnone\n\n## Options considered\n- **A** — assert it.\n- **B** — measure it.\n\n## Consequences\nnone\n",
    });
    chk("an accepted record with no instruction evidence is REFUSED", /Not recorded/.test(String(bad?.content?.[0]?.text || "")) && !fs.existsSync(path.join(p.decisionsDir, "0003-unproved-claim.md")), String(bad?.content?.[0]?.text || "").slice(0, 70));

    const dup = await decTool.execute("t-dup", {
      action: "record",
      id: "ADR-0002",
      title: "the publish floor is the completion floor",
      decision: "overwrite the existing record",
      applies_to: ["lib/gates/**"],
      user_instructed: "overwrite it",
      body: "## Decision\noverwrite\n\n## Context and Problem Statement\nx\n\n## Options considered\n- **A** — overwrite it.\n- **B** — supersede it.\n\n## Consequences\nx\n",
    });
    chk("an existing record is never overwritten — it is superseded", /already exists/.test(String(dup?.content?.[0]?.text || "")), String(dup?.content?.[0]?.text || "").slice(0, 70));

    const sup = await decTool.execute("t-sup", {
      action: "supersede",
      id: "ADR-0002",
      title: "the publish floor checks the last run only when the tree is dirty",
      decision: "push only when the last full suite run is green after the last edit, unless nothing changed",
      applies_to: ["lib/gates/**"],
      user_instructed: "allow pushing an unchanged tree",
      body: "## Decision\npush only when the last full suite run is green after the last edit, unless nothing changed\n\n## Context and Problem Statement\nAn unchanged tree cannot be untested.\n\n## Options considered\n- **always require green** — rejected for unchanged trees.\n- **skip when clean** — taken.\n\n## Consequences\nFewer pointless reruns.\n",
    });
    chk("supersede writes the new record", /ADR-0002 is superseded by ADR-0003/.test(String(sup?.content?.[0]?.text || "")), String(sup?.content?.[0]?.text || "").slice(0, 60));
    const oldText = fs.readFileSync(path.join(p.decisionsDir, "0002-the-publish-floor-is-the-completion-floor.md"), "utf8");
    chk("and marks the old one superseded, both directions", /status: superseded/.test(oldText) && /superseded_by: ADR-0003/.test(oldText));
    const idx = fs.readFileSync(path.join(p.decisionsDir, "INDEX.md"), "utf8");
    // Two different rules, both deliberate. INDEX.md is a human reading the repo:
    // reversed decisions stay visible as history, flagged (Nygard's own practice).
    // The run card is read by an agent as "this governs": a reversed decision there
    // is how a withdrawn decision gets followed, so it must not appear at all.
    chk("the generated index keeps the superseded record as flagged history", /ADR-0003/.test(idx) && /ADR-0002/.test(idx) && /superseded by ADR-0003/.test(idx));
    const cardLines = indexForCard(loadRegister(p.decisionsDir).records).join("\n");
    chk("and the run card drops it, so a reversed decision never looks current", /ADR-0003/.test(cardLines) && !/ADR-0002/.test(cardLines), cardLines.replace(/\n/g, " | ").slice(0, 70));

    console.log("=== 6. a broken register must not break the run ===");
    fs.writeFileSync(path.join(p.decisionsDir, "0009-broken.md"), "---\nid: ADR-9999\nstatus: accepted\n  bad indentation here\n---\nbody\n");
    const broken = await settleAll([]);
    chk("settle still runs with a malformed record present", !!broken || broken === undefined);
    const checkOut = await decTool.execute("t-check", { action: "check" });
    chk("and the tool reports it instead of hiding it", /error|unparseable|front matter/i.test(String(checkOut?.content?.[0]?.text || "")), String(checkOut?.content?.[0]?.text || "").slice(0, 70));
    fs.rmSync(path.join(p.decisionsDir, "0009-broken.md"), { force: true });

    console.log("=== 7. the project can switch the steer off ===");
    const q = project("off");
    process.chdir(q.root);
    __clearProjectCache();
    for (const fn of on("session_start")) await fn({});
    fs.mkdirSync(q.decisionsDir, { recursive: true });
    fs.writeFileSync(path.join(q.decisionsDir, "0001-off.md"), record("ADR-0001", "governed but not enforced", "src/**"));
    q.write(".asf/config.json", JSON.stringify({ "gate.decisions.read_before_edit": false, "gate.decisions.inject": false }));
    await toolCall("write", { path: "src/a.ts", content: "export const a = 1;\n" });
    const off = await settleAll([]);
    chk("read_before_edit=false: no read steer", !/action=get/.test(textOf(off?.entries, "asf-steer")));
    chk("inject=false: the card carries no decision block", !/decisions in force/.test(textOf(off?.entries, "asf-run-card")));
    q.cleanup();

  } finally {
    p.cleanup();
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exit(1);
}
