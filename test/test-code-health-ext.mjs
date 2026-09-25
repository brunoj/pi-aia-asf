// Extension integration: /asf health + /asf verify Gate 8, through the real
// command handler with a REAL eslint (symlinked into the fixture's
// node_modules/.bin) — the exact path a user triggers.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let pass = 0, fail = 0;
const chk = (name, cond, detail = "") => {
  if (cond) { console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fail++; }
};

const STATE_ROOT = path.join(os.homedir(), ".pi", "agent", "skills", "aia-asf", "projects");

function makeProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asf-ch-ext-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

export async function run({ commands, extDir }) {
  // 06e standard doc wired into SKILL.md like 06c (spec spc-1790336984535-15568).
  const skill = fs.readFileSync(path.join(extDir, "skills", "aia-asf", "SKILL.md"), "utf8");
  chk("06e referenced from SKILL.md", skill.includes("06e-code-health.md"));
  chk("06e standard doc exists", fs.existsSync(path.join(extDir, "skills", "aia-asf", "references", "06e-code-health.md")));
  chk("Phase 7 mentions the code health gate", /Code Health Gate/.test(skill));
  const asf = commands.find((c) => c.name === "asf");
  chk("/asf command registered", !!asf);
  if (!asf) return;

  const hasEslint = fs.existsSync("/usr/bin/eslint");
  chk("global eslint available for the real-tool path", hasEslint);
  if (!hasEslint) return;

  const prevCwd = process.cwd();
  const tmpDirs = [];
  try {
    // ── 1. clean fixture → HEALTHY through the real command ──
    const clean = makeProject({ "src/a.js": "export function add(a, b) { return a + b; }\n" });
    tmpDirs.push(clean);
    fs.mkdirSync(path.join(clean, "node_modules", ".bin"), { recursive: true });
    fs.symlinkSync("/usr/bin/eslint", path.join(clean, "node_modules", ".bin", "eslint"));
    process.chdir(clean);
    const out1 = await asf.fn(["health"], {});
    chk("/asf health prints a report", out1.includes("Code Health Gate report"));
    chk("clean fixture: HEALTHY", out1.includes("HEALTHY"), out1.split("\n").slice(0, 4).join(" | "));
    chk("real eslint metrics ran", out1.includes("complexity") && out1.includes("0"));

    // ── 2. god-file fixture → GATE FAILED through the real command ──
    const god = makeProject({
      "src/god.js":
        "function god() {\n" +
        Array.from({ length: 120 }, (_, i) => `  if (x${i}) { if (y${i}) { if (z${i}) { return ${i}; } } }`).join("\n") +
        "\n}\n",
    });
    tmpDirs.push(god);
    fs.mkdirSync(path.join(god, "node_modules", ".bin"), { recursive: true });
    fs.symlinkSync("/usr/bin/eslint", path.join(god, "node_modules", ".bin", "eslint"));
    process.chdir(god);
    const out2 = await asf.fn(["health"], {});
    chk("god-file: GATE FAILED", out2.includes("GATE FAILED"), out2.split("\n").filter((l) => l.includes("✗")).slice(0, 3).join(" | "));
    chk("god-file: violation named", out2.includes("maxLinesPerFunction") || out2.includes("complexity"));

    // ── 3. /asf verify (large) includes CODE HEALTH Gate 8 ──
    const proj = path.basename(god);
    const stateDir = path.join(STATE_ROOT, proj);
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "state.json"), JSON.stringify({
      current: { workType: "feature", scale: "large", phase: "implementation", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      history: [],
    }));
    try {
      const out3 = await asf.fn(["verify"], {});
      chk("verify includes CODE HEALTH (Gate 8)", out3.includes("CODE HEALTH (Gate 8"));
      chk("verify includes the health report", out3.includes("Code Health Gate report"));
      chk("verify flags the gate result", /Code health gate passed|GATE NOT PASSED/.test(out3));
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }

    // ── 4. help lists /asf health ──
    const help = await asf.fn([], {});
    chk("help lists /asf health", help.includes("/asf health"));

    // ── 5. /asf health --diff works through the command ──
    process.chdir(clean);
    const out5 = await asf.fn(["health", "--diff"], {});
    chk("--diff accepted", out5.includes("No metric regressed") || out5.includes("regression"));
  } finally {
    process.chdir(prevCwd);
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exit(1);
}
