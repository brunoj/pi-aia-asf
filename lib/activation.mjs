/**
 * Software-work detection — the trigger that makes ASF an active process.
 *
 * The first draft of this detector watched `edit`/`write` only, inside a git work
 * tree, at the second such call. The audit in `RESEARCH-trace-improvements.md` §9
 * measured what that would have missed over 18 days of real sessions:
 *
 *   - **1,329 bash commands that write source** (heredocs, `sed -i`, `printf >`)
 *     — 36% of all source mutations, invisible to an edit/write detector;
 *   - **117 `.sh` mutations** outside the planned extension list, which also had
 *     no C#, Scala, Dart, Zig, Elixir, Lua, protobuf, GraphQL or Makefile.
 *
 * So: bash is inspected for write constructs, the language list is widened, the
 * git requirement is dropped (a repo-less directory is still software work — the
 * git-specific gates simply do not apply there), and activation happens on the
 * **first** source mutation, because "at all times" cannot be satisfied by a
 * threshold. Noise is handled by `/asf passive`, not by ignoring work.
 */

/** Source and ships-config. Deliberately wider than the first draft. */
const SOURCE_EXT = [
  "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs",
  "py", "pyi", "go", "rs",
  "java", "kt", "kts", "scala", "groovy",
  "c", "h", "cpp", "hpp", "cc", "cxx", "hh",
  "cs", "fs", "rb", "php", "swift", "m", "mm",
  "dart", "zig", "ex", "exs", "erl", "hrl", "lua", "r", "jl",
  "sql", "pkl", "proto", "graphql", "gql", "prisma", "avsc",
  "vue", "svelte", "astro",
  "json", "jsonc", "toml", "yaml", "yml", "tf", "tfvars", "hcl",
  "sh", "bash", "zsh", "fish", "ps1",
  "gradle", "cmake", "mk",
];
const SOURCE_EXT_RE = new RegExp(`\\.(${SOURCE_EXT.join("|")})$`, "i");
const SPECIAL_FILES = /^(dockerfile|makefile|gemfile|rakefile|justfile|guardfile|cmakelists\.txt|meson\.build|procfile|containerfile)$/i;

/** Generated, vendored and dependency trees are not anyone's source. */
const SKIP_RE = new RegExp(
  [
    "node_modules", "[/\\\\]dist[/\\\\]", "[/\\\\]build[/\\\\]", "[/\\\\]out[/\\\\]",
    "[/\\\\]target[/\\\\]", "[/\\\\]vendor[/\\\\]", "[/\\\\]\\.venv[/\\\\]",
    "[/\\\\]\\.git[/\\\\]", "[/\\\\]__pycache__[/\\\\]",
    "package-lock\\.json", "yarn\\.lock", "pnpm-lock\\.yaml", "cargo\\.lock",
    "composer\\.lock", "poetry\\.lock", "\\.min\\.(js|css)$", "\\.pyc$",
    "\\.snap$", "[/\\\\]coverage[/\\\\]",
  ].join("|"),
  "i",
);

/** Scratch probes are not software work; they are a shell being thought with. */
// Scratch: tmp-prefixed dirs/files, and loose files directly in /tmp or
// /var/tmp (a project directory UNDER /tmp is real work and stays source).
const SCRATCH_RE = /(^|[/\\])\.?tmp[-.][\w.-]*[/\\]|[/\\]\.?tmp[-.][\w.-]*$|^\/(var\/)?tmp\/[^/]+$/i;

const MUTATING_TOOLS = new Set(["edit", "write", "multiedit", "multi_edit", "notebook-edit", "apply_patch", "str_replace_editor"]);

/**
 * Is this path source (or ships-config)? Docs, notes and assets are deliberately
 * excluded: a session that only writes markdown is not developing software.
 */
