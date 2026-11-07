// Pure game rules, shared by the page and the tests.

export const LAUNCH_DATE = "2026-11-07"; // puzzle #1
// Bullseye: within this share of the real answer (years: of the slider window).
export const BULLSEYE_PCT = { fact: 0.02, fermi: 0.05, year: 0.005 };
export const ZERO_AT = 0.5;      // 50% off the real answer scores 0
export const YEAR_ZERO_AT = 0.3; // years: 30% of the window off scores 0
export const CURVE = 1.4;        // >1 is kinder to near misses: 10% off scores ~81

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

// Year questions ("What year was Van Gogh born?") use a window of years
// instead of starting at 0. The window is a clean width (100 years for
// modern dates, wider for older ones) that starts on a round number, with
// the answer at least 10% in from either end. Where the answer sits inside
// the window varies by question, so the middle of the bar gives nothing away.
export const LATEST_YEAR = 2025;
export function yearWidth(answer) {
  if (answer >= 1800) return 100;
  if (answer >= 1500) return 200;
  if (answer >= 1000) return 500;
  return 1000;
}
export function sliderRange(q) {
  if (q.type !== "year") return { min: 0, max: sliderMax(q) };
  if (q.min != null && q.max != null) return { min: q.min, max: q.max };
  const w = yearWidth(q.answer);
  const step = w / 4;
  const starts = [];
  for (let s = Math.ceil((q.answer - w * MAX_POSITION) / step) * step; s <= q.answer - w * (1 - MAX_POSITION); s += step) starts.push(s);
  const capped = starts.filter((s) => s + w <= LATEST_YEAR);
  const pool = capped.length ? capped : starts;
  const min = pool[hash(q.id) % pool.length];
  return { min, max: min + w };
}

// Bullseye window: 0.5% of the scale (2% for Fermi estimates), rounded down.
// On small scales that rounds to 0, so the answer must be exact. A 100-year
// window needs the exact year.
// How far off a guess is: a share of the real answer, or for years a share
// of the slider window (being 10 years out is the same in 1066 or 1966).
export function offBy(q, range, guess) {
  const diff = Math.abs(guess - q.answer);
  return q.type === "year" ? diff / (range.max - range.min) : diff / Math.abs(q.answer);
}

// Small counts (under 50) round down to 0, so they need the exact answer.
export function bullseyeTolerance(q, range) {
  const pct = BULLSEYE_PCT[q.type] ?? BULLSEYE_PCT.fact;
  return Math.floor(pct * (q.type === "year" ? range.max - range.min : Math.abs(q.answer)));
}

export function scoreGuess(q, range, guess) {
  if (Math.abs(guess - q.answer) <= bullseyeTolerance(q, range)) return { points: 100, bullseye: true };
  const err = offBy(q, range, guess);
  const t = q.type === "year" ? err / YEAR_ZERO_AT : err / ZERO_AT;
  const left = q.type === "year" ? 1 - t : 1 - t ** CURVE;
  return { points: Math.max(0, Math.round(90 * left)), bullseye: false };
}

// Years print without a thousands separator (1853, not 1,853).
// Years show as-is. Counts get commas, and from a million up they are shortened
// to 3 significant figures (3,333,360 -> "3.33M", 500,000,000,000 -> "500B").
// { full: true } keeps every digit, for the guess box.
const COMPACT = [[1e12, "T"], [1e9, "B"], [1e6, "M"]];
export function formatValue(q, n, { full = false } = {}) {
  const v = Math.round(n);
  if (q.type === "year") return String(v);
  if (!full) for (const [size, suffix] of COMPACT) {
    if (Math.abs(v) >= size) return `${Number((v / size).toPrecision(3))}${suffix}`;
  }
  return v.toLocaleString("en-US");
}

// Read a typed guess like "3,000,000" back into a number.
export function parseGuess(text) {
  const digits = String(text).replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

export function shareSquare(r) {
  if (r.bullseye) return "🎯";
  if (r.points >= 70) return "🟩";
  if (r.points >= 30) return "🟨";
  return "🟥";
}

// Crowd stats from /api/scores: the community's average score for the day.
// Your own score is already counted, so with nobody else yet there's no
// average worth showing. Player counts are never shown.
export function crowdStanding(data, total) {
  if (!data || !(data.players > 1) || data.average == null) return null;
  return { average: data.average, diff: total - data.average, bins: data.bins };
}

// Scratchpad calculator: + − × ÷, brackets, decimals and unary minus.
// Commas in numbers are ignored. Returns null for anything incomplete or
// invalid (including division by zero), so the display can just wait.
export function calculate(expr) {
  const src = String(expr).replace(/,/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  const tokens = src.match(/\d*\.?\d+(?:e[+-]?\d+)?|[-+*/()]|\S/gi) || [];
  let i = 0;
  const peek = () => tokens[i];
  const fail = () => { throw new Error("bad"); };
  const factor = () => {
    const t = tokens[i++];
    if (t === "-") return -factor();
    if (t === "+") return factor();
    if (t === "(") { const v = sum(); if (tokens[i++] !== ")") fail(); return v; }
    if (t != null && /^\d*\.?\d+(e[+-]?\d+)?$/i.test(t)) return Number(t);
    return fail();
  };
  const product = () => {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = tokens[i++], r = factor();
      if (op === "/" && r === 0) fail();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const sum = () => {
    let v = product();
    while (peek() === "+" || peek() === "-") v = tokens[i++] === "+" ? v + product() : v - product();
    return v;
  };
  try {
    if (!tokens.length) return null;
    const v = sum();
    return i === tokens.length && Number.isFinite(v) ? v : null;
  } catch { return null; }
}

// A calculator result for display: commas, up to 6 decimals, no float noise.
export function formatCalc(n) {
  if (n == null) return "";
  const clean = Number(n.toPrecision(12));
  if (Math.abs(clean) >= 1e15) return clean.toExponential(4);
  return clean.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
