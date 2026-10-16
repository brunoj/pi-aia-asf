/**
 * ASF's obligations declaration file — loader and validator (P39).
 *
 * The container lives in the loop guard; **ASF ships the content**. This module
 * validates ASF's own file against the guard's vocabulary before it is ever
 * handed over, so a malformed declaration is an ASF bug caught by ASF's suite
 * rather than a silent absence at the guard.
 *
 * The vocabulary below is a **copy**, and the guard is its authority. It is
 * duplicated deliberately: ASF must not import the guard (the guard works
 * without ASF and ASF must work without the guard). `test-gates.mjs` asserts
 * this copy still matches what the guard accepts, so drift fails loudly here.
 *
 * **Enforcement, never meaning.** A declaration records which check enforces a
 * rule; what the rule requires stays in the reference prose. The bidirectional
 * assertion (P44) is what keeps the two from drifting apart.
 */

import fs from "node:fs";
import path from "node:path";

/** The guard's accepted trigger vocabulary. Authority: the guard's own suite. */
export const TRIGGER_LITERALS = ["always"];
export const TRIGGER_PREFIXES = ["area:", "path-glob:", "tool:", "when-spec-matches:"];
export const PRIORITIES = ["must", "should", "nice-to-have"];
export const CLASSES = ["H", "M", "S"];
export const SIGNAL_KINDS = ["scan", "test"];

/** Where ASF's declaration file lives inside the package. */
export function declarationPath(repoRoot) {
  return path.join(repoRoot, "obligations.d", "aia-asf.json");
}

export function validateTrigger(expr) {
  const t = String(expr || "").trim();
  if (!t) return "empty trigger";
  if (TRIGGER_LITERALS.includes(t)) return null;
  for (const p of TRIGGER_PREFIXES) {
    if (t.startsWith(p)) {
      const value = t.slice(p.length).trim();
      if (!value) return `trigger "${expr}" has an empty value after "${p}"`;
      if (p === "when-spec-matches:") {
        // Alternation with | is fine inside a regex; reject only real syntax errors.
        try {
          new RegExp(value);
        } catch (e) {
          return `trigger "${expr}" is not a valid regular expression: ${e.message}`;
        }
      }
      return null;
    }
  }
  return `unknown trigger "${expr}" — accepted: ${[...TRIGGER_LITERALS, ...TRIGGER_PREFIXES.map((p) => p + "<value>")].join(", ")}`;
}

/**
 * Validate one obligation. `strict` additionally requires the fields ASF owes
 * its own reviewers: every H and M obligation must name a test file *and* an
 * assertion string, mirroring what capture_spec's trace already demands of
 * specs (P44).
 */
export function validateObligation(o, { strict = true } = {}) {
  const problems = [];
  if (!o || typeof o !== "object") return ["obligation is not an object"];
  const need = (k) => {
    if (typeof o[k] !== "string" || !o[k].trim()) problems.push(`"${k}" must be a non-empty string`);
  };
  need("id");
  need("requirement");
  need("area");
  need("requirement");

  if (!PRIORITIES.includes(o.priority)) problems.push(`priority must be one of ${PRIORITIES.join(", ")}`);
  if (!CLASSES.includes(o.class)) problems.push(`class must be one of ${CLASSES.join(", ")} — the enforcement class is never omitted`);
  if (!Array.isArray(o.trigger) || o.trigger.length === 0) {
    problems.push("trigger must be a non-empty array");
  } else {
    for (const t of o.trigger) {
      const err = validateTrigger(t);
      if (err) problems.push(err);
    }
  }
  if (o.recurring !== true) problems.push("recurring must be true — a standing obligation that stays met forever is not standing");

  if (!o.signal || typeof o.signal !== "object" || !SIGNAL_KINDS.includes(o.signal.kind)) {
    problems.push(`signal.kind must be one of ${SIGNAL_KINDS.join(", ")}`);
  } else if (o.signal.kind === "scan" && typeof o.signal.pattern !== "string") {
    problems.push('signal.kind "scan" requires signal.pattern');
  } else if (o.signal.kind === "test") {
    if (typeof o.signal.file !== "string") problems.push('signal.kind "test" requires signal.file');
    if (typeof o.signal.assertion !== "string") problems.push('signal.kind "test" requires signal.assertion');
  }

  if (!o.trace || typeof o.trace !== "object" || !o.trace.outcome || !o.trace.codePath) {
    problems.push("trace requires outcome and codePath");
  }

  if (strict && (o.class === "H" || o.class === "M")) {
    if (!o.trace || !o.trace.testFile) problems.push(`a ${o.class}-class obligation must name a test file`);
    if (!o.trace || !o.trace.assertion) problems.push(`a ${o.class}-class obligation must name an assertion string`);
  }
  return problems;
}