export function isSourcePath(p) {
  if (typeof p !== "string" || !p) return false;
  const clean = p.split(/[?#]/)[0].replace(/["'`]+$/g, "");
  if (!clean || SKIP_RE.test(clean) || SCRATCH_RE.test(clean)) return false;
  const base = clean.split(/[/\\]/).pop() || clean;
  if (SPECIAL_FILES.test(base)) return true;
  if (/\.(md|markdown|txt|rst|adoc|png|jpe?g|gif|svg|webp|ico|mp4|webm|pdf|lock)$/i.test(base)) return false;
  return SOURCE_EXT_RE.test(base);
}

/** A path-looking token in a command that ends in a source extension. */
function commandTouchesSource(cmd) {
  const m = cmd.match(/[\w./\\~$-]+\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|c|cpp|cc|h|hpp|cs|rb|php|swift|dart|zig|ex|exs|lua|sql|proto|graphql|vue|svelte|json|yaml|yml|toml|tf|sh|bash|gradle|mk)\b/i);
  return !!m && !SKIP_RE.test(m[0]) && !SCRATCH_RE.test(m[0]);
}

/**
 * Write constructs a shell uses to create or change source without an edit tool.
 * Each branch is a real form seen in the corpus, not a guess:
 * `cat > x.js <<'EOF'`, `python3 - <<'PY' ... open(p,'w')`, `sed -i`, `printf >`,
 * `tee`, `patch`, `git apply`, `node -e writeFileSync`, `cp/mv/install` to source.
 */
const WRITE_CONSTRUCTS = [
  { re: /<<[-~]?\s*['"]?[A-Z_][A-Z0-9_]*['"]?/i, why: "heredoc" },
  // `> path.ts` / `>> path.ts`, allowing quotes and ~/$HOME starts
  { re: /(^|[^0-9<>])>{1,2}\s*["']?[^\s|&;)]+\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|c|cpp|cs|rb|php|swift|json|ya?ml|toml|sh|sql|proto|vue|svelte)\b/i, why: "redirect" },
  { re: /\btee\b[^\n|;&]*\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|c|cpp|rb|php|json|ya?ml|toml|sh)\b/i, why: "tee" },
  { re: /\bsed\b[^\n|;&]*\s-i\b/i, why: "sed -i" },
  { re: /\bgit\s+apply\b|\bpatch\b\s+-p/i, why: "patch" },
  { re: /\b(python3?|perl|ruby|node|deno|bun)\b[^\n]*(-c\s|-<<|<<)/i, why: "scripted edit", needsWrite: /open\s*\([^)]*["'][wa]|writeFileSync|appendFileSync|write_text|>>\s*["']|\.write\s*\(/i },
  { re: /(^|\|\||&&|;)\s*(cp|mv|install)\b[^\n|;&]*\.(ts|tsx|js|jsx|py|go|rs|c|cpp|rb|php|json|ya?ml|toml|sh)\b/i, why: "cp/mv/install to source" },
];

/**
 * Does this bash command write source?
 *
 * Deliberately conservative in one direction only: it must not fire on
 * `grep`, `ls`, `cat` of a file, or a test run. That is why every branch needs an
 * actual write construct *and* a source path (the corpus contains 1,329 genuine
 * writes, and an earlier loose version of this regex matched read-only commands
 * too — that version is not what ships).
 */
export function bashWritesSource(cmd) {
  if (typeof cmd !== "string" || cmd.length < 4) return { writes: false };
  if (SKIP_RE.test(cmd)) return { writes: false };
  for (const w of WRITE_CONSTRUCTS) {
    if (!w.re.test(cmd)) continue;
    if (w.needsWrite && !w.needsWrite.test(cmd)) continue;
    if (!commandTouchesSource(cmd)) continue;
    return { writes: true, via: w.why };
  }
  return { writes: false };
}

/**
 * A hand-spawned pi worker with extensions OFF and write-capable tools.
 *
 * Such a worker edits source with no ASF in its process, so its edits are
 * invisible to every gate here. It is not refused (delegation is legitimate);
 * it is counted as a source mutation of the PARENT run, so the parent's
 * completion floor — a passing test run — still applies to what it wrote.
 * Read-only workers (`-t read,grep,find,ls`, the documented reviewer fallback)
 * are not mutations and are left alone.
 */
export function delegatesUnguardedWrites(cmd) {
  if (typeof cmd !== "string") return false;
  if (!/(^|[\s;&|(])pi\s+(?:[^\n|;&]*\s)?(-p|--print|--mode\s+json)\b/.test(cmd) && !/(^|[\s;&|(])pi\s+-p\b/.test(cmd)) return false;
  if (!/(\s|^)(--no-extensions|-ne)\b/.test(cmd)) return false;
  const tools = cmd.match(/(?:\s)(?:-t|--tools)\s+["']?([\w,\s-]+?)["']?(?=\s+-|\s*$|\s+["'])/);
  if (!tools) return true; // default tool set includes edit, write and bash
  return /\b(edit|write|bash|multiedit|powershell)\b/i.test(tools[1]);
}

/**
 * Classify one tool call.
 * @returns {{mutates: boolean, source: boolean, path: string|null, via: string|null}}
 */
export function classifyToolCall(toolName, input) {
  const name = String(toolName || "").toLowerCase();
  const inp = input && typeof input === "object" ? input : {};
  const path = typeof inp.path === "string" ? inp.path : typeof inp.file_path === "string" ? inp.file_path : null;

  if (MUTATING_TOOLS.has(name)) {
    return { mutates: true, source: isSourcePath(path), path, via: "tool" };
  }
  if (name === "bash" || name === "powershell") {
    const cmd = typeof inp.command === "string" ? inp.command : "";
    if (delegatesUnguardedWrites(cmd)) {
      return { mutates: true, source: true, path: null, via: "bash:unguarded-worker" };
    }
    const w = bashWritesSource(cmd);
    return { mutates: w.writes, source: w.writes, path: null, via: w.writes ? `bash:${w.via}` : null };
  }
  return { mutates: false, source: false, path: null, via: null };
}

/**
 * Should this call open an ASF run?
 *
 * @param {object} o
 * @param {{mutates:boolean,source:boolean}} o.call       classifyToolCall() result
 * @param {object|null} o.activeRun                       state.current, or null
 * @param {string|null} [o.passiveRunId]                  the run the PO marked passive
 */
export function activationDecision({ call, activeRun, passiveRunId = null } = {}) {
  if (!call || !call.mutates || !call.source) return { activate: false };
  if (activeRun && activeRun.phase && activeRun.phase !== "none") {
    if (passiveRunId && activeRun.runId === passiveRunId) return { activate: false, reason: "passive" };
    return { activate: false, reason: "already-active" };
  }
  // A run that was closed (phase none) is not a reason to stay passive: the next
  // piece of software work re-arms ASF. Passive silences *this* run, never the
  // project — otherwise one `/asf passive` at 09:00 would disable enforcement for
  // the rest of the day's real work.
  return { activate: true };
}

/** Exported for the tests and for `/asf` diagnostics. */
export const SOURCE_EXTENSIONS = SOURCE_EXT;
