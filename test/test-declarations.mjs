/**
 * A `.d.mts` that declares an export the module does not have is a lie the
 * compiler believes.
 *
 * Twice in one week the type surface and the module disagreed after a refactor:
 * `blockers.d.mts` still declared `RULE_TEXT` / `refusalStage` / `__resetRefusals`
 * after they moved to `refusals.mjs`, and `settle.d.mts` still declared
 * `MAX_IDENTICAL_STEERS` after the cap was deleted. A `.ts` importing either
 * typechecks clean and gets `undefined` at runtime — the worst kind of drift,
 * because the tool that is supposed to catch it is the one that is wrong.
 *
 * So the declaration files are checked against the real module objects.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const HERE = new URL(".", import.meta.url).pathname;
const REPO = join(HERE, "..");
const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? "  — " + String(detail).slice(0, 300) : ""}`);
};

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".d.mts")) out.push(full);
  }
  return out;
}

/** Exported *runtime* names a `.d.mts` promises: const/let/var/function/class + `export { a as b }`. */
function declaredNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/export\s+(?:declare\s+)?(?:const|let|var|function|async\s+function|class)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const t = part.trim();
      if (!t || /^type\b/.test(t)) continue;
      const as = t.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  names.delete("default");
  return [...names];
}

export async function run() {
  console.log("── 1 — every declared export exists at runtime ──────────────");
  const files = walk(join(REPO, "lib"));
  check("declaration files exist to check at all", files.length > 0, "found none under lib/");

  let names = 0;
  const liars = [];
  const orphans = [];
  for (const file of files) {
    const rel = relative(REPO, file);
    const mod = file.replace(/\.d\.mts$/, ".mjs");
    if (!existsSync(mod)) {
      orphans.push(rel);
      continue;
    }
    let ns;
    try {
      ns = await import(pathToFileURL(mod).href);
    } catch (e) {
      orphans.push(`${rel} (module will not load: ${e.message})`);
      continue;
    }
    const declared = declaredNames(readFileSync(file, "utf8"));
    names += declared.length;
    const missing = declared.filter((n) => !(n in ns));
    if (missing.length) liars.push(`${rel}: ${missing.join(", ")}`);
  }

  check("no declaration file promises an export its module lacks", liars.length === 0, liars.join(" | "));
  check("every declaration file has a module beside it", orphans.length === 0, orphans.join(" | "));
  check("the check is not vacuous", names > 40, `only ${names} declared name(s) inspected`);

  console.log("── 2 — the reverse direction is at least visible ────────────");
  // A module export with no declaration is not a bug (it may be internal), but a
  // *deleted* one is: the declaration would then be the liar, caught above. This
  // row exists so the count above cannot silently shrink to nothing over time.
  check(`inspected ${names} declared export name(s) across ${files.length} module(s)`, names > 40);

  const failed = results.filter((r) => !r.cond).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  return failed === 0;
}
