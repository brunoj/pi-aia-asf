// Regression: pi >= 1.0 command contract (RegisteredCommand).
//
// Bug evidence (pi 1.0.1, loading the published package):
//   Failed to load extension ".../pi-aia-asf/index.ts": Failed to load extension:
//   Command "/asf" registered by extension ".../index.ts" must define handler().
//
// Cause: both commands were registered as bare functions taking (args: string[], ctx)
// and RETURNING their output as a string. pi now requires
//   registerCommand(name, { description?, handler(args: string, ctx): Promise<void> })
// — args is one raw string and a returned string is dropped: user-visible output must
// go through ctx.ui.notify().
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  if (cond) { console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fail++; }
};

const STATE_ROOT = path.join(os.homedir(), ".pi", "agent", "skills", "aia-asf", "projects");

export async function run({ commands, extDir, api, invokeCommand }) {
  console.log("=== 1. the harness enforces pi's contract (negative control) ===");
  // Without this, the suite itself is the reason the bug shipped: a mock that accepts
  // any shape can never catch a contract change in the host.
  let rejected = false;
  let rejectMsg = "";
  try {
    api.registerCommand("contract-bogus", async () => "old style");
  } catch (e) {
    rejected = true;
    rejectMsg = String(e.message || e);
  }
  chk("harness rejects a bare-function command", rejected, rejectMsg.slice(0, 70));
  chk("rejection names the missing handler()", /must define handler\(\)/.test(rejectMsg));

  console.log("=== 2. both commands use the options-object form ===");
  for (const name of ["asf", "asf-approve"]) {
    const cmd = commands.find((c) => c.name === name);
    chk(`/${name} registered`, !!cmd);
    if (!cmd) continue;
    chk(`/${name} handler is a function`, typeof cmd.handler === "function");
    chk(
      `/${name} has a description`,
      typeof cmd.description === "string" && cmd.description.trim().length > 0,
      (cmd.description || "").slice(0, 50),
    );
  }

  console.log("=== 3. source-level guard: no bare-function registration left ===");
  const src = fs.readFileSync(path.join(extDir, "index.ts"), "utf8");
  chk(
    "no registerCommand(name, fn) form in index.ts",
    !/registerCommand\(\s*"[^"]+"\s*,\s*(async\s*)?\(/.test(src),
  );
  chk(
    "registrations carry handler()",
    (src.match(/handler:/g) || []).length >= 2,
    `handler: x${(src.match(/handler:/g) || []).length}`,
  );

  console.log("=== 4. args arrive as ONE string, output arrives via ctx.ui.notify ===");
  const prevCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asf-contract-"));
  try {
    process.chdir(tmp); // throwaway project name → no persisted ASF state
    const help = await invokeCommand("asf");
    chk(
      "handler returns void (output is not a return value)",
      help.returned === undefined,
      `returned ${typeof help.returned}`,
    );
    chk(
      "/asf with no args notifies the help text",
      help.notices.length === 1 && help.text.includes("/asf health"),
      `notices=${help.notices.length}`,
    );

    const status = await invokeCommand("asf", "status");
    chk(
      "string arg parses into a subcommand",
      status.text.includes("No active ASF session."),
      status.text.slice(0, 40),
    );

    const upper = await invokeCommand("asf", "STATUS");
    chk("subcommand stays case-insensitive", upper.text.includes("No active ASF session."));

    const unknown = await invokeCommand("asf", "nope extra tokens");
    chk("unknown subcommand falls back to help", unknown.text.includes("ASF commands:"));

    const approve = await invokeCommand("asf-approve");
    chk(
      "/asf-approve without a session notifies instead of throwing",
      approve.text.includes("No active ASF session"),
      approve.text.slice(0, 40),
    );
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(path.join(STATE_ROOT, path.basename(tmp)), { recursive: true, force: true });
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exit(1);
}
