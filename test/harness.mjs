// ASF harness: loads the extension with a mocked ExtensionAPI and runs checks.
// Usage: node harness.mjs <path-to-extension-dir> <test-file>
import { createJiti } from 'jiti';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const extDir = process.argv[2];
const testFile = process.argv[3];

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
};

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

// Run the test file with access to the captured registrations
const test = await import(path.resolve(testFile));
if (typeof test.run === 'function') {
  await test.run({ tools, commands, events, api, extDir, invokeCommand });
}
