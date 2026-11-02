#!/usr/bin/env node
/**
 * ASF audits its own normative content (W2.2).
 *
 * ASF enforces "the artifact you ship, not the source you wrote" on everyone else.
 * Its own deliverable is markdown that agents read and obey, and until now nothing
 * checked that the pointers in it still land. A reference renamed, a heading renamed,
 * a file added but never indexed in the read-on-demand table: all of them are silent,
 * and the failure only shows up much later as an agent that never read the rule it
 * needed.
 *
 * Checks:
 *   1. every relative link in SKILL.md and references/*.md resolves on disk
 *   2. every `#anchor` on a relative link matches a real heading
 *   3. every file under references/ is indexed in SKILL.md, and every indexed file exists
 *   4. every reference declares when to read it (the index is the load-control)
 *   5. SKILL.md and every agents/*.md carry name + description frontmatter
 *
 * Exported for the suite (so the negative controls can run against fixtures) and
 * runnable as a CLI.
 */
import fs from "node:fs";
import path from "node:path";

const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;

function headingsOf(text) {
  const out = new Set();
  for (const line of text.split("\n")) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (!m) continue;
    const slug = m[2]
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    out.add(slug);
  }
  return out;
}

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  const obj = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) obj[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return obj;
}

function listFiles(dir, filter) {
  try {
    return fs.readdirSync(dir).filter(filter).sort();
  } catch {
    return [];
  }
}

/**
 * @param {string} skillDir  directory holding SKILL.md, references/, agents/
 */
export function auditDocs(skillDir) {
  const problems = [];
  const add = (file, msg) => problems.push({ file, msg });

  const skillPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    return { problems: [{ file: "SKILL.md", msg: "missing" }], checked: 0 };
  }
  const skill = fs.readFileSync(skillPath, "utf8");
  const refDir = path.join(skillDir, "references");
  const agentDir = path.join(skillDir, "agents");
  const refFiles = listFiles(refDir, (f) => f.endsWith(".md"));
  const agentFiles = listFiles(agentDir, (f) => f.endsWith(".md"));

  let checked = 0;

  // 1 + 2 — links and anchors
  const docs = [
    { file: "SKILL.md", abs: skillPath, text: skill },
    ...refFiles.map((f) => ({ file: `references/${f}`, abs: path.join(refDir, f), text: fs.readFileSync(path.join(refDir, f), "utf8") })),
  ];
  for (const doc of docs) {
    for (const m of doc.text.matchAll(LINK)) {
      const target = m[2];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      checked++;
      const [rel, anchor] = target.split("#");
      const abs = path.resolve(path.dirname(doc.abs), rel);
      if (!fs.existsSync(abs)) {
        add(doc.file, `relative link points at a file that does not exist: ${target}`);
        continue;
      }
      if (anchor) {
        checked++;
        const heads = headingsOf(fs.readFileSync(abs, "utf8"));
        if (!heads.has(anchor.toLowerCase())) {
          add(doc.file, `anchor #${anchor} does not match any heading in ${rel}`);
        }
      }
    }
  }

  // 3 — the index and the directory agree, both ways
  for (const f of refFiles) {
    if (!skill.includes(f)) add(`references/${f}`, "not indexed in SKILL.md — an agent can never be routed to it");
  }
  for (const m of skill.matchAll(/`?references\/([A-Za-z0-9._-]+\.md)`?/g)) {
    const f = m[1];
    if (!fs.existsSync(path.join(refDir, f))) add("SKILL.md", `index names references/${f}, which does not exist`);
  }

  // 4 — every reference says when to read it
  for (const f of refFiles) {
    const text = fs.readFileSync(path.join(refDir, f), "utf8");
    if (!/read when/i.test(text.split("\n").slice(0, 12).join("\n"))) {
      add(`references/${f}`, "no 'Read when' line in its first lines — the index is ASF's only load-control");
    }
  }

  // 5 — frontmatter
  const fm = frontmatter(skill);
  if (!fm || !fm.name || !fm.description) add("SKILL.md", "frontmatter must define name and description");
  for (const f of agentFiles) {
    const a = frontmatter(fs.readFileSync(path.join(agentDir, f), "utf8"));
    if (!a || !a.name || !a.description) add(`agents/${f}`, "frontmatter must define name and description");
  }

  return { problems, checked, references: refFiles.length, agents: agentFiles.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), "..", "skills", "aia-asf");
  const r = auditDocs(dir);
  for (const p of r.problems) console.log(`FAIL  ${p.file}: ${p.msg}`);
  console.log(`\n${r.checked} link/anchor reference(s) checked, ${r.references} reference(s), ${r.agents} agent(s), ${r.problems.length} problem(s)`);
  process.exit(r.problems.length ? 1 : 0);
}
