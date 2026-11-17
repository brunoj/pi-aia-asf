/**
 * asf_baseline — measure what was ALREADY broken before this run touched it.
 *
 * The completion floor asked "did the full suite exit 0 this session". On a
 * project whose suite was red when the run started, that gap could not be
 * closed: the agent had to either repair 50 unrelated failures or claim a green
 * that never happened. It is the same unreachable shape as the health loop — a
 * blocker with no action behind it — and it was reported by a real run that
 * reproduced the failures on baseline with its own change stashed.
 *
 * The answer is not to weaken the floor. A red suite is still a red suite; what
 * changes is that "red" is now split into "red because of this run" (a blocker)
 * and "red before this run" (reported debt). The split needs evidence, and the
 * evidence has to be measured, not asserted — an agent that could name its own
 * pre-existing failures could name away any regression.
 *
 * So this tool measures them itself, in a DETACHED WORKTREE at the base commit:
 * the working tree is never stashed, reset or touched (a previous attempt at
 * this pattern destroyed uncommitted work), and the failing test names come from
 * the runner's own output. lib/gates/suite-runs.mjs then checks, name by name,
 * that the run introduced nothing new.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exec } from "../../code-health/exec.mjs";
import { deriveSuiteRun, isTestCommand } from "../../gates/suite-runs.mjs";
import { appendEvidence } from "../evidence.ts";

type ExecFn = (cmd: string, args: string[], opts?: Record<string, unknown>) => Promise<{ code: number; stdout: string; stderr: string; timedOut?: boolean }>;

/** The commit the baseline is measured at — the answer to "which baseline?". */
async function headOf(root: string, execFn: ExecFn): Promise<string | null> {
  try {
    const res = await execFn("git", ["rev-parse", "HEAD"], { cwd: root, timeoutMs: 15_000 });
    if (res.code !== 0) return null;
    return String(res.stdout || "").trim() || null;
  } catch {
    // A spawn that throws is the same fact as one that exits non-zero: there is no
    // commit to measure. It must not escape as a crashed tool call.
    return null;
  }
}

/**
 * Run the suite at `head` in a throwaway worktree.
 *
 * A detached worktree is the only safe way to measure the base commit while the
 * agent has uncommitted work in the real tree: `git stash` and `git checkout`
 * both put that work at risk, and one of them has already destroyed some.
 */
