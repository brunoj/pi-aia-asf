// Tests for the delegation + dependency changes (source-level, pre-release).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { estimateParallelism, planJoin, JOIN_FORBIDDEN } from '../lib/parallel-estimate.mjs';

let pass = 0, fail = 0;
const chk = (name, cond, detail) => {
  if (cond) { console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); fail++; }
};

export async function run({ tools, commands, extDir, invokeCommand }) {
  const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));

  console.log('=== 1. pi-intercom NOT a dependency ===');
  chk('dependencies does NOT have pi-intercom', !(pkg.dependencies && pkg.dependencies['pi-intercom']), JSON.stringify(pkg.dependencies || {}));
  chk('NOT in bundledDependencies', !(pkg.bundledDependencies || []).includes('pi-intercom'), 'bundling would conflict (proven)');
  chk('pi manifest does NOT reference node_modules/pi-intercom', !JSON.stringify(pkg.pi || {}).includes('pi-intercom'), 'no double-load');

  console.log('=== 2. dependency check excludes pi-intercom ===');
  // /asf with no args returns the summary; find the command and call it
  const asfCmd = commands.find((c) => c.name === 'asf');
  chk('/asf command registered', !!asfCmd);
  if (asfCmd) {
    const out = (await invokeCommand('asf')).text;
    chk('summary does NOT mention pi-intercom', !out.includes('pi-intercom'), 'intercom is optional, not required');
    chk('summary lists all 4 required deps', out.includes('pi-vigilant') && out.includes('pi-smart-web-search') && out.includes('pi-smart-fetch') && out.includes('pi-aia-browser'));
  }

  console.log('=== 3. 06d-delegation reference exists & is wired ===');
  const refPath = path.join(extDir, 'skills', 'aia-asf', 'references', '06d-delegation.md');
  chk('06d-delegation.md exists', fs.existsSync(refPath));
  const ref = fs.readFileSync(refPath, 'utf8');
  chk('covers intercom practice', ref.includes('Use intercom to talk to them directly') && ref.includes('intercom({ action: "send"') && ref.includes('before you send'));
  chk('covers subagent spawn', ref.includes('pi -p') && ref.includes('NO MUTUAL DEPENDENCIES'));
  chk('documents lost-update evidence', ref.includes('1 of 4 edits survived') || ref.includes('lost'));
  chk('documents exit-code warning', ref.includes('Exit code 0 does NOT mean') && ref.includes('exited 0'));
  chk('documents no-builtin-subagent', ref.includes('no built-in subagent tool'));

  const skill = fs.readFileSync(path.join(extDir, 'skills', 'aia-asf', 'SKILL.md'), 'utf8');
  const anti = fs.readFileSync(path.join(extDir, 'skills', 'aia-asf', 'references', '06m-antipatterns.md'), 'utf8');
  chk('SKILL.md references 06d', skill.includes('06d-delegation.md'));
  chk('SKILL.md anti-patterns include same-file subagents', skill.includes('parallel subagents that touch the same file'));
  chk('forbidden list includes exit-code trust (06m)', anti.includes('subagent\'s exit code'));
  chk('forbidden list includes re-deriving context (06m)', anti.includes('instead of asking it over intercom'));

  console.log('=== 4. README updated ===');
  const readme = fs.readFileSync(path.join(extDir, 'README.md'), 'utf8');
  chk('README notes pi-intercom optional', readme.includes('**not** a dependency') && readme.includes('Optional'));
  chk('README not in required table', !readme.includes('| **pi-intercom** |'));

  console.log('=== 6. the serial/parallel decision is computed, not felt (W3.1) ===');
  const disjoint = [
    { id: 'P1', files: ['lib/a.mjs'], testFiles: ['test/a.test.mjs'], provides: ['a'], dependsOn: [], estMinutes: 20 },
    { id: 'P2', files: ['lib/b.mjs'], testFiles: ['test/b.test.mjs'], provides: ['b'], dependsOn: [], estMinutes: 20 },
    { id: 'P3', files: ['lib/c.mjs'], testFiles: ['test/c.test.mjs'], provides: ['c'], dependsOn: [], estMinutes: 20 },
  ];
  const par = estimateParallelism({ packages: disjoint, maxConcurrent: 3 });
  chk('disjoint packages are judged parallel', par.verdict === 'parallel', par.reasons.join('; '));
  chk('the speed-up is a number, not a feeling', par.speedUp > 1.3, `speedUp ${par.speedUp}, critical path ${par.criticalPathMinutes}m`);
  chk('the schedule respects maxConcurrent', par.schedule.every((w) => w.length <= 3), JSON.stringify(par.schedule));

  const shared = disjoint.map((p, i) => (i === 1 ? { ...p, files: ['lib/a.mjs'] } : p));
  const clash = estimateParallelism({ packages: shared, maxConcurrent: 3 });
  chk('two packages owning one file are refused', clash.verdict === 'serial' && clash.conflicts.some((c) => c.type === 'file'), clash.conflicts.map((c) => c.detail).join('; '));

  const ifaceClash = disjoint.map((p) => (p.id === 'P2' ? { ...p, provides: ['a'] } : p));
  chk('two packages providing one interface are refused', estimateParallelism({ packages: ifaceClash, maxConcurrent: 3 }).conflicts.some((c) => c.type === 'interface'));

  const cyclic = disjoint.map((p) => (p.id === 'P1' ? { ...p, dependsOn: ['P3'] } : p));
  chk('a dependency cycle is refused', estimateParallelism({ packages: cyclic, maxConcurrent: 3 }).conflicts.some((c) => c.type === 'cycle'));

  const tiny = [{ id: 'P1', files: ['lib/a.mjs'], estMinutes: 20 }, { id: 'P2', files: ['lib/b.mjs'], estMinutes: 20 }];
  const t = estimateParallelism({ packages: tiny, maxConcurrent: 3 });
  chk('two packages are not worth threads', t.verdict === 'serial' && t.reasons.some((r) => r.includes('independent')));
  const short = [
    { id: 'P1', files: ['lib/a.mjs'], estMinutes: 5 },
    { id: 'P2', files: ['lib/b.mjs'], estMinutes: 5 },
    { id: 'P3', files: ['lib/c.mjs'], estMinutes: 5 },
  ];
  const s = estimateParallelism({ packages: short, maxConcurrent: 3 });
  chk('a short critical path is refused as not worth it', s.verdict === 'serial' && s.reasons.some((r) => r.includes('speed-up')), `speedUp ${s.speedUp}`);

  console.log('=== 7. the join is one lane (W3.2) ===');
  chk('resolving a merge conflict by model is forbidden', JOIN_FORBIDDEN.some((f) => /merge conflict/i.test(f)));
  chk('a thread may never resolve its own ticket', JOIN_FORBIDDEN.some((f) => /resolve/i.test(f)));
  const j = planJoin({ branches: ['bmx/p1', 'bmx/p2'] });
  chk('the full suite runs after the rebase, not before', j.steps.indexOf('rebase') < j.steps.indexOf('full'));
  chk('tickets are resolved only after the suite is green', j.steps.indexOf('full') < j.steps.indexOf('resolve'));
  chk('the join names the forbidden moves', j.forbidden === JOIN_FORBIDDEN);

  console.log('=== 8. the worker brief partitions the truth (W2.3) ===');
  const delegFile = fs.readFileSync(path.join(extDir, 'skills', 'aia-asf', 'references', '06d-delegation.md'), 'utf8');
  for (const part of ['Task', 'File partition', 'Interfaces you may assume', 'Definition of done for the package', 'Report format', 'What not to do']) {
    chk(`brief contains "${part}"`, delegFile.includes(part));
  }
  chk('a thread may not touch the shared suite', delegFile.includes('shared suite'));
  chk('the decision is recorded even when serial', delegFile.includes('even when the answer is serial'));

  console.log('=== 9. review rules live in 06d too ===');
  chk('a failed reviewer is not run, never zero findings', delegFile.includes('not run') && delegFile.includes('zero findings'));
  chk('a report whose citations do not resolve is rejected', /citations? [^\n]*resolve|does not resolve/i.test(delegFile));
  chk('A/B is only at the blocker boundary', delegFile.includes('blocker boundary'));

  console.log('=== 5. frontmatter still valid YAML ===');
  const fm = skill.split('---')[1] || '';
  chk('frontmatter has name+description', fm.includes('name:') && fm.includes('description:'));

  console.log(`\n  PASS: ${pass}  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}
