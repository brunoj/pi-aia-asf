// Tests for the bounded-wait rule (06b Rule 15 + SKILL.md + 07-release).
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const chk = (name, cond, detail) => {
  if (cond) { console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); fail++; }
};

export async function run({ extDir }) {
  const base = path.join(extDir, 'skills', 'aia-asf');
  const qa = fs.readFileSync(path.join(base, 'references', '06b-testing-qa.md'), 'utf8');
  const skill = fs.readFileSync(path.join(base, 'SKILL.md'), 'utf8');
  const release = fs.readFileSync(path.join(base, 'references', '07-release.md'), 'utf8');

  console.log('=== 1. 06b Rule 15 exists and is complete ===');
  chk('Rule 15 heading present', qa.includes('## Rule 15 — Bound every long-running operation'));
  chk('states expected duration explicitly', qa.includes('State the expected duration before running'));
  chk('ALWAYS hard timeout', qa.includes('ALWAYS wrap it in a hard timeout'));
  chk('no unbounded waits', qa.includes('Never run unbounded'));
  chk('exceeding bound = bug signal, diagnose', qa.includes('Exceeding the bound is a bug signal'));
  chk('raise bound deliberately with reason', qa.includes('raise it deliberately'));
  chk('cites the 50000s failure', qa.includes('50,000 seconds'));
  chk('DoD item added', qa.includes('Every long-running command ran under an explicit timeout with a stated expected duration'));

  console.log('=== 2. SKILL.md discipline rule ===');
  chk('discipline rule 6 bounded waits', skill.includes('Bounded waits — ALWAYS (06b Rule 15)'));
  chk('mentions 50,000-second hang', skill.includes('50,000-second hang'));
  chk('mentions hard timeout', skill.includes('hard timeout'));

  console.log('=== 3. 07-release verify-first bullet ===');
  chk('release step mentions bounded waits', release.includes('no unbounded waits'));
  chk('release step cites 06b Rule 15', release.includes('06b Rule 15'));

  console.log(`\n  PASS: ${pass}  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}
