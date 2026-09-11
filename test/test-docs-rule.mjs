// Tests for the documents-are-code tenet (06c Rule 9 + SKILL.md wiring).
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const chk = (name, cond, detail) => {
  if (cond) { console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); fail++; }
};

export async function run({ extDir }) {
  const base = path.join(extDir, 'skills', 'aia-asf');
  const cq = fs.readFileSync(path.join(base, 'references', '06c-code-quality.md'), 'utf8');
  const skill = fs.readFileSync(path.join(base, 'SKILL.md'), 'utf8');

  console.log('=== 1. 06c Rule 9 exists and is complete ===');
  chk('Rule 9 heading present', cq.includes('## Rule 9 — Documents are code'));
  chk('quotes the tenet', cq.includes('it\'s time to refactor them'));
  chk('edit-tool failure trigger', cq.includes('Edit-tool failures'));
  chk('truncation trigger', cq.includes('Truncation'));
  chk('multi-topic bloat trigger', cq.includes('Multi-topic bloat'));
  chk('split-by-topic pattern', cq.includes('Split by topic'));
  chk('parent as index/map', cq.includes('index/map'));
  chk('cross-references exact', cq.includes('Keep cross-references exact'));
  chk('preserve content (Rule 8 analog)', cq.includes('Preserve content'));
  chk('refactor before it hurts', cq.includes('Refactor before it hurts'));

  console.log('=== 2. Where-this-applies + anti-patterns ===');
  chk('Phase 6 mentions Rule 9', cq.includes('Apply\n  Rule 9') || cq.includes('Rule 9 to the documents'));
  chk('Phase 7 mentions Rule 9', cq.includes('no doc so large that\n  editing it is fragile'));
  chk('anti-pattern: let doc grow', cq.includes('Letting a document grow until edits start breaking'));
  chk('anti-pattern: wall-of-prose SKILL.md', cq.includes('wall of prose instead of a map'));

  console.log('=== 3. SKILL.md wiring ===');
  chk('Phase 6 note mentions Rule 9', skill.includes('Documents are code too') && skill.includes('Rule 9'));
  chk('Phase 7 DoD mentions doc check', skill.includes('Documents too (06c Rule 9)'));
  chk('anti-pattern added', skill.includes('Letting a document grow until edits start breaking'));
  chk('index says 9 rules', skill.includes('(9 rules, SSOT'));

  console.log(`\n  PASS: ${pass}  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}
