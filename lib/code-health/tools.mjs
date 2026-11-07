/**
 * Code Health Gate — tool resolution.
 *
 * The gate measures nothing without its tools, and a project that happens not to
 * ship eslint/jscpd/madge is not a project without complexity problems. So the
 * tools are ASF's OWN dependencies (package.json) and are resolved from ASF
 * first: the same metric means the same thing in every repo, and a fresh clone
 * with an empty node_modules still gets a real measurement instead of eight
 * "tool not installed" skips.
 *
 * Resolution order, per tool:
 *   1. ASF's own node_modules  — deterministic, ships with the package
 *   2. the project's node_modules — a project may pin its own version
 *   3. PATH — a global install
 */

import { existsSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/** ASF's package root (this file is <root>/lib/code-health/tools.mjs). */
export const ASF_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const TOOLS = {
  eslint: { bin: "eslint", pkg: "eslint" },
  sonarjs: { pkg: "eslint-plugin-sonarjs" },
  tsParser: { pkg: "@typescript-eslint/parser" },
  jscpd: { bin: "jscpd", pkg: "jscpd" },
  madge: { bin: "madge", pkg: "madge" },
  depcruise: { bin: "depcruise", pkg: "dependency-cruiser" },
};

function isExecutable(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Locate an installed package's root directory, the way node itself would.
 *
 * A literal `<base>/node_modules/<name>` check is wrong for the layout pi
 * actually installs: npm HOISTS pi-aia-asf's dependencies into a shared
 * node_modules one level up, so the package dir has no node_modules of its own
 * and every tool looked missing — which silently fell through to a system eslint
 * (v8, no flat config) and to eight skips again. require.resolve walks up the
 * real module paths, so it finds the hoisted copy.
 */
function findPkgDir(base, name) {
  // The ancestor walk comes FIRST: it is exactly node's own node_modules
  // resolution, and require.resolve can escape the install entirely (a Debian
  // NODE_PATH found /usr/share/nodejs/eslint before the copy that shipped with
  // pi-aia-asf — the gate would then measure with eslint 8 and fail to run).
  let dir2 = base;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir2, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) {
      try {
        return { dir: candidate, meta: JSON.parse(readFileSync(join(candidate, "package.json"), "utf-8")) };
      } catch { return { dir: candidate, meta: {} }; }
    }
    const up = dirname(dir2);
    if (up === dir2) break;
    dir2 = up;
  }
  try {
    const req = createRequire(join(base, "package.json"));
    let dir = dirname(req.resolve(name));
    for (let i = 0; i < 6; i++) {
      const pj = join(dir, "package.json");
      if (existsSync(pj)) {
        try {
          const meta = JSON.parse(readFileSync(pj, "utf-8"));
          if (meta.name === name) return { dir, meta };
        } catch { /* keep walking */ }
      }
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  } catch { /* packages with no `main` (jscpd) cannot be resolved by name */ }
  const literal = join(base, "node_modules", name);
  if (existsSync(literal)) {
    try {
      return { dir: literal, meta: JSON.parse(readFileSync(join(literal, "package.json"), "utf-8")) };
    } catch { return { dir: literal, meta: {} }; }
  }
  return null;
}

/** The executable a package declares in its own `bin` field. */
function binFromPkg(found, binName) {
  if (!found) return null;
  const bin = found.meta?.bin;
  const rel = typeof bin === "string" ? bin : bin?.[binName];
  if (!rel) return null;
  const p = join(found.dir, rel);
  return isExecutable(p) ? p : null;
}

function findOnPath(name) {
  for (const dir of String(process.env.PATH || "").split(":")) {
    if (!dir) continue;
    const p = join(dir, name);
    if (isExecutable(p)) return p;
  }
  return null;
}

/**
 * Resolve every tool. `bins` holds absolute paths to spawn (never `npx`, which
 * silently installs a different version or nothing at all).
 *
 * @param {string} projectRoot
 * @returns {{eslint:boolean, eslintSonarjs:boolean, jscpd:boolean, madge:boolean,
 *            dependencyCruiser:boolean, typescriptParser:boolean,
 *            bins:Record<string,string|null>, pkgs:Record<string,string|null>,
 *            sources:Record<string,string>}}
 */
export function resolveTools(projectRoot, { asfRoot = ASF_ROOT } = {}) {
  const bases = [
    { dir: asfRoot, source: "asf" },
    { dir: projectRoot, source: "project" },
  ];
  const bins = {};
  const pkgs = {};
  const sources = {};

  for (const [key, spec] of Object.entries(TOOLS)) {
    if (spec.bin) {
      bins[key] = null;
      for (const b of bases) {
        const found = binFromPkg(findPkgDir(b.dir, spec.pkg), spec.bin);
        if (found) {
          bins[key] = found;
          sources[key] = b.source;
          break;
        }
      }
      if (!bins[key]) {
        const onPath = findOnPath(spec.bin);
        if (onPath) {
          bins[key] = onPath;
          sources[key] = "path";
        }
      }
    }
    if (spec.pkg) {
      pkgs[key] = null;
      for (const b of bases) {
        const found = findPkgDir(b.dir, spec.pkg);
        if (found) {
          pkgs[key] = found.dir;
          if (!sources[key]) sources[key] = b.source;
          break;
        }
      }
    }
  }

  // eslint is usable when its binary exists; the sonarjs rules only when the
  // plugin package is there too. A missing plugin must not disable the six
  // eslint metrics that do not need it.
  const eslint = !!bins.eslint;
  return {
    eslint,
    eslintSonarjs: eslint && !!pkgs.sonarjs,
    jscpd: !!bins.jscpd,
    madge: !!bins.madge,
    dependencyCruiser: !!bins.depcruise,
    typescriptParser: !!pkgs.tsParser,
    bins,
    pkgs,
    sources,
  };
}

/**
 * Human-readable list of what is missing, for the "make them requirements"
 * contract: the gate names the package, not just "tool not installed".
 */
export function missingTools(tools) {
  const out = [];
  if (!tools.eslint) out.push("eslint");
  if (!tools.eslintSonarjs) out.push("eslint-plugin-sonarjs");
  if (!tools.jscpd) out.push("jscpd");
  if (!tools.madge) out.push("madge");
  if (!tools.typescriptParser) out.push("@typescript-eslint/parser");
  return out;
}
