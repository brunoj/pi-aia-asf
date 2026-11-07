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

import { existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

function findBin(base, name) {
  const p = join(base, "node_modules", ".bin", name);
  return isExecutable(p) ? p : null;
}

function findPkg(base, name) {
  const p = join(base, "node_modules", name);
  return existsSync(p) ? p : null;
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
export function resolveTools(projectRoot) {
  const bases = [
    { dir: ASF_ROOT, source: "asf" },
    { dir: projectRoot, source: "project" },
  ];
  const bins = {};
  const pkgs = {};
  const sources = {};

  for (const [key, spec] of Object.entries(TOOLS)) {
    if (spec.bin) {
      bins[key] = null;
      for (const b of bases) {
        const found = findBin(b.dir, spec.bin);
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
        const found = findPkg(b.dir, spec.pkg);
        if (found) {
          pkgs[key] = found;
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
