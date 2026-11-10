// ASF harness: loads the extension with a mocked ExtensionAPI and runs checks.
// Usage: node harness.mjs <path-to-extension-dir> <test-file>
import { createJiti } from 'jiti';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const extDir = process.argv[2];
const testFile = process.argv[3];

/*
 * Isolate run state BEFORE anything imports the extension.
 *
 * A suite that forgets to chdir was writing into the developer's LIVE run state —
 * `/etc/passwd` and a scratch path ended up in the real run's `filesTouched`, and the
 * reviewer saw them in the run card. State is the one thing a test can corrupt with no
 * visible failure, so the whole tree is redirected here and no suite can reach the real
 * one. Set ASF_STATE_ROOT yourself (run-all does not) to debug against real state.
 */
if (!process.env.ASF_STATE_ROOT) {
  process.env.ASF_STATE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "asf-harness-state-"));
}

// --- Mock ExtensionAPI ---
const tools = [];
const commands = [];
const events = [];
const api = {
  registerTool: (def) => { tools.push(def); },
  // pi >= 1.0 command contract (RegisteredCommand in pi's extensions/types):
  //   registerCommand(name, { description?, getArgumentCompletions?, handler(args: string, ctx) })
  // A bare function is a LOAD-TIME error in pi ("must define handler()"). Mirror
  // that here: without this the harness accepted the old shape and the extension
  // only blew up when pi actually loaded it.
  registerCommand: (name, options) => {
    if (!options || typeof options !== 'object' || typeof options.handler !== 'function') {
      throw new Error(
        `Command "/${name}" registered by extension "${extDir}/index.ts" must define handler().`,
      );
    }
    commands.push({ name, description: options.description, handler: options.handler });
  },
  on: (ev, fn) => { events.push({ ev, fn }); },
  sendMessage: async () => {},
  getConfig: () => ({}),
  // pi's ExtensionAPI.getAllTools(): every configured tool, not just ASF's own. A
  // real session also has tools other extensions registered (bmx_request_input,
  // browser_*, …); suites add those through `hostTools` to model that session.
  getAllTools: () => [...tools.map((t) => ({ name: t.name })), ...hostTools.map((name) => ({ name }))],
};
// Tools another extension registered in the session being modelled. Mutable on
// purpose: a suite pushes `bmx_request_input` to model a Betamaxx session.
const hostTools = [];

// Invoke a registered command the way pi does: args as one string, handler returns
// void, and everything it wants the user to see arrives through ctx.ui.notify().
async function invokeCommand(name, args = '', ctxExtra = {}) {
  const cmd = commands.find((c) => c.name === name);
  if (!cmd) throw new Error(`command /${name} is not registered`);
  const notices = [];
  const ctx = {
    ui: {
      notify: (message, type = 'info') => notices.push({ message, type }),
      confirm: async () => true,
      select: async () => undefined,
      input: async () => undefined,
      setStatus: () => {},
    },
    hasUI: true,
    mode: 'interactive',
    ...ctxExtra,
  };
  const returned = await cmd.handler(args, ctx);
  return { cmd, notices, text: notices.map((n) => n.message).join('\n'), returned };
}

// Load the extension via jiti (same loader pi uses)
const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const mod = await jiti.import(path.join(extDir, 'index.ts'));
const factory = mod.default || mod;
await factory(api);

// Suites are plain .mjs and cannot import ASF's .ts modules directly (node has no TS
// parser); only this harness has jiti. Hand the loader over rather than making each
// suite spin up its own, so a suite can exercise the extension's own helpers.
const loadTs = (rel) => jiti.import(path.isAbsolute(rel) ? rel : path.join(extDir, rel));

// Run the test file with access to the captured registrations
const test = await import(path.resolve(testFile));
// How a suite says it failed. Two shapes are honoured, and the difference matters:
// a suite that reports failure by RETURNING false used to print its FAILs and still
// be counted green (and an early version of that fix assigned the tools array to
// `ok`, which is always truthy, and discarded the verdict again). A suite that
// exposes its verdict as the module's DEFAULT export was ignored the same way —
// `test.run` was simply absent, so nothing was ever checked. A test runner that
// cannot fail is the most dangerous kind of test runner, so an unreadable verdict
// is now called out instead of passing silently.
let verdict;
if (typeof test.run === 'function') {
  globalThis.__tools = tools;
  verdict = await test.run({ tools, commands, events, api, extDir, invokeCommand, loadTs, hostTools });
} else if (typeof test.default === 'boolean') {
  verdict = test.default;
} else if (typeof test.ok === 'boolean') {
  verdict = test.ok;
} else if (typeof test.selfReports !== 'boolean') {
  // Suites that report their own failure are legitimate — but say so, or the next
  // suite that expects its verdict to be read will be read as nothing at all.
  console.log(`WARNING: ${path.basename(testFile)} exports no run(), no boolean default and no selfReports marker — the runner cannot tell whether it passed. Export async function run() returning the verdict, or export const selfReports = true if it reports its own failure.`);
} else if (!/process\.exit\(1\)|from "node:test"|require\("node:test"\)/.test(fs.readFileSync(path.resolve(testFile), 'utf8'))) {
  // The marker is a claim, and claims get checked: a suite that says it reports its
  // own failure but contains no failure channel is a suite that cannot fail, which is
  // the exact hole this block exists to close.
  console.log(`WARNING: ${path.basename(testFile)} claims selfReports but contains no process.exit(1) and does not use node:test — nothing here can fail the run.`);
}
if (verdict === false) {
  console.log(`SUITE REPORTED FAILURE: ${path.basename(testFile)}`);
  process.exit(1);
}
