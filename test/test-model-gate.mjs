// Tests for P27 — the model gate (06j + the 06e `model` level + 06g §3 +
// 06b Rule 20).
//
// Two kinds of claim are under test, and they need different treatment:
//
//   1. the scanner's fitness functions — does it fire on a real cascade and stay
//      silent on a declared one? A pass here means nothing without the negative
//      controls, so every rule has one, and the incident itself is a fixture.
//   2. the normative wiring — is the obligation actually in the DoD, the emitted
//      checklist and the review lens, so a run cannot be called delivered
//      without it?
//
// The scanner is a tripwire, not an authority. These tests assert what it does
// NOT catch as well, so the gap is in the record rather than discovered in
// production.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanModelSource, scanModel, hasPersistenceFiles, isModelRelevant, MODEL_RULES } from '../lib/code-health/model.mjs';
import { normalizeConfig, DEFAULT_CONFIG } from '../lib/code-health/config.mjs';
import { planMetrics, detectLanguages } from '../lib/code-health/detect.mjs';
import { runHealth } from '../lib/code-health/index.mjs';

const TOOLS_ALL = { eslint: true, eslintSonarjs: true, jscpd: true, madge: true, dependencyCruiser: true, typescriptParser: true };
const planFor = (files) => planMetrics(DEFAULT_CONFIG, detectLanguages(files), TOOLS_ALL, { files }).find((r) => r.key === 'modelFindings');

let pass = 0, fail = 0;
const chk = (name, cond, detail) => {
  if (cond) { console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); fail++; }
};

const scan = (p, text, cfg) => scanModelSource(p, text, cfg || {});
const rulesOf = (f) => f.map((x) => x.rule);
// Prose is line-wrapped; compare against whitespace-normalised text.
const flat = (s) => s.replace(/\s+/g, ' ');

// The incident, in the shape it had: a child row with its own owner and
// human-authored state, CASCADE'd to a template row.
const INCIDENT = `
CREATE TABLE org_action_items (id SERIAL PRIMARY KEY, org_id INT, question_id INT, title TEXT, completed_at TIMESTAMPTZ);
ALTER TABLE org_action_items
  ADD CONSTRAINT fk_item_question FOREIGN KEY (question_id)
  REFERENCES checklist_questions (id) ON DELETE CASCADE;
`;

