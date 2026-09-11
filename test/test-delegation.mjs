// Tests for the delegation + dependency changes (source-level, pre-release).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let pass = 0, fail = 0;
const chk = (name, cond, detail) => {
  if (cond) { console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); fail++; }
};

export async function run({ tools, commands, extDir }) {
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
    const out = await asfCmd.fn([], {});
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
  chk('SKILL.md references 06d', skill.includes('06d-delegation.md'));
  chk('SKILL.md anti-patterns include same-file subagents', skill.includes('parallel subagents that touch the same file'));
  chk('SKILL.md anti-patterns include exit-code trust', skill.includes('subagent\'s exit code'));
  chk('SKILL.md anti-patterns include re-deriving context', skill.includes('instead of asking it over intercom'));

  console.log('=== 4. README updated ===');
  const readme = fs.readFileSync(path.join(extDir, 'README.md'), 'utf8');
  chk('README notes pi-intercom optional', readme.includes('**not** a dependency') && readme.includes('Optional'));
  chk('README not in required table', !readme.includes('| **pi-intercom** |'));

  console.log('=== 5. frontmatter still valid YAML ===');
  const fm = skill.split('---')[1] || '';
  chk('frontmatter has name+description', fm.includes('name:') && fm.includes('description:'));

  console.log(`\n  PASS: ${pass}  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}
