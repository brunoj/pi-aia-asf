/**
 * `tool_call` blockers (P40) — the objectively blockable, and nothing else.
 *
 * A rule that is decidable from the tool input plus session state should be
 * enforced at the moment of the action, not minutes later by the agent's own
 * reflection. Four qualify. Anything that needs judgement stays a finding,
 * because a gate that guesses is worse than no gate — it trains everyone to
 * route around gates.
 *
 * **Autonomy rule (normative for every ASF gate).** ASF is an autonomous loop;
 * a gate must not become a round-trip to a human. `block: true, reason` returns
 * the reason **to the model**, so blocking is agent-facing feedback — no gate
 * here calls any UI to seek approval. The load-bearing corollary: **every
 * blocker has an autonomous exit the agent can take itself.** A blocker whose
 * only exit is a human decision is misdesigned and belongs in the report, not
 * in the path.
 *
 * **Fail-safe is stated per rule, never inherited.** pi's semantics are that a
 * crashing `tool_call` handler blocks the tool. That is right for the secret
 * rule and wrong for the convenience rules, so `failSafe` is explicit below.
 */

// ─── (a) secret written to a tracked path ──────────────────────────────────
//
// No self-service bypass: the autonomous exit (do not write the secret) costs
// the agent nothing and weakens nothing.

