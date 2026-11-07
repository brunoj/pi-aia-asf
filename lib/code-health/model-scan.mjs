/**
 * Which files the model level looks at, and the scan over them.
 *
 * Its own module so `model.mjs` stays the finding logic; this is the file
 * selection and the I/O.
 */
import { PERSISTENCE_PATH_RE } from "./model-patterns.mjs";
import { scanModelSource } from "./model.mjs";
import { listSourceFiles } from "./files.mjs";

/** File names that are persistence-shaped even when the extension is not. */

const SQL_EXT_RE = /\.sql$/i;
/** Schema DSLs are persistence code even though they are not "source". */
const DSL_EXT_RE = /\.(?:prisma|proto|avsc|edn)$/i;
const CODE_EXT_RE = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts|py|rb|php|java|kt|cs|go|rs|ex|exs|scala)$/i;

/** Which of the listed files should the model level look at? */
export function isModelRelevant(relPath) {
  return SQL_EXT_RE.test(relPath) || DSL_EXT_RE.test(relPath) || CODE_EXT_RE.test(relPath);
}

/**
 * Does the project have anything for this level to inspect? Name-based, so a
 * project whose persistence layer sits somewhere unusual sees `scanned: 0` in
 * the report rather than a silent pass — say so in the delivery report.
 */
export function hasPersistenceFiles(files) {
  return (files || []).some((f) => SQL_EXT_RE.test(f) || DSL_EXT_RE.test(f) || PERSISTENCE_PATH_RE.test(f));
}

/**
 * Scan a project. `files` and `readFile` are injectable for tests.
 * Returns { findings, scanned, errors }.
 */
export async function scanModel(root, { files, readFile, config } = {}) {
  const fs = readFile || (await import("node:fs/promises")).readFile;
  const list = files || listSourceFiles(root, null);
  const findings = [];
  const errors = [];
  let scanned = 0;

  for (const rel of list) {
    if (!isModelRelevant(rel)) continue;
    let text;
    try {
      text = await fs(`${root}/${rel}`, "utf-8");
    } catch (err) {
      errors.push(`${rel}: ${err.message}`);
      continue;
    }
    if (/\basf-model-ignore\b/i.test(text)) continue; // file-level opt-out, greppable
    scanned++;
    findings.push(...scanModelSource(rel, text, config));
  }

  return { findings, scanned, errors };
}
