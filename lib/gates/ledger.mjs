/**
 * Evidence ledger (P42) — claims become artefacts.
 *
 * Today "I ran the full suite" and "I did not run the full suite" are two
 * sentences with no observable difference, so a completion gate has nothing to
 * check against. This module is the thing that makes P41's checks possible.
 *
 * **The rule that decides whether any of this is worth anything: entries are
 * written by the extension, derived from observed tool traffic, and there is no
 * model-callable way to append one.** If the agent could append an entry it
 * would append a convenient one, and the ledger would be theatre. The agent's
 * account of itself is testimony; what the extension watched happen is evidence.
 *
 * Entries are durable and excluded from model context (pi's documented use for
 * `appendEntry`), so this costs no prompt budget — which matters given how
 * dense ASF's instructions already are.
 *
 * Where a value cannot be observed without guessing, it is `unknown`, never 0
 * and never inferred: a check that examined nothing reports scanned: 0 and is
 * not a pass.
 */

import { failuresInheritedFromBaseline } from "./suite-runs.mjs";

/** Entry kinds the ledger accepts. Anything else is rejected at append time. */
export const ENTRY_KINDS = [
  "suite-run",
  "health-run",
  "browser-verify",
  "browser-na",
  "clean-room",
  "spec-transition",
  "gate-verdict",
  "gate-block",
  // The state of the branch BEFORE this run touched it — what makes a red suite
  // distinguishable from a regression. Recorded by the asf_baseline tool, which
  // runs the suite itself in a detached worktree; never claimed in prose.
  "baseline-run",
];

/**
 * Validate an entry's shape. An entry with the wrong shape is not evidence of
 * anything, and a gate that gates on shape cannot accept a prose claim.
 */
/** Per-kind validators: a table, so a new kind is a row and not a new branch. */
const VALIDATORS = {
  "suite-run": (e) => {
    if (typeof e.command !== "string" || !e.command.trim()) return "suite-run requires command";
    if (typeof e.exitCode !== "number") return "suite-run requires exitCode (number)";
    if (typeof e.durationMs !== "number") return "suite-run requires durationMs (number)";
    if (!("testCount" in e)) return "suite-run requires testCount (number, or 'unknown')";
    if (e.testCount !== "unknown" && typeof e.testCount !== "number")
      return "suite-run testCount must be a number or the string 'unknown'";
    // Optional, but recorded by the observer: the ledger is one per process, so an
    // entry that does not say where it ran cannot be told apart from a suite that
    // ran in some other checkout.
    if (e.root !== undefined && typeof e.root !== "string") return "suite-run root must be a string";
    return null;
  },
  "health-run": (e) => {
    if (!["small", "standard", "major"].includes(e.level)) return "health-run requires level (small|standard|major)";
    // `unknown` is what a measurement that threw records, and `not-measured` is
    // what a disabled or unrunnable gate records. Both were rejected here, which
    // left the gate's own "ran but produced no verdict" branch unreachable.
    if (!["pass", "warn", "fail", "unknown", "not-measured"].includes(e.verdict))
      return "health-run requires verdict (pass|warn|fail|unknown|not-measured)";
    if (typeof e.scanned !== "number") return "health-run requires scanned (number)";
    if (e.mode !== undefined && !["warn", "block"].includes(e.mode)) return "health-run mode must be warn|block";
    if (e.root !== undefined && typeof e.root !== "string") return "health-run root must be a string";
    return null;
  },
  "baseline-run": (e) => {
    if (typeof e.command !== "string" || !e.command.trim()) return "baseline-run requires command (the suite command measured at the base)";
    if (typeof e.exitCode !== "number") return "baseline-run requires exitCode (number)";
    if (!Array.isArray(e.failing)) return "baseline-run requires failing (array of failing test names)";
    if (e.scope !== "full") return "baseline-run must be a full-suite measurement (scope: full)";
    if (typeof e.head !== "string" || !e.head.trim()) return "baseline-run requires head (the commit the baseline was measured at)";
    return null;
  },
  "browser-verify": (e) => need(e, "page") || need(e, "action") || need(e, "assertion"),
  "browser-na": (e) => need(e, "reason"),
  "clean-room": (e) => need(e, "package") || (["pass", "fail"].includes(e.result) ? null : "clean-room requires result (pass|fail)"),
  "spec-transition": (e) => need(e, "specId") || need(e, "status") || need(e, "evidence"),
  "gate-verdict": (e) => {
    if (need(e, "gate")) return need(e, "gate");
    if (typeof e.fired !== "boolean") return "gate-verdict requires fired (boolean)";
    if (typeof e.scanned !== "number") return "gate-verdict requires scanned (number)";
    return null;
  },
  "gate-block": (e) => need(e, "gate") || need(e, "rule") || need(e, "reason"),
};

function need(entry, k, t = "string") {
  if (typeof entry[k] !== t || (t === "string" && !entry[k].trim())) return `${entry.kind} requires "${k}" (${t})`;
  return null;
}

