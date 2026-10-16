// Wilcoxon rank-sum (Mann-Whitney U) normal approx with tie correction + Hodges-Lehmann shift
export function mannWhitney(a, b) {
  const all = a.map(v => [v, 0]).concat(b.map(v => [v, 1])).sort((x, y) => x[0] - y[0]);
  const ranks = new Array(all.length); let tieSum = 0;
  for (let i = 0; i < all.length;) { let j = i; while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++;
    const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) ranks[k] = r; const t = j - i + 1; tieSum += t ** 3 - t; i = j + 1; }
  let ra = 0; all.forEach((x, i) => { if (x[1] === 0) ra += ranks[i]; });
  const n1 = a.length, n2 = b.length, N = n1 + n2;
  const U = ra - n1 * (n1 + 1) / 2, mu = n1 * n2 / 2;
  const sd = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tieSum / (N * (N - 1))));
  const z = (U - mu) / sd; const p = 2 * (1 - phi(Math.abs(z)));
  return { U, z, p };
}
function phi(x) { const t = 1 / (1 + 0.2316419 * x); const d = 0.3989423 * Math.exp(-x * x / 2);
  return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); }
export const median = (x) => { const s = [...x].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function hlRatio(base, cand) { const d = []; for (const x of cand) for (const y of base) d.push(Math.log(x / y)); return Math.exp(median(d)); }
