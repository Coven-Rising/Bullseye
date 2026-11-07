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

// Small deterministic hash and RNG.
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

// Each day's 10 questions are fixed in data/schedule.json (built by
// scripts/schedule.mjs). Once a day is written it never changes and its
// questions are never used again, so adding new questions is always safe.
export function dailyQuestions(pool, schedule, day) {
  const byId = new Map(pool.map((q) => [q.id, q]));
  const days = schedule.days;
  if (!days.length) return [];
  const ids = days[Math.min(day, days.length) - 1];
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

// Plan new days from questions that have never been scheduled. Existing days
// are left exactly as they are. Each new day mixes categories and has at most
// one Fermi estimate.
export function planDays(pool, schedule, perDay, seed = "bullseye") {
  const used = new Set(schedule.days.flat());
  const fresh = pool.filter((q) => !used.has(q.id)).sort((a, b) => a.id.localeCompare(b.id));
  const rand = rng(hash(seed + schedule.days.length));
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
  }
  const added = [];
  while (fresh.length >= perDay) {
    const day = [];
    const cats = new Map();
    let fermi = 0;
    for (let pass = 0; pass < 3 && day.length < perDay; pass++) {
      for (let i = 0; i < fresh.length && day.length < perDay; i++) {
        const q = fresh[i];
        const c = cats.get(q.category) || 0;
        const isFermi = q.type === "fermi";
        // Pass 0: one per category, one Fermi. Pass 1: two per category. Pass 2: anything.
        if (pass < 2 && c > pass) continue;
        if (pass < 2 && isFermi && fermi >= 1) continue;
        day.push(q); cats.set(q.category, c + 1); if (isFermi) fermi++;
        fresh.splice(i--, 1);
      }
    }
    added.push(day.map((q) => q.id));
  }
  return added;
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
