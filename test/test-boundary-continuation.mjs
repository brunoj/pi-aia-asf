/**
 * Regression: the completion gate's continuation must be RUNNABLE (pi 1.5.0).
 *
 * Bug evidence (pi 1.5.0, in-session extension error):
 *   [Extension "<boundary>" error: agent_before_settle requested continuation
 *   without runnable model context]
 *
 * Cause: pi 1.5.0 validates a boundary continuation instead of trusting it. In
 * `_runBeforeSettleBoundary` it commits the entries an extension returns, then
 * rebuilds the context and only continues when `canContinue` holds:
 *
 *   contextCanContinue = hasNonSystemContext && finalRole !== "assistant"
 *   canContinue        = contextCanContinue || pendingCustomContext
 *                        || (finalRole === "assistant" && hasQueuedMessages())
 *
 * At settle time the context ends with the assistant's own message and nothing
 * is queued, so a bare `{ continue: true }` — which is what the gate returned —
 * is refused, the agent is never told what was missing, and the gate's one
 * bounded continuation does nothing but log an error.
 *
 * The fix returns a `custom_message` entry alongside `continue: true`: pi
 * projects custom messages to role "user", which is what makes the next
 * provider request runnable, and it is the only channel that can carry the
 * missing list to the model.
 *
 * So this suite does not assert "returns continue". It re-implements pi's rule
 * as the oracle and requires the handler's own result to satisfy it against a
 * context that ends with an assistant message. A handler that regresses to a
 * bare continue fails here.
 */
import { MAX_STEERS } from "../lib/gates/settle.mjs";
import { projectKey, __clearProjectCache } from "../lib/project.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { homeStateDir } from "../lib/home.mjs";

/**
 * The gate reads ASF's per-project state (keyed on process.cwd()), so the test
 * runs inside a throwaway project directory rather than mutating the real one.
 */
function makeProject(prefix) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-boundary-")));
  const name = `${prefix}-${process.pid}`;
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  __clearProjectCache();
  const key = projectKey(dir);
  fs.mkdirSync(homeStateDir(dir, key), { recursive: true });
  return {
    dir,
    stateFile: path.join(homeStateDir(dir, key), "state.json"),
    cleanup() {
      try { process.chdir(originalCwd); } catch { /* already gone */ }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(path.join(os.homedir(), ".pi", "agent", "skills", "aia-asf", "projects", key), { recursive: true, force: true });
    },
  };
}
const originalCwd = process.cwd();

function writeState(stateFile, phase) {
  fs.writeFileSync(
    stateFile,
    JSON.stringify({
      current: phase === "none" ? null : {
        workType: "feature", scale: "large", phase, planApproved: true,
        startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      history: [],
    }),
  );
}

let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  if (cond) { console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fail++; }
};

/**
 * pi's boundary runnability rule, transcribed from agent-session.js (1.5.0).
 * `entries` are the drafts the handler returned; pi commits them BEFORE the
 * check, so they count towards the projected context.
 */
function piSaysCanContinue({ lastRole = "assistant", hasNonSystemContext = true, queued = false }, result) {
  const drafts = Array.isArray(result?.entries) ? result.entries : [];
  // custom_message drafts are appended as custom messages, which convertToLlm
  // maps to role "user" (core/messages.js).
  const finalRole = drafts.some((d) => d?.type === "custom_message") ? "user" : lastRole;
  const hasNonSystem = hasNonSystemContext || drafts.length > 0;
  const contextCanContinue = hasNonSystem && finalRole !== "assistant";
  return contextCanContinue || queued;
}

/** What the model would actually be told by this continuation ('' if none). */
function continuationText(result) {
  const drafts = Array.isArray(result?.entries) ? result.entries : [];
  return drafts
    .filter((d) => d?.type === "custom_message")
    .map((d) => (typeof d.content === "string" ? d.content : (d.content ?? []).map((c) => c.text).join("")))
    .join("\n");
}

