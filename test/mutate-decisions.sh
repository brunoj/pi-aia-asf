#!/usr/bin/env bash
# Mutation test for the decision-register guards.
# Each mutation removes or weakens ONE guard; the suite must fail. A guard that
# no test notices is not a guard.
set -u
cd "$(dirname "$0")/.."
BK=$(mktemp -d)
trap 'cp -a "$BK"/. . 2>/dev/null; rm -rf "$BK"' EXIT
cp -a lib "$BK/"

run() { timeout 300 node test/harness.mjs "$PWD" test/test-decisions-live.mjs >/tmp/mut.log 2>&1 || return 1;
  timeout 300 node test/harness.mjs "$PWD" test/test-decisions-cite.mjs >>/tmp/mut.log 2>&1; }
report() { if [ "$1" -eq 0 ]; then echo "ESCAPED  $2"; else echo "caught   $2"; fi; }

m() { # m <file> <from> <to> <label>
  python3 - "$@" <<'PY'
import sys
f, a, b, _ = sys.argv[1:5]
s = open(f).read()
if a not in s:
    sys.stderr.write("MUTATION-NOT-APPLIED: " + f + "\n"); sys.exit(3)
open(f, "w").write(s.replace(a, b, 1))
PY
}

echo "── decision-register guards ──"

m lib/extension/handlers/tool-call.ts 'authoredText(input)' 'JSON.stringify(input || {})' "citation from any tool param"
run; report $? "citation may come from any tool parameter"
cp -a "$BK/lib" .

m lib/extension/handlers/tool-call.ts 'if (toolName !== "asf_decisions") {' 'if (true) {' "register tool params count as citations"
run; report $? "reading a record satisfies cite-or-record"
cp -a "$BK/lib" .

m lib/decisions/store.mjs 'const live = (records || []).filter((r) => !closed.has(String(r.status)));' 'const live = (records || []);' "card shows reversed decisions"
run; report $? "superseded decision stays on the run card"
cp -a "$BK/lib" .

m lib/decisions/consult.mjs 'for (const r of [...loadRegister(dir).records, ...(read || [])]) {' 'for (const r of [...(read || [])]) {' "duplicate id invisible"
run; report $? "duplicate id slips past validation"
cp -a "$BK/lib" .

m lib/extension/tools/decisions.ts 'record: recordFrom(recordParams),' 'record: recordFrom(p),' "supersede keeps the old id"
run; report $? "supersede reuses the superseded id"
cp -a "$BK/lib" .

m lib/gates/settle.mjs '...(opts.decisionGaps || []).map((g) => String(g.gap || "")).filter(Boolean),' '...(opts.decisionGaps || []).map((g) => ({ gate: "decisions", gap: g.gap, remedy: g.remedy })),' "decision gap rendered as [object Object]"
run; report $? "decision gap is unreadable to the agent"
cp -a "$BK/lib" .

m lib/decisions/consult.mjs 'const known = [...new Map([...loaded, ...(read || [])].map((r) => [String(r.id), r])).values()].map((r) =>
    String(r.id) === String(id) ? { ...r, status: "superseded", superseded_by: newId } : r,
  );' 'const known = [...new Map([...loaded, ...(read || [])].map((r) => [String(r.id), r])).values()];' "one-way supersession"
run; report $? "supersession cannot be written (bidirectional check before the back-link)"
cp -a "$BK/lib" .

m lib/decisions/consult.mjs 'if (!data.id) data.id = `ADR-${String(nextNumber(dir)).padStart(4, "0")}`;' 'data.id = `ADR-${String(nextNumber(dir)).padStart(4, "0")}`;' "explicit id honoured"
run; report $? "an explicit id is silently renumbered"
cp -a "$BK/lib" .

echo "── baseline (no mutation) must be green ──"
run; if [ $? -eq 0 ]; then echo "green    unmutated suite"; else echo "RED      unmutated suite (see /tmp/mut.log)"; fi
