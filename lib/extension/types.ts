/**
 * Run-state shapes shared by the extension modules.
 */

import { Type } from "typebox";

export type AsfPhase =
  | "none"
  | "classify"
  | "intake"
  | "research"
  | "specs"
  | "adversarial"
  | "plan"
  | "implementation"
  | "verification";

export type AsfScale = "small" | "large";

export interface AsfState {
  workType?: "new-project" | "feature" | "major-bugfix" | "refactor";
  scale?: AsfScale;
  phase: AsfPhase;
  planApproved?: boolean;
  startedAt?: string;
  updatedAt: string;
  /** P1: identity and provenance of the run. */
  runId?: string;
  /** True when the software-work detector opened this run, not a human. */
  auto?: boolean;
  /** What opened it: a command, or the shape of the work seen. */
  trigger?: string;
  /** One line: what this run is for. Goes on the card. */
  objective?: string;
  /** Claimed ticket, when this run is Betamaxx work. */
  ticketId?: string;
  /** P4 working-set anchor: paths this run has changed. */
  filesTouched?: string[];
  /** True once this run changed source — the completion floor then needs a test. */
  sourceMutated?: boolean;
  /** Steers issued, and the exact gaps already raised (never raised twice). */
  steers?: number;
  seenSteers?: string[];
  /** The run the PO silenced with `/asf passive`. */
  passiveRunId?: string;
  /** Epoch ms of the last source mutation in this run. */
  lastMutationAt?: number;
  /** Set when the run needs input ASF genuinely cannot supply. */
  parked?: { reason: string; question: string; at: string };
}

/** Definition-of-done checks (references/06b-testing-qa.md, Rule 10). */
export const QA_CHECKLIST: Array<{ key: string; label: string }> = [
  { key: "build", label: "Typecheck/build passes" },
  { key: "tests", label: "Full test suite green (not a subset) — the gate; Rule 19 never relaxes this checkbox" },
  { key: "regression", label: "Regression test added for every bug fixed this cycle" },
  { key: "triggers", label: "Triggers AND non-triggers tested for conditional behavior" },
  { key: "artifact", label: "Shipped artifact inspected and clean-room installed — performed by the release pipeline (`npm run release` → verify-published), which ASF records when it runs; a run that never ran it has no clean-room evidence to claim" },
  { key: "observable", label: "Observable end state verified as a user would experience it" },
  { key: "browser", label: "Every interface the change TOUCHES exercised through a real browser during the build (06b Rule 9) — page + action + assertion named; n/a with reason if none" },
  { key: "specs", label: "Every MUST spec 'met' with concrete evidence" },
  { key: "trace", label: "Spec-to-code traceability: every met spec has outcome → codePath → test" },
  { key: "code-health", label: "Code Health Gate passed (or enabled:false / gate.mode:warn with the report shown)" },
  { key: "model", label: "Model (06j): every relationship the change touches has a written ownership declaration; store writes have invariant + non-effect tests (06g §3); /asf health model level passes or its findings are accepted with a reason; n/a with reason if no persistence touched" },
  { key: "surface", label: "Every delivered feature is consumed by a surface (UI or API) — nothing dead" },
  { key: "e2e", label: "Feature specs have an end-to-end behavioral test through the real entry point" },
  { key: "honest", label: "Skipped/inconclusive checks reported explicitly" },
];

/** Spec-to-code traceability (M1) — mirrors pi-vigilant's Trace. */
export interface Trace {
  outcome: string;
  codePath: string;
  testFile?: string;
  assertion?: string;
}

export interface SpecItem {
  id: string;
  requirement: string;
  area: string;
  priority: string;
  status: string;
  trace?: Trace;
}

export interface ProjectStateFile {
  current: AsfState | null;
  /** Completed runs, oldest first. `runId` identifies the run; `by` says what closed it
   *  (`auto`, `asf_run_complete`, `phase-none`). Written only through `archiveRun`. */
  history: Array<{ runId?: string | null; workType: string; phase: AsfPhase | string; startedAt: string; endedAt: string; by?: string }>;
}

// ─── Constants & helpers ───────────────────────────────────────────────────

