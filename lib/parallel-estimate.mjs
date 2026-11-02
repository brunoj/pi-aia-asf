/**
 * Parallel-execution estimator (W3.1).
 *
 * ASF's rule is that parallel implementation is a decision, not an enthusiasm. The
 * decision needs numbers, so this computes them: the serial cost, the critical path
 * under a concurrency cap, the speed-up that cap actually yields, and the conflicts
 * that forbid parallelism in the first place.
 *
 * Two kinds of conflict are checked, because file disjointness alone is not
 * independence. Agents working on disjoint files still break each other when they
 * both touch a shared interface — the silent semantic drift a merge queue cannot see.
 * So a shared interface that neither package declares as provided counts as a
 * dependency, and the answer is serial.
 *
 * Nothing here spawns anything. It answers "is this worth parallelising" and returns
 * the reasons either way, so a refusal is recorded rather than silently omitted.
 */

const MIN_SPEEDUP = 1.3;
const MIN_INDEPENDENT = 3;

/**
 * @param {object} input
 * @param {Array<{id:string, files:string[], interfacesNeeded?:string[], interfacesProvided?:string[], dependsOn?:string[], minutes:number}>} input.packages
 * @param {number} [input.maxConcurrent]
 */
export function estimateParallelism({ packages = [], maxConcurrent = 3 }) {
  const reasons = [];
  const errors = [];

  if (!Array.isArray(packages) || packages.length === 0) {
    return { verdict: "serial", speedup: 1, reasons: ["no work packages declared"], conflicts: [], errors: ["packages is empty"] };
  }

  const byId = new Map();
  for (const p of packages) {
    if (!p.id) errors.push("a package has no id");
    if (byId.has(p.id)) errors.push(`duplicate package id "${p.id}"`);
    if (!Number.isFinite(p.minutes) || p.minutes <= 0) errors.push(`package "${p.id}" has no positive minutes`);
    if (!Array.isArray(p.files) || p.files.length === 0) errors.push(`package "${p.id}" declares no files — independence cannot be verified`);
    byId.set(p.id, p);
  }
  for (const p of packages) {
    for (const d of p.dependsOn || []) {
      if (!byId.has(d)) errors.push(`package "${p.id}" depends on unknown package "${d}"`);
    }
  }
  if (errors.length) return { verdict: "serial", speedup: 1, reasons: ["work packages are not well formed"], conflicts: [], errors };

  // --- conflicts -------------------------------------------------------------
  const conflicts = [];
  for (let i = 0; i < packages.length; i++) {
    for (let j = i + 1; j < packages.length; j++) {
      const a = packages[i], b = packages[j];
      const sharedFiles = (a.files || []).filter((f) => (b.files || []).includes(f));
      if (sharedFiles.length) {
        conflicts.push({ kind: "file", packages: [a.id, b.id], items: sharedFiles });
      }
      // A shared interface is only safe when exactly one side owns it.
      const aProv = new Set(a.interfacesProvided || []);
      const bProv = new Set(b.interfacesProvided || []);
      const aNeed = new Set(a.interfacesNeeded || []);
      const bNeed = new Set(b.interfacesNeeded || []);
      const bothTouch = new Set([...aNeed, ...aProv].filter((x) => bNeed.has(x) || bProv.has(x)));
      const unowned = [...bothTouch].filter((x) => !(aProv.has(x) && bNeed.has(x)) && !(bProv.has(x) && aNeed.has(x)));
      if (unowned.length) {
        conflicts.push({ kind: "interface", packages: [a.id, b.id], items: unowned });
      }
    }
  }

  // --- cycle check -----------------------------------------------------------
  const state = new Map();
  const hasCycle = (id, stack) => {
    if (state.get(id) === "done") return false;
    if (stack.has(id)) return true;
    stack.add(id);
    state.set(id, "visiting");
    for (const d of byId.get(id).dependsOn || []) {
      if (hasCycle(d, stack)) return true;
    }
    stack.delete(id);
    state.set(id, "done");
    return false;
  };
  for (const p of packages) {
    state.clear();
    if (hasCycle(p.id, new Set())) {
      return { verdict: "serial", speedup: 1, reasons: ["dependency cycle among work packages"], conflicts, errors: ["cycle"] };
    }
  }

  // --- serial and critical path ---------------------------------------------
  const serial = packages.reduce((s, p) => s + p.minutes, 0);
  const finish = new Map();
  const earliestFinish = (id) => {
    if (finish.has(id)) return finish.get(id);
    const p = byId.get(id);
    const start = Math.max(0, ...(p.dependsOn || []).map(earliestFinish));
    const f = start + p.minutes;
    finish.set(id, f);
    return f;
  };
  const criticalPath = Math.max(...packages.map((p) => earliestFinish(p.id)));
  const criticalPathIds = packages
    .filter((p) => earliestFinish(p.id) === criticalPath)
    .map((p) => p.id);

  // --- bounded list schedule (what the cap really yields) --------------------
  const cap = Math.max(1, Math.floor(maxConcurrent));
  const remaining = packages.map((p) => ({ ...p, done: false }));
  const doneAt = new Map();
  let clock = 0;
  let guard = 0;
  while (remaining.some((p) => !p.done) && guard++ < 1000) {
    const ready = remaining
      .filter((p) => !p.done && (p.dependsOn || []).every((d) => doneAt.has(d)))
      .sort((a, b) => b.minutes - a.minutes);
    if (!ready.length) break;
    const batch = ready.slice(0, cap);
    const start = Math.max(0, ...(batch.flatMap((p) => (p.dependsOn || []).map((d) => doneAt.get(d) || 0))));
    const end = start + Math.max(...batch.map((p) => p.minutes));
    for (const p of batch) {
      p.done = true;
      doneAt.set(p.id, end);
    }
    clock = Math.max(clock, end);
  }
  const parallel = clock;
  const speedup = parallel > 0 ? serial / parallel : 1;

  // --- verdict ---------------------------------------------------------------
  const independentCount = packages.filter(
    (p) => !(p.dependsOn || []).length && !conflicts.some((c) => c.packages.includes(p.id)),
  ).length;

  if (conflicts.length) {
    const kinds = [...new Set(conflicts.map((c) => c.kind))].join(", ");
    reasons.push(`conflicts of kind ${kinds} — packages are not independent (06d: if two tasks might touch the same file, they are dependent)`);
  }
  if (independentCount < MIN_INDEPENDENT) {
    reasons.push(`only ${independentCount} fully independent package(s); ${MIN_INDEPENDENT} are needed to pay for the fan-out`);
  }
  if (speedup < MIN_SPEEDUP) {
    reasons.push(`critical path ${criticalPath}m vs serial ${serial}m — speed-up ${speedup.toFixed(2)}x is below the ${MIN_SPEEDUP}x floor, so parallelism would cost more than it saves`);
  }

  const verdict = conflicts.length === 0 && independentCount >= MIN_INDEPENDENT && speedup >= MIN_SPEEDUP ? "parallel" : "serial";
  if (verdict === "parallel") {
    reasons.push(`${independentCount} independent packages, speed-up ${speedup.toFixed(2)}x at concurrency ${cap}; join through the serialised queue and run the full suite after rebase`);
  }

  return {
    verdict,
    serial,
    criticalPath,
    criticalPathIds,
    parallel,
    speedup: Number(speedup.toFixed(2)),
    maxConcurrent: cap,
    independentCount,
    conflicts,
    reasons,
    errors: [],
  };
}

