// Pure game rules, shared by the page and the tests.

export const LAUNCH_DATE = "2026-11-07"; // puzzle #1
export const BULLSEYE_PCT = { fact: 0.005, fermi: 0.02 };
export const PARTIAL_CUTOFF = 0.3; // beyond 30% of the scale you score 0

// Days since launch, by the player's local calendar date. #1 on launch day.
export function puzzleNumber(date) {
  const [y, m, d] = LAUNCH_DATE.split("-").map(Number);
  const launch = Date.UTC(y, m - 1, d);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.floor((today - launch) / 86400000) + 1);
}

// Small deterministic hash and RNG so every player gets the same puzzle.
export function hash(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shuffle the pool once with a fixed seed, then walk through it 10 at a time.
// No question repeats until the whole pool has been used.
export function pickDaily(pool, day, count) {
  const order = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const rand = rng(hash("bullseye-pool"));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const n = Math.min(count, order.length);
  const start = ((day - 1) * n) % order.length;
  return Array.from({ length: n }, (_, i) => order[(start + i) % order.length]);
}

// The slider always starts at 0. Its top is a clean number (10, 25, 50, 100,
// 250, 500, 1,000 ...) with the answer no more than 90% of the way along, so
// the end of the bar never gives the answer away. About 1 in 3 questions goes
// one step higher still.
export const MAX_POSITION = 0.9;
export function scaleLadder(upTo) {
  const steps = [];
  for (let p = 1; ; p *= 10) {
    for (const m of [10, 25, 50]) {
      const v = m * p;
      steps.push(v);
      if (v >= upTo) return steps;
    }
  }
}
export function sliderMax(q) {
  if (q.max) return q.max; // a question can set its own scale
  const ladder = scaleLadder(q.answer * 10);
  let i = ladder.findIndex((v) => q.answer <= v * MAX_POSITION);
  if (hash(q.id) % 3 === 0) i++;
  return ladder[i];
}

// Bullseye window: 0.5% of the scale (2% for Fermi estimates), rounded down.
// On small scales that rounds to 0, so the answer must be exact.
export function bullseyeTolerance(q, max) {
  return Math.floor(max * (BULLSEYE_PCT[q.type] ?? BULLSEYE_PCT.fact));
}

export function scoreGuess(q, max, guess) {
  const diff = Math.abs(guess - q.answer);
  if (diff <= bullseyeTolerance(q, max)) return { points: 100, bullseye: true };
  const err = diff / max;
  return { points: Math.max(0, Math.round(90 * (1 - err / PARTIAL_CUTOFF))), bullseye: false };
}

export function shareSquare(r) {
  if (r.bullseye) return "🎯";
  if (r.points >= 70) return "🟩";
  if (r.points >= 30) return "🟨";
  return "🟥";
}
