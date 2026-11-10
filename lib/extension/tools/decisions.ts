/**
 * asf_decisions — the agent's hands on the decision register.
 *
 * The register only changes behaviour if it is consulted *while the code is
 * being written*, so this tool exists for three moments: before an approach is
 * proposed (`list`/`match`), when a real choice is made (`record`), and when a
 * choice is reversed (`supersede`, which writes both halves of the link).
 *
 * `get` matters more than it looks: reading a record through this tool is what
 * marks it as in-context, and the read-before-edit floor is satisfied by that
 * mark — not by the file existing somewhere on disk.
 *
 * A record that fails validation is **not written**; the caller gets the fix
 * list. Half-records are the ones that get followed into the code.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { registerAt, addDecision, supersedeDecision, relativeTo } from "../../decisions/consult.mjs";
import { matchesAny } from "../../decisions/glob.mjs";
import { readProjectConfig } from "../../gates/config.mjs";
import { runRoot, projectName } from "../paths.ts";
import { loadState } from "../state.ts";
import { runtime } from "../runtime.ts";
import { appendEvidence } from "../evidence.ts";
import type { DecisionRecord } from "../../decisions/schema.d.mts";

const ACTIONS = ["list", "get", "match", "record", "supersede", "check"] as const;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
const bool = (v: unknown): boolean => v === true;

type ActionOut = { text: string; ok?: boolean; count?: number; id?: string; error?: string };

async function planApproved(): Promise<boolean> {
  try {
    const state = await loadState(projectName());
    return state.current?.planApproved === true;
  } catch {
    return false;
  }
}

function config(): Record<string, unknown> {
  try {
    return readProjectConfig(runRoot());
  } catch {
    return {};
  }
}

function recordFrom(p: Record<string, unknown>): DecisionRecord {
  const record: DecisionRecord = {
    title: str(p.title),
    decision: str(p.decision),
    applies_to: arr(p.applies_to),
    tags: arr(p.tags),
    origin: str(p.origin) || "agent",
    source: arr(p.source),
    from_spec: str(p.from_spec),
    user_instructed: str(p.user_instructed),
    plan: str(p.plan),
    supersedes: arr(p.supersedes),
    reopens_when: str(p.reopens_when),
    enforced: bool(p.enforced),
    checks: arr(p.checks),
  };
  // An explicit id is honoured, not silently renumbered: a caller that asks to
  // write an id the register already holds is told so, which is the difference
  // between "supersede it" and a second record claiming to be the same decision.
  if (p.id) record.id = str(p.id);
  if (p.status) record.status = str(p.status);
  return record;
}

function renderList(records: DecisionRecord[]): string {
  if (!records.length) return "The register is empty. Record a decision with action=record when a choice has real alternatives.";
  return records
    .map((r) => `${r.id} [${r.status}] ${r.decision}\n    governs: ${(r.applies_to || []).join(", ") || "—"}${r.superseded_by ? `\n    superseded by ${r.superseded_by}` : ""}`)
    .join("\n");
}

function renderProblems(problems: { severity: string; file?: string; field?: string; message: string }[]): string {
  if (!problems.length) return "no problems";
  return problems.map((p) => `${p.severity === "error" ? "✗" : "•"} ${p.file || ""}${p.field ? ` (${p.field})` : ""}: ${p.message}`).join("\n");
}

async function listAction(root: string): Promise<ActionOut> {
  const { dir, records, problems } = registerAt(root, config());
  const errors = problems.filter((p) => p.severity === "error");
  const text = `${dir}\n\n${renderList(records)}${errors.length ? `\n\n${renderProblems(errors)}` : ""}`;
  return { text, ok: errors.length === 0, count: records.length };
}

async function getAction(root: string, id: string): Promise<ActionOut> {
  const { records } = registerAt(root, config());
  const found = records.find((r) => String(r.id).toLowerCase() === id.toLowerCase());
  if (!found) return { text: `No ${id} in the register.`, ok: false, count: 0 };
  if (!runtime.decisionsRead.includes(String(found.id))) runtime.decisionsRead.push(String(found.id));
  const { body, __file, ...fields } = found;
  const text = `${__file || ""}\n\n${Object.entries(fields).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join("\n")}\n\n${body || ""}`;
  appendEvidence({ kind: "decision-read", id: found.id, file: __file });
  return { text, ok: true, count: 1, id: String(found.id) };
}

async function matchAction(root: string, filePath: string): Promise<ActionOut> {
  const { records } = registerAt(root, config());
  const hit = records.filter((r) => r.status === "accepted" && matches(r, filePath));
  const text = hit.length
    ? `${filePath} is governed by:\n${renderList(hit)}\n\nRead them with action=get before changing the file.`
    : `No accepted decision governs ${filePath}.`;
  return { text, ok: true, count: hit.length };
}

/** The register's own matcher — one implementation, never a second one here. */
function matches(r: DecisionRecord, filePath: string): boolean {
  return matchesAny(filePath, r.applies_to || []);
}