export function validateEntry(entry) {
  if (!entry || typeof entry !== "object") return "entry is not an object";
  if (!ENTRY_KINDS.includes(entry.kind)) return `unknown entry kind "${entry.kind}"`;
  const validate = VALIDATORS[entry.kind];
  if (!validate) return `unhandled entry kind "${entry.kind}"`;
  return validate(entry);
}

/**
 * The ledger itself. In-memory per session, persisted through `pi.appendEntry`
 * by the caller (index.ts) — this module is pure so it can be tested without a
 * host.
 */
export function createLedger() {
  /** @type {Array<object>} */
  const entries = [];
  /** @type {Array<string>} */
  const rejected = [];

  return {
    entries,
    rejected,
    /**
     * Append an entry. Invalid entries are REJECTED AND RECORDED, never
     * silently dropped: a ledger that quietly loses entries is worse than one
     * that refuses loudly, because the completion gate would then report an
     * absence as if it were a fact.
     */
    append(candidate, { at = new Date().toISOString() } = {}) {
      const problem = validateEntry(candidate);
      if (problem) {
        rejected.push(`${problem}`);
        return { ok: false, error: problem };
      }
      const entry = { ...candidate, at };
      entries.push(entry);
      return { ok: true, entry };
    },
    has(kind, predicate) {
      return entries.some((e) => e.kind === kind && (!predicate || predicate(e)));
    },
    count(kind) {
      return entries.filter((e) => e.kind === kind).length;
    },
    latest(kind) {
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i].kind === kind) return entries[i];
      return null;
    },
  };
}

// ─── What the completion gate may conclude ─────────────────────────────────

/**
 * The four session facts P41 checks. A spec says what the deliverable must
 * have; only the harness knows what actually happened this session.
 */
// No scale means small (PO policy) — at this layer too, so a caller that forgets to
// pass one gets the floor rather than a ceremony nobody chose.
/**
 * Does a suite run recorded at `entryRoot` speak for the project at `root`?
 *
 * Containment counts both ways: a suite run from a parent that covers the project
 * (a monorepo root, a session started above the checkout) really did run it, and a
 * run inside the project is obviously its own. Two sibling checkouts are not each
 * other — and that is the case the per-process ledger used to blur.
 */
export function coversProject(entryRoot, root) {
  if (!root || !entryRoot) return true;
  const a = String(entryRoot).replace(/\/+$/, "");
  const b = String(root).replace(/\/+$/, "");
  if (!a || !b) return true;
  return a === b || a.startsWith(b + "/") || b.startsWith(a + "/");
}