export async function run({ extDir }) {
  const base = path.join(extDir, 'skills', 'aia-asf');
  const read = (f) => fs.readFileSync(path.join(base, 'references', f), 'utf8');
  const skillMd = fs.readFileSync(path.join(base, 'SKILL.md'), 'utf8');
  const indexTs = fs.readFileSync(path.join(extDir, 'index.ts'), 'utf8');

  // ── 1. the incident, and the controls that make the pass mean something ──
  console.log('\n— the incident shape —');
  {
    const f = scan('migrations/0001.sql', INCIDENT);
    chk('catches the cascade that ate the production data', f.length === 1 && f[0].rule === 'undeclared-cascade', f.map((x) => x.rule).join(','));
    chk('names the CHILD table, not the parent', f[0]?.table === 'org_action_items', f[0]?.table);
    chk('the message states the fix', /asf-model/.test(f[0]?.message || ''));

    const declared = INCIDENT.replace(
      'ALTER TABLE org_action_items',
      '-- asf-model: org_action_items -> checklist_questions = instance, owner: the organisation\nALTER TABLE org_action_items',
    );
    chk('negative control: the same cascade, DECLARED, is silent', scan('migrations/0001.sql', declared).length === 0, 'the answer is not the point — the decision is');

    const waived = INCIDENT.replace('ALTER TABLE org_action_items', '-- asf-model-accept: legacy FK, removed in BMX-142\nALTER TABLE org_action_items');
    chk('a written waiver silences exactly its own finding', scan('migrations/0001.sql', waived).length === 0);
    chk('the waiver stays greppable for audit', /asf-model-accept/.test(waived));

    chk('file-level opt-out is honoured and greppable', scan('legacy.sql', `-- asf-model-ignore\n${INCIDENT}`).length === 0);
  }

  // ── 2. the defect is not SQL-shaped ─────────────────────────────────────
  console.log('\n— store-agnostic declarations —');
  const cases = [
    ['prisma/schema.prisma', 'model T {\n  q Question[] @relation(fields: [id], onDelete: Cascade)\n}\n', 'Prisma onDelete: Cascade'],
    ['entities/Order.java', '@Entity\nclass Order {\n  @OneToMany(cascade = CascadeType.REMOVE)\n  private List<OrderLine> lines;\n}\n', 'JPA CascadeType.REMOVE'],
    ['app/models/question.rb', 'class Question < ApplicationRecord\n  has_many :answers, dependent: :destroy\nend\n', 'Rails dependent: :destroy'],
    ['app/models/tpl.py', "class Step(models.Model):\n    __tablename__ = 'steps'\n    tpl = models.ForeignKey(Tpl, on_delete=models.CASCADE)\n", 'Django on_delete=CASCADE'],
    ['src/order.cs', 'public class Order {\n  public IList<OrderLine> Lines { get; set; }\n}\nmodelBuilder.Entity<Order>().HasMany(o => o.Lines).OnDelete(DeleteBehavior.Cascade);\n', 'EF DeleteBehavior.Cascade'],
    ['db/mapping.py', "mapper(Parent, t, {\n  'children': relationship(Child, cascade='all, delete-orphan')\n})\n", 'SQLAlchemy delete-orphan'],
    ['db/migrate/001.rb', 'create_table "parents" do |t|\nend\nadd_foreign_key "children", "parents", on_delete: :cascade\n', 'Ruby migration on_delete: :cascade'],
    ['src/repo.ts', 'const s = new Schema({ q: { type: ObjectId, ref: "Question", onDelete: "cascade" } });\n', 'Mongoose onDelete: cascade'],
  ];
  for (const [p, text, label] of cases) {
    chk(`detects a cascade expressed as ${label}`, rulesOf(scan(p, text)).includes('undeclared-cascade'));
  }

  {
    // There is no constraint here to inspect. The invariant tests (06g §3) are
    // the gate for this shape — asserting the gap keeps it from being forgotten.
    const f = scan(
      'repositories/actions.ts',
      'import { Collection } from "mongodb";\nasync function wipe(ids) {\n  await db.collection("org_action_items").deleteMany({ question_id: { $in: ids } });\n  await db.collection("checklist_questions").deleteMany({ template_id: { $in: ids } });\n}\n',
    );
    chk('DOCUMENTED GAP: a hand-rolled document-store cascade is not caught (invariant tests carry it)', !rulesOf(f).includes('undeclared-cascade'));
  }

  {
    const text = 'ALTER TABLE x ADD CONSTRAINT c FOREIGN KEY (y) REFERENCES z (id) ON DELETE SPECIAL_WIPE;\n';
    chk('an unknown dialect is invisible by default', scan('migrations/a.sql', text).length === 0);
    const f = scan('migrations/a.sql', text, { extraCascadePatterns: ['ON\\s+DELETE\\s+SPECIAL_WIPE'] });
    chk('project dialect is extendable via config, not by waiting for a release', f.length === 1 && /custom:/.test(f[0].marker));
    chk('an invalid extra pattern is dropped, not a crash', scan('migrations/a.sql', text, { extraCascadePatterns: ['('] }).length === 0);
  }

  // ── 3. rebuild-by-delete ────────────────────────────────────────────────
  console.log('\n— rebuild-by-delete —');
  {
    const f = scan('services/template.sql', 'DELETE FROM checklist_steps WHERE template_id = $1;\nINSERT INTO checklist_steps (template_id, title) VALUES ($1, $2);\n');
    chk('SQL delete + reinsert of the same table', f[0]?.rule === 'delete-then-reinsert' && f[0]?.table === 'checklist_steps', f[0]?.rule);
    chk('the message says WHY', /row identity/.test(f[0]?.message || ''));

    const doc = scan('repositories/steps.ts', 'import { Collection } from "mongodb";\nawait db.collection("steps").deleteMany({ templateId });\nawait db.collection("steps").insertMany(rows);\n');
    chk('document-store delete + insert of the same collection', rulesOf(doc).includes('delete-then-reinsert'));

    const py = scan('services/template_service.py', "class TemplateService:\n    def save(self, tid, steps):\n        self.session.execute('DELETE FROM checklist_steps WHERE template_id = %s', (tid,))\n        for s in steps:\n            self.session.execute('INSERT INTO checklist_steps (template_id, title) VALUES (%s, %s)', (tid, s))\n");
    chk('fires through an ORM session', rulesOf(py).includes('delete-then-reinsert'));

    const upsert = scan('services/steps.sql', 'INSERT INTO steps (id, title) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;\n');
    chk('negative control: an upsert is not a rebuild', !rulesOf(upsert).includes('delete-then-reinsert'));

    const diff = scan('services/x.sql', "DELETE FROM steps WHERE id = $1;\nINSERT INTO audit_log (what) VALUES ('step deleted');\n");
    chk('negative control: delete and insert of DIFFERENT tables is not a rebuild', !rulesOf(diff).includes('delete-then-reinsert'));

    const far = scan('services/y.sql', 'DELETE FROM steps WHERE id = $1;\n' + Array.from({ length: 60 }, (_, i) => `-- padding ${i}`).join('\n') + '\nINSERT INTO steps (id) VALUES ($1);\n');
    chk('negative control: far apart is outside the window', !rulesOf(far).includes('delete-then-reinsert'));

    const mem = scan('src/cache.ts', "const m = new Map();\nm.delete('a');\nm.set('b', 1);\n");
    chk('in-memory collections are not persistence calls', mem.length === 0, 'map.delete is not DELETE FROM');
  }

  // ── 4. config + honest reporting ────────────────────────────────────────
  console.log('\n— config and honest reporting —');
  {
    chk('model level is on by default (a gate nobody enables is not a gate)', DEFAULT_CONFIG.model.enabled === true && DEFAULT_CONFIG.model.requireDeclaration === true);
    const c = normalizeConfig({ model: { requireDeclaration: false, rebuildWindowLines: 5, extraCascadePatterns: ['x', 42] } });
    chk('config is normalised', c.model.requireDeclaration === false && c.model.rebuildWindowLines === 5);
    chk('non-string extra patterns are dropped', JSON.stringify(c.model.extraCascadePatterns) === '["x"]');

    const row = planFor(['migrations/1.sql', 'src/app.ts']);
    chk('planned when persistence exists', !!row && row.tool === 'asf-model');
    chk('built in — never skipped for a missing dependency', row?.toolAvailable === true);

    const none = planFor(['src/app.ts', 'README.md']);
    chk('the level is still reported when there is no persistence (it does not vanish)', !!none);
    chk('disabled with a reason when there is no persistence', none?.enabled === false && /no persistence/.test(none?.disableReason || ''), none?.disableReason);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asf-model-none-'));
    const r = await scanModel(dir, { files: ['docs/README.md'], readFile: async () => '# docs\n', config: DEFAULT_CONFIG.model });
    chk('a scan that looked at nothing says scanned: 0 rather than hiding it', r.scanned === 0 && r.findings.length === 0);
    const r2 = await scanModel(dir, { files: ['migrations/clean.sql'], readFile: async () => 'CREATE TABLE t (id INT);\n', config: DEFAULT_CONFIG.model });
    chk('a clean file proves it was looked at (scanned: 1, no findings)', r2.scanned === 1 && r2.findings.length === 0);
    fs.rmSync(dir, { recursive: true, force: true });

    const err = await scanModel('/nonexistent', { files: ['migrations/1.sql'], readFile: async () => { throw new Error('EACCES'); }, config: DEFAULT_CONFIG.model });
    chk('an unreadable file is an error, not a pass', err.errors.length === 1);

    chk('hasPersistenceFiles recognises schemas and dialects', hasPersistenceFiles(['db/schema.sql']) && hasPersistenceFiles(['prisma/schema.prisma']) && hasPersistenceFiles(['app/models/user.rb']) && hasPersistenceFiles(['src/repositories/items.ts']));
    chk('hasPersistenceFiles says no for a pure app', !hasPersistenceFiles(['src/app.ts', 'README.md']));
    chk('isModelRelevant covers source, DSLs and SQL', ['a.sql', 'prisma/schema.prisma', 'm.ts', 'models/x.py', 'Order.java', 'x.rb'].every(isModelRelevant) && !isModelRelevant('README.md'));
    chk('only the two rules exist — no heuristics crept back in', MODEL_RULES.join(',') === 'undeclared-cascade,delete-then-reinsert', MODEL_RULES.join(','));

    // The claim that matters: does it actually fail a build?
    const gdir = fs.mkdtempSync(path.join(os.tmpdir(), 'asf-model-gate-'));
    fs.mkdirSync(path.join(gdir, 'migrations'), { recursive: true });
    fs.writeFileSync(path.join(gdir, 'migrations', '0001.sql'), INCIDENT);
    let res = await runHealth(gdir, []);
    let mrow = res.rows.find((r) => r.key === 'modelFindings');
    chk('the model level FAILS a real build', mrow?.status === 'fail' && res.exitCode === 1, `status=${mrow?.status} exit=${res.exitCode}`);
    chk('the report names file:line and the fix', (mrow?.details || []).some((d) => /0001.sql:5/.test(d) && /asf-model/.test(d)));

    fs.writeFileSync(path.join(gdir, 'migrations', '0001.sql'), INCIDENT.replace('ALTER TABLE org_action_items', '-- asf-model: org_action_items -> checklist_questions = instance, owner: the organisation\nALTER TABLE org_action_items'));
    res = await runHealth(gdir, []);
    mrow = res.rows.find((r) => r.key === 'modelFindings');
    chk('declaring ownership makes the build pass (the pass is not vacuous)', mrow?.status === 'pass' && res.exitCode === 0, `status=${mrow?.status} exit=${res.exitCode}`);
    fs.rmSync(gdir, { recursive: true, force: true });
  }

  // ── 5. normative wiring: the obligation must be in the gates ────────────
  console.log('\n— normative wiring —');
  {
    const j = flat(read('06j-data-model.md'));
    chk('06j states the ownership classes and the declaration', ['composition', 'instance', 'ledger', 'asf-model:', 'does it survive'].every((s) => j.includes(s)));
    chk('06j carries the model rules M1–M8', [1, 2, 3, 4, 5, 6, 7, 8].every((n) => j.includes(`M${n} —`)));
    chk('06j says a clean scan is a tripwire, not a pass', j.includes('tripwire, not an authority'));
    chk('06j states it is store-agnostic by design', j.includes('store-agnostic by design'));
    chk('06j hands schema-free stores to the invariant tests', j.includes('no constraint to inspect'));
    chk('06j requires scanned: 0 to be said out loud', j.includes('scanned: 0'));
    chk('06j sets the trigger as what the change WRITES', j.includes('what the change WRITES') && j.includes('only a backend change'));
    chk('06j keeps legitimate exceptions (it must not read as never-cascade)', j.includes('Legitimate exceptions') && j.includes('a pass, not a failure'));

    const b = read('06b-testing-qa.md');
    chk('Rule 20 exists', b.includes('## Rule 20 — The model is asserted, not assumed'));
    chk('the DoD carries the model line', b.includes('Model line (06j)'));
    chk('n/a requires a reason', b.includes('no persistence touched'));
    chk('exactly 20 rules (no silent duplication)', (b.match(/^## Rule \d+ —/gm) || []).length === 20);

    const g = read('06g-test-design.md');
    chk('06g carries the invariant and non-effect tests', g.includes('Invariant and non-effect tests (P27)'));
    chk('06g names all four techniques', ['Survival test', 'Non-effect assertion', 'Zero-row invariant', 'Two-user authorization test'].every((s) => g.includes(s)));
    chk('06g asks the non-effect question', flat(read('06g-test-design.md')).includes('what must not have happened'));

    const e = read('06e-code-health.md');
    chk('06e documents the model level', e.includes('| model |') && e.includes('"model"') && e.includes('extraCascadePatterns'));

    chk('the adversarial pass has a data & model lens', read('04-adversarial.md').includes('Data & model questions'));
    const p = read('05-plan.md');
    chk('the plan template carries the ownership table', p.includes('Data model & ownership') && p.includes('Survives parent?'));

    const i = read('06-implementation.md');
    chk('implementation makes it a build-time step', i.includes('Assert the **model**') && i.includes('one edit wide'));
    chk('model drift is a named drift anti-pattern', i.includes('**Model drift**'));

    chk('SKILL.md indexes 20 rules and 06j', skillMd.includes('(20 rules + DoD)') && skillMd.includes('06j-data-model.md'));
    chk('SKILL.md Phase 6 carries the rule', skillMd.includes('The model is asserted, not assumed'));
    chk('SKILL.md Phase 7 checks the model DoD', skillMd.includes('model DoD'));
    chk('SKILL.md anti-patterns name the green-suite blind spot', skillMd.includes('never populated the table the change destroys'));
    chk('SKILL.md does not oversell the scan', skillMd.includes('tripwire'));

    chk('the emitted QA checklist carries the model line', indexTs.includes('key: "model"') && indexTs.includes('invariant + non-effect tests'));

    // Boundary: the guard stays general. Model knowledge lives on the ASF side;
    // what crosses to the loop guard is the specification, never the check.
    chk('06j states who enforces it (specs, not a model-aware guard)', j.includes('Who enforces this') && j.includes('never the check'));
    chk('06j keeps the guard general', j.includes('does not know what a cascade is'));
    chk('SKILL.md sends the obligation as a spec', skillMd.includes('Capture the obligations as MUST specs') && skillMd.includes('does not know what a cascade is'));
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exit(1);
}
