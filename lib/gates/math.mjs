/** Arithmetic shared by the parameter table and its resolver (no cycle). */

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function round2(v) {
  return Math.round(v * 100) / 100;
}
