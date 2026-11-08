/**
 * The refusal ladder (P3).
 *
 * 53% of the refusals the agent ever received (9 of 17) were it walking into the
 * same wall again — `secret-in-tracked-file` fired 3 of its 4 times as a repeat,
 * all on test files with realistic-looking placeholder keys. A remedy in a
 * message that is re-issued identically is not made to stick, so the ladder
 * changes what the agent is *told* before it ever changes what it is *asked*:
 *
 *   1st fire  → refuse + autonomous exit (the text already carried this)
 *   2nd same  → refuse + the rule text itself, so the why and the sanctioned
 *               alternative reach the context instead of just the veto
 *   3rd same  → park for the PO: insisting three times on an irreversible action
 *               with no safe path is exactly the park case, not a nag
 *
 * Split out of `blockers.mjs` (0.17.5): the blockers decide, this decides what
 * the agent is told when it walks into one twice.
 */

// ─── The refusal ladder (P3) ───────────────────────────────────────────────
//
// 53% of the refusals the agent ever received (9 of 17) were it walking into the
// same wall again — `secret-in-tracked-file` fired 3 of its 4 times as a repeat,
// all on test files with realistic-looking placeholder keys. A remedy in a
// message that is re-issued identically is not made to stick, so the ladder
// changes what the agent is *told* before it ever changes what it is *asked*:
//
//   1st fire  → refuse + autonomous exit (the text already carried this)
//   2nd same  → refuse + the rule text itself, so the why and the sanctioned
//               alternative reach the context instead of just the veto
//   3rd same  → park for the PO: insisting three times on an irreversible action
//               with no safe path is exactly the park case, not a nag

/** Normative text per refusal, injected on the second identical fire. */
export const RULE_TEXT = {
  "secret-in-tracked-file":
    "Secrets never go into tracked files, including tests. The sanctioned form is " +
    "a fixture constant that cannot be a real key (sk-test-not-a-real-key), an " +
    "environment variable name read at runtime, or a git-ignored .env. A key " +
    "shape that a scanner can match is a key shape that a scanner will match.",
  "destructive-git-dirty-tree":
    "A destructive git command against a dirty tree discards work that exists " +
    "nowhere else. Commit it, or stash it with a message, then re-run the " +
    "destructive step. The gate is not protecting the tree from you; it is " +
    "protecting the only copy of the change.",
  "push-without-recorded-green":
    "Nothing is published or pushed without a recorded full-suite green run in " +
    "this session. The gate never moves — the suite does. Run the full suite; " +
    "when it exits 0 this is unblocked, and the published artifact is then " +
    "verified from the registry rather than assumed.",
};

const refusals = new Map();

/** Which fire of this identical refusal is this? 1 = first time. */
export function refusalStage(gate, fingerprint) {
  const key = `${gate}|${String(fingerprint || "").slice(0, 200)}`;
  const n = (refusals.get(key) || 0) + 1;
  refusals.set(key, n);
  return n;
}

/** Test hook, and the same reset a new run performs. */
export function __resetRefusals() {
  refusals.clear();
}
