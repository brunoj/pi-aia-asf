/**
 * Source-file discovery for the health gate.
 *
 * Its own module so model.mjs can use it without importing run.mjs, which
 * imports model.mjs — that pair was a real circular dependency the gate found
 * in ASF itself once madge was actually installed.
 */

import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { DEFAULT_IGNORE, isIgnored } from "./glob.mjs";

/**
 * Recursively list source files under root, skipping ignored dirs/files.
 *
 * `ignorePatterns` are the PROJECT's own (`.asf/code-health.json` → ignore).
 * They are matched as globs against the relative path, and DEFAULT_IGNORE
 * (minified bundles, generated trees, dotfiles) is always applied on top.
 * Pass `null` only when there is genuinely no project config — the spawners
 * used to do that unconditionally, which is how a project's ignore list came to
 * be discarded while the gate still claimed to honour it.
 */
export function listSourceFiles(root, ignorePatterns, opts = {}) {
  const patterns = [...DEFAULT_IGNORE, ...(Array.isArray(ignorePatterns) ? ignorePatterns : [])];
  const ignoreDirs = new Set([
    "node_modules", ".git", "dist", "build", "coverage", "test", "tests", "__tests__", "fixtures",
    ".next", ".cache",
    // vendored / generated trees: measuring a dependency's code says nothing
    // about this project, and on a home directory it produced 958 findings from
    // Python site-packages.
    "site-packages", "dist-packages", "venv", ".venv", "env", ".tox", "__pycache__",
    "vendor", "third_party", "bower_components", "target", "Pods", ".gradle", ".m2",
  ]);
  const out = [];
  /** Tool state and vendored trees are not this project's source. */
  const skipDir = (name, rel) => {
    if (name.startsWith(".")) return true;
    if (ignoreDirs.has(name)) return true;
    return rel.split(sep).some((part) => ignoreDirs.has(part));
  };

  const keepFile = (name, rel) => {
    if (/\.(test|spec)\.[^.]+$/.test(name)) return false;
    return !isIgnored(rel, patterns);
  };
  let excluded = 0;

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs);
      if (e.isDirectory()) {
        if (!skipDir(e.name, rel)) walk(abs);
      } else if (e.isFile()) {
        if (keepFile(e.name, rel)) out.push(rel);
        else if (!/\.(test|spec)\.[^.]+$/.test(e.name)) excluded++;
      }
    }
  };
  walk(root);
  // The count is what makes an exclusion auditable: a gate that quietly
  // measured nothing would otherwise look identical to one that measured
  // everything and found it clean.
  if (opts.withExclusions) return { files: out, excluded };
  return out;
}

/**
 * Detect which metric tools are available. Resolution is ASF-first (see
 * tools.mjs): the gate ships its own toolchain, so a project without eslint is
 * still measured rather than skipped.
 */
export function detectTools(root) {
  const tools = resolveTools(root);
  return {
    eslint: tools.eslint,
    eslintSonarjs: tools.eslintSonarjs,
    jscpd: tools.jscpd,
    madge: tools.madge,
    dependencyCruiser: tools.dependencyCruiser,
    typescriptParser: tools.typescriptParser,
    bins: tools.bins,
    pkgs: tools.pkgs,
    sources: tools.sources,
    missing: missingTools(tools),
  };
}

/**
 * Build a flat-config eslint config for the requested rules and write it to a
 * temp file. Deterministic on purpose: `--no-config-lookup` means the project's
 * own config cannot change what the gate measures, and the plugin/parser are
 * imported by absolute file URL so they resolve from ASF's install.
 */
function writeEslintConfig(rules, tools, root) {
  const imports = [];
  // flat config wants plugin OBJECTS, not names
  let pluginsSrc = "{}";
  const langOpts = ['ecmaVersion: "latest"', 'sourceType: "module"'];
  // Resolve each package's real entry point instead of guessing a path: the
  // plugin's main file moves between major versions (lib/index.js → cjs/plugin.js).
  const entry = (name) => {
    for (const base of [ASF_ROOT, root]) {
      try {
        return pathToFileURL(createRequire(join(base, "package.json")).resolve(name)).href;
      } catch { /* try the next base */ }
    }
    return null;
  };
  const sonarjsEntry = tools.pkgs.sonarjs && entry("eslint-plugin-sonarjs");
  if (sonarjsEntry) {
    // CJS plugin with __esModule: the real object is a nested default.
    imports.push(`import sonarjsMod from ${JSON.stringify(sonarjsEntry)};\nconst sonarjs = sonarjsMod.default || sonarjsMod;`);
    pluginsSrc = "{ sonarjs }";
  }
  const tsParserEntry = tools.pkgs.tsParser && entry("@typescript-eslint/parser");
  if (tsParserEntry) {
    imports.push(`import tsParserMod from ${JSON.stringify(tsParserEntry)};\nconst tsParser = tsParserMod.default || tsParserMod;`);
    langOpts.push("parser: tsParser");
    langOpts.push('parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } }');
  }
  const body = `${imports.join("\n")}
export default [{
  files: ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.jsx", "**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
  languageOptions: { ${langOpts.join(", ")} },
  plugins: ${pluginsSrc},
  rules: ${JSON.stringify(rules, null, 2)},
}];
`;
  const file = join(tmpdir(), `asf-eslint-${process.pid}-${Math.random().toString(36).slice(2, 8)}.mjs`);
  writeFileSync(file, body, "utf-8");
  return file;
}

