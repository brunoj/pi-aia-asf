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
import { runRoot } from "../paths.ts";
import { runtime } from "../runtime.ts";
import { appendEvidence, queueSteer } from "../evidence.ts";

type Input = Record<string, unknown>;

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
export function observeDecisions(toolName: string, input: Input, config: Record<string, unknown>): void {
  try {
    const { records } = registerAt(runRoot(), config);
    // The register tool's own params name records to fetch/supersede; they are
    // register operations, never citations.
    if (toolName !== "asf_decisions") {
      for (const id of citedIds(authoredText(input), records)) {
        if (!runtime.decisionsCited.includes(id)) {
          runtime.decisionsCited.push(id);
          appendEvidence({ kind: "decision-cite", id });
        }
      }
    }
    if (config["gate.decisions.read_before_edit"] === false) return;
    const target = writeTarget(toolName, input);
    if (!target) return;
    for (const r of unreadGoverning(records, target, runtime.decisionsRead)) steerOnUnread(r, target);
  } catch {
    /* observer only */
  }
}

