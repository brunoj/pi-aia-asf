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
  registerCommand: (name, fn) => { commands.push({ name, fn }); },
  on: (ev, fn) => { events.push({ ev, fn }); },
  sendMessage: async () => {},
  getConfig: () => ({}),
};

// Load the extension via jiti (same loader pi uses)
const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const mod = await jiti.import(path.join(extDir, 'index.ts'));
const factory = mod.default || mod;
await factory(api);

// Run the test file with access to the captured registrations
const test = await import(path.resolve(testFile));
if (typeof test.run === 'function') {
  await test.run({ tools, commands, events, api, extDir });
}
