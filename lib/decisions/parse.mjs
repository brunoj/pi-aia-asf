/**
 * The front matter of a decision record.
 *
 * A documented subset of YAML — flat `key: value`, inline arrays, block lists,
 * comments — parsed by ASF rather than by a YAML dependency. The reason is the
 * same one that makes the health gate write its own eslint config and run
 * `--no-config-lookup`: what a gate reads must not depend on a library the
 * measured project happens to have installed.
 *
 * The second reason is the user. These files are edited by hand, verbatim, in
 * whatever editor is open. So the parser is strict about what it understands and
 * *loud* about what it does not: unsupported syntax is returned as an error,
 * never skipped, because a record silently parsed as empty reads as "no
 * decisions" — and an empty register is a gate that passes for the wrong reason.
 */

const FM_DELIM = /^---\s*$/;

function stripComment(value) {
  let out = "";
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      out += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "#" && (i === 0 || /\s/.test(value[i - 1]))) break;
    out += c;
  }
  return out.trim();
}

function unquote(v) {
  const t = v.trim();
  if (t.length > 1 && (t[0] === '"' || t[0] === "'") && t.endsWith(t[0])) return t.slice(1, -1);
  return t;
}

function parseScalar(v) {
  const t = unquote(v);
  if (t === "") return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

function parseInlineArray(v) {
  const inner = v.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner.split(",").map((s) => parseScalar(s.trim())).filter((x) => x !== "");
}

/** Is this line something the subset cannot express (nested map, tabs, anchors)? */
function unsupported(line) {
  if (/\t/.test(line)) return "tabs are not valid indentation";
  if (/^\s+\S+:\s*$/.test(line) || /^\s+\S+:\s+\S/.test(line)) return "nested maps are not supported";
  if (/^\s*[-*]\s+\S+:/.test(line)) return "maps inside lists are not supported";
  if (/^\s*[&*]|:\s*[|>]\s*$/.test(line)) return "anchors and block scalars are not supported";
  return undefined;
}

/**
 * Apply one front-matter line to `data`. Returns an error string when the line is
 * not something this parser understands, `null` when it was consumed happily, and
 * the new current key when a `key:` opened a list. Kept separate from the loop so
 * the four shapes a line can have (blank/comment, unsupported, bullet, pair) read
 * as four branches instead of one nested pile.
 */
function applyLine(line, data, key) {
  const bad = unsupported(line);
  if (bad) return { error: bad };
  const bullet = /^\s*-\s+(.*)$/.exec(line);
  if (bullet && key) {
    if (!Array.isArray(data[key])) data[key] = [];
    data[key].push(parseScalar(stripComment(bullet[1])));
    return {};
  }
  const kv = /^([A-Za-z_][\w.-]*):\s*(.*)$/.exec(line);
  if (!kv) return { error: `not a "key: value" pair — "${line.trim()}"`, key: null };
  const next = kv[1];
  const value = stripComment(kv[2]);
  if (value === "") data[next] = [];
  else if (value.startsWith("[")) data[next] = parseInlineArray(value);
  else data[next] = parseScalar(value);
  return { key: next };
}

/**
 * Parse `---` front matter out of a markdown document.
 * @returns {{data: Record<string, unknown>, body: string, errors: string[]}}
 */
export function parseFrontMatter(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  if (lines[0].trim() !== "---") {
    return { data: {}, body: lines.join("\n"), errors: ["missing front matter (the file must start with ---)"] };
  }
  const end = lines.findIndex((l, i) => i > 0 && FM_DELIM.test(l));
  if (end < 0) {
    return { data: {}, body: "", errors: ["front matter is never closed (no second ---)"] };
  }
  const data = {};
  const errors = [];
  let key = null;
  for (let i = 1; i < end; i++) {
    const line = lines[i].replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const out = applyLine(line, data, key);
    if (out.error) {
      errors.push(`front matter line ${i + 1}: ${out.error}`);
      key = out.key === null ? null : key;
      continue;
    }
    if (out.key) key = out.key;
  }
  return { data, body: lines.slice(end + 1).join("\n"), errors };
}

function emitValue(v) {
  if (Array.isArray(v)) return `[${v.map(emitValue).join(", ")}]`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v ?? "");
  return /[:#\[\]{}"']|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

/** Serialize a record back to front matter + body. Keys keep the declared order. */
export function serializeFrontMatter(data, body, order = []) {
  const keys = order.length ? [...order.filter((k) => k in data), ...Object.keys(data).filter((k) => !order.includes(k))] : Object.keys(data);
  const fm = keys.map((k) => `${k}: ${emitValue(data[k])}`);
  return `---\n${fm.join("\n")}\n---\n\n${String(body ?? "").trim()}\n`;
}
