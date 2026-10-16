#!/usr/bin/env bash
# Runs the full pi-aia-asf test suite against the real extension + skill text.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

"$HERE/setup.sh" >/dev/null || { echo "setup failed"; exit 1; }

fail=0
for t in test-gates.mjs test-performance-gates.mjs test-config-screen.mjs test-delivery-report.mjs test-security-mapping.mjs test-timeouts.mjs test-ceiling.mjs test-delegation.mjs test-docs-rule.mjs test-code-health-ext.mjs test-command-contract.mjs test-improvements.mjs test-test-selection.mjs test-browser-touched.mjs test-model-gate.mjs; do
  echo "── $t ─────────────────────────────────────────"
  # Bounded per 06b Rule 15: these are pure file/text assertions, seconds at most.
  if timeout 120 node "$HERE/harness.mjs" "$ROOT" "$HERE/$t"; then :; else fail=1; fi
  echo ""
done

[ $fail -eq 0 ] && echo "ALL SUITES PASSED" || echo "SUITE FAILURES"
exit $fail
