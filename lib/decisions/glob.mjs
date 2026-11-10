/**
 * The tiny glob matcher a decision uses to name the code it governs.
 *
 * `applies_to: [lib/gates/**, test/test-gates.mjs]` is the field that turns a
 * paragraph into something that can be *routed*: it is how ASF knows, at the
 * moment a file is about to be edited, which decisions apply to that file.
 *
 * Written here rather than pulled from a package for the same reason as the
 * front-matter parser — a gate's behaviour must not vary with what the measured
 * project has installed. Supported: `*` (not across `/`), `**` (across `/`),
 * `?`, and a trailing `/` meaning "everything under here".
 */

function escapeRe(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/**
 * Emit the pattern for a run of stars starting at `i`, and report how much of the
 * glob it consumed. Pulled out of `globToRe` because the three star cases are where
 * all the nesting lived; with them here, the compiler is a flat switch.
 */
function starPattern(g, i) {
  if (g[i + 1] !== "*") return { pattern: "[^/]*", skip: 1 };
  // `**/` may match zero directories, so swallow the separator with it.
  if (g[i + 2] === "/") return { pattern: "(?:.*/)?", skip: 3 };
  return { pattern: ".*", skip: 2 };
}

/** Compile one glob into an anchored RegExp. */
export function globToRe(glob) {
  let g = String(glob || "");
  if (!g) return /^$/;
  if (g.endsWith("/")) g += "**";
  let out = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      const star = starPattern(g, i);
      out += star.pattern;
      i += star.skip - 1;
      continue;
    }
    if (c === "?") {
      out += "[^/]";
      continue;
    }
    out += escapeRe(c);
  }
  return new RegExp(`^${out}$`);
}

/** Does a project-relative path fall under any of these globs? */
export function matchesAny(path, globs) {
  const p = String(path || "").replace(/^\.\//, "").replace(/^\/+/, "");
  return (globs || []).some((g) => globToRe(g).test(p));
}
