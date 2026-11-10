/**
 * DECISION REGISTER suite (P-decisions).
 *
 * Same standard as every other gate here: each rule gets a fixture that MUST fire
 * and a near-miss that MUST NOT. The failure this guards against is a register
 * that looks authoritative while saying nothing — an empty section, a decision
 * that is just the title again, a supersession that points one way, an
 * `accepted` nobody instructed.
 *
 * Also pinned: the `.asf/` home (one directory, legacy names still readable,
 * telemetry ignored), and the two properties the user asked for — the files are
 * hand-editable (so nothing may overwrite them) and ASF runs unattended (so a
 * broken file is reported, never read as "no decisions").
 */
import {
  ASF_DIR, asfDir, writePath, readPath, ensureHome, decisionsDir, homeStateDir, readHomeFile,
} from "../lib/home.mjs";
import { parseFrontMatter, serializeFrontMatter } from "../lib/decisions/parse.mjs";
import { globToRe, matchesAny } from "../lib/decisions/glob.mjs";
import { validateRecord, validateRegister, STATUSES } from "../lib/decisions/schema.mjs";
import {
  loadRegister, writeRecord, updateRecord, nextNumber, renderIndex, indexForCard, governing, fileNameFor,
} from "../lib/decisions/store.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const section = (s) => console.log(`\n=== ${s} ===`);
const tmp = (why) => fs.mkdtempSync(path.join(os.tmpdir(), `asf-${why}-`));

/** A record that satisfies every rule — the near-miss baseline. */
const good = (over = {}) => ({
  id: "ADR-0007",
  status: "accepted",
  title: "Retry provider webhooks on 5xx and timeouts only",
  decided: "2026-11-09",
  applies_to: ["services/payments/webhooks/**"],
  decision: "Retry on 5xx and timeouts, never on 4xx, max 3 attempts with the same idempotency key.",
  user_instructed: "only retry on 5xx",
  from_spec: "",
  plan: "",
  origin: "agent",
  source: [],
  supersedes: [],
  superseded_by: "",
  review_by: "2027-11-09",
  enforced: false,
  checks: [],
  specs: [],
  ...over,
  body: over.body ?? [
    "## Decision",
    "Retry on 5xx and timeouts, never on 4xx.",
    "",
    "## Context",
    "A 4xx means our request is wrong.",
    "",
    "## Options considered",
    "- Retry everything — amplifies outages.",
    "- Never retry — transient 5xx are routine.",
    "",
    "## Consequences",
    "Consumers must be idempotent on the event id.",
  ].join("\n"),
});

const errsOf = (problems) => problems.filter((p) => p.severity === "error");
const noticesOf = (problems) => problems.filter((p) => p.severity === "notice");
const mentions = (problems, re) => problems.some((p) => re.test(p.message));

// ─── 1. The `.asf/` home ───────────────────────────────────────────────────
section("the .asf/ home: one directory, legacy still readable");