export async function run({ events }) {
  console.log("=== 1. the oracle itself is not vacuous (negative control) ===");
  // A rule that says "yes" to everything would let the old bug pass. Prove the
  // oracle refuses the exact shape the gate used to return.
  chk("bare continue on an assistant-terminated context is REFUSED by the oracle",
    piSaysCanContinue({}, { continue: true }) === false);
  chk("continue carrying a custom_message is ACCEPTED by the oracle",
    piSaysCanContinue({}, { continue: true, entries: [{ type: "custom_message", content: "x", display: true }] }) === true);
  chk("no continuation requested is not a continuation",
    piSaysCanContinue({}, undefined) === false);

  console.log("=== 2. the gate is registered on the actionable boundary ===");
  const handler = events.find((e) => e.ev === "agent_before_settle")?.fn;
  chk("agent_before_settle has a handler", typeof handler === "function");
  if (typeof handler !== "function") {
    console.log(`\n${pass} passed, ${fail} failed`);
    return fail === 0;
  }

  const proj = makeProject("live");
  process.chdir(proj.dir);
  try {
    console.log("=== 3. no ASF run in this project means NO gate (negative control) ===");
    // The regression this exists for: once the continuation became real, an
    // ungated check interrupted sessions that never asked for ASF — a plain
    // question in a scratch directory was held to the delivery evidence bar.
    fs.rmSync(proj.stateFile, { force: true });
    const idle = await handler({ type: "agent_before_settle", outcome: "completed", context: { canContinue: false } });
    chk("with no ASF state the gate stays silent", !idle, JSON.stringify(idle)?.slice(0, 70));

    writeState(proj.stateFile, "none");
    const none = await handler({ type: "agent_before_settle", outcome: "completed", context: { canContinue: false } });
    chk("phase 'none' stays silent too", !none, JSON.stringify(none)?.slice(0, 70));

    console.log("=== 4. an active ASF run gets a RUNNABLE continuation ===");
    writeState(proj.stateFile, "implementation");
    const result = await handler({ type: "agent_before_settle", outcome: "completed", context: { canContinue: false } });

  if (!result || !result.continue) {
    chk("the gate blocks an unevidenced run with a continuation", false,
      `got ${JSON.stringify(result)?.slice(0, 120)}`);
  } else {
    chk("the gate blocks an unevidenced run with a continuation", true);
    chk("the continuation carries entries (never a bare continue)",
      Array.isArray(result.entries) && result.entries.length > 0,
      `entries=${result.entries?.length}`);

    const msg = (result.entries ?? []).find((d) => d?.type === "custom_message");
    chk("the entry is a custom_message (pi projects it to role user)", !!msg);
    chk("the entry sets display so the reviewer sees why the run resumed", !!msg?.display);
    chk("the entry names what is missing, not just 'continue'",
      typeof msg?.content === "string" && msg.content.length > 0 && /\n- \S/.test(msg.content),
      `${continuationText(result).split("\n").length} lines`);
    // No ceiling: a warranted loop may run as long as the gap is real. Claiming
    // "of at most N" is what made the 2026-11-07 loop read as a countdown that
    // never counted down.
    chk("the continuation claims no ceiling and says the work is not stopped",
      typeof msg?.content === "string" && !/of at most/.test(msg.content) && /Nothing here stops you/.test(msg.content) && /no ceiling on warranted work/.test(msg.content));

    // The regression assertion: pi's own rule, applied to the handler's result.
    chk("PI WOULD ACCEPT this continuation (the 1.5.0 contract)",
      piSaysCanContinue({}, result) === true);
    chk("the old shape would have failed here",
      piSaysCanContinue({}, { continue: true }) === false);
  }

  console.log("=== 5. an unchanged real gap keeps being raised (a warranted loop) ===");
    // The loop is the mechanism. What it must not do is word the same gap as
    // new information, or drop it while it is still open.
    const again = await handler({ type: "agent_before_settle", outcome: "completed", context: { canContinue: false } });
    const againMsg = (again?.entries || []).find((d) => d.customType === "asf-completion-gate");
    chk("the unchanged real gap is raised again", again?.continue === true && !!againMsg, `again=${JSON.stringify(again)?.slice(0, 80)}`);
    chk("but it is worded as a repeat, not as new information", /still open after/.test(againMsg?.content || ""), (againMsg?.content || "").slice(0, 60));
    const st = JSON.parse(fs.readFileSync(proj.stateFile, "utf8"));
    chk("the steer fingerprint is persisted in run state (survives a reload)", Array.isArray(st.current?.seenSteers) && st.current.seenSteers.length >= 1);
    chk("and the count is persisted, so a reload cannot reset it", typeof st.current?.steers === "number" && st.current.steers >= 2, `steers=${st.current?.steers}`);

    console.log("=== 5b. prior boundary entries from other extensions are preserved ===");
    writeState(proj.stateFile, "implementation");
    const foreign = { type: "custom_message", customType: "someone-else", content: "theirs", display: false };
    const r5 = await handler({ type: "agent_before_settle", outcome: "completed", entries: [foreign], context: { canContinue: false } });
    chk("a foreign entry proposed earlier is still in the result", !r5 || (r5.entries || []).some((d) => d.customType === "someone-else"), JSON.stringify(r5)?.slice(0, 90));

    console.log("=== 6. a malformed event must not request a continuation ===");
    writeState(proj.stateFile, "implementation");
    try {
      const r = await handler(undefined);
      chk("a malformed event does not produce a continuation", !r || r.continue !== true, JSON.stringify(r)?.slice(0, 60));
    } catch (e) {
      chk("a malformed event does not throw out of the boundary", false, String(e).slice(0, 80));
    }
  } finally {
    proj.cleanup();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail === 0;
}