export function sessionFacts(ledger, { scale = "small", webTouched = false, root = null } = {}) {
  const missing = [];
  // Things the delivery report must say but that must not block a run: a gate
  // the project turned off, a gate whose tools are missing, a suite that was
  // already red when the run started. They are never recorded as passes — the
  // report carries them as gaps in what was verified.
  const reported = [];

  // `/asf health` is a delivery-time check for standard/major runs. An
  // auto-opened small run carries the floor (a real test run, see settle.mjs),
  // not the full delivery ceremony — otherwise every one-file fix is steered
  // toward a health audit nobody asked for.
  const health = ledger.latest("health-run");
  // A verdict is only about the tree it measured. The ledger is one per process, so a
  // session that touched two checkouts could carry one's verdict as the other's health
  // fact — and the 2,349-steer loop was exactly that: a `fail` produced by measuring
  // `$HOME`, demanded of a run about one small package. An unlabelled verdict is never
  // held against the run, so a missing label cannot manufacture a gap.
  const healthCovers = health ? coversProject(health.root, root) : true;
  if (scale !== "small") {
    if (!health) {
      missing.push("the code health gate has not been run this session — call the asf_health tool (its verdict is recorded, not claimed)");
    } else if (!healthCovers) {
      missing.push(
        `the code health gate measured "${health.root}", not this project ("${root}") — call asf_health here; ` +
          `a verdict from another tree says nothing about this one, and its violations are not this run's to fix`,
      );
    } else if (health.verdict === "unknown") {
      missing.push("the code health gate ran but produced no verdict — call the asf_health tool again; a run without a verdict is not a pass");
    }
  }

  // Prime directive: code that no longer meets the health standard is refactored, not
  // reported. A recorded `fail` is a measured violation, so it blocks at EVERY scale (an
  // agent that chose to measure must not be able to finish on a red it just recorded) —
  // and it is closable: refactor, then call asf_health again; the LATEST verdict rules.
  //
  // Two exits were missing and produced a 2,349-steer loop (2026-11-11):
  //  - a project that set `gate.mode: "warn"` asked not to be blocked by this
  //    gate. That policy is honoured — but the verdict still says fail, so the
  //    report cannot claim the code is healthy.
  //  - "not-measured" (disabled, or no metric could run) is neither a pass nor
  //    a violation. It is reported, never blocked, and never drawn as a tick.
  if (health && healthCovers && health.verdict === "fail") {
    if (health.mode === "warn") {
      reported.push(`the code health gate measured violations (verdict: fail) — the project set gate.mode: "warn", so this is reported and not blocked; the code is NOT healthy`);
    } else {
      missing.push("the code health gate measured violations (verdict: fail) — refactor the flagged code, then call the asf_health tool again; a failing verdict is not a pass");
    }
  }
  if (health && healthCovers && health.verdict === "not-measured") {
    reported.push("the code health gate did not measure anything (disabled, or no metric could run) — reported as unverified, never as a pass");
  }

  const fullRunsAll = ledger.entries.filter((e) => e.kind === "suite-run" && e.scope === "full");
  // Which checkout a suite actually ran in. The ledger is one per process, so a
  // session that touched two projects could close one's completion gate with the
  // other's green suite. An unlabelled entry is never held against the run — a
  // missing label must not manufacture a gap the agent cannot answer.
  const fullRuns = fullRunsAll.filter((e) => coversProject(e.root, root));
  if (scale !== "small") {
    if (fullRuns.length === 0 && fullRunsAll.length > 0) {
      missing.push(
        `the full test suite was run, but not for this project — the last full run was recorded in ` +
          `"${fullRunsAll[fullRunsAll.length - 1].root}" while this run is about "${root}"; run the suite here`,
      );
    } else if (fullRuns.length === 0) {
      missing.push("the full test suite was not run this session (a subset is not a full run; state the impact area if a subset is genuinely intended)");
    } else if (fullRuns[fullRuns.length - 1].exitCode !== 0) {
      // The LAST full run, not "did any full run ever pass": a session that went
      // green and then finished red is a red session, and a gate that read the
      // earlier green would certify it as verified. (A later SUBSET run does not
      // count here — only a full run can speak for the suite.)
      //
      // A suite that was ALREADY red when the run started is a different fact
      // from a run that broke it. The old rule asked only "did the full suite
      // exit 0 this session", so on a legacy project the gap could not be closed
      // without fixing someone else's failures or claiming a green that never
      // happened — the same unreachable shape as the health loop. Inheritance is
      // checked against a baseline ASF measured itself, test-name by test-name.
      const last = fullRuns[fullRuns.length - 1];
      const inherited = failuresInheritedFromBaseline(last, ledger.latest("baseline-run"));
      if (inherited.ok) {
        reported.push(`the full suite is red at ${inherited.count} failure(s) inherited from the recorded baseline${inherited.head ? ` (${inherited.head})` : ""} — no new failure was introduced; this is pre-existing debt, not this run's regression`);
      } else {
        missing.push(`the full test suite ran but never exited 0 this session${inherited.why ? ` (${inherited.why})` : ""}`);
      }
    }
  }

  if (webTouched) {
    const verified = ledger.has("browser-verify");
    const na = ledger.has("browser-na");
    if (!verified && !na) {
      missing.push("a web surface is touched but no browser verification was recorded — verify it, or record a structured n/a with a reason");
    }
  }

  return { missing, reported, health, fullRuns };
}

/**
 * Render the ledger section for the delivery report. Rendered from entries, so
 * what the reviewer reads is what was observed, not what was asserted.
 */
/** One ledger entry as one line. A table, so a new kind is a row. */
const RENDERERS = {
  "suite-run": (e) =>
    `- suite run: \`${e.command}\` → exit ${e.exitCode}, ${e.testCount} tests (${e.scope}), ${Math.round(e.durationMs / 1000)} s`,
  "baseline-run": (e) =>
    `- baseline \`${e.command}\` at ${String(e.head).slice(0, 8)} → exit ${e.exitCode}, ${e.failing.length} failing before this run touched anything`,
  "health-run": (e) =>
    `- /asf health (${e.level}): ${e.verdict}, scanned ${e.scanned}${e.scanned === 0 ? " — **examined nothing, not a pass**" : ""}`,
  "browser-verify": (e) => `- browser: ${e.page} → ${e.action} → asserts "${e.assertion}"`,
  "browser-na": (e) => `- browser n/a: ${e.reason}`,
  "clean-room": (e) => `- clean-room ${e.package}: ${e.result}`,
  "spec-transition": (e) => `- spec ${e.specId} → ${e.status}: ${String(e.evidence).slice(0, 120)}`,
  "gate-verdict": (e) => `- gate ${e.gate}: ${e.fired ? "FIRED" : "clear"}, scanned ${e.scanned}${e.scanned === 0 ? " (**not a pass**)" : ""}`,
  "gate-block": (e) =>
    `- gate ${e.gate} blocked ${e.rule}: ${e.reason}${e.bypassed ? ` — BYPASSED${e.bypassReason ? ` (${e.bypassReason})` : ""}` : ""}`,
};

export function renderLedger(ledger) {
  const lines = ["## Evidence ledger"];
  if (ledger.entries.length === 0) {
    lines.push("- (no evidence recorded this session — nothing was observed running)");
  }
  for (const e of ledger.entries) {
    const render = RENDERERS[e.kind];
    if (render) lines.push(render(e));
  }
  if (ledger.rejected.length) {
    lines.push(`- rejected entries (${ledger.rejected.length}): ${ledger.rejected.slice(0, 3).join("; ")}${ledger.rejected.length > 3 ? " …" : ""}`);
  }
  return lines.join("\n");
}
