import { createJiti } from "/home/brunoj/pi-aia-asf/node_modules/jiti/lib/jiti.mjs";
const jiti = createJiti(import.meta.url);
const { bashWritesSource } = await jiti.import("/home/brunoj/pi-aia-asf/lib/activation.mjs");
const cases = [
  ["cat <<'EOF'\nsee lib/foo.ts for details\nEOF", false],
  ["grep -n foo lib/bar.ts", false],
  ["cat lib/foo.ts", false],
  ["ls lib/*.ts", false],
  ["cat > lib/foo.ts <<'EOF'\ncode\nEOF", true],
  ["python3 - <<'PY'\nopen('x.ts','w').write('a')\nPY", true],
  ["tee lib/foo.ts <<'EOF'\nx\nEOF", true],
  ["sed -i 's/a/b/' lib/foo.ts", true],
];
for (const [cmd, want] of cases) {
  const got = bashWritesSource(cmd).writes;
  console.log(`${got === want ? "ok  " : "BAD "} want=${want} got=${got}  ${JSON.stringify(cmd.slice(0, 46))}${bashWritesSource(cmd).via ? " via=" + bashWritesSource(cmd).via : ""}`);
}