async function runAtHead(root: string, head: string, command: string, execFn: ExecFn, timeoutMs: number) {
  const dir = mkdtempSync(join(tmpdir(), "asf-baseline-"));
  try {
    const add = await execFn("git", ["worktree", "add", "--detach", dir, head], { cwd: root, timeoutMs: 60_000 }).catch((e) => ({ code: -1, stdout: "", stderr: String(e && e.message || e) }));
    if (add.code !== 0) return { error: `could not create a worktree at ${head.slice(0, 8)}: ${(add.stderr || add.stdout || "").slice(0, 200)}` };
    const run = await execFn("bash", ["-c", command], { cwd: dir, timeoutMs }).catch((e) => ({ code: -1, stdout: "", stderr: String(e && e.message || e), timedOut: false }));
    if (run.timedOut) return { error: `the baseline run timed out after ${Math.round(timeoutMs / 1000)}s — pass a larger timeoutMs` };
    return { exitCode: run.code, output: `${run.stdout || ""}\n${run.stderr || ""}` };
  } finally {
    try {
      await execFn("git", ["worktree", "remove", "--force", dir], { cwd: root, timeoutMs: 60_000 });
    } catch {
      /* best effort */
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

export function registerBaselineTool(pi: ExtensionAPI, deps: { execFn?: ExecFn } = {}): void {
  const execFn = deps.execFn || (exec as unknown as ExecFn);
  pi.registerTool({
    name: "asf_baseline",
    label: "ASF Baseline",
    description:
      "Measure the test failures that already exist on this branch, before this run changed anything, " +
      "and record them as evidence. Run your full suite command in a throwaway worktree at the base " +
      "commit — your working tree is never stashed or reset. The completion gate then distinguishes " +
      "'the suite was already red' (reported debt) from 'this run broke it' (a blocker). Call this when " +
      "the suite is red and you believe the failures predate your change; it is the only way to claim that.",
    promptSnippet: "Record pre-existing test failures as evidence (throwaway worktree at the base commit)",
    parameters: Type.Object({
      command: Type.String({ description: "The project's full-suite command, exactly as you run it (e.g. 'bash test/run-all.sh', 'pytest -q')." }),
      timeoutMs: Type.Optional(Type.Number({ description: "Max milliseconds for the baseline run (default 120000)." })),
    }),
    async execute(_toolCallId: string, params: { command?: unknown; timeoutMs?: unknown }) {
      // One details shape for every return path: the tool's result type is
      // inferred from the first one, and a path that omits a key fails the type
      // check (or, worse, leaves a reader guessing which keys can be missing).
      const details = (over: Record<string, unknown>) => ({
        recorded: false, error: "", head: "", failing: 0, exitCode: -1, ...over,
      });
      const fail = (text: string, error: string) => ({
        content: [{ type: "text" as const, text }],
        details: details({ error }),
      });
      const command = typeof params?.command === "string" ? params.command.trim() : "";
      if (!command) return fail("asf_baseline needs the full-suite command to measure.", "no command");
      if (!isTestCommand(command)) {
        return fail(
          `asf_baseline: "${command}" is not recognised as a test-suite command, and a lint or typecheck is not a baseline. Pass the command that runs the whole suite.`,
          "not a test command",
        );
      }
      const { measureRoot } = await import("../run.ts");
      const root = await measureRoot();
      const head = await headOf(root, execFn);
      if (!head) {
        return fail(
          `asf_baseline: ${root} is not a git repository, so there is no base commit to measure against. Without one, "these failures predate my change" cannot be checked — and an unchecked claim of that kind is as dangerous as a fabricated green.`,
          "not a git repo",
        );
      }
      const timeoutMs = Number(params?.timeoutMs) > 0 ? Number(params.timeoutMs) : 120_000;
      const started = Date.now();
      const ran = await runAtHead(root, head, command, execFn, timeoutMs);
      if (ran.error) return fail(`asf_baseline: ${ran.error}`, ran.error);

      const derived = deriveSuiteRun(command, { exitCode: ran.exitCode ?? 1, durationMs: Date.now() - started, output: ran.output });
      if (!derived || derived.scope !== "full") {
        return fail(
          `asf_baseline: "${command}" ran as a subset, not the full suite. A baseline of part of the suite cannot license leaving the rest red.`,
          "not a full-suite run",
        );
      }
      const entry = {
        kind: "baseline-run",
        command: derived.command,
        exitCode: derived.exitCode,
        durationMs: derived.durationMs,
        failing: derived.failing,
        scope: derived.scope,
        head,
      };
      const res = appendEvidence(entry);
      const line = `full suite at ${head.slice(0, 8)}: ${command}\n` + (derived.exitCode === 0
        ? `the suite is GREEN at ${head.slice(0, 8)} — so any failure you now see was introduced by this run, and a baseline will not excuse it`
        : `${derived.failing.length} test(s) already failing at ${head.slice(0, 8)}${derived.failing.length ? `: ${derived.failing.slice(0, 5).join(", ")}${derived.failing.length > 5 ? ", …" : ""}` : " (names unreadable from the output)"}`);
      return {
        content: [{ type: "text" as const, text: `baseline recorded${res.ok ? "" : " — REJECTED: " + res.error}\n${line}` }],
        details: details({ recorded: !!res.ok, error: res.ok ? "" : String(res.error), head, failing: derived.failing.length, exitCode: derived.exitCode }),
      };
    },
  });
}
