// Tests for P25 — Risk-based test selection for the inner loop (06b Rule 19).
// Verifies: the rule exists and states the user's certainty-gated design
// (burden of proof on the subset, default full), the disqualifier list is
// mechanical (no judgment calls), the gate (Rule 10) is explicitly unmoved,
// the 06-implementation test-first loop points at it, SKILL.md's index/
// anti-patterns are wired, and — critically — that the coin-toss/iteration-
// counter machinery from the earlier draft was REMOVED, not just unmentioned
// (regression guard: the user rejected it, it must not silently return).
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const chk = (name, cond, detail) => {
  if (cond) { console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); fail++; }
};

export async function run({ extDir }) {
  const base = path.join(extDir, 'skills', 'aia-asf');
  const tq = fs.readFileSync(path.join(base, 'references', '06b-testing-qa.md'), 'utf8');
  const impl = fs.readFileSync(path.join(base, 'references', '06-implementation.md'), 'utf8');
  const skill = fs.readFileSync(path.join(base, 'SKILL.md'), 'utf8');

  console.log('=== 1. Rule 19 exists and states the certainty-gated design ===');
  chk('Rule 19 heading present', tq.includes('## Rule 19 — Test selection for the inner loop'));
  chk('references P25', tq.includes('(P25'));
  chk('states default is full', tq.includes('Default is full'));
  chk('burden of proof is on the subset', tq.includes('Burden of proof is on the subset'));
  chk('requires an impact statement', tq.includes('impact statement'));
  chk('unstated/uncertain -> full', tq.includes('not certain') && tq.includes('full'));

  console.log('=== 2. Disqualifier list is mechanical, not a judgment call ===');
  chk('no-judgment framing present', tq.includes('no judgment call'));
  chk('shared/global state disqualifier', tq.includes('shared/global state'));
  chk('dependency/lockfile disqualifier', tq.includes('lockfile'));
  chk('build/test/CI config disqualifier', tq.includes('test, lint, or CI config'));
  chk('schema/migration disqualifier', tq.includes('migration'));
  chk('public API/contract disqualifier', tq.includes('public API/contract'));
  chk('cross-module refactor disqualifier', tq.includes('cross-module refactor'));
  chk('unmapped file -> full (no map = always full)', tq.includes('no entry in the project\'s test-impact map'));

  console.log('=== 3. The gate never moves (Rule 10 unchanged in meaning) ===');
  chk('Rule 10 checkbox cross-references Rule 19 and says gate never moves',
    tq.includes('the gate never moves'));
  chk('Rule 19 repeats "gate never moves" as its own framing', tq.includes('the DoD gate never moves'));
  chk('Rule 19 explicitly ties to commit-after-every-change workflow',
    tq.includes('commits after every green run') || tq.includes('commits after every'));

  console.log('=== 4. Coin-toss / iteration-counter machinery was REMOVED, not left in ===');
  // Regression guard: an earlier draft proposed iteration%N, a coin toss, and
  // a "5 consecutive subsets" backstop. The user rejected all of it once the
  // commit-after-every-change workflow was pointed out. It must not reappear.
  chk('no "coin toss" language in the shipped rule', !tq.includes('coin toss'));
  chk('no "fullRunEvery" counter in the shipped rule', !tq.includes('fullRunEvery'));
  chk('no "coinToss" config key in the shipped rule', !tq.includes('coinToss'));
  chk('no "consecutive subset" backstop language', !tq.includes('consecutive subset'));

  console.log('=== 5. 06-implementation.md test-first loop points at Rule 19 ===');
  chk('step 3 mentions 06b Rule 19', impl.includes('06b Rule 19'));
  chk('step 4 (commit) explicitly says FULL, never a subset',
    impl.includes('always the FULL suite') && impl.includes('never a subset'));

  console.log('=== 6. SKILL.md wiring ===');
  chk('index updated to 19 rules', skill.includes('19 rules + DoD'));
  chk('anti-pattern: subset without impact statement', skill.includes('without a stated impact statement'));
  chk('anti-pattern: subset satisfying the DoD checkbox', skill.includes('satisfying the Rule 10 full-suite checkbox'));

  console.log(`\n  PASS: ${pass}  FAIL: ${fail}`);
  return fail === 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const extDir = process.argv[2] || path.resolve(import.meta.dirname, '..');
  run({ extDir }).then((ok) => process.exit(ok ? 0 : 1));
}
