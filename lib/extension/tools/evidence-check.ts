/**
 * asf_evidence_check — can this install produce what its gates demand?
 *
 * The invariant "every evidence kind a gate requires has a producer" is the difference
 * between a warranted loop and the unwarranted one of 2026-11-07: a run steered
 * forever at evidence its own hands cannot record. The repository asserts it in
 * `test/test-evidence-kinds.mjs`, but `test/` is not shipped, so a session with a
 * broken or half-updated install had no way to find out — it could only be steered,
 * and steered, and steered, at a gap that was never closable from inside.
 *
 * This is that way. It reads the installed package's own files (never the user's
 * project) and answers one question, so "the gate is stuck on something impossible"
 * becomes a checkable fact instead of a guess.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface Coverage {
  kinds: string[];
  required: string[];
  producers: Record<string, string[]>;
  orphans: string[];
  requiredOrphans: string[];
  files: number;
}

/** One details shape for every branch: a union whose branches disagree about which
 *  fields exist makes the host read `error` as required and reject the tool. */
export function details() {
  return {
    action: "evidence-check",
    ok: false,
    error: "",
    kind: "",
    required: false,
    producers: [] as string[],
    kinds: 0,
    orphans: [] as string[],
    requiredOrphans: [] as string[],
    requiredList: [] as string[],
  };
}

async function coverage(): Promise<{ coverage: Coverage; gap: { gap: string; remedy: string } | null; root: string }> {
  const { ASF_ROOT } = await import("../../code-health/tools.mjs");
  const { ENTRY_KINDS } = await import("../../gates/ledger.mjs");
  const { evidenceCoverage, coverageGap } = await import("../../gates/evidence-coverage.mjs");
  const cov = evidenceCoverage(ASF_ROOT, ENTRY_KINDS) as Coverage;
  return { coverage: cov, gap: coverageGap(cov) as { gap: string; remedy: string } | null, root: String(ASF_ROOT) };
}

/** The answer about one kind: who records it, or the honest fact that nobody does. */
export function reportKind(cov: Coverage, kind: string) {
  const d = details();
  d.kind = kind;
  if (!cov.kinds.includes(kind)) {
    return {
      content: [{ type: "text" as const, text: `${kind} is not a ledger kind this install knows (${cov.kinds.join(", ")})` }],
      details: d,
    };
  }
  const producers = cov.producers[kind] || [];
  const required = cov.required.includes(kind);
  const text = producers.length
    ? `${kind}: produced by ${producers.join(", ")}${required ? " (required by a gate)" : ""}`
    : `${kind}: NOTHING in the installed package records it${required ? " — and a gate requires it, so no run can close on it" : " (nothing requires it either: dead weight)"}`;
  return {
    content: [{ type: "text" as const, text }],
    details: { ...d, ok: producers.length > 0, producers, required },
  };
}

/** The whole picture, said plainly: sound, or broken in a way no effort can fix. */
export function reportAll(cov: Coverage, gap: { gap: string; remedy: string } | null, root: string) {
  const d = details();
  const text = gap
    ? `ASF install at ${root}: ${gap.gap}\n${gap.remedy}\n\n${cov.kinds.length} kinds over ${cov.files} files; required by gates: ${cov.required.join(", ")}`
    : `ASF install at ${root} is sound: ${cov.kinds.length} evidence kinds over ${cov.files} files, each with a producer; ${cov.required.length} of them are required by a gate (${cov.required.join(", ")}).`;
  return {
    content: [{ type: "text" as const, text }],
    details: {
      ...d,
      ok: !gap,
      kinds: cov.kinds.length,
      required: cov.required.length > 0,
      requiredList: cov.required,
      orphans: cov.orphans,
      requiredOrphans: cov.requiredOrphans,
    },
  };
}

/**
 * A check that could not run is not a check that passed. This is its own function so
 * the claim is testable: a mutation that made the catch branch report `ok: true` was
 * invisible while nothing ever drove the failure path.
 */
export function reportFailure(error: string) {
  return {
    content: [{ type: "text" as const, text: `evidence coverage could not be checked: ${error}` }],
    details: { ...details(), error },
  };
}

export function registerEvidenceCheckTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "asf_evidence_check",
    label: "ASF Evidence Coverage",
    description:
      "Check whether the installed ASF can actually produce every kind of evidence its gates demand. " +
      "Call this when a run keeps being steered at the same evidence gap and you cannot close it — an " +
      "unproducible kind is a broken install, not unfinished work, and no amount of effort closes it. " +
      "Reads ASF's own installed files, never the user's project.",
    promptSnippet: "Check that every gate-required evidence kind has a producer in this install",
    parameters: Type.Object({
      kind: Type.Optional(
        Type.String({
          description: "Report only this evidence kind (e.g. 'browser-verify'); omit for the whole picture.",
        }),
      ),
    }),

    async execute(_toolCallId: string, params: { kind?: unknown }) {
      try {
        const { coverage: cov, gap, root } = await coverage();
        const kind = typeof params.kind === "string" ? params.kind.trim() : "";
        return kind ? reportKind(cov, kind) : reportAll(cov, gap, root);
      } catch (e) {
        return reportFailure(String((e as Error)?.message || e));
      }
    },
  });
}
