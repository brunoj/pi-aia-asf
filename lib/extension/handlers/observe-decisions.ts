/**
 * What a tool call did to the decision register — the observer half of the floor.
 *
 * Two observations, both cheap and both load-bearing:
 *
 *  - an **accepted** decision governs a file this run is about to change and has
 *    not been read -> steer once to read it. A register nobody has opened is a
 *    register nobody followed, and the moment to catch a violation is before the
 *    edit, not at settle when the code is already written;
 *  - the agent **cited** a decision (in a plan, a message, authored content) ->
 *    remember it, because the completion floor asks for a citation, not a feeling.
 *
 * Reads are fenced like every other observer here: a register that cannot be read
 * is reported by the register's own checks, never by breaking the tool call.
 */
import { registerAt, unreadGoverning, citedIds } from "../../decisions/consult.mjs";
import { resolve as abspath } from "node:path";
import { matchesAny } from "../../decisions/glob.mjs";
import { runRoot } from "../paths.ts";
import { runtime } from "../runtime.ts";
import { projectOf } from "../run.ts";
import { inventory, coverage, findForeignAdrs, hasSource, backfillSteer } from "../../decisions/backfill.mjs";
import { appendEvidence, queueSteer } from "../evidence.ts";

import type { Input } from "./observed.ts";
import type { DecisionRecord } from "../../decisions/schema.mjs";

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|c|h|cpp|hpp|swift)$/i;

/**
 * The fields that count as the run AUTHORED something. A citation has to be text
 * the run wrote into the project or said out loud; an id that happens to appear in
 * a tool's parameters is not the run endorsing a decision — otherwise reading a
 * record (`action=get id=ADR-0001`) would satisfy cite-or-record, and the whole
 * completion floor would close itself the first time anyone looked at the register.
 */
const AUTHORED_FIELDS = ["content", "newText", "new_text", "text", "summary", "message", "body"];

function authoredText(input: Input): string {
  if (!input || typeof input !== "object") return "";
  return AUTHORED_FIELDS.map((k) => (typeof input[k] === "string" ? String(input[k]) : "")).join("\n");
}

/** The file this call is about to change, when it is a file-writing tool. */
function writeTarget(toolName: string, input: Input): string {
  if (!/edit|write|apply_patch|create_file|str_replace/i.test(toolName)) return "";
  return typeof input.path === "string" ? input.path : typeof input.file_path === "string" ? input.file_path : "";
}

/** One steer per decision per run — the point is to inform, not to nag. */
function steerOnUnread(record: { id?: unknown; decision?: unknown }, target: string): void {
  const id = String(record.id || "");
  if (!id || runtime.decisionsSteered.includes(id)) return;
  runtime.decisionsSteered.push(id);
  appendEvidence({ kind: "decision-unread", id, target });
  queueSteer(
    `ASF: ${id} governs ${target} and this run has not read it. The decision is: ${String(record.decision || "(see the record)")}. ` +
      `Read it with asf_decisions action=get id=${id} before the edit — following a decision you never opened is how a ` +
      `documented boundary gets quietly crossed, and overriding one is a decision of its own (record it, then proceed).`,
  );
}

/** Record what the run cited, and steer once if it is about to edit governed code unread. */
/**
 * Which records the agent's own words name. The register tool's params are register
 * operations, never citations — counting them would let `asf_decisions action=get` mark a
 * decision as read by the edit it is being used to look up.
 */
function noteCitations(toolName: string, input: Input, records: DecisionRecord[]): void {
  if (toolName === "asf_decisions") return;
  for (const id of citedIds(authoredText(input), records)) {
    if (runtime.decisionsCited.includes(id)) continue;
    runtime.decisionsCited.push(id);
    appendEvidence({ kind: "decision-cite", id });
  }
}

/**
 * The backfill offer: writing code in a project with no register is the first opportunity
 * to recover the decisions already in it. Guidance, once per run, with the candidate list
 * attached and a ceiling on the records — a gap saying "go analyse the repo" with no end
 * would be a run that never closes. ASF reports; only the agent writes a record.
 */
function offerBackfill({ target, root, records, config }: { target: string | null; root: string | null; records: DecisionRecord[]; config: Record<string, unknown> }): void {
  if (!target || runtime.backfillOffered || !SOURCE.test(target)) return;
  // The offer asserts "this run is changing code in THIS project", so the file being
  // changed has to live inside the project being described. A write to a scratch file
  // (/tmp/x.mjs) from a session whose workspace is a non-repo $HOME resolved to that
  // $HOME, and the agent was told to adopt ADRs from an unrelated checkout under it.
  if (!root || !abspath(target).startsWith(abspath(root) + "/")) return;
  runtime.backfillOffered = true;
  if (records.length > 0 || !hasSource(root)) return;
  const cfg = config || {};
  const foreign = findForeignAdrs(root, cfg);
  const { uncovered } = coverage(records, inventory(root, { config: cfg }), matchesAny);
  const text = backfillSteer({ records, foreign, uncovered, hasSource: true });
  if (!text) return;
  queueSteer(text);
  appendEvidence({ kind: "steer", gate: "backfill-offered", root });
}

export function observeDecisions(toolName: string, input: Input, config: Record<string, unknown>): void {
  try {
    // The register follows the code (ADR-0005): an edit is checked against the register
    // of the project the edited file lives in, as long as that project is inside the
    // session workspace. Reading the workspace root's register instead meant a session
    // opened in a parent repo never saw the decisions governing the code it changed.
    const target0 = writeTarget(toolName, input);
    const ws = runRoot();
    const root = (target0 && projectOf(target0, ws)) || ws;
    const { records } = registerAt(root, config);
    // The register tool's own params name records to fetch/supersede; they are
    // register operations, never citations.
    noteCitations(toolName, input, records);
    const target = writeTarget(toolName, input);
    offerBackfill({ target, root, records, config });
    if (config["gate.decisions.read_before_edit"] === false) return;
    if (!target) return;
    for (const r of unreadGoverning(records, target, runtime.decisionsRead)) steerOnUnread(r, target);
  } catch {
    /* observer only */
  }
}

