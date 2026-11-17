/**
 * Ignore-pattern matching for the health gate.
 *
 * The first version asked `ignorePatterns.some((p) => p.includes(name))` — a
 * substring test between the PATTERN and the bare FILENAME. It worked for the
 * one shape a test happened to use (`["d3.v5.min.js"]`) and silently matched
 * nothing for every shape a person would actually write (`["public/**"]`,
 * a minified-bundle glob). A silently non-matching ignore list is worse than no
 * ignore list: the project believes its vendored bundles are excluded while
 * the gate measures them and fails the run on them.
 *
 * Semantics here follow .eslintignore/.gitignore, because that is what people
 * already know:
 *   - a pattern with no "/" matches the basename at any depth;
 *   - a pattern with "/" matches the project-relative posix path;
 *   - `**` spans path segments, `*` and `?` do not cross a segment;
 *   - a leading `!` un-ignores; the LAST matching pattern wins.
 */

/** Translate one glob segment to regex source; `*` and `?` never cross a slash. */
function segmentSource(part) {
  let seg = "";
  for (const ch of part) {
    if (ch === "*") seg += "[^/]*";
    else if (ch === "?") seg += "[^/]";
    else seg += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return seg;
}

/** Compile one ignore pattern to an anchored regex. */
export function globToRegExp(pattern) {
  const negated = pattern.startsWith("!");
  const body = negated ? pattern.slice(1) : pattern;
  const anchored = body.includes("/");
  const parts = body.split("/").filter((p) => p !== "" && p !== ".");
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "**") {
      // A trailing `**` means "everything below here", slashes included, and it
      // must NOT demand a trailing separator — `public/**` has to match
      // `public/js/d3.v5.min.js`, which is the whole reason it gets written.
      // Mid-pattern, `**/` may span zero or more segments.
      out.push(i === parts.length - 1 ? ".*" : "(?:.*/)?");
      continue;
    }
    out.push(segmentSource(part));
    if (i < parts.length - 1) out.push("/");
  }
  const src = anchored ? `^${out.join("")}$` : `^(?:.*/)?${out.join("")}$`;
  return { re: new RegExp(src), negated };
}

/**
 * Is `rel` (project-relative, posix separators) ignored by `patterns`?
 * Last match wins, so `["dist/**", "!dist/keep.js"]` keeps keep.js.
 */
export function isIgnored(rel, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  const path = String(rel).split("\\").join("/");
  let ignored = false;
  for (const p of patterns) {
    if (typeof p !== "string" || p === "") continue;
    const { re, negated } = globToRegExp(p);
    if (re.test(path)) ignored = !negated;
  }
  return ignored;
}

/**
 * What is never this project's first-party code, however it is filed.
 *
 * These are defaults, not a policy the project has to opt into: a minified
 * vendor bundle in `public/js/` is not source, and measuring one is how a
 * single 248,257-character d3.v5.min.js produced 148 of 158 maxParams
 * violations and a completion gate that could not be closed.
 *
 * The list is exported so the report can say how many files it removed — an
 * exclusion nobody can see is how a gate quietly stops measuring anything.
 */
export const DEFAULT_IGNORE = [
  "**/*.min.js", "**/*.min.css", "**/*-min.js", "**/*.bundle.js", "**/*.pack.js",
  "**/*.js.map", "**/*.css.map",
  "**/generated/**", "**/gen/**", "**/.generated/**",
  "**/*.lock", "**/package-lock.json", "**/yarn.lock", "**/pnpm-lock.yaml",
  "**/*.pb.go", "**/*_pb2.py", "**/*.generated.ts",
  // dotfiles are tool config, not source: measuring `.eslintrc.json` as
  // first-party code is how a project gets graded on its own linter settings.
  "**/.*",
];