/**
 * Load and validate ASF's declaration file.
 *
 * Returns `{ ok, obligations, problems }`. A file that cannot be read or parsed
 * is a **failure**, not an empty list: an absent declaration must never look
 * like a compliant one.
 */
export function loadDeclarations(repoRoot) {
  const file = declarationPath(repoRoot);
  if (!fs.existsSync(file)) {
    return { ok: false, obligations: [], problems: [`${file}: the declaration file is missing — ASF without declared obligations has no enforcement surface`] };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    return { ok: false, obligations: [], problems: [`${file}: could not be parsed (${e.message})`] };
  }

  const problems = [];
  if (parsed.source !== "aia-asf") problems.push(`source must be "aia-asf", got ${JSON.stringify(parsed.source)}`);
  if (!Array.isArray(parsed.obligations) || parsed.obligations.length === 0) {
    problems.push("obligations must be a non-empty array");
    return { ok: false, obligations: [], problems };
  }

  const seen = new Set();
  const obligations = [];
  parsed.obligations.forEach((o, i) => {
    const where = `obligations[${i}] (${o && o.id ? o.id : "no id"})`;
    const p = validateObligation(o).map((x) => `${where}: ${x}`);
    if (p.length) problems.push(...p);
    else obligations.push(o);
    if (o && o.id) {
      if (seen.has(o.id)) problems.push(`${where}: duplicate id "${o.id}"`);
      seen.add(o.id);
    }
  });

  return { ok: problems.length === 0, obligations, problems };
}

/**
 * The bidirectional check (P44): every obligation must point at a test file that
 * exists and contains the assertion it names. A declaration pointing at a test
 * that does not exist is worse than no declaration — it looks like coverage.
 */
export function assertSignalsExist(repoRoot, obligations) {
  const problems = [];
  // The signal assertions are a REPO-TIME check: they compare a declaration
  // against the test suite that enforces it. `/asf rules` runs against the
  // INSTALLED package, which ships no test/ at all — treating that as 17
  // broken declarations would make the command useless for every consumer and
  // would train people to ignore the one report that matters. So: no test
  // directory means "not the declaring repo", said once, and skipped. Where a
  // test directory DOES exist, a missing file or assertion is a hard failure —
  // that is the drift this function exists to catch.
  if (!fs.existsSync(path.join(repoRoot, "test"))) {
    return [`test/ not present under ${repoRoot}: signal assertions skipped — this is not the declaring repo, so declaration-to-test drift was NOT checked`];
  }
  for (const o of obligations) {
    const tf = o.trace && o.trace.testFile;
    if (!tf) continue;
    const abs = path.join(repoRoot, "test", path.basename(tf));
    if (!fs.existsSync(abs)) {
      problems.push(`${o.id}: names test file "${tf}" which does not exist`);
      continue;
    }
    const text = fs.readFileSync(abs, "utf-8");
    const assertion = o.trace.assertion;
    if (assertion && !text.includes(assertion)) {
      problems.push(`${o.id}: names assertion "${assertion}" which does not appear in ${tf}`);
    }
    if (o.signal && o.signal.kind === "test" && o.signal.assertion) {
      const sigFile = path.join(repoRoot, "test", path.basename(o.signal.file));
      if (!fs.existsSync(sigFile)) problems.push(`${o.id}: signal.file "${o.signal.file}" does not exist`);
      else if (!fs.readFileSync(sigFile, "utf-8").includes(o.signal.assertion))
        problems.push(`${o.id}: signal.assertion "${o.signal.assertion}" does not appear in ${o.signal.file}`);
    }
  }
  return problems;
}

/** Render for `/asf rules` — the registry question with an answer. */
export function renderRules(obligations, { area, cls } = {}) {
  const rows = obligations.filter((o) => (!area || o.area === area) && (!cls || o.class === cls));
  const byClass = { H: [], M: [], S: [] };
  for (const o of rows) (byClass[o.class] || (byClass[o.class] = [])).push(o);
  const label = {
    H: "H — hard: cannot be declared done without satisfying it",
    M: "M — mechanical verdict, produced only if the check is run",
    S: "S — self-attested: an expectation, never a blocker",
  };
  const lines = [`# ASF obligations (${rows.length})`, ""];
  for (const c of ["H", "M", "S"]) {
    if (!byClass[c] || byClass[c].length === 0) continue;
    lines.push(`## ${label[c]}`);
    for (const o of byClass[c]) {
      lines.push(`- **${o.id}** [${o.priority}] (${o.area})`);
      lines.push(`  - ${o.requirement}`);
      lines.push(`  - triggers: ${o.trigger.join(" | ")}`);
      lines.push(`  - enforced by: ${o.trace.testFile || "—"}${o.trace.assertion ? ` asserts "${o.trace.assertion}"` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
