import { mannWhitney, median, hlRatio } from './stats.mjs';
const work = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Math.sqrt(i ^ (s & 7)); return s; };
let sink = 0;
function sample(n, ops = 20) { const t = process.hrtime.bigint(); for (let k = 0; k < ops; k++) sink += work(n); return Number(process.hrtime.bigint() - t) / ops; }
function trial(nBase, nCand, samples = 30) {
  for (let w = 0; w < 10; w++) { sample(nBase); sample(nCand); }              // warmup
  const a = [], b = [];
  for (let i = 0; i < samples; i++) { if (Math.random() < .5) { a.push(sample(nBase)); b.push(sample(nCand)); } else { b.push(sample(nCand)); a.push(sample(nBase)); } } // randomized interleaving
  const { p } = mannWhitney(a, b); const r = hlRatio(a, b);
  return { stat: p < 0.01 && r > 1.05, naive: median(b) / median(a) > 1.15, naive10: median(b)/median(a) > 1.10, r, cv: sd(a) / mean(a) };
}
const mean = x => x.reduce((s, v) => s + v, 0) / x.length;
const sd = x => { const m = mean(x); return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)); };
const N = 20000, R = +process.argv[2] || 40;
for (const [label, f] of [["null (A vs A)", 1.0], ["+10% work", 1.10], ["+20% work", 1.20]]) {
  let st = 0, nv = 0, nv10 = 0; const rs = [], cvs = [];
  for (let i = 0; i < R; i++) { const t = trial(N, Math.round(N * f)); st += t.stat; nv += t.naive; nv10 += t.naive10; rs.push(t.r); cvs.push(t.cv); }
  console.log(`${label.padEnd(14)} statGate fires ${st}/${R}  naive>15% fires ${nv}/${R}  naive>10% fires ${nv10}/${R}  median HL ratio ${median(rs).toFixed(3)}  median CV ${(median(cvs)*100).toFixed(1)}%`);
}
if (sink === 42) console.log('');