const SECRET_PATTERNS = [
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "AWS secret access key assignment", re: /\baws_secret_access_key\b\s*[:=]\s*["'][A-Za-z0-9/+=]{40}["']/i },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "OpenAI-style key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Stripe key", re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

/** Paths that are never "tracked" for this purpose. */
const SECRET_EXEMPT = /(^|\/)(\.env(\.[^/]+)?|\.gitignore|\.git\/|node_modules\/|.*\.example$|.*\.sample$|test\/fixtures\/|.*\.md$)/;

export function blockSecretWrite(input, ctx = {}) {
  const path = str(input, ["path", "filePath", "file_path", "file"]);
  const content = str(input, ["content", "newText", "new_string", "text"]);
  if (!path || content == null) return { fired: false, scanned: 0 };

  const tracked = ctx.trackedPaths ? ctx.trackedPaths(path) : !SECRET_EXEMPT.test(path);
  if (!tracked) return { fired: false, scanned: 1, detail: `exempt path ${path}` };

  for (const p of SECRET_PATTERNS) {
    if (p.re.test(content)) {
      return {
        fired: true,
        scanned: 1,
        rule: "secret-in-tracked-file",
        reason:
          `refusing to write what looks like a ${p.name} into "${path}". ` +
          `Autonomous exit: read it from the environment or a git-ignored .env, ` +
          `or add the path to .gitignore and write it there. This blocker has no ` +
          `bypass, because not writing the secret is always available to you.`,
      };
    }
  }
  return { fired: false, scanned: 1 };
}

// ─── (b) test subset without the impact statement ───────────────────────────

const TEST_CMD = /(^|[\s&;|(])(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(vitest|jest|pytest|go\s+test|cargo\s+test|make\s+test)\b/;
const SUBSET_HINT = /--\s*(grep|testPathPattern|filter|to-grep)\b|\s-t\s+\S+|\brun\s+\S+\.spec\b|\brun\s+\S+\.test\b|--testNamePattern/;

export function blockTestSubset(input, ctx = {}) {
  const command = str(input, ["command"]);
  if (!command || !TEST_CMD.test(command)) return { fired: false, scanned: 0 };
  if (!SUBSET_HINT.test(command)) return { fired: false, scanned: 1, detail: "full run" };
  if (ctx.impactStated) return { fired: false, scanned: 1, detail: "impact area stated" };

  return {
    fired: true,
    scanned: 1,
    rule: "test-subset-without-impact",
    reason:
      `this runs a test SUBSET without stating the impact area. ` +
      `Autonomous exit: run the full suite (the default), or re-issue with the ` +
      `impact area stated so the subset is a decision rather than a shortcut.`,
  };
}

// ─── (c) push/publish with no recorded full-suite green ─────────────────────

const PUSH_CMD = /\bgit\s+push\b|\b(npm|pnpm|yarn)\s+publish\b|\bnpx\s+semantic-release\b|\bgh\s+release\s+create\b/;

export function blockPushWithoutGreen(input, ctx = {}) {
  const command = str(input, ["command"]);
  if (!command || !PUSH_CMD.test(command)) return { fired: false, scanned: 0 };
  if (ctx.dryRun || /--dry-run\b/.test(command)) return { fired: false, scanned: 1, detail: "dry run" };

  const green = (ctx.suiteRuns || []).some((r) => r.scope === "full" && r.exitCode === 0);
  if (green) return { fired: false, scanned: 1, detail: "full suite green this session" };

  return {
    fired: true,
    scanned: 1,
    rule: "push-without-recorded-green",
    reason:
      `refusing to push/publish: this session has no recorded full-suite green run. ` +
      `Autonomous exit: run the full suite, and once it exits 0 this is unblocked. ` +
      `The gate never moves — the suite does.`,
  };
}

// ─── (d) destructive git with a dirty tree ──────────────────────────────────

const DESTRUCTIVE_GIT = /\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f[a-zA-Z]*|checkout\s+--\s|restore\s+--source|stash\s+(drop|clear)|push\s+(-f|--force))\b/;

export function blockDestructiveGitDirty(input, ctx = {}) {
  const command = str(input, ["command"]);
  if (!command || !DESTRUCTIVE_GIT.test(command)) return { fired: false, scanned: 0 };
  if (/\bgit\s+clean\s+-n\b|--dry-run\b/.test(command)) return { fired: false, scanned: 1, detail: "dry run" };
  if (!ctx.dirty) return { fired: false, scanned: 1, detail: "tree is clean" };

  return {
    fired: true,
    scanned: 1,
    rule: "destructive-git-dirty-tree",
    reason:
      `refusing a destructive git command while the working tree is dirty — it would discard uncommitted work. ` +
      `Autonomous exit: commit the work, or stash it with a message, then re-run.`,
  };
}

// ─── Registry ──────────────────────────────────────────────────────────────

/**
 * The four blockers. `failSafe` says what happens when the blocker itself
 * throws: `block` for the secret rule (a broken secret check must not let a
 * secret through), `allow` for the three convenience rules (a broken convenience
 * check must not stop the loop — and it reports itself rather than passing
 * silently).
 */
export const BLOCKERS = [
  { name: "secret-in-tracked-file", run: blockSecretWrite, failSafe: "block", switch: "gate.block.secret", criticality: "high", bypassable: false },
  { name: "test-subset-without-impact", run: blockTestSubset, failSafe: "allow", switch: "gate.block.testSubset", criticality: "low", bypassable: true },
  { name: "push-without-recorded-green", run: blockPushWithoutGreen, failSafe: "allow", switch: "gate.block.pushGate", criticality: "high", bypassable: true },
  { name: "destructive-git-dirty-tree", run: blockDestructiveGitDirty, failSafe: "allow", switch: "gate.block.destructiveGit", criticality: "medium", bypassable: true },
];

function str(input, keys) {
  if (!input || typeof input !== "object") return null;
  for (const k of keys) {
    const v = input[k];
    if (typeof v === "string" && v.length) return v;
  }
  return null;
}

/**
 * Run the enabled blockers over one tool call.
 *
 * Returns `{ block: true, reason }` in pi's shape, or `null` to allow. Every
 * result — fired or not — is returned in `verdicts` so the ledger can record
 * what was actually examined.
 */
export function evaluateBlockers(toolName, input, ctx = {}, { enabled = {} } = {}) {
  const verdicts = [];
  for (const b of BLOCKERS) {
    if (enabled[b.switch] === false) {
      verdicts.push({ gate: b.name, fired: false, scanned: 0, skipped: "disabled" });
      continue;
    }
    let v;
    try {
      v = b.run(input, { ...ctx, toolName });
    } catch (e) {
      const err = (e && e.message) || String(e);
      verdicts.push({ gate: b.name, fired: b.failSafe === "block", scanned: 0, error: err });
      if (b.failSafe === "block") {
        return {
          block: true,
          reason: `${b.name}: the check itself failed (${err}) and this rule blocks on failure by design — a secret check that cannot run is not a pass. Fix the check or record a structured n/a.`,
          verdicts,
        };
      }
      continue; // degrade to allow, reported
    }
    verdicts.push({ gate: b.name, ...v });
    if (v.fired) {
      return { block: true, reason: `${b.name}: ${v.reason}`, rule: b.name, verdicts };
    }
  }
  return { block: false, verdicts };
}
