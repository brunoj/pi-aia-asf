/**
 * The load budget — bounded by the model's context window, and by nothing else.
 *
 * Everything ASF marks "(always)" is paid by every agent on every session. The first
 * design bounded it with hand-picked byte ceilings (24,000 per file, 76,000 total). Those
 * numbers were not a property of any model; they were a guess that then had to be
 * defended, and they ran out: by 0.19.0 the total had 53 bytes of headroom, so every new
 * rule forced a split whose only purpose was to satisfy the number. A split is not free —
 * it is the one move that can quietly turn a mandatory rule into an optional read — so a
 * budget that forces splits for no reason makes the standard weaker, not cheaper.
 *
 * PO policy: the always-read set is limited only by the context window. The real cost of
 * instructions is the share of the window they take from the work, so the limit is a
 * SHARE of the actual model's window (measured in tokens, estimated from bytes), and the
 * window is read from the running model at session start. What remains enforced:
 *   - the share: always-read instructions may not take more than ALWAYS_READ_SHARE of the
 *     window, which leaves the rest for code, tool output and conversation;
 *   - preservation: a split (now optional, never forced by a number) may not lose a rule
 *     heading or a P## marker, and every pointer into an appendix must land.
 * An unknown window falls back to the smallest window ASF supports, so a missing model
 * reading can only make the check stricter, never switch it off.
 */
import fs from "node:fs";
import path from "node:path";

/** Bytes per token for English prose and markdown — a conservative (low) estimate. */
export const BYTES_PER_TOKEN = 3.5;

/** The share of the context window always-read instructions may take. */
export const ALWAYS_READ_SHARE = 0.25;

/** The smallest window ASF supports, used when the running model does not report one. */
export const MIN_CONTEXT_WINDOW = 128_000;

/**
 * The run card is injected into every active run's context (open, session_start,
 * session_compact) and re-injected on every reanchor, so its ceiling is about repetition,
 * not about the window: it stays a fixed, renderer-asserted number.
 */
export const RUN_CARD_BYTES = 1_536;

/** Files every agent reads on every session — these are the ones that cost. */
export const ALWAYS_READ = [
  "SKILL.md",
  "references/06b-testing-qa.md",
  "references/06c-code-quality.md",
  "references/06i-completeness.md",
];

/** Estimated tokens for a byte count. Rounded up: an estimate must not flatter. */
export const tokensFor = (bytes) => Math.ceil(bytes / BYTES_PER_TOKEN);

/** The token budget for a context window; an unusable window means the minimum. */
export function budgetFor(contextWindow) {
  const w = Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : MIN_CONTEXT_WINDOW;
  return { contextWindow: w, tokens: Math.floor(w * ALWAYS_READ_SHARE), assumed: w !== contextWindow };
}

export function checkBudget(skillDir, { always = ALWAYS_READ, contextWindow } = {}) {
  const over = [];
  const sizes = {};
  for (const rel of always) {
    const abs = path.join(skillDir, rel);
    if (!fs.existsSync(abs)) {
      over.push({ file: rel, bytes: 0, msg: "listed as always-read but the file is missing" });
      sizes[rel] = 0;
      continue;
    }
    sizes[rel] = Buffer.byteLength(fs.readFileSync(abs));
  }
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  const budget = budgetFor(contextWindow);
  const tokens = tokensFor(total);
  if (tokens > budget.tokens) {
    over.push({
      file: "(always-read total)",
      bytes: total,
      tokens,
      msg: `the always-read set takes ~${tokens} tokens, more than ${Math.round(ALWAYS_READ_SHARE * 100)}% of a ${budget.contextWindow}-token window (${budget.tokens}); move procedure, examples and tables into an explicitly read reference — never a rule`,
    });
  }
  return { over, sizes, total, tokens, budget, share: tokens / budget.contextWindow };
}

const RULE_HEADING = /^## Rule (\d+) — (.+)$/gm;
const P_MARKER = /\bP\d{2}\b/g;

/** Snapshot of what the normative content currently contains. */
export function ruleBaseline(skillDir) {
  const b = fs.readFileSync(path.join(skillDir, "references", "06b-testing-qa.md"), "utf8");
  const rules = [...b.matchAll(RULE_HEADING)].map((m) => ({ n: Number(m[1]), title: m[2].trim() }));
  const markers = new Set();
  for (const f of fs.readdirSync(path.join(skillDir, "references"))) {
    const text = fs.readFileSync(path.join(skillDir, "references", f), "utf8");
    for (const m of text.matchAll(P_MARKER)) markers.add(m[0]);
  }
  for (const m of fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8").matchAll(P_MARKER)) markers.add(m[0]);
  return { rules, markers: [...markers].sort() };
}

/**
 * After a split, nothing may have been lost.
 * @param {object} baseline  a previously captured ruleBaseline()
 */
/** Every rule in the baseline must still exist, with the same title. */
function ruleProblems(now, baseline) {
  const nowRules = new Map(now.rules.map((r) => [r.n, r.title]));
  const problems = [];
  for (const r of baseline.rules) {
    if (!nowRules.has(r.n)) problems.push(`Rule ${r.n} — ${r.title} is gone from 06b-testing-qa.md`);
    else if (nowRules.get(r.n) !== r.title) problems.push(`Rule ${r.n} was retitled: "${r.title}" -> "${nowRules.get(r.n)}"`);
  }
  return problems;
}

/** Normalise a heading or a pointer into the same comparison key. */
const headingKey = (s) => s.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");

/** Problems for one reference file's `file.md §heading` pointers. */
function pointerProblems(skillDir, file) {
  const problems = [];
  const text = fs.readFileSync(path.join(skillDir, "references", file), "utf8");
  for (const m of text.matchAll(/`([0-9a-z-]+\.md)`\s*(?:§|#)\s*`([^`]+)`/g)) {
    const target = path.join(skillDir, "references", m[1]);
    if (!fs.existsSync(target)) {
      problems.push(`${file} points at ${m[1]}, which does not exist`);
      continue;
    }
    const want = headingKey(m[2]);
    if (!want) continue;
    const heads = [...fs.readFileSync(target, "utf8").matchAll(/^#{1,6}\s+(.*)$/gm)].map((h) => headingKey(h[1]));
    if (!heads.includes(want)) problems.push(`${file} points at ${m[1]} §${m[2]}, which is not a heading there`);
  }
  return problems;
}

/**
 * After a split, nothing may have been lost.
 * @param {object} baseline  a previously captured ruleBaseline()
 */
export function verifyRulesPreserved(skillDir, baseline) {
  const now = ruleBaseline(skillDir);
  const problems = ruleProblems(now, baseline);
  const nowMarkers = new Set(now.markers);
  for (const m of baseline.markers) {
    if (!nowMarkers.has(m)) problems.push(`${m} no longer appears anywhere in the normative content`);
  }

  // Pointers into an appendix must land. A pointer to a heading that was renamed is
  // how a rule becomes optional while still looking complete.
  for (const f of fs.readdirSync(path.join(skillDir, "references"))) problems.push(...pointerProblems(skillDir, f));
  return { problems, rules: now.rules.length, markers: now.markers.length };
}
