/**
 * What counts as CITING a decision — the completion floor's whole basis.
 *
 * This is its own suite because the runtime that tracks citations is session-scoped
 * by design: one pi session, one project. A second project inside the same module
 * would inherit the first project's citations and recordations, and every assertion
 * here would pass for the wrong reason.
 *
 * The rule being pinned: a citation is text the run AUTHORED. An id that appears in
 * a tool's parameters is register traffic — `action=get id=ADR-0007` is reading the
 * register, not endorsing it. If a parameter counted, the first lookup would satisfy
 * cite-or-record and the floor would close itself.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { projectKey, __clearProjectCache } from "../lib/project.mjs";
import { homeStateDir } from "../lib/home.mjs";
import { addDecision } from "../lib/decisions/consult.mjs";

let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  if (cond) { console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fail++; }
};

const originalCwd = process.cwd();

const RECORD = `---
id: ADR-0007
status: accepted
title: secrets are read from the environment at boot
decision: secrets are read from the environment at boot, never baked into a file
decided: 2026-11-10
applies_to: ["src/**"]
origin: user
user_instructed: "never bake secrets into the bundle"
---

## Decision
Secrets are read from the environment at boot, never baked into a file.

## Context and Problem Statement
Bundled secrets leak into the artifact and into git history.

## Options considered
- **environment at boot** — taken.
- **bake into the bundle** — rejected: the artifact becomes a credential.

## Consequences
Deploy must supply the environment; nothing secret is committed.
`;

export async function run({ events }) {
  const on = (ev) => events.filter((e) => e.ev === ev).map((e) => e.fn);
  const toolCall = async (toolName, input, id = `tc-${Math.random()}`) => {
    let out;
    for (const fn of on("tool_call")) out = (await fn({ toolName, input, toolCallId: id })) || out;
    return out;
  };
  const settle = async () => {
    let out;
    for (const fn of on("agent_before_settle")) {
      out = await fn({ type: "agent_before_settle", outcome: "completed", entries: [], context: { canContinue: false } });
    }
    return out;
  };
  const tool = (name) => (typeof globalThis.__tools !== "undefined" ? globalThis.__tools : []).find((t) => t.name === name);
  const gateOf = (out) => (out?.entries || []).filter((e) => e.customType === "asf-completion-gate").map((e) => String(e.content || "")).join("\n");

  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-dec-cite-")));
  const key = projectKey(root);
  process.chdir(root);
  __clearProjectCache();
  try {
    for (const fn of on("session_start")) await fn({});
    const decisionsDir = path.join(root, ".asf", "decisions");
    fs.mkdirSync(decisionsDir, { recursive: true });
    fs.writeFileSync(path.join(decisionsDir, "0001-secrets.md"), RECORD);

    console.log("=== 1. a parameter that names a decision is not a citation ===");
    await toolCall("write", { path: "src/a.ts", content: "export const a = 1;\n" });
    // Reading the record satisfies the READ floor, so the only thing left open is
    // the citation gap — the assertion cannot pass on the read gap's wording.
    const decTool = tool("asf_decisions");
    await decTool.execute("t-get", { action: "get", id: "ADR-0007" });
    await toolCall("asf_decisions", { action: "get", id: "ADR-0007" });
    await toolCall("bash", { command: "grep -r ADR-0007 src" });
    await toolCall("read", { path: "src/a.ts" });
    const open = gateOf(await settle());
    chk("the citation gap is still open after the id appeared in parameters", /ADR-0007/.test(open) && /never cited it/i.test(open), open.split("\n").find((l) => /ADR-0007/.test(l)) || open.slice(0, 80));

    console.log("=== 2. text the run wrote IS a citation ===");
    await toolCall("write", { path: "docs/boot.md", content: "config is read from the environment per ADR-0007\n" });
    const shut = gateOf(await settle());
    chk("authored text naming the decision closes the gap", !/never cited it/i.test(shut), shut.split("\n").find((l) => /ADR-0007/.test(l)) || "closed");

    console.log("=== 3. the register on disk is the authority for taken ids ===");
    // The tool always passes the records it loaded; the store must not need that
    // courtesy, or a caller that omits it could mint a second ADR-0007.
    const dup = addDecision(root, {
      record: { id: "ADR-0007", title: "a second claim to the same number", decision: "secrets may be baked into the bundle", applies_to: ["src/**"], user_instructed: "bake them in" },
      body: "## Decision\nbake them in\n\n## Context and Problem Statement\nconvenience.\n\n## Options considered\n- **environment** — rejected.\n- **bundle** — taken.\n\n## Consequences\nThe artifact becomes a credential.\n",
      config: {},
    });
    chk("a second record claiming an existing id is REFUSED", dup.ok === false && /duplicate id/i.test(JSON.stringify(dup.problems || [])), JSON.stringify(dup.problems || []).slice(0, 80));
    chk("and nothing was written for it", !fs.existsSync(path.join(decisionsDir, "0001-a-second-claim-to-the-same-number.md")));

    console.log("=== 4. a register OPERATION is not a citation ===");
    // The register tool's own params carry authored text (a record's body), and a
    // body naturally names the decisions it follows. If the observer read those,
    // writing one record would silently "cite" every decision it mentions and the
    // completion floor would be satisfied by paperwork.
    fs.writeFileSync(
      path.join(decisionsDir, "0008-layout.md"),
      RECORD.replace(/ADR-0007/g, "ADR-0008").replace(/secrets are read from the environment at boot/g, "docs live under docs/ and are never generated"),
    );
    await toolCall("asf_decisions", {
      action: "record",
      title: "docs are hand-written",
      decision: "docs are hand-written under docs/, never generated",
      applies_to: ["docs/**"],
      body: "## Decision\nhand-written\n\n## Context and Problem Statement\ntrust.\n\n## Options considered\n- **hand-written** — taken, per ADR-0008.\n- **generated** — rejected.\n\n## Consequences\nDrift is possible.\n",
    });
    const seen = String((await decTool.execute("t-check2", { action: "check" }))?.content?.[0]?.text || "");
    chk("a record body naming a decision does not cite it", !/cited \[[^\]]*ADR-0008/.test(seen), seen.split("\n").find((l) => l.startsWith("this run:")) || seen.slice(0, 60));
  } finally {
    try { process.chdir(originalCwd); } catch { /* gone */ }
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(homeStateDir(root, key), { recursive: true, force: true });
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exit(1);
}