async function recordAction(root: string, p: Record<string, unknown>): Promise<ActionOut> {
  const approved = await planApproved();
  const { records } = registerAt(root, config());
  const out = addDecision(root, {
    record: recordFrom(p),
    body: str(p.body),
    config: config(),
    planApproved: approved,
    read: records,
  });
  if (!out.ok) {
    return { text: `Not recorded:\n${renderProblems(out.problems || [])}`, ok: false };
  }
  runtime.decisionsRead.push(String(out.id));
  if (!runtime.decisionsRecorded.includes(String(out.id))) runtime.decisionsRecorded.push(String(out.id));
  appendEvidence({ kind: "decision-record", id: out.id, file: out.file });
  return { text: `Recorded ${out.id} at ${out.file}\n\n${renderProblems(out.problems || [])}`, ok: true, id: String(out.id) };
}

async function supersedeAction(root: string, p: Record<string, unknown>): Promise<ActionOut> {
  const approved = await planApproved();
  const { records } = registerAt(root, config());
  // The `id` parameter names the decision being REPLACED; the record built from
  // the same params must not carry it, or the new decision is written with the old
  // decision's id and the register ends up with two claimants for one number.
  const { id: _supersededId, ...recordParams } = p;
  const out = supersedeDecision(root, {
    id: str(p.id),
    by: "agent",
    record: recordFrom(recordParams),
    body: str(p.body),
    config: config(),
    planApproved: approved,
    read: records,
  });
  if (!out.ok) return { text: `Not superseded:\n${renderProblems(out.problems || [])}`, ok: false };
  if (!runtime.decisionsRecorded.includes(String(out.id))) runtime.decisionsRecorded.push(String(out.id));
  appendEvidence({ kind: "decision-supersede", id: out.id, superseded: out.superseded });
  return { text: `${out.superseded} is superseded by ${out.id}; both halves of the link are written.`, ok: true, id: String(out.id) };
}

async function checkAction(root: string): Promise<ActionOut> {
  const { dir, records, problems } = registerAt(root, config());
  const errors = problems.filter((p) => p.severity === "error");
  const notices = problems.filter((p) => p.severity === "notice");
  // What the completion floor believes about THIS run. Without it the citation rules
  // are invisible: an agent that cited a decision and is still blocked has no way to
  // see that the gate missed the citation, or took it from somewhere else. Stating
  // the three sets is what makes the floor debuggable instead of mystical.
  const sets = (ids: string[]) => (ids.length ? ids.join(", ") : "none");
  const thisRun = `this run: cited [${sets(runtime.decisionsCited)}] read [${sets(runtime.decisionsRead)}] recorded [${sets(runtime.decisionsRecorded)}]`;
  const text = `${dir}: ${records.length} record(s), ${errors.length} error(s), ${notices.length} notice(s)\n${thisRun}\n\n${renderProblems(problems)}`;
  return { text, ok: errors.length === 0, count: records.length };
}

