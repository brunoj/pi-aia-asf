/**
 * The load budget and its preservation check (W1.4, revised by PO policy:
 * "always-read budget should be only limited by the context window size").
 *
 * Positive: the always-read set fits its share of the SMALLEST supported window (so it
 * fits every supported model), and the committed rule baseline still resolves.
 *
 * Negative controls, all run and required to fire:
 *   - growth past the window share is reported
 *   - an unknown window is judged against the minimum, never skipped
 *   - growth that was over the old fixed byte ceiling but well inside the window is
 *     NOT reported (the old arbitrary number must be gone, not just raised)
 *   - a rule heading deleted from the tree is reported as lost
 * A budget that does not fail when the file grows is not a budget.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { checkBudget, verifyRulesPreserved, ruleBaseline, budgetFor, tokensFor, ALWAYS_READ, ALWAYS_READ_SHARE, MIN_CONTEXT_WINDOW, BYTES_PER_TOKEN, RUN_CARD_BYTES } from "../lib/skill-budget.mjs";
import { CARD_CEILING_BYTES } from "../lib/run-card.mjs";

const chk = (name, cond, detail) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) process.exitCode = 1;
};

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name);
    const b = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(a, b);
    else fs.copyFileSync(a, b);
  }
}

export async function run({ extDir, loadTs, events }) {
  const skillDir = path.join(extDir, "skills", "aia-asf");
  const baselinePath = path.join(extDir, "test", "fixtures", "rule-baseline.json");

  console.log("=== 1. always-read set fits its share of the context window ===");
  const r = checkBudget(skillDir, { contextWindow: MIN_CONTEXT_WINDOW });
  chk(`always-read set within ${ALWAYS_READ_SHARE * 100}% of the smallest supported window (${MIN_CONTEXT_WINDOW})`, r.over.length === 0, r.over.map((o) => o.msg).join("; "));
  console.log(`  INFO  always-read total: ${r.total} bytes ≈ ${r.tokens} tokens = ${(r.share * 100).toFixed(1)}% of ${r.budget.contextWindow}`);
  chk("the limit is a share of the window, not a fixed byte number", budgetFor(200_000).tokens === 200_000 * ALWAYS_READ_SHARE && budgetFor(1_000_000).tokens === 1_000_000 * ALWAYS_READ_SHARE);
  chk("an unknown or broken window is judged against the minimum, never skipped",
    budgetFor(undefined).contextWindow === MIN_CONTEXT_WINDOW && budgetFor(0).contextWindow === MIN_CONTEXT_WINDOW && budgetFor(NaN).assumed === true);
  chk("token estimates round up (an estimate must not flatter)", tokensFor(1) === 1 && tokensFor(BYTES_PER_TOKEN * 10 + 1) === 11);

  console.log("=== 2. the rule baseline still resolves (a split may not lose a rule) ===");
  chk("a committed rule baseline exists", fs.existsSync(baselinePath), baselinePath);
  if (fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const v = verifyRulesPreserved(skillDir, baseline);
    chk("no rule heading lost", v.problems.filter((p) => p.startsWith("Rule")).length === 0, v.problems.join("; "));
    chk("no P## marker lost", v.problems.filter((p) => p.startsWith("P")).length === 0, v.problems.join("; "));
    chk("every appendix pointer lands", v.problems.filter((p) => p.includes("points at")).length === 0, v.problems.join("; "));
    chk("baseline is not vacuous", baseline.rules.length >= 20 && baseline.markers.length >= 20, `${baseline.rules.length} rules, ${baseline.markers.length} markers`);
  }

  console.log("=== 3. negative control: growth must be reported ===");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asf-budget-"));
  try {
    const grown = path.join(tmp, "grown");
    copyTree(skillDir, grown);
    const target = path.join(grown, "references", "06b-testing-qa.md");
    // 20 KB: over the OLD fixed 06b ceiling (28,000) and the old 76,000 total, but far
    // inside a window share. Under the window rule this must NOT be reported.
    fs.appendFileSync(target, `\n\n${"padding ".repeat(2560)}\n`);
    const modest = checkBudget(grown, { contextWindow: MIN_CONTEXT_WINDOW });
    chk("growth past the old fixed byte ceilings, inside the window share, is not reported", modest.over.length === 0, modest.over.map((o) => o.msg).join("; "));
    // Now past the share of the smallest window.
    const need = Math.ceil(budgetFor(MIN_CONTEXT_WINDOW).tokens * BYTES_PER_TOKEN) - modest.total + 1024;
    fs.appendFileSync(target, "x".repeat(Math.max(need, 0)));
    const g = checkBudget(grown, { contextWindow: MIN_CONTEXT_WINDOW });
    const flagged = g.over.find((o) => o.file === "(always-read total)");
    chk("growth past the window share is reported", !!flagged, flagged ? `${flagged.tokens} tokens` : "NOT REPORTED — the budget is decorative");
    chk("and the same set fits a window large enough to hold it", checkBudget(grown, { contextWindow: 4_000_000 }).over.length === 0);
    chk("and an unknown window is held to the minimum (still reported)", checkBudget(grown, {}).over.length > 0);

    console.log("=== 4. negative control: a lost rule must be reported ===");
    const lost = path.join(tmp, "lost");
    copyTree(skillDir, lost);
    const b = path.join(lost, "references", "06b-testing-qa.md");
    const text = fs.readFileSync(b, "utf8");
    const stripped = text.replace(/^## Rule 23 — .*$/m, "## Rule 23 — (heading removed by a careless split)");
    chk("the fixture actually removed the rule heading", stripped !== text);
    fs.writeFileSync(b, stripped);
    const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : ruleBaseline(skillDir);
    const v2 = verifyRulesPreserved(lost, baseline);
    chk("a deleted rule heading is reported as lost", v2.problems.some((p) => p.includes("Rule 23")), v2.problems.slice(0, 2).join("; ") || "NOT REPORTED");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("=== 5. the run card ceiling is registered with the load budget ===");
  chk("the renderer's ceiling equals the registered budget (it cannot creep alone)", CARD_CEILING_BYTES === RUN_CARD_BYTES, `${CARD_CEILING_BYTES} vs ${RUN_CARD_BYTES}`);

  console.log("=== 6. session start judges the RUNNING model's window ===");
  const { budgetNotice } = await loadTs("lib/extension/handlers/lifecycle.ts");
  chk("a large real window raises no notice", budgetNotice(200_000) === null);
  const tiny = budgetNotice(40_000);
  chk("a window too small for the always-read set is told, with the real window named", typeof tiny === "string" && /40000-token window/.test(tiny) && /not a stop/.test(tiny), tiny || "no notice");
  chk("a model that reports no window is judged against the minimum (no notice at today's size)", budgetNotice(undefined) === null);

  // The wiring, not only the function: fire the real session_start with a model that has a
  // small window, then the next turn_end must deliver the notice into the conversation.
  const fire = async (name, ev, ctx) => { let out; for (const h of events.filter((e) => e.ev === name)) out = (await h.fn(ev, ctx)) ?? out; return out; };
  await fire("session_start", {}, { getModel: () => ({ contextWindow: 40_000 }) });
  const delivered = await fire("turn_end", { entries: [], toolResults: [{}] }, {});
  const texts = (delivered?.entries || []).map((e) => String(e.content ?? ""));
  chk("the real session_start reads ctx.getModel().contextWindow and the next turn delivers the notice", texts.some((t) => /40000-token window/.test(t)), texts.join(" | ").slice(0, 200) || "nothing delivered");
  await fire("session_start", {}, { getModel: () => ({ contextWindow: 200_000 }) });
  const quiet = await fire("turn_end", { entries: [], toolResults: [{}] }, {});
  chk("a session on a large window gets no budget notice", !(quiet?.entries || []).some((e) => /token window/.test(String(e.content ?? ""))));
}