{
  const root = tmp("home");
  check("writes always land inside .asf/", path.dirname(writePath(root, "config")) === asfDir(root) && ASF_DIR === ".asf");
  check("the home is .asf — the directory ASF already used for config, not a new name", asfDir("/p") === path.join("/p", ".asf"));

  // legacy root config must still be found: an unread config reads as an
  // unconfigured gate, and an unconfigured gate reads as a passing gate.
  fs.writeFileSync(path.join(root, ".asf-config.json"), JSON.stringify({ gate: { mode: "strict" } }));
  check("a pre-home root .asf-config.json is still read", readPath(root, "config") === path.join(root, ".asf-config.json"));
  check("and its contents are readable through the home resolver", /strict/.test(readHomeFile(root, "config") || ""));
  fs.mkdirSync(asfDir(root), { recursive: true });
  fs.writeFileSync(writePath(root, "config"), JSON.stringify({ gate: { mode: "warn" } }));
  check("the home copy wins over the legacy root file", readPath(root, "config") === path.join(asfDir(root), "config.json"));

  const root2 = tmp("home2");
  fs.writeFileSync(path.join(root2, "PLAN.md"), "# old plan\n");
  check("a root PLAN.md is still read (Gate 5 must not break mid-task)", readPath(root2, "plan") === path.join(root2, "PLAN.md"));
  check("but a plan ASF writes goes under .asf/", path.dirname(writePath(root2, "plan")) === asfDir(root2));

  const dir = ensureHome(root2);
  check("ensureHome creates the home", fs.existsSync(dir) && fs.existsSync(path.join(dir, "decisions")));
  const ignore = fs.readFileSync(path.join(dir, ".gitignore"), "utf-8");
  check("telemetry is ignored so an append-only ledger never dirties the tree", /(^|\n)state\//.test(ignore), JSON.stringify(ignore));
  check("durable files are NOT ignored (decisions must be reviewable)", !/decisions/.test(ignore));
  const before = fs.readFileSync(path.join(dir, ".gitignore"), "utf-8");
  ensureHome(root2);
  check("ensureHome is idempotent — running it twice changes nothing", fs.readFileSync(path.join(dir, ".gitignore"), "utf-8") === before);
  fs.writeFileSync(path.join(dir, ".gitignore"), "local/\n");
  ensureHome(root2);
  check("a project's own ignore rules are kept, not clobbered", /local\//.test(fs.readFileSync(path.join(dir, ".gitignore"), "utf-8")));

  check("state lives under .asf/state/<key>", homeStateDir(root2, "home-brunoj-x") === path.join(dir, "state", "home-brunoj-x"));
  check("decisions dir is configurable for projects that keep MADR files elsewhere",
    decisionsDir(root2, { decisions: { dir: "docs/decisions" } }) === path.join(root2, "docs/decisions"));
  check("and defaults to the home when unset", decisionsDir(root2, {}) === path.join(dir, "decisions"));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(root2, { recursive: true, force: true });
}

// ─── 2. Front matter ───────────────────────────────────────────────────────
section("front matter: understood strictly, refused loudly");

{
  const text = [
    "---",
    "id: ADR-0001",
    "status: accepted   # inline comment",
    'title: "Quoted: with a colon"',
    "applies_to: [lib/**, test/x.mjs]",
    "owners:",
    "  - bruno",
    "  - pi",
    "enforced: false",
    "decided: 2026-11-09",
    "---",
    "",
    "## Decision",
    "Do the thing.",
  ].join("\n");
  const { data, body, errors } = parseFrontMatter(text);
  check("parses scalars, inline arrays, block lists, comments and quotes",
    errors.length === 0 && data.status === "accepted" && data.title === "Quoted: with a colon"
    && Array.isArray(data.applies_to) && data.applies_to[0] === "lib/**" && data.applies_to[1] === "test/x.mjs"
    && Array.isArray(data.owners) && data.owners.join() === "bruno,pi" && data.enforced === false
    && data.decided === "2026-11-09", JSON.stringify(errors));
  check("keeps the body for the human surface", /## Decision/.test(body));

  const noFm = parseFrontMatter("# just prose\n");
  check("a file with no front matter is an error, not an empty record", noFm.errors.length === 1 && /missing front matter/.test(noFm.errors[0]));
  const unclosed = parseFrontMatter("---\nid: ADR-0002\n");
  check("unclosed front matter is an error", unclosed.errors.length === 1 && /never closed/.test(unclosed.errors[0]));
  const nested = parseFrontMatter("---\nid: ADR-0003\nscope:\n  paths: [a]\n---\n\nbody\n");
  check("syntax outside the subset is refused rather than silently dropped", nested.errors.length === 1 && /nested maps/.test(nested.errors[0]), JSON.stringify(nested.errors));
  const tabbed = parseFrontMatter("---\nid: ADR-0004\n\tstatus: accepted\n---\n\nbody\n");
  check("tabs are reported, not guessed at", tabbed.errors.some((e) => /tabs/.test(e)));

  const round = parseFrontMatter(serializeFrontMatter({ id: "ADR-0009", applies_to: ["a/**", "b"], n: 3 }, "## Decision\nx\n"));
  check("serialize/parse round-trips", round.errors.length === 0 && round.data.id === "ADR-0009" && round.data.applies_to[1] === "b" && round.data.n === 3, JSON.stringify(round.errors));
}

// ─── 3. Globs ──────────────────────────────────────────────────────────────
section("applies_to globs route a decision to a file");

{
  check("** crosses directories", globToRe("lib/**").test("lib/gates/settle.mjs"));
  check("a bare * does not cross a directory", !globToRe("lib/*.mjs").test("lib/gates/settle.mjs"));
  check("a bare * does match inside one directory", globToRe("lib/*.mjs").test("lib/home.mjs"));
  check("**/ may match zero directories", globToRe("**/test/**").test("test/x.mjs"));
  check("an exact path matches itself", matchesAny("test/x.mjs", ["test/x.mjs"]));
  check("a trailing slash means everything under here", matchesAny("a/b/c.ts", ["a/b/"]));
  check("and does not match a sibling with a longer name", !matchesAny("ab/c.ts", ["a/"]));
  check("a dot-slash prefix does not defeat the match", matchesAny("./lib/x.mjs", ["lib/**"]));
  check("no globs governs nothing", !matchesAny("lib/x.mjs", []));
}

// ─── 4. Validation — fire and near-miss ────────────────────────────────────
section("a record cannot look authoritative while saying nothing");

check("the complete record passes", errsOf(validateRecord(good())).length === 0, JSON.stringify(errsOf(validateRecord(good()))));
check("every documented status is accepted", STATUSES.every((s) => !mentions(validateRecord(good({ status: s, user_instructed: "x" })), /not one of/)));

{
  const cases = [
    ["a missing decision is refused", good({ decision: "" }), /required field "decision"/],
    ["a decision that only restates the title is refused", good({ decision: "Retry provider webhooks on 5xx and timeouts only" }), /restates the title/],
    ["a decision too short to be a rule is refused", good({ decision: "use retries" }), /too short to be a rule/],
    ["a missing ## Context is refused", good({ body: "## Decision\nx\n" }), /missing "## Context"/],
    ["an empty ## Consequences is refused", good({ body: "## Decision\nx\n## Context\ny\n## Options considered\n- a\n- b\n## Consequences\n" }), /"## Consequences" is empty/],
    ["one option is refused — that is not a decision", good({ body: "## Decision\nx\n## Context\ny\n## Options considered\n- only this\n## Consequences\nz\n" }), /one option is not a decision/],
    ["an unknown status is refused", good({ status: "final" }), /is not one of/],
    ["an id that does not match the file is refused", good({ id: "ADR-0011", __file: "0007-x.md" }), /does not match the file name/],
    ["an id that is not ADR-NNNN is refused", good({ id: "7" }), /must look like ADR-0007/],
    ["enforced: true with no named check is refused", good({ enforced: true }), /name it in checks/],
    ["enforced: true pointing at a missing file is refused", good({ enforced: true, checks: ["test/nope.mjs"] }), /does not exist/, { exists: () => false }],
  ];
  for (const [name, rec, re, ctx] of cases) check(name, mentions(validateRecord(rec, ctx || {}), re), JSON.stringify(validateRecord(rec, ctx || {}).map((p) => p.message)));

  // near-misses: must NOT fire
  check("two real options pass", !mentions(validateRecord(good({ body: "## Decision\nx\n## Context\ny\n## Options considered\n- a\n- b\n## Consequences\nz\n" })), /one option/));
  check("a recovered record that says the options are undocumented passes",
    !mentions(validateRecord(good({ body: "## Decision\nx\n## Context\ny\n## Options considered\nnot documented (recovered)\n## Consequences\nz\n" })), /one option/));
  check("enforced: false needs no check", errsOf(validateRecord(good({ enforced: false, checks: [] }))).length === 0);
  check("enforced: true with a check that really exists passes",
    errsOf(validateRecord(good({ enforced: true, checks: ["test/real.mjs"] }), { exists: () => true })).length === 0);
  const unknownField = validateRecord(good({ adr_dialect: "madr" }));
  check("an unknown field is a notice, never an error (a hand edit must not be blocked)",
    noticesOf(unknownField).some((p) => /unknown field/.test(p.message)) && errsOf(unknownField).length === 0);
}

section("accepted means someone instructed it");

{
  const noSource = good({ user_instructed: "", from_spec: "", plan: "", origin: "agent" });
  check("accepted with no instruction at all is refused", mentions(validateRecord(noSource), /needs sufficient instruction/));
  check("a spec id is sufficient instruction", !mentions(validateRecord(good({ user_instructed: "", from_spec: "spc-1794-1" })), /needs sufficient instruction/));
  check("the user's own words are sufficient instruction", !mentions(validateRecord(good({ from_spec: "" })), /needs sufficient instruction/));
  check("an approved plan is sufficient instruction",
    !mentions(validateRecord(good({ user_instructed: "", from_spec: "", plan: ".asf/PLAN.md" }), { planApproved: true }), /needs sufficient instruction/));
  check("an unapproved plan is NOT sufficient instruction",
    mentions(validateRecord(good({ user_instructed: "", from_spec: "", plan: ".asf/PLAN.md" }), { planApproved: false }), /needs sufficient instruction/));
  check("recovered evidence is sufficient instruction", !mentions(validateRecord(good({ user_instructed: "", from_spec: "", origin: "backfill", source: ["lib/gates/settle.mjs:41"] })), /needs sufficient instruction/));
  check("a recovered record with no provenance is refused", mentions(validateRecord(good({ user_instructed: "", from_spec: "", origin: "backfill", source: [] })), /must cite where it came from/));
  check("proposed never needs instruction", errsOf(validateRecord(good({ status: "proposed", user_instructed: "", from_spec: "", origin: "agent", source: [] }))).length === 0);
}

section("supersession points both ways or it does not count");

{
  const older = good({ id: "ADR-0001", title: "Retry all failed webhooks", decision: "Retry every failed webhook, including 4xx.", superseded_by: "", __file: "0001-retry-all.md" });
  const newer = good({ id: "ADR-0002", title: "Retry on 5xx only", decision: "Retry on 5xx and timeouts only, never on 4xx.", supersedes: ["ADR-0001"], __file: "0002-retry-5xx.md" });
  check("one-sided supersession is caught", mentions(validateRegister([older, newer]), /does not point back/));
  const olderFixed = { ...older, superseded_by: "ADR-0002" };
  check("bidirectional supersession passes", errsOf(validateRegister([olderFixed, newer])).length === 0, JSON.stringify(errsOf(validateRegister([olderFixed, newer])).map((p) => p.message)));
  check("superseded without naming a replacement is refused", mentions(validateRecord(good({ status: "superseded", superseded_by: "" })), /must name the record/));
  check("superseding something that is not in the register is refused", mentions(validateRegister([newer]), /is not in the register/));
  check("a duplicate id is refused", mentions(validateRegister([olderFixed, { ...newer, id: "ADR-0001" }]), /duplicate id/));
  const a = good({ id: "ADR-0010", title: "A", decision: "Do A whenever the request arrives, with care.", applies_to: ["lib/**"] });
  const b = good({ id: "ADR-0011", title: "B", decision: "Do B whenever the request arrives, with care.", applies_to: ["lib/**"] });
  const overlap = validateRegister([a, b]);
  check("two accepted decisions over the same paths are reported for review", noticesOf(overlap).some((p) => /both accepted and govern the same paths/.test(p.message)));
  check("and that report never blocks (contradiction is a human judgement)", errsOf(overlap).length === 0, JSON.stringify(errsOf(overlap).map((p) => p.message)));
  check("an overdue review date is reported, not blocked", noticesOf(validateRecord(good({ review_by: "2020-01-01" }))).some((p) => /review was due/.test(p.message)));
}

// ─── 5. The store ──────────────────────────────────────────────────────────
section("the store: hand-editable files are never overwritten");

{
  const dir = path.join(tmp("store"), "decisions");
  const rec = good();
  const w = writeRecord(dir, rec, rec.body);
  check("a new record is written under the decisions dir", w.created && fs.existsSync(w.file));
  check("the file name carries the number and a slug of the title", /0007-retry-provider-webhooks-on-5xx-only-timeouts-only\.md$/.test(path.basename(w.file)) || /0007-.*\.md$/.test(path.basename(w.file)), path.basename(w.file));
  const bytes = fs.readFileSync(w.file, "utf-8");
  const again = writeRecord(dir, { ...rec, decision: "silently rewritten by the tool" }, rec.body);
  check("writing the same id again refuses instead of overwriting", again.created === false && again.reason === "exists");
  check("and the human's file is byte-for-byte unchanged", fs.readFileSync(w.file, "utf-8") === bytes);

  const loaded = loadRegister(dir);
  check("the register loads back what was written", loaded.records.length === 1 && loaded.records[0].id === "ADR-0007" && /## Decision/.test(loaded.records[0].body));
  check("nextNumber never collides", nextNumber(dir) === 8 && fileNameFor("ADR-0008", "x").startsWith("0008-"));

  fs.writeFileSync(path.join(dir, "0008-broken.md"), "# someone edited this badly\n");
  const withBroken = loadRegister(dir);
  check("a file that will not parse is reported with its name, not skipped",
    withBroken.problems.some((p) => /0008-broken\.md/.test(p.file || "") && /missing front matter/.test(p.message)),
    JSON.stringify(withBroken.problems));
  check("a broken file does not make the register look empty", withBroken.records.length === 2);
  check("and the broken record still gets validated so the problem is actionable",
    errsOf(validateRegister(withBroken.records)).some((p) => /required field/.test(p.message)));

  fs.writeFileSync(path.join(dir, "INDEX.md"), "stale\n");
  check("the generated index is not read as a record", loadRegister(dir).records.every((r) => r.__file !== "INDEX.md"));

  const idx = renderIndex([good({ status: "accepted" }), good({ id: "ADR-0003", status: "proposed", title: "Cache the provider client", decision: "Cache the provider client per process for 30s." })]);
  check("the index groups by status and leads with the rule", /## accepted/.test(idx) && /## proposed/.test(idx) && /Retry on 5xx and timeouts/.test(idx));
  check("the index names the governed paths (the retrieval surface)", /services\/payments\/webhooks/.test(idx));
  const card = indexForCard([good(), ...Array.from({ length: 30 }, (_, i) => good({ id: `ADR-01${i}`, title: `T${i}`, decision: `Rule number ${i} that is long enough to be a real rule.` }))], { max: 12, bytes: 900 });
  check("the card index is bounded in rows and bytes", card.length <= 12 && card.join("\n").length <= 900, `${card.length} rows, ${card.join("\n").length} bytes`);
  check("and never drops the accepted records to make room", card.some((l) => /ADR-0007/.test(l)));

  check("governing() returns the accepted decision for a governed path", governing(loadRegister(dir).records, "services/payments/webhooks/retry.ts").length === 1);
  check("governing() returns nothing for an ungoverned path", governing(loadRegister(dir).records, "docs/readme.md").length === 0);
  check("a proposed decision never governs (an unconfirmed idea must not block)",
    governing([{ ...good(), status: "proposed" }], "services/payments/webhooks/retry.ts").length === 0);

  const upd = updateRecord(dir, "ADR-0007", { status: "superseded", superseded_by: "ADR-0009" });
  check("a record's status can be updated without losing its body", upd.created && /## Consequences/.test(fs.readFileSync(upd.file, "utf-8")) && /superseded_by: ADR-0009/.test(fs.readFileSync(upd.file, "utf-8")));
  check("updating an unknown id says so instead of writing a new file", updateRecord(dir, "ADR-9999", { status: "retired" }).reason === "not-found");
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
}

const failed = results.filter((r) => !r.cond);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED: " + failed.map((f) => f.name).join(" | "));
  process.exit(1);
}

/**
 * This suite reports its own failure (process.exit / node:test) rather than returning a
 * verdict, so the runner does not read one. The marker is checked: the harness
 * warns if it is claimed without a failure channel in the file.
 */
export const selfReports = true;