/**
 * The parameter schema, declared apart from the registration so adding a field is
 * a row here and not an edit inside a 50-line call.
 */
const DECISION_PARAMS = {
  action: StringEnum(ACTIONS, { description: "What to do." }),
  id: Type.Optional(Type.String({ description: "Decision id (ADR-0007) for get/supersede." })),
  path: Type.Optional(Type.String({ description: "Project-relative file path for match." })),
  title: Type.Optional(Type.String({ description: "Short title; the rule belongs in it." })),
  decision: Type.Optional(Type.String({ description: "One-sentence rule, imperative. Not the topic." })),
  applies_to: Type.Optional(Type.Array(Type.String(), { description: "Globs the decision governs." })),
  body: Type.Optional(Type.String({ description: "Markdown body: ## Decision, Context, Options considered, Consequences." })),
  status: Type.Optional(Type.String({ description: "proposed | accepted (needs instruction evidence)." })),
  from_spec: Type.Optional(Type.String({ description: "Spec id this decision implements." })),
  user_instructed: Type.Optional(Type.String({ description: "The user's own words, verbatim." })),
  plan: Type.Optional(Type.String({ description: "Plan path, when the decision came from an approved plan." })),
  origin: Type.Optional(Type.String({ description: "agent | user | backfill | imported." })),
  source: Type.Optional(Type.Array(Type.String(), { description: "Where a recovered decision was found (file:line, commit)." })),
  supersedes: Type.Optional(Type.Array(Type.String(), { description: "Ids this record replaces." })),
  reopens_when: Type.Optional(Type.String({ description: "What would make this decision worth revisiting." })),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Retrieval terms." })),
  enforced: Type.Optional(Type.Boolean({ description: "True only when a named check really proves it." })),
  checks: Type.Optional(Type.Array(Type.String(), { description: "Test files that enforce this decision." })),
};

/** One action per branch; an unknown action lists the register rather than failing. */
async function runAction(root: string, action: string, params: Record<string, unknown>): Promise<ActionOut> {
  if (action === "get") return getAction(root, str(params.id));
  if (action === "match") return matchAction(root, str(params.path));
  if (action === "record") return recordAction(root, params);
  if (action === "supersede") return supersedeAction(root, params);
  if (action === "check") return checkAction(root);
  return listAction(root);
}

function toolResult(action: string, out: ActionOut) {
  return {
    content: [{ type: "text" as const, text: out.text }],
    details: { action, ok: out.ok === true, count: out.count || 0, id: out.id || "", error: out.error || "" },
  };
}

export function registerDecisionsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "asf_decisions",
    label: "ASF Decisions",
    description:
      "Read and write the project's decision register (.asf/decisions/). Use `list` or `match` " +
      "before proposing an approach, `get` before changing code a decision governs, `record` " +
      "when a choice has real alternatives, and `supersede` when one is reversed. Records are " +
      "plain markdown the user edits by hand; a record that fails validation is not written.",
    promptSnippet: "Consult or record the project's architecture decisions",
    parameters: Type.Object(DECISION_PARAMS),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const root = runRoot();
      const action = str(params?.action);
      try {
        return toolResult(action, await runAction(root, action, params));
      } catch (e) {
        // A tool that throws at the framework is a tool the model cannot recover
        // from; the error comes back as content so the run can act on it.
        const message = String((e as Error)?.message || e);
        return {
          content: [{ type: "text" as const, text: `asf_decisions (${action}) failed: ${message}` }],
          details: { action, ok: false, count: 0, id: "", error: message },
        };
      }
    },
  });
}

/** Exposed for the handlers: the register as the rest of ASF sees it. */
export function currentRegister() {
  return registerAt(runRoot(), config());
}
