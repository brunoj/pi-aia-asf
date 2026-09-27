// Tests for the ASF improvement implementation (P01–P22 approved set).
// Verifies the indexed structure: new references exist with read-when/skip-when
// headers, SKILL.md index lists every reference, and each proposal landed in
// its designated file (SSOT — no duplication).
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
  const skill = fs.readFileSync(path.join(base, 'SKILL.md'), 'utf8');
  const refs = ['01-intake.md','02-research.md','04-adversarial.md','05-plan.md',
    '06-implementation.md','06b-testing-qa.md','06c-code-quality.md','06d-delegation.md',
    '06e-code-health.md','06f-stability.md','06g-test-design.md','06h-security.md','07-release.md'];

  console.log('=== 1. New references exist with read-when/skip-when headers ===');
  for (const f of ['06f-stability.md','06g-test-design.md','06h-security.md']) {
    const t = read(f);
    chk(`${f} exists`, fs.existsSync(path.join(base, 'references', f)));
    chk(`${f} has Read when`, t.includes('**Read when:'));
    chk(`${f} has Skip when`, t.includes('**Skip when:'));
  }

  console.log('=== 2. SKILL.md index lists every reference (P-index) ===');
  for (const f of refs) {
    chk(`index lists ${f}`, skill.includes(`\`${f}\``));
  }
  chk('index has Read when column', skill.includes('| File | Covers | Read when |'));
  chk('index says never load all', skill.includes('never load all'));
  chk('06b count updated to 18 rules', skill.includes('18 rules + DoD'));

  console.log('=== 3. P01–P04 in 05-plan.md ===');
  const plan = read('05-plan.md');
  chk('P01 Decisions section', plan.includes('## Decisions (P01'));
  chk('P01 options considered', plan.includes('Options considered'));
  chk('P02 quality requirements', plan.includes('## Quality requirements (P02'));
  chk('P02 scenario has measure', plan.includes('stimulus → response → measure'));
  chk('P03 ATAM-lite', plan.includes('## Architecture evaluation (P03'));
  chk('P03 sensitivity/tradeoff', plan.includes('Sensitivity/tradeoff points'));
  chk('P04 views optional', plan.includes('## Views (P04'));

  console.log('=== 4. P15/P03 lenses in 04-adversarial.md ===');
  const adv = read('04-adversarial.md');
  chk('security lens (trust boundaries)', adv.includes('**trust') && adv.includes('boundaries**'));
  chk('security lens (STRIDE)', adv.includes('STRIDE'));
  chk('threat registry', adv.includes('**threat') && adv.includes('registry**'));
  chk('architecture lens (ATAM-lite)', adv.includes('ATAM-lite'));
  chk('sensitivity/tradeoff in lens', adv.includes('sensitivity/tradeoff points'));

  console.log('=== 5. P05/P09/P13 in 06c-code-quality.md ===');
  const cq = read('06c-code-quality.md');
  chk('P05 deep modules', cq.includes('Deep modules (P05)'));
  chk('P05 shallow pass-through is defect', cq.includes('Shallow pass-through modules are defects'));
  chk('P05 anti-patterns listed', cq.includes('temporal decomposition') && cq.includes('back-door leakage'));
  chk('P05 voodoo constants counterweight', cq.includes('voodoo constants'));
  chk('P13 characterization', cq.includes('Characterization baseline (P13)'));
  chk('P13 characterization test', cq.includes('characterization test'));
  chk('P09 smells 5 groups', cq.includes('Code smells — the 5 groups (P09)'));
  chk('P09 bloaters', cq.includes('**Bloaters**'));
  chk('P09 couplers', cq.includes('**Couplers**'));
  chk('P09 three-times rule', cq.includes('three times is a design problem'));
  chk('still 9 rules', cq.includes('## Rule 9 — Documents are code'));

  console.log('=== 6. P11/P14/P21 in 06b-testing-qa.md ===');
  const tq = read('06b-testing-qa.md');
  chk('P11 Rule 16 determinism', tq.includes('## Rule 16 — Determinism'));
  chk('P11 never re-run into green', tq.includes('re-run into green'));
  chk('P14 Rule 17 delivery report', tq.includes('## Rule 17 — Delivery report (P14)'));
  chk('P14 not-tested register', tq.includes('Not-tested register'));
  chk('P21 Rule 18 escaped-defect loop', tq.includes('## Rule 18 — Escaped-defect feedback loop (P21)'));
  chk('P21 which gate should have caught', tq.includes('which gate should have caught this'));
  chk('DoD has delivery report line', tq.includes('Delivery report complete (P14)'));
  chk('DoD has stability line', tq.includes('Stability line (06f)'));
  chk('DoD has security line', tq.includes('Security line (06h)'));
  chk('points to 06g test design', tq.includes('06g-test-design.md'));

  console.log('=== 7. P05/P17 in 06e-code-health.md ===');
  const ch = read('06e-code-health.md');
  chk('P05 depth metric report-only', ch.includes('module depth (interface vs implementation)'));
  chk('P05 depth never gates', ch.includes('never a gate'));
  chk('P17 npm audit', ch.includes('npm audit'));
  chk('P17 gitleaks', ch.includes('gitleaks'));
  chk('P17 config supplyChain', ch.includes('"supplyChain"'));
  chk('P17 config secrets', ch.includes('"secrets"'));

  console.log('=== 8. P17 RV loop in 07-release.md ===');
  const rel = read('07-release.md');
  chk('P17 re-run dependency check per release', rel.includes('re-run the dependency/security check (P17 RV loop)'));
  chk('P17 every release not just deps', rel.includes('re-run **every release**'));

  console.log('=== 9. P20 drift in 06-implementation.md ===');
  const impl = read('06-implementation.md');
  chk('P20 drift self-correction', impl.includes('Drift self-correction (P20)'));
  chk('P20 named anti-patterns', impl.includes('Scope creep') && impl.includes('Gate drift'));
  chk('P20 stop/revert/self-correct/continue', impl.includes('**Self-correction loop'));
  chk('P20 escalate only on genuine conflicts', impl.includes('Escalate to the user only when the plan/requirements themselves are the'));
  chk('P20 reads 06f/06g/06h on demand', impl.includes('06f-stability.md') && impl.includes('06h-security.md'));

  console.log('=== 10. P22 policy + anti-patterns in SKILL.md ===');
  chk('P22 self-modification policy', skill.includes('ASF self-modification policy (P22)'));
  chk('P22 facts may be updated', skill.includes('Facts may be updated in the same change'));
  chk('P22 standards via review process', skill.includes('Standards change only through the review process'));
  chk('P22 escalate not edit', skill.includes('Escalate, don\'t edit'));
  chk('Phase 4 points to 06h', skill.includes('06h-security.md'));
  chk('Phase 5 template has Decisions', skill.includes('## Decisions (ADRs'));
  chk('Phase 6 read-on-demand note', skill.includes('Read on demand (only if they apply)'));
  chk('Phase 7 stability DoD', skill.includes('stability DoD'));
  chk('Phase 7 security DoD', skill.includes('security DoD'));
  chk('anti-pattern P05 shallow', skill.includes('Shallow pass-through modules'));
  chk('anti-pattern P20 drift', skill.includes('Drift: scope creep'));
  chk('anti-pattern P22 self-modify', skill.includes('Self-modifying the ASF\'s own rules'));

  console.log('=== 11. No dangling pointers (every reference file is reachable) ===');
  const listed = refs.filter((f) => skill.includes(`\`${f}\``));
  chk('all 13 references listed in index', listed.length === 13, `${listed.length}/13`);

  console.log('=== 12. P07 observability in 06f ===');
  const stab = read('06f-stability.md');
  chk('P07 health endpoint', stab.includes('Health/readiness endpoint'));
  chk('P07 structured logs', stab.includes('Structured logs to stdout'));
  chk('P07 correlation IDs', stab.includes('Correlation IDs'));
  chk('P07 runbook', stab.includes('Runbook in README'));

  console.log('=== 13. P19 reviewer gate in 06d + SKILL.md ===');
  const del = read('06d-delegation.md');
  chk('P19 reviewer gate section', del.includes('Independent reviewer gate (P19'));
  chk('P19 blocker/suggestion/question', del.includes('BLOCKER') && del.includes('SUGGESTION'));
  chk('P19 fresh context', del.includes('Fresh context is the point'));
  chk('P19 triage autonomous', del.includes('Triage (autonomous'));
  chk('P19 escalate only genuine conflicts', del.includes('Escalate to the user ONLY on genuine conflicts'));
  chk('SKILL.md Phase 7 reviewer gate', skill.includes('Independent reviewer gate (large work, P19)'));

  console.log('=== 14. P23 configurable release policy ===');
  const rel2 = read('07-release.md');
  chk('policy section in 07-release', rel2.includes('Release policy (user-configurable)'));
  chk('policy when field', rel2.includes('**`when`**'));
  chk('policy how field', rel2.includes('**`how`**'));
  chk('policy not a deterministic command list', rel2.includes('not a deterministic command list'));
  chk('policy precedence (user > default)', rel2.includes('user definition takes precedence'));
  chk('policy default = final review', rel2.includes('always send for final review'));
  chk('test on publish step', rel2.includes('Test on publish / in production — ALWAYS'));
  chk('test on publish hygiene rule', rel2.includes('Test on publish / in production, if applicable — always'));
  chk('SKILL.md step 3 reads policy', skill.includes('check the release policy') && skill.includes('.asf-release.json'));
  chk('SKILL.md test-on-publish', skill.includes('Always test on publish / in production'));
  chk('SKILL.md anti-pattern policy', skill.includes('beyond the configured release policy'));
  chk('SKILL.md anti-pattern test-on-publish', skill.includes('without testing the shipped artifact on publish'));
  const asfPolicy = path.join(extDir, '.asf-release.json');
  chk('ASF own .asf-release.json exists', fs.existsSync(asfPolicy));
  if (fs.existsSync(asfPolicy)) {
    try {
      const p = JSON.parse(fs.readFileSync(asfPolicy, 'utf8'));
      chk('ASF policy parses as JSON', true);
      chk('ASF policy has when', typeof p.when === 'string' && p.when.length > 0);
      chk('ASF policy has how', typeof p.how === 'string' && p.how.length > 0);
      chk('ASF policy how mentions npm', p.how.includes('npm'));
      chk('ASF policy how mentions verification', p.how.includes('clean-room') || p.how.includes('verify'));
    } catch (e) { chk('ASF policy parses as JSON', false, e.message); }
  }
  const relScript = fs.readFileSync(path.join(extDir, 'scripts', 'release.sh'), 'utf8');
  chk('release.sh echo says pi-aia-asf', relScript.includes('npm:pi-aia-asf@'));
  chk('release.sh no pi-vigilant echo', !relScript.includes('npm:pi-vigilant@'));

  console.log(`\n  PASS: ${pass}  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}
