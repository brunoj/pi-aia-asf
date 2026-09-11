// Tests for the absolute wait ceiling (30 min) + per-run opt-out.
//
// User requirement:
//   "ASF should encourage the agent to ALWAYS set a reasonable timeout, and also
//    have a self-enforced timeout of say 30min that CAN EXPLICITLY BE DISABLED
//    for a single run, but otherwise breaks a hanging wait after 30min max."
//
// Three things must be true of the SHIPPED skill text:
//   1. every waiting call carries an explicit, reasonable timeout;
//   2. a hard ceiling of 30 min that no wait may exceed;
//   3. the ceiling is disableable per-run — explicitly, not by default.
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

  console.log('=== 1. Ceiling is defined with a concrete number ===');
  chk('06b states an absolute ceiling', /absolute ceiling/i.test(qa));
  chk('06b names 30 minutes', /30\s*min/i.test(qa));
  chk('06b gives the seconds form (1800)', qa.includes('1800'));
  chk('ceiling is framed as a maximum, not a default',
    /never exceed|no wait may exceed|must not exceed|hard ceiling/i.test(qa));

  console.log('=== 2. ALWAYS set a reasonable per-call timeout ===');
  chk('every waiting call needs its own timeout',
    /every.{0,40}(tool call|command).{0,80}timeout/is.test(qa));
  chk('ceiling is NOT a substitute for a per-call bound',
    /not a substitute|ceiling is a backstop|backstop, not/i.test(qa));
  chk('explicitly covers tool calls, not just shell',
    /tool call/i.test(qa) && /timeout.{0,30}parameter/i.test(qa));

  console.log('=== 3. Per-run opt-out exists and is explicit ===');
  chk('opt-out documented', /disable|opt.?out|waive/i.test(qa));
  chk('opt-out is scoped to a SINGLE run', /single run|one run|that run|per-run/i.test(qa));
  chk('opt-out requires explicit statement (not silent)',
    /explicit/i.test(qa) && /state|say|declare|announce/i.test(qa));
  chk('opt-out does not persist / carry over',
    /does not carry|not persist|resets|only for that|reverts/i.test(qa));

  console.log('=== 4. Behavior when the ceiling is hit ===');
  chk('ceiling breaks the wait (kill, not endure)', /kill|abort|break/i.test(qa));
  chk('hitting the ceiling is treated as a failure to diagnose',
    /bug signal|failure to investigate|diagnose/i.test(qa));

  console.log('=== 5. Surfaced in SKILL.md discipline rules (agent reads this) ===');
  chk('SKILL.md mentions the 30-min ceiling', /30\s*min/i.test(skill));
  chk('SKILL.md mentions the per-run opt-out',
    /disable|opt.?out|waive/i.test(skill) && /single run|per-run|that run/i.test(skill));

  console.log('=== 6. Definition of Done covers it ===');
  chk('DoD item references the ceiling',
    /- \[ \].*(30\s*min|ceiling)/i.test(qa));

  console.log('=== 7. Applies to BOTH scales (small work is not exempt) ===');
  // QA standard is mandatory at both scales; the ceiling must not be scoped to large only.
  const ruleIdx = qa.search(/absolute ceiling/i);
  const seg = ruleIdx >= 0 ? qa.slice(ruleIdx, ruleIdx + 2500) : '';
  chk('ceiling is not limited to large/gated work only',
    seg.length > 0 && !/only.{0,30}large\b/i.test(seg));

  console.log(`\n  PASS: ${pass}  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}
