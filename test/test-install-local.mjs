/**
 * The local-install gate (scripts/install-local.mjs).
 *
 * The failure it exists for: 0.18.0 passed typecheck, the full suite, the "publish
 * landed" poll and the published-artifact load test — and the session kept running
 * 0.17.13, because `~/.pi/agent/npm/package.json` pinned `^0.17.13` and a caret on a
 * `0.x` version does not span a minor. Every gate read the registry or the working
 * tree; none read the copy pi actually loads. So the checks here are deliberately
 * not "did npm say OK": they compare bytes.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  extensionDir,
  isExtensionDir,
  tree,
  diffTrees,
  checkVersion,
} from "../scripts/install-local.mjs";

let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  if (cond) { console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fail++; }
};

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "asf-install-")));

/** A published tree and an installed tree that start identical. */
function pair({ version = "0.18.0", name = "pi-aia-asf" } = {}) {
  const extDir = tmp();
  const published = tmp();
  const installed = path.join(extDir, "node_modules", name);
  fs.mkdirSync(path.join(extDir, "node_modules", name, "lib"), { recursive: true });
  fs.mkdirSync(path.join(published, "lib"), { recursive: true });
  fs.writeFileSync(path.join(extDir, "package.json"), JSON.stringify({ name: "pi-extensions", private: true, dependencies: { [name]: `^${version}` } }));
  for (const dir of [installed, published]) {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version }));
    fs.writeFileSync(path.join(dir, "index.ts"), "export default function ext(){}\n");
    fs.writeFileSync(path.join(dir, "lib", "gates.mjs"), "export const a = 1;\n");
  }
  return { extDir, installed, published, version, name };
}

export async function run() {
console.log("=== 1. an identical install passes ===");
{
  const p = pair();
  const d = diffTrees(p.installed, p.published);
  chk("identical trees are reported as the same", d.same, JSON.stringify(d));
  chk("and the file list is complete", tree(p.published).length === 3, String(tree(p.published).length));
  const v = checkVersion(p.extDir, p.name, p.version);
  chk("the installed version is the released one", v.ok && v.installed === "0.18.0", JSON.stringify(v));
}

console.log("=== 2. the failure that actually happened is caught ===");
{
  // The exact shape of the incident: the pin says ^0.17.13, npm never upgrades across
  // a minor on 0.x, and the directory still holds the OLD package.
  const p = pair();
  fs.writeFileSync(path.join(p.installed, "package.json"), JSON.stringify({ name: p.name, version: "0.17.13" }));
  const v = checkVersion(p.extDir, p.name, "0.18.0");
  chk("a stale install is refused", !v.ok, JSON.stringify(v));
  chk("and the message names the version it found", /0\.17\.13/.test(v.message), v.message);
  chk("and explains the caret-on-0.x cause rather than just failing", /caret|minor/i.test(v.message), v.message);
}

console.log("=== 3. bytes are compared, not version strings ===");
{
  // The check that matters: the version says 0.18.0 and the code is NOT 0.18.0.
  // A gate that only reads package.json passes this; the release must not.
  const p = pair();
  fs.writeFileSync(path.join(p.installed, "lib", "gates.mjs"), "export const a = 999; // hand-patched\n");
  const d = diffTrees(p.installed, p.published);
  chk("a hand-patched file is caught with the version unchanged", !d.same && d.changed.includes(path.join("lib", "gates.mjs")), JSON.stringify(d));
  chk("and checkVersion alone does NOT catch it (so the byte compare is load-bearing)", checkVersion(p.extDir, p.name, p.version).ok);

  const q = pair();
  fs.rmSync(path.join(q.installed, "lib", "gates.mjs"));
  const dm = diffTrees(q.installed, q.published);
  chk("a shipped file missing from the install is caught", !dm.same && dm.missing.includes(path.join("lib", "gates.mjs")), JSON.stringify(dm));

  const r = pair();
  fs.writeFileSync(path.join(r.installed, "lib", "backdoor.mjs"), "export const evil = 1;\n");
  const de = diffTrees(r.installed, r.published);
  chk("a file installed but never published is caught", !de.same && de.extra.includes(path.join("lib", "backdoor.mjs")), JSON.stringify(de));

  const s = pair();
  fs.rmSync(path.join(s.installed, "package.json"));
  chk("NEGATIVE: an install with no package.json is not silently OK", !checkVersion(s.extDir, s.name, s.version).ok);
}

console.log("=== 4. the directory it checks is the directory pi loads ===");
{
  chk("the default is the pi extension dir", extensionDir({}) === path.join(os.homedir(), ".pi", "agent", "npm"), extensionDir({}));
  chk("and an explicit override is honoured", extensionDir({ PI_EXTENSION_DIR: "/tmp/somewhere" }) === "/tmp/somewhere");
  chk("NEGATIVE: an empty override does not override", extensionDir({ PI_EXTENSION_DIR: "   " }) === path.join(os.homedir(), ".pi", "agent", "npm"));

  const good = tmp();
  fs.writeFileSync(path.join(good, "package.json"), JSON.stringify({ name: "pi-extensions", dependencies: { "pi-aia-asf": "^0.1.0" } }));
  chk("a real extension dir is recognised", isExtensionDir(good));
  const empty = tmp();
  chk("NEGATIVE: an empty directory is not an extension dir", !isExtensionDir(empty));
  const noDeps = tmp();
  fs.writeFileSync(path.join(noDeps, "package.json"), JSON.stringify({ name: "x" }));
  chk("NEGATIVE: a package.json without dependencies is not an extension dir", !isExtensionDir(noDeps));
}

console.log(pass === 0 ? "NO CHECKS RAN" : `\n${pass} passed, ${fail} failed`);
return fail === 0 ? "PASS" : "FAIL";
}
