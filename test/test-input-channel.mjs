/**
 * Context-aware input routing (PO, 2026-11-10).
 *
 * "Long loops should always keep running until resolution or absolutely requiring
 * user input. If working on a betamaxx ticket, user input is requested by moving
 * the ticket to input required, etc — so user input should be context aware."
 *
 * Two halves, and the second is the one that was missing:
 *
 *  1. the loop keeps going — no cap on warranted work, and a park never stops the run;
 *  2. when input genuinely IS required, the ask goes through whatever channel this
 *     session actually has: a claimed ticket is parked with the ticket system's own
 *     tool, not typed into a CLI nobody is watching.
 *
 * The pure rules are tested directly; the two park sites (the completion gate's park
 * and the third identical refusal) are driven through the real observers, so a
 * rendering that ignores the channel fails here rather than in a live ticket session.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { resolveInputChannel, routeAsk, pickParkTool } from "../lib/gates/input-channel.mjs";
import { createTracked, noteTrackedCall, matchersFromConfig } from "../lib/gates/tracked.mjs";
import { homeStateDir } from "../lib/home.mjs";
import { projectKey } from "../lib/project.mjs";

const originalCwd = process.cwd();

let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  if (cond) { console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fail++; }
};

function project(prefix, { git = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `asf-input-${prefix}-`)));
  if (git) execFileSync("git", ["init", "-q"], { cwd: root });
  // The key comes from ASF, not from a guess: under the harness the state tree is
  // redirected, so the path must be resolved the same way the extension resolves it.
  const key = projectKey(root);
  return {
    root,
    key,
    stateFile: path.join(homeStateDir(root, key), "state.json"),
    specDir: path.join(os.homedir(), ".pi", "agent", "skills", "spec-memory", "projects", key),
    cleanup() {
      try { process.chdir(originalCwd); } catch { /* gone */ }
      fs.rmSync(this.specDir, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** A session with the Betamaxx agent tools registered — the ticket-session case. */
const BMX_TOOLS = ["bmx_claim", "bmx_submit_resolution", "bmx_flag_review", "bmx_request_input", "bmx_get_ticket"];

/** Open tracked work the way a real claim does, through the observer. */
function claim(ticketId, toolName = "bmx_claim") {
  const tracked = createTracked();
  noteTrackedCall(tracked, { toolName, input: { ticket_id: ticketId } });
  return tracked;
}

/** The one legitimate park this gate knows: a credential ASF cannot obtain. */
function credentialGap(p) {
  fs.mkdirSync(p.specDir, { recursive: true });
  fs.writeFileSync(path.join(p.specDir, "current-task.json"), JSON.stringify({
    areas: { functionality: [{ id: "spc-credential-required", status: "met", verifiedAt: new Date(Date.now() + 1000).toISOString() }] },
  }));
  const file = JSON.parse(fs.readFileSync(p.stateFile, "utf8"));
  fs.writeFileSync(p.stateFile, JSON.stringify({ current: { ...file.current, scale: "large", steers: null, seenSteers: [] }, history: [] }));
}

export async function run({ events, invokeCommand, hostTools }) {
  const on = (ev) => events.filter((e) => e.ev === ev).map((e) => e.fn);
  const toolCall = async (toolName, input) => {
    let out;
    for (const fn of on("tool_call")) out = await fn({ type: "tool_call", toolName, input, id: "c1" });
    return out;
  };
  const settle = async (entries = []) => {
    let out;
    for (const fn of on("agent_before_settle")) {
      out = await fn({ type: "agent_before_settle", outcome: "completed", entries, context: { canContinue: false } });
    }
    return out;
  };

  console.log("=== 1. the channel is resolved from what the session actually has ===");
  {
    const none = resolveInputChannel({ tracked: createTracked(), tools: BMX_TOOLS });
    chk("no claimed item means no work-item channel", none.kind === "conversation", JSON.stringify(none));
    chk("and the reason says why", /no work item/i.test(none.reason || ""), none.reason);

    const t = claim("bmx-42");
    const hit = resolveInputChannel({ tracked: t, tools: BMX_TOOLS });
    chk("a claimed ticket + a park tool = the work-item channel", hit.kind === "work-item", JSON.stringify(hit));
    chk("it names the ticket system's own park tool", hit.tool === "bmx_request_input", String(hit.tool));
    chk("and the item the question is about", hit.item === "bmx-42", String(hit.item));

    const noTool = resolveInputChannel({ tracked: t, tools: ["read", "bash", "edit"] });
    chk("a claimed ticket with NO park tool falls back to the conversation", noTool.kind === "conversation", JSON.stringify(noTool));
    chk("and says the integration is missing rather than hiding it", /no tool to park it/i.test(noTool.reason || ""), noTool.reason);

    // Tools arrive from pi as objects; a suite that only ever passed strings would
    // never notice a host that passes {name}.
    const asObjects = resolveInputChannel({ tracked: t, tools: BMX_TOOLS.map((name) => ({ name })) });
    chk("tool lists in either shape work", asObjects.kind === "work-item" && asObjects.tool === "bmx_request_input", JSON.stringify(asObjects));

    chk("NEGATIVE: no tools at all is not a work-item channel", resolveInputChannel({ tracked: t, tools: [] }).kind === "conversation");
    chk("NEGATIVE: a null tracked state does not throw", (() => { try { resolveInputChannel({ tracked: null, tools: BMX_TOOLS }); return true; } catch { return false; } })());
  }

  console.log("=== 2. the park tool is chosen by what it does, not by its vendor ===");
  {
    const t = claim("LIN-7");
    // A Linear session has no bmx_* at all; the same matcher that tracked work uses
    // is what finds its park tool, so a new tracker needs no ASF change.
    const linear = resolveInputChannel({ tracked: t, tools: ["linear_claim", "linear_needs_input", "linear_resolve"] });
    chk("a non-Betamaxx tracker is routed too", linear.kind === "work-item" && linear.tool === "linear_needs_input", JSON.stringify(linear));

    const parkRe = matchersFromConfig().park;
    // request_input asks a question; flag_review says "this is not a real issue".
    // Sending a question through the latter tells the PO the work is invalid.
    const onlyFlag = resolveInputChannel({ tracked: t, tools: ["bmx_claim", "bmx_flag_review"] });
    chk("NEGATIVE: a review flag is not an input channel", onlyFlag.kind === "conversation", JSON.stringify(onlyFlag));
    chk("the matcher does see it as a park tool (so the exclusion is the routing's)", parkRe.test("bmx_flag_review"));
    chk("and both park tools present still prefers the one that ASKS",
      pickParkTool(["bmx_flag_review", "bmx_request_input"], { park: parkRe }) === "bmx_request_input");

    // A project widens the matcher in its own config; that must reach the routing too.
    const widened = resolveInputChannel({
      tracked: t,
      tools: ["jira_take", "jira_flag_for_po"],
      config: { "gate.tracked.park": "flag_for_po" },
    });
    chk("a project-widened park matcher is honoured", widened.kind === "work-item" && widened.tool === "jira_flag_for_po", JSON.stringify(widened));
    chk("NEGATIVE: widening is not inherited by the next session", resolveInputChannel({ tracked: t, tools: ["jira_take", "jira_flag_for_po"] }).kind === "conversation");

    // The item being worked on is the one the question is about; synthetic ids
    // (a claim that carried no id) cannot be passed to a park tool.
    const synthetic = createTracked();
    noteTrackedCall(synthetic, { toolName: "bmx_claim", input: {} });
    const onlySynthetic = resolveInputChannel({ tracked: synthetic, tools: BMX_TOOLS });
    chk("a claim with no item id parks nothing but still names the tool", onlySynthetic.kind === "work-item" && onlySynthetic.item === null, JSON.stringify(onlySynthetic));

    const two = createTracked();
    noteTrackedCall(two, { toolName: "bmx_claim", input: { ticket_id: "bmx-old" } });
    noteTrackedCall(two, { toolName: "bmx_claim", input: { ticket_id: "bmx-new" } });
    const latest = resolveInputChannel({ tracked: two, tools: BMX_TOOLS });
    chk("the most recent claim is the one asked about", latest.item === "bmx-new" && latest.others.includes("bmx-old"), JSON.stringify(latest));
  }

  console.log("=== 3. the ask keeps the run going, in both channels ===");
  {
    const ticket = routeAsk("Is the staging key available?", { kind: "work-item", tool: "bmx_request_input", item: "bmx-42", others: [] });
    chk("the ticket ask names the tool to call", /bmx_request_input/.test(ticket), ticket.slice(0, 90));
    chk("and the item to park", /bmx-42/.test(ticket));
    chk("and it says NOT to ask in the CLI", /not the CLI/i.test(ticket), ticket.slice(0, 120));
    chk("and the run keeps going", /keep going/i.test(ticket));
    chk("the question itself survives the routing", /staging key/.test(ticket));

    const convo = routeAsk("Which of the two APIs?", { kind: "conversation", reason: "no work item is claimed in this session" });
    chk("the conversation ask asks once, plainly", /once/i.test(convo), convo.slice(0, 90));
    chk("and the run keeps going there too", /keep going/i.test(convo));

    // A park that reads as a stop is the failure this whole rule exists to prevent.
    for (const [label, text] of [["ticket", ticket], ["conversation", convo]]) {
      chk(`NEGATIVE: the ${label} ask never tells the agent to stop or wait`, !/\bstop\b|\bwait for (the|your) (PO|reply|answer)\b|\bhalt\b|\bI will wait\b/i.test(text), text.slice(0, 120));
    }
  }

  console.log("=== 4. the completion gate's park routes through the ticket, for real ===");
  {
    const p = project("park", { git: true });
    process.chdir(p.root);
    try {
      await on("session_start").reduce(async (m, fn) => { await m; return fn({}); }, Promise.resolve());
      // A ticket session: the Betamaxx tools are registered by another extension.
      hostTools.push(...BMX_TOOLS);
      await toolCall("bmx_claim", { ticket_id: "bmx-777" });

      await toolCall("edit", { path: "src/a.ts", content: "export const A = 1;\n" });
      credentialGap(p);

      let parkEntry = null;
      for (let i = 0; i < 6 && !parkEntry; i++) {
        const r = await settle();
        parkEntry = (r?.entries || []).find((e) => e.customType === "asf-park") || null;
      }
      chk("the park reaches the agent", !!parkEntry, "no asf-park entry in 6 settles");
      const content = String(parkEntry?.content || "");
      chk("the ticket-session park tells it to use bmx_request_input", /bmx_request_input/.test(content), content.slice(0, 160));
      chk("naming the claimed ticket", /bmx-777/.test(content), content.slice(0, 160));
      chk("and never to ask in the CLI", /not the CLI/i.test(content));
      chk("the channel is recorded in the entry for the reviewer", parkEntry?.details?.channel?.kind === "work-item", JSON.stringify(parkEntry?.details?.channel));

      // CONTROL: same run, same gap, no ticket tools registered — the ask must fall
      // back to the conversation and must not invent a tool the session does not have.
      hostTools.length = 0;
      await invokeCommand("asf", "abort");
      await toolCall("edit", { path: "src/b.ts", content: "export const B = 1;\n" });
      credentialGap(p);
      let fallback = null;
      for (let i = 0; i < 6 && !fallback; i++) {
        const r = await settle();
        fallback = (r?.entries || []).find((e) => e.customType === "asf-park") || null;
      }
      const fb = String(fallback?.content || "");
      chk("CONTROL: with no park tool the ask still reaches the agent", !!fallback, "no asf-park entry");
      chk("CONTROL: and asks in the conversation", /Ask it in the conversation/.test(fb), fb.slice(0, 140));
      chk("CONTROL: and never names a tool the session does not have", !/bmx_request_input/.test(fb), fb.slice(0, 140));

      await invokeCommand("asf", "abort");
      hostTools.length = 0;
      p.cleanup();
    } catch (e) {
      chk("the park-site drive does not throw", false, String((e && e.stack) || e).slice(0, 300));
      hostTools.length = 0;
      p.cleanup();
    }
  }

  console.log("=== 5. the third identical refusal routes through the ticket too ===");
  {
    const p = project("refusal", { git: true });
    process.chdir(p.root);
    try {
      await on("session_start").reduce(async (m, fn) => { await m; return fn({}); }, Promise.resolve());
      hostTools.push(...BMX_TOOLS);
      await toolCall("bmx_claim", { ticket_id: "bmx-900" });
      // The same irreversible action, refused three identical times: the third rung
      // is the other place ASF parks for the PO.
      let reason = "";
      for (let i = 0; i < 4; i++) {
        // Built at runtime: the literal is what the secret blocker looks for, and it
        // is right to refuse to write it — including into the test that proves it.
        const key = ["AKIA", "IOSFODNN7EXAMP", "LE"].join("");
        const r = await toolCall("write", { path: "src/secret.ts", content: `const k = "${key}";\n` });
        if (r?.block) reason = String(r.reason || "");
      }
      chk("the repeated refusal parks", /park|needs-input|work item/i.test(reason), reason.slice(0, 160));
      chk("through the ticket system's own tool", /bmx_request_input/.test(reason), reason.slice(0, 200));
      chk("naming the claimed ticket", /bmx-900/.test(reason), reason.slice(0, 200));
      chk("and only that action waits — the rest continues", /only this action waits/i.test(reason), reason.slice(-160));
      hostTools.length = 0;
      p.cleanup();
    } catch (e) {
      chk("the refusal-site drive does not throw", false, String((e && e.stack) || e).slice(0, 300));
      hostTools.length = 0;
      p.cleanup();
    }
  }

  console.log(pass === 0 ? "NO CHECKS RAN" : `\n${pass} passed, ${fail} failed`);
  return fail === 0 ? "PASS" : "FAIL";
}
