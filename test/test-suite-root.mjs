// A suite run is evidence about ONE checkout. The ledger is one per process, so the
// entry has to carry where it ran, through every hop from observe to ledger, and the
// gate has to refuse to let a sibling checkout's green stand in for this one's.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
export async function run({ events, api }) {
  let pass = 0, fail = 0;
  const chk = (n, c, d) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); c ? pass++ : fail++; };
  const fire = async (ev, p) => { for (const e of events.filter((x) => x.ev === ev)) await e.fn(p); };
  const { sessionFacts, createLedger } = await import("../lib/gates/ledger.mjs");
  // The live handlers write to their own module instance's ledger (jiti hands every
  // import a fresh module), so judge what they PERSIST: that is the real output path.
  const persisted = [];
  api.appendEntry = (type, data) => { if (type === "asf-evidence") persisted.push(data); };
  const ledger = createLedger();
  const sync = () => { for (const e of persisted.splice(0)) ledger.append(e); };
  // a passing health run, so the only open question is the suite
  ledger.append({ kind: "health-run", level: "standard", verdict: "pass", scanned: 9 });

  const a = fs.mkdtempSync(path.join(os.tmpdir(), "asf-sr-a-"));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), "asf-sr-b-"));
  try {
    // Through the REAL handlers: observe at tool_call, record at tool_result.
    await fire("tool_call", { toolName: "bash", input: { command: `cd ${b} && npm test` }, toolCallId: "sr1" });
    await fire("tool_result", { toolCallId: "sr1", content: [{ type: "text", text: "ok" }], isError: false });
    sync();
    const rec = ledger.entries.find((e) => e.kind === "suite-run");
    chk("the recorded ledger entry says where the suite ran", rec?.root === b, rec?.root);
    chk("NEGATIVE: that root is the cd target, not the session cwd", rec?.root !== process.cwd(), rec?.root);

    const f = sessionFacts(ledger, { scale: "standard", root: a });
    chk("NEGATIVE: the green suite in checkout B does not satisfy checkout A", f.missing.some((g) => /not for this project/.test(g)), f.missing.join("; ").slice(0, 90));
    const g = sessionFacts(ledger, { scale: "standard", root: b });
    chk("but it does satisfy checkout B", !g.missing.some((x) => /full test suite/.test(x)), g.missing.join("; ").slice(0, 90));

    // A failing test run must carry the root too — the red branch reads it as well.
    await fire("tool_call", { toolName: "bash", input: { command: `cd ${a} && npm test` }, toolCallId: "sr2" });
    await fire("tool_result", { toolCallId: "sr2", content: [{ type: "text", text: "boom" }], isError: true });
    sync();
    const red = ledger.entries.filter((e) => e.kind === "suite-run").pop();
    chk("a red run carries its root as well", red?.exitCode === 1 && !!red?.root && red.root.endsWith(path.basename(a)), JSON.stringify({ c: red?.exitCode, r: red?.root }));
  } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
  console.log(`\n${pass} passed, ${fail} failed`); return fail;
}