/**
 * The join contract (W3.2). Kept as data so a test can assert the queue is
 * single-lane and the suite is not skippable, rather than trusting prose.
 */
export const JOIN_STEPS = Object.freeze([
  "fetch every branch and the current main",
  "rebase the branch onto the updated main",
  "read each diff against its package's DoD — the orchestrator, never a thread",
  "run the FULL suite in the rebased state (unit + integration + E2E)",
  "fast-forward merge only if every check passed",
  "resolve each ticket with its own summary — only after the suite is green",
]);

export const JOIN_FORBIDDEN = Object.freeze([
  "an LLM resolving a merge conflict — re-read the two intents by hand, or stop and ask",
  "merging without the full suite in the rebased state",
  "two joins in flight at once",
  "a thread resolving its own ticket or writing its own summary",
  "a thread editing outside its declared file partition",
]);

/**
 * The parallelism switch (P47). Default OFF, and staying off is the safe reading:
 * parallelism buys elapsed time and costs tokens, and a wrong "yes" costs both. It is
 * a config value, not a dependency — ASF must keep working with no orchestration
 * plugin installed, so nothing here imports one.
 */
export const PARALLEL_DEFAULT = false;
export const MAX_CONCURRENT_CAP = 4; // this box has 4 cores — more threads than cores is just a slower queue

export function readParallelSwitch({ config = {}, env = {} } = {}) {
  const configured = config?.parallel?.enabled === true;
  const oneRun = /^(1|true|yes)$/i.test(String(env.ASF_PARALLEL ?? ""));
  const enabled = configured || oneRun;
  const requested = Number(config?.parallel?.maxConcurrent ?? 3);
  const maxConcurrent = Math.max(1, Math.min(MAX_CONCURRENT_CAP, Number.isFinite(requested) ? requested : 3));
  return {
    enabled,
    maxConcurrent,
    reason: enabled
      ? oneRun && !configured
        ? "enabled for this run only by ASF_PARALLEL — the override does not persist"
        : `enabled by config parallel.enabled, capped at ${maxConcurrent} concurrent`
      : "default OFF — single-agent is the default; enable with parallel.enabled, or ASF_PARALLEL=1 for one run",
  };
}

export function planJoin({ branches = [] }) {
  return {
    order: branches.map((b, i) => ({ branch: b, lane: 0, step: i + 1, steps: JOIN_STEPS })),
    singleLane: true,
    forbidden: JOIN_FORBIDDEN,
  };
}
