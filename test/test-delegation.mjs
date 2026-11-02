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
  const wp = (id, files, extra = {}) => ({ id, files, minutes: 20, dependsOn: [], ...extra });
  const disjoint = [wp('P1', ['lib/a.mjs'], { interfacesProvided: ['a'] }), wp('P2', ['lib/b.mjs'], { interfacesProvided: ['b'] }), wp('P3', ['lib/c.mjs'], { interfacesProvided: ['c'] })];
  const par = estimateParallelism({ packages: disjoint, maxConcurrent: 3 });
  chk('disjoint packages are judged parallel', par.verdict === 'parallel', (par.reasons || []).join('; '));
  chk('the speed-up is a number, not a feeling', par.speedup >= 1.3, `speedup ${par.speedup}, critical path ${par.criticalPath}m of ${par.serial}m serial`);
  chk('the concurrency cap is honoured', par.maxConcurrent === 3, String(par.maxConcurrent));
  chk('independence is counted, not assumed', par.independentCount >= 3, String(par.independentCount));

  const clash = estimateParallelism({ packages: [wp('P1', ['lib/a.mjs']), wp('P2', ['lib/a.mjs']), wp('P3', ['lib/c.mjs'])], maxConcurrent: 3 });
  chk('two packages owning one file are refused', clash.verdict === 'serial' && clash.conflicts.some((c) => c.kind === 'file'), JSON.stringify(clash.conflicts));

  const iface = estimateParallelism({ packages: [wp('P1', ['lib/a.mjs'], { interfacesProvided: ['x'] }), wp('P2', ['lib/b.mjs'], { interfacesProvided: ['x'] }), wp('P3', ['lib/c.mjs'])], maxConcurrent: 3 });
  chk('two packages providing one interface are refused', iface.conflicts.some((c) => c.kind === 'interface'), JSON.stringify(iface.conflicts));

  const cyc = estimateParallelism({ packages: [wp('P1', ['lib/a.mjs'], { dependsOn: ['P3'] }), wp('P2', ['lib/b.mjs']), wp('P3', ['lib/c.mjs'], { dependsOn: ['P1'] })], maxConcurrent: 3 });
  chk('a dependency cycle is refused', cyc.verdict === 'serial' && (cyc.errors || []).length > 0, (cyc.reasons || []).join('; '));

  const two = estimateParallelism({ packages: [wp('P1', ['lib/a.mjs']), wp('P2', ['lib/b.mjs'])], maxConcurrent: 3 });
  chk('two packages are not worth threads', two.verdict === 'serial' && two.reasons.some((r) => /independent/.test(r)), two.reasons.join('; '));

  const short = estimateParallelism({ packages: [wp('P1', ['lib/a.mjs'], { minutes: 5 }), wp('P2', ['lib/b.mjs'], { minutes: 5 }), wp('P3', ['lib/c.mjs'], { minutes: 5 })], maxConcurrent: 3 });
  chk('a thin critical path is refused as not worth it', short.verdict === 'serial' && short.reasons.some((r) => /cost more than they save|speed|parallelis/i.test(r)), `speedup ${short.speedup}: ${short.reasons.join('; ')}`);

  const malformed = estimateParallelism({ packages: [{ id: 'P1', minutes: 0, files: [] }], maxConcurrent: 3 });
  chk('a package with no files is not silently treated as independent', malformed.verdict === 'serial' && malformed.errors.length > 0, JSON.stringify(malformed.errors));

  console.log('=== 7. the join is one lane (W3.2) ===');
  chk('resolving a merge conflict by model is forbidden', JOIN_FORBIDDEN.some((f) => /merge conflict/i.test(f)));
  chk('a thread may never resolve its own ticket', JOIN_FORBIDDEN.some((f) => /resolving its own ticket|resolve its own ticket/i.test(f)));
  chk('a thread may not edit outside its partition', JOIN_FORBIDDEN.some((f) => /partition/i.test(f)));
  const j = planJoin({ branches: ['bmx/p1', 'bmx/p2'] });
  chk('the join is a single lane', j.singleLane === true);
  const steps = j.order[0].steps;
  chk('the full suite runs after the rebase, not before', steps.findIndex((s) => /rebase/.test(s)) < steps.findIndex((s) => /FULL suite/.test(s)), JSON.stringify(steps));
  chk('tickets are resolved only after the suite is green', steps.findIndex((s) => /FULL suite/.test(s)) < steps.findIndex((s) => /resolve each ticket/.test(s)));
  chk('the join names the forbidden moves', j.forbidden === JOIN_FORBIDDEN);

  console.log('=== 8. the worker brief partitions the truth (W2.3) ===');
  const delegFile = fs.readFileSync(path.join(extDir, 'skills', 'aia-asf', 'references', '06d-delegation.md'), 'utf8');
  for (const part of ['Objective', 'File partition', 'Interfaces needed', 'Interfaces provided', 'Output format', 'Boundaries', 'Done when']) {
    chk(`brief contains "${part}"`, delegFile.includes(part));
  }
  chk('a thread runs its own checks, never the full suite', /its own tests, not the full suite/.test(delegFile) && /full suite in the rebased state/.test(delegFile));
  chk('the refusal is recorded, not silently dropped', /refusal is recorded in the plan/.test(delegFile));

  console.log('=== 9. review rules live in 06d too ===');
  chk('a failed reviewer is not run, never a clean review', delegFile.includes('`not run`') && delegFile.includes('never counted as a'));
  chk('a report whose citations do not resolve is rejected', /did not read is `not run`/.test(delegFile) && /cite or abstain/.test(delegFile));
  chk('A/B is only at the blocker boundary', delegFile.includes('blocker boundary'));

  console.log('=== 5. frontmatter still valid YAML ===');
  const fm = skill.split('---')[1] || '';
  chk('frontmatter has name+description', fm.includes('name:') && fm.includes('description:'));

  console.log(`\n  PASS: ${pass}  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}
