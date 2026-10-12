// Tests for P26 — browser verification of every TUCHED interface, during the
// build (06b Rule 9 strengthened, not duplicated).
//
// The point of this rule is that the trigger moved from deliverable-level
// ("the project has a UI") to change-level ("can THIS change reach a rendered
// surface"), and the timing moved from final verification into the Phase 6
// loop. So the assertions are mostly about those two words — plus the teeth:
// evidence naming, the Rule 19 non-exclusion clause, and the /asf verify
// checklist item. A rule that only says "test the UI" would pass a weaker
// test, so the negative controls below are what make this worth running.
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const chk = (name, cond, detail) => {
  if (cond) { console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); fail++; }
};

export async function run({ extDir }) {
  const base = path.join(extDir, 'skills', 'aia-asf');
  const read = (f) => fs.readFileSync(path.join(base, 'references', f), 'utf8');
  const tq = read('06b-testing-qa.md');
  const impl = read('06-implementation.md');
  const skill = fs.readFileSync(path.join(base, 'SKILL.md'), 'utf8');
  const index = fs.readFileSync(path.join(extDir, 'index.ts'), 'utf8');

  console.log('=== 1. Rule 9 trigger is change-level, not deliverable-level ===');
  chk('heading says TOUCH + during the build',
    tq.includes('## Rule 9 — Browser-test every interface you TOUCH, during the build'));
  chk('states the trigger is what the change touches', tq.includes('The trigger is what the change TOUCHES'));
  chk('names the deliverable-level framing it replaces', tq.includes('not whether the project "has a UI"'));
  chk('poses the reachability question', tq.includes('can this change reach'));
  for (const [label, needle] of [
    ['page/route/component/form', 'a page, route, component, widget, form'],
    ['styling/copy/formatting', 'markup, styling, copy, formatting'],
    ['client-side state', 'client-side state, routing, data fetching'],
    ['an API a UI consumes', 'that a UI consumes'],
    ['server-side not exempt', 'not exempt just because the diff is in'],
    ['auth/upload paths', 'uploads/downloads'],
  ]) chk(`touched list covers ${label}`, tq.includes(needle));

  console.log('=== 2. Uncertainty inverts to a browser run (not a skip) ===');
  chk('uncertain => browser-test, tied to Rule 19 inversion',
    tq.includes('When uncertain, browser-test it') && tq.includes('inversion as Rule 19'));
  chk('"only a backend change" rejected as a non-argument', tq.includes('is not an argument'));
  chk('cheap direction to be wrong is the safe one', tq.includes('costs a browser run, never a skipped one'));

  console.log('=== 3. Timing is the Phase 6 build loop, not final verification ===');
  chk('names the Phase 6 build loop, per change', tq.includes('in the Phase 6 build loop, per change'));
  chk('before committing that change', tq.includes('before committing'));
  chk('not at final verification', tq.includes('not at final\nverification') || tq.includes('not at final verification'));
  chk('gives the reason (defect is one edit wide)', tq.includes('one edit wide'));

  console.log('=== 4. Rule 19 interaction: a touched surface is never excluded ===');
  chk('browser/E2E suite never excludable by subset selection', tq.includes('never\nexcludable') || tq.includes('never excludable'));
  chk('selection may drop unrelated suites only', tq.includes('never the one that looks at'));

  console.log('=== 5. Evidence, not assertion ===');
  chk('requires page + action + assertion', tq.includes('the page/URL opened, the action taken, and what was asserted'));
  chk('n/a must carry a reason', tq.includes('n/a: no rendered surface touched, because'));
  chk('missing tool must be said out loud', tq.includes('never let a missing tool read as a passed check'));
  chk('bare "browser tested" called out as non-evidence', tq.includes('is not evidence'));

  console.log('=== 6. Rule 10 DoD checkbox strengthened ===');
  chk('checkbox says in the build + every interface touched',
    tq.includes('in the build, for every interface the change touches'));
  chk('checkbox demands the evidence fields', tq.includes('the action taken and what was asserted'));
  chk('checkbox allows stated n/a', tq.includes('`n/a` stated with a reason'));

  console.log('=== 7. 06-implementation.md wired ===');
  chk('browser section heading says touched + in the build',
    impl.includes('## Browser testing (MANDATORY for every touched interface, in the build)'));
  chk('trigger restated as what the change touches', impl.includes('The trigger is **what the change touches**'));
  chk('test-first loop gained step 5 (browser before commit)',
    impl.includes('5. Browser-verify every interface the change **touches**'));
  chk('step 5 says before committing that change', impl.includes('before committing that change** (06b Rule 9)'));
  chk('step 5 carries the uncertainty default', impl.includes('provably cannot reach a'));
  chk('evidence/n-a reporting requirement present', impl.includes('n/a: no rendered surface touched, because'));

  console.log('=== 8. SKILL.md Phase 6 rule 5 + anti-patterns ===');
  chk('rule 5 trigger is touched, in the build',
    skill.includes('MANDATORY for every interface the change TOUCHES, in the build (06b Rule 9)'));
  chk('rule 5 poses reachability question', skill.includes('can this change reach a rendered surface'));
  chk('rule 5 carries the uncertainty default', skill.includes('Uncertain whether it reaches a surface? Then it is touched'));
  chk('anti-pattern: deliverable-level framing', skill.includes('Treating browser testing as about "projects that have a UI"'));
  chk('anti-pattern: deferring to final verification', skill.includes('Deferring browser verification of a touched interface to final verification'));
  chk('anti-pattern: "only a backend change"', skill.includes('"It\'s only a backend change" with no render path named'));
  chk('anti-pattern: bare "browser tested"', skill.includes('Reporting "browser tested" without the page, action and assertion'));

  console.log('=== 9. /asf verify checklist has teeth (index.ts QA_CHECKLIST) ===');
  chk('browser DoD item requires touched interfaces in the build',
    index.includes('Every interface the change TOUCHES exercised through a real browser during the build (06b Rule 9)'));
  chk('browser DoD item requires named evidence', index.includes('page + action + assertion named'));
  chk('tests DoD item states the gate is never relaxed by Rule 19',
    index.includes('the gate; Rule 19 never relaxes this checkbox'));

  console.log(`\n  PASS: ${pass}  FAIL: ${fail}`);
  return fail === 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const extDir = process.argv[2] || path.resolve(import.meta.dirname, '..');
  run({ extDir }).then((ok) => process.exit(ok ? 0 : 1));
}
