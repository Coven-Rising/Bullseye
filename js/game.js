// Bullseye: a daily estimation game. Prototype, no build step.
import { dailyQuestions, puzzleNumber, sliderRange, bullseyeTolerance, scoreGuess, offBy, shareSquare, formatValue, parseGuess, crowdStanding, calculate, formatCalc } from "./rules.js";

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Math.round(n).toLocaleString("en-US");

const state = { day: 0, questions: [], index: 0, results: [] };

function storageKey() { return `bullseye-${state.practice ? "practice" : "day"}-${state.day}`; }
function save() {
  try { localStorage.setItem(storageKey(), JSON.stringify(state.results)); } catch {}
}
function load() {
  try { return JSON.parse(localStorage.getItem(storageKey())) || []; } catch { return []; }
}

async function start() {
  const [pool, schedule] = await Promise.all([
    fetch("data/questions.json").then((r) => r.json()),
    fetch("data/schedule.json").then((r) => r.json()),
  ]);
  state.schedule = schedule;
  const params = new URLSearchParams(location.search);
  state.day = params.has("day") ? Number(params.get("day")) : puzzleNumber(new Date());
  state.pool = pool;
  state.questions = dailyQuestions(pool, schedule, state.day);
  state.results = params.has("fresh") ? [] : load();
  state.index = state.results.length;
  $("#puzzle-no").textContent = `#${state.day}`;
  // The game loads behind the how-to-play popup; Play just closes it.
  if (state.index >= state.questions.length) showSummary();
  else { showQuestion(); showRules(); }
}

// How-to-play popup: opens by itself on a player's first visit, and from the ? button.
function showRules() {
  const d = $("#rules");
  const playing = !$("#screen-question").hidden || !$("#screen-reveal").hidden;
  const streak = currentStreak(loadStats(), state.day);
  const line = $("#rules-streak");
  line.hidden = !playing || streak < 1;
  line.textContent = `🔥 ${streak}-day streak. Keep it going!`;
  $("#play").textContent = !playing ? "Got it" : state.index > 0 ? `Continue #${state.day}` : `Play #${state.day}`;
  $("#play").onclick = () => { if (soundOn) ctx(); };
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  const stop = playDemo();
  d.addEventListener("close", () => { stop(); window.scrollTo(0, 0); }, { once: true });
}

// The mini slider in step 2 glides between guesses, like a player lining one up.
function playDemo() {
  const stops = [0.47, 0.18, 0.74, 0.55, 0.62, 0.47];
  const set = (p) => {
    $(".demo").style.setProperty("--p", `${(p * 100).toFixed(2)}%`);
    $("#demo-num").textContent = Math.round(p * 500);
  };
  set(stops[0]);
  if (reducedMotion()) return () => {};
  let raf, i = 0, t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const tick = (now) => {
    const t = (now - t0) / 1100; // 0-0.7 move, then hold
    const a = stops[i], b = stops[(i + 1) % stops.length];
    set(a + (b - a) * ease(Math.min(1, t / 0.7)));
    if (t >= 1) { i = (i + 1) % (stops.length - 1); t0 = now; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
$("#help").onclick = showRules;

// Personal stats, kept on this device only.
const STATS_KEY = "bullseye-stats";
function loadStats() {
  try { return { played: 0, best: 0, bullseyes: 0, streak: 0, maxStreak: 0, lastDay: 0, ...JSON.parse(localStorage.getItem(STATS_KEY)) }; }
  catch { return { played: 0, best: 0, bullseyes: 0, streak: 0, maxStreak: 0, lastDay: 0 }; }
}
// A streak only counts if the last puzzle played was today or yesterday.
function currentStreak(st, day) { return st.lastDay >= day - 1 ? st.streak : 0; }
function recordDay(day, total, bulls) {
  const st = loadStats();
  if (st.lastDay >= day) return st; // already counted (e.g. a page reload)
  st.streak = st.lastDay === day - 1 ? st.streak + 1 : 1;
  st.maxStreak = Math.max(st.maxStreak, st.streak);
  st.played += 1;
  st.best = Math.max(st.best, total);
  st.bullseyes += bulls;
  st.lastDay = day;
  try { localStorage.setItem(STATS_KEY, JSON.stringify(st)); } catch {}
  return st;
}

// Time left until local midnight, when the next puzzle unlocks.
function startCountdown() {
  clearInterval(startCountdown._i);
  const tick = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const left = Math.max(0, Math.floor((next - now) / 1000));
    const pad = (n) => String(n).padStart(2, "0");
    $("#s-countdown").textContent = `${pad(Math.floor(left / 3600))}:${pad(Math.floor(left / 60) % 60)}:${pad(left % 60)}`;
  };
  tick();
  startCountdown._i = setInterval(tick, 1000);
}

function showQuestion() {
  const q = state.questions[state.index];
  const range = sliderRange(q);
  const { min, max } = range;
  const span = max - min;
  const show = (n) => formatValue(q, n);
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
  $("#screen-question").hidden = false;
  $("#screen-reveal").hidden = true;
  $("#screen-summary").hidden = true;

  const count = $("#q-progress");
  count.innerHTML = `${state.index + 1}<small>/${state.questions.length}</small>`;
  count.setAttribute("aria-label", `Question ${state.index + 1} of ${state.questions.length}`);
  $("#q-category").textContent = q.category;
  $("#q-fermi").hidden = q.type !== "fermi";
  $("#q-prompt").textContent = q.prompt;
  $("#q-min").textContent = show(min);
  $("#q-max").textContent = show(max) + (q.unit ? ` ${q.unit}` : "");

  const slider = $("#slider");
  const box = $("#guess-box");
  slider.min = min;
  slider.max = max;
  slider.step = span <= 2000 ? 1 : span / 2000;
  slider.value = min;
  // The box shows the full number with commas, and shrinks its text to fit big ones.
  const full = (v) => formatValue(q, v, { full: true });
  const setBox = (v) => { box.value = full(v); fitBox(box, full(max).length); };
  setBox(min);
  updateFill();

  let lastVal = min;
  slider.oninput = () => {
    const v = Math.round(Number(slider.value));
    setBox(v); updateFill();
    // Tick on every change, however small. Fast drags are paced to a steady
    // rattle by the throttle in click(); pitch rises as the handle goes up.
    if (v !== lastVal) { lastVal = v; sliderTick((v - min) / span); }
  };
  box.oninput = () => {
    const v = parseGuess(box.value);
    if (box.value !== "") box.value = v > max ? full(max) : full(v);
    slider.value = clamp(v); updateFill();
  };
  box.onblur = () => setBox(clamp(parseGuess(box.value)));
  // + and − move by 1 on small scales, and by a round step on big ones.
  const step = span <= 2000 ? 1 : 10 ** Math.floor(Math.log10(span / 200));
  $("#minus").setAttribute("aria-label", `Decrease by ${step.toLocaleString("en-US")}`);
  $("#plus").setAttribute("aria-label", `Increase by ${step.toLocaleString("en-US")}`);
  const nudge = (d) => {
    const v = clamp(parseGuess(box.value) + d);
    setBox(v); slider.value = v; updateFill();
    sliderTick((v - min) / span);
  };
  tools.useGuess = (n) => {
    const v = clamp(n);
    setBox(v); slider.value = v; updateFill();
    sliderTick((v - min) / span);
  };
  tools.reset();
  $("#minus").onclick = () => nudge(-step);
  $("#plus").onclick = () => nudge(step);
  $("#lock").onclick = () => lock(q, range, clamp(parseGuess(box.value)));
}

function updateFill() {
  const s = $("#slider");
  const pct = ((Number(s.value) - Number(s.min)) / (Number(s.max) - Number(s.min))) * 100;
  s.style.setProperty("--fill", `${pct}%`);
}

function lock(q, range, guess) {
  const { points, bullseye } = scoreGuess(q, range, guess);
  state.results.push({ id: q.id, guess, points, bullseye });
  save();
  showReveal(q, range, guess, points, bullseye);
}

function showReveal(q, range, guess, points, bullseye) {
  const { min, max } = range;
  const span = max - min;
  const fmt = (n) => formatValue(q, n);
  $("#screen-question").hidden = true;
  $("#screen-reveal").hidden = false;
  const unit = q.unit ? ` ${q.unit}` : "";
  const tol = bullseyeTolerance(q, range);

  $("#r-prompt").textContent = q.prompt;
  $("#r-badge").hidden = !bullseye;
  setValue($("#r-answer"), fmt(q.answer), q.unit);
  // The correct answer stays hidden until the dart lands, then pops in with its marker.
  const answerTile = $("#r-answer-tile");
  answerTile.classList.remove("show");
  answerTile.classList.toggle("waiting", !reducedMotion());
  setValue($("#r-guess"), fmt(guess), q.unit);
  fitText($("#r-answer"));
  fitText($("#r-guess"));
  // The range of guesses that would have scored a bullseye.
  const lo = Math.max(min, q.answer - tol), hi = Math.min(max, q.answer + tol);
  setValue($("#r-range"), tol === 0 ? fmt(q.answer) : `${fmt(lo)}–${fmt(hi)}`, q.unit);
  $("#r-range-note").textContent = tol === 0 ? (q.type === "year" ? "Exact year only" : "Exact answer only") : `Within ±${q.type === "year" ? `${Math.round(tol)} years` : fmt(tol)}`;
  // Off by, as a share of the slider's scale (the same measure the score uses).
  // Off by: a share of the real answer, or for years the number of years.
  const isYear = q.type === "year";
  const offPct = isYear ? Math.abs(guess - q.answer) : offBy(q, range, guess) * 100;
  $("#r-accuracy").hidden = bullseye;
  const offText = isYear
    ? (n) => `${Math.round(n)} yr${Math.round(n) === 1 ? "" : "s"}`
    : (n) => `${n > 0 && n < 0.1 ? "0.1" : n >= 100 ? Math.round(n) : n.toFixed(1)}%`;
  for (const el of [$("#r-points"), $("#r-accuracy-value")]) { clearTimeout(el._t); cancelAnimationFrame(el._raf); }
  $("#r-points").textContent = "0";
  $("#r-accuracy-value").textContent = offText(0);
  $("#r-working").hidden = !q.working;
  $("#r-working").textContent = q.working ? `Working: ${q.working}` : "";

  // Source: a few lines of info, not a link out of the game.
  const panel = $("#r-source");
  const toggle = $("#r-source-toggle");
  panel.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "Source";
  $("#r-source-note").textContent = q.sourceNote || "";
  $("#r-source-site").textContent = `Source: ${siteName(q.source)}`;
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    toggle.textContent = panel.hidden ? "Source" : "Hide source";
  };

  // Track: answer marker, guess marker, and the bullseye window.
  const frac = (v) => (v - min) / span;
  const pos = (v) => `${frac(v) * 100}%`;
  for (const [sel, v] of [["#t-answer", q.answer], ["#t-guess", guess]]) {
    const el = $(sel);
    el.dataset.edge = frac(v) > 0.88 ? "end" : frac(v) < 0.12 ? "start" : "";
    el.classList.remove("anim");
    el.style.left = reducedMotion() ? pos(v) : "0%";
  }
  // After the dart lands (or is skipped): count up the stats and slide the markers.
  const runStats = () => {
    countUp($("#r-points"), points, (n) => String(Math.round(n)), 150);
    countUp($("#r-accuracy-value"), offPct, offText, 150);
    answerTile.classList.remove("waiting");
    if (reducedMotion()) return;
    answerTile.classList.add("show");
    void $("#t-guess").offsetWidth;
    requestAnimationFrame(() => {
      $("#t-guess").classList.add("anim");
      $("#t-guess").style.left = pos(guess);
      $("#t-answer").style.left = pos(q.answer);
      $("#t-answer").classList.add("anim");
    });
  };
  playThrow(throwTier(points, bullseye), runStats);
  $("#t-window").style.left = pos(lo);
  $("#t-window").style.width = `max(2px, ${(hi - lo) / span * 100}%)`;
  $("#t-min").textContent = fmt(min);
  $("#t-max").textContent = fmt(max);

  const last = state.index === state.questions.length - 1;
  $("#next").textContent = last ? "See results!" : "Next question";
  $("#next").onclick = () => {
    state.index++;
    if (state.index >= state.questions.length) showSummary(); else showQuestion();
  };
  $("#next").focus();
}

// Size the guess box text so the longest number on this scale fits.
function fitBox(box, chars) {
  box.style.fontSize = "";
  const base = parseFloat(getComputedStyle(box).fontSize);
  const room = box.clientWidth - 16;
  box.style.fontSize = `${Math.min(base, Math.floor(room / (chars * 0.78)))}px`;
}

// Shrink a value's font until it fits on one line in its tile (e.g. 500,000,000,000).
function fitText(el) {
  el.style.fontSize = "";
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth && size > 12) el.style.fontSize = `${--size}px`;
}

// A number with its unit in smaller type, e.g. "299,792 km/s".
function setValue(el, text, unit) {
  el.textContent = text;
  if (unit) {
    const u = document.createElement("span");
    u.className = "unit";
    u.textContent = ` ${unit}`;
    el.appendChild(u);
  }
}

const BULL_FX_MS = 3000;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Count a number up from 0 over ~1.1s, after an optional delay.
function countUp(el, to, format, delay = 0) {
  clearTimeout(el._t); cancelAnimationFrame(el._raf);
  if (reducedMotion()) { el.textContent = format(to); return; }
  el.textContent = format(0);
  const dur = 1100;
  el._t = setTimeout(() => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const text = format(to * eased);
      if (text !== el.textContent) countTick();
      el.textContent = text;
      if (t < 1) el._raf = requestAnimationFrame(step);
      else el.classList.add("pop");
    };
    el.classList.remove("pop");
    el._raf = requestAnimationFrame(step);
  }, delay);
}

// Sound: tiny synthesized effects, no audio files. Browsers allow it because
// the player has just tapped "Lock it in".
let audio;
let soundOn = true;
try { soundOn = localStorage.getItem("bullseye-sound") !== "off"; } catch {}
function ctx() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (audio.state === "suspended") audio.resume();
  return audio;
}
function tone(freq, start, dur, type = "triangle", gain = 0.18) {
  const a = ctx(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, a.currentTime + start);
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.05);
}
function thunk(start) {
  const a = ctx(); if (!a) return;
  // A low "thud" that drops in pitch, plus a short burst of noise for the hit.
  const o = a.createOscillator(), g = a.createGain();
  const t = a.currentTime + start;
  o.type = "sine"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
  g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.35);
  const buf = a.createBuffer(1, a.sampleRate * 0.08, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const n = a.createBufferSource(), ng = a.createGain();
  n.buffer = buf; ng.gain.value = 0.35; n.connect(ng).connect(a.destination); n.start(t);
}
function whoosh(start, dur) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + start;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  n.buffer = buf; f.type = "bandpass"; f.Q.value = 1.2;
  f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(3000, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(a.destination); n.start(t);
}
// Short clicks: a woody tick for the slider, a quicker, higher tick for count-ups.
// Each click is rendered once into a tiny buffer and replayed, which is far
// cheaper than building new oscillators on every slider event (that caused
// stutter on fast drags).
const clickBuffers = {};
let master;
function clickBuffer(a, freq, ms) {
  const key = `${freq}-${ms}`;
  if (clickBuffers[key]) return clickBuffers[key];
  const len = Math.floor(a.sampleRate * ms / 1000);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / a.sampleRate;
    const env = Math.exp(-t * 900) * Math.min(1, i / 24); // quick attack, fast decay
    d[i] = env * (Math.sin(2 * Math.PI * freq * t) * 0.8 + Math.sin(2 * Math.PI * freq * 2.7 * t) * 0.2);
  }
  return (clickBuffers[key] = buf);
}
const lastClick = {};
function click(kind, freq, gain, minGap) {
  if (!soundOn) return;
  const now = performance.now();
  if (now - (lastClick[kind] || 0) < minGap) return;
  lastClick[kind] = now;
  const a = ctx(); if (!a) return;
  if (!master) { master = a.createGain(); master.connect(a.destination); }
  const src = a.createBufferSource(), g = a.createGain();
  src.buffer = clickBuffer(a, freq, 30);
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start(a.currentTime + 0.005);
}
const sliderTick = (pos = 0.5) => click("slider", 1500 + Math.round(pos * 8) * 100, 0.35, 30);
const countTick = () => click("count", 3200, 0.22, 45);

// Start audio on the first touch so the first tick isn't delayed.
window.addEventListener("pointerdown", () => { if (soundOn) ctx(); }, { once: true, capture: true });

function bullseyeSound() {
  if (!soundOn) return;
  whoosh(0.7, 0.7);
  thunk(1.4);
  [[1047, 1.6], [1319, 1.75], [1568, 1.9], [2093, 2.05]].forEach(([f, t], i) => tone(f, t, i === 3 ? 0.7 : 0.25));
}
function setupSound() {
  const btn = $("#sound");
  const paint = () => {
    btn.setAttribute("aria-pressed", String(soundOn));
    btn.setAttribute("aria-label", soundOn ? "Sound on" : "Sound off");
  };
  paint();
  btn.onclick = () => {
    soundOn = !soundOn;
    try { localStorage.setItem("bullseye-sound", soundOn ? "on" : "off"); } catch {}
    paint();
    if (soundOn) tone(1319, 0, 0.15);
  };
}

// Every answer throws a dart at the board. Where it lands depends on how
// close the guess was; a bullseye gets the full show.
const TIERS = {
  bull:   { ms: BULL_FX_MS, dist: 0,    text: "Bullseye!" },
  close:  { ms: 2000,       dist: 0.22, text: "So close!" },
  decent: { ms: 2000,       dist: 0.5,  text: "Not bad!" },
  ouch:   { ms: 2000,       dist: 0.84, text: "Ouch!" },
  miss:   { ms: 2300,       dist: 1.2,  text: "Missed!" },
};
function throwTier(points, bullseye) {
  if (bullseye) return "bull";
  if (points >= 70) return "close";
  if (points >= 30) return "decent";
  if (points > 0) return "ouch";
  return "miss";
}
function throwSound(tier) {
  if (!soundOn) return;
  if (tier === "bull") return bullseyeSound();
  whoosh(0.4, 0.55);
  if (tier !== "miss") thunk(0.95);
  if (tier === "close") { tone(1319, 1.05, 0.2); tone(1760, 1.2, 0.5); }
  if (tier === "decent") tone(1047, 1.05, 0.45, "triangle", 0.12);
  if (tier === "ouch") slide(320, 110, 1.05, 0.55);
  if (tier === "miss") { thunk(1.0); tone(392, 1.2, 0.2, "sine", 0.1); tone(311, 1.42, 0.4, "sine", 0.1); }
}
function slide(from, to, start, dur) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + start, o = a.createOscillator(), g = a.createGain();
  o.type = "triangle"; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
// A muted-trombone "womp": a buzzy tone through a filter that opens and
// closes like a plunger mute, sagging slightly in pitch.
function womp(start, freq, dur, wobble = false) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(freq * 1.03, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.94, t + dur);
  if (wobble) {
    const lfo = a.createOscillator(), lg = a.createGain();
    lfo.frequency.value = 6; lg.gain.value = freq * 0.035;
    lfo.connect(lg).connect(o.frequency); lfo.start(t + 0.2); lfo.stop(t + dur + 0.05);
  }
  f.type = "lowpass"; f.Q.value = 6;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
  f.frequency.exponentialRampToValueAtTime(450, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.28, t + 0.05);
  g.gain.setValueAtTime(0.28, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
function buzzer(start, dur) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + start;
  for (const f of [98, 104]) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sawtooth"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.setValueAtTime(0.12, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
}
function playThrow(tier, done) {
  const cfg = TIERS[tier];
  throwSound(tier);
  if (reducedMotion()) { done(); return; }
  const fx = $("#bull-fx");
  // Land the dart at a random angle, at the tier's distance from the centre.
  const ang = Math.random() * Math.PI * 2;
  const wrap = fx.querySelector(".fx-dart-wrap");
  wrap.style.setProperty("--lx", `${Math.cos(ang) * cfg.dist * 50}%`);
  wrap.style.setProperty("--ly", `${Math.sin(ang) * cfg.dist * 50}%`);
  fx.querySelector(".fx-text").textContent = cfg.text;
  fx.className = `bull-fx tier-${tier}`;
  fx.hidden = false;
  void fx.offsetWidth;
  fx.classList.add("play");
  let finished = false;
  const close = () => {
    if (finished) return;
    finished = true;
    clearTimeout(fx._t);
    fx.hidden = true; fx.classList.remove("play");
    done();
  };
  clearTimeout(fx._t);
  fx._t = setTimeout(close, cfg.ms + 200);
  fx.onclick = close;
}

// "https://en.wikipedia.org/wiki/Mount_Everest" -> "Wikipedia, Mount Everest"
function siteName(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("wikipedia.org")) {
      const page = decodeURIComponent(u.pathname.split("/").pop()).replace(/_/g, " ");
      return `Wikipedia, ${page}`;
    }
    return u.hostname.replace(/^www\./, "");
  } catch { return url; }
}

function shareText() {
  const total = state.results.reduce((a, r) => a + r.points, 0);
  const bulls = state.results.filter((r) => r.bullseye).length;
  const squares = state.results.map(shareSquare).join("");
  return `Bullseye #${state.day}  ${total}/${state.questions.length * 100}\n${squares}\n${bulls} bullseye${bulls === 1 ? "" : "s"}`;
}

function showSummary() {
  $("#screen-question").hidden = true;
  $("#screen-reveal").hidden = true;
  $("#screen-summary").hidden = false;
  const total = state.results.reduce((a, r) => a + r.points, 0);
  const bulls = state.results.filter((r) => r.bullseye).length;
  const st = state.practice ? loadStats() : recordDay(state.day, total, bulls);
  $("#s-title").textContent = state.practice ? `Practice set complete!` : `Puzzle #${state.day} complete!`;
  countUp($("#s-total"), total, (n) => String(Math.round(n)), 300);
  $("#st-played").textContent = st.played;
  $("#st-streak").textContent = currentStreak(st, puzzleNumber(new Date()));
  $("#st-best").textContent = st.best;
  $("#st-bulls").textContent = st.bullseyes;
  startCountdown();
  $("#s-max").textContent = state.questions.length * 100;
  $("#s-squares").textContent = state.results.map(shareSquare).join("");
  const list = $("#s-list");
  list.innerHTML = "";
  state.results.forEach((r, i) => {
    const q = state.questions[i];
    const tier = r.bullseye ? "bull" : r.points >= 70 ? "good" : r.points >= 30 ? "ok" : "miss";
    const li = document.createElement("li");
    li.className = `ans ans-${tier}`;
    li.innerHTML = `<span class="ans-n"></span><p class="ans-q"></p><span class="ans-pts"></span>
      <p class="ans-v"><span class="ans-real"><small>Answer</small> <b></b></span><span class="ans-you"><small>You</small> <b></b></span></p>`;
    li.querySelector(".ans-n").textContent = i + 1;
    li.querySelector(".ans-q").textContent = q.prompt;
    const unit = q.unit ? ` ${q.unit}` : "";
    li.querySelector(".ans-real b").textContent = formatValue(q, q.answer) + unit;
    li.querySelector(".ans-you b").textContent = formatValue(q, r.guess);
    li.querySelector(".ans-pts").textContent = r.bullseye ? "🎯 100" : r.points;
    list.appendChild(li);
  });
  showCrowd(state.day, total, !state.practice);
  // Practice replays an earlier day. The preview build (window.BULLSEYE_PREVIEW)
  // can also step forward into upcoming days for testing.
  const today = puzzleNumber(new Date());
  const next = window.BULLSEYE_PREVIEW ? state.day + 1 : (state.practice ? state.day - 1 : today - 1);
  const canPractice = next >= 1 && next <= state.schedule.days.length;
  $("#practice").hidden = !canPractice;
  $("#practice").textContent = window.BULLSEYE_PREVIEW ? `Play #${next} (preview)` : `Play #${next} (practice)`;
  $("#practice").onclick = () => {
    state.day = next;
    state.practice = true;
    state.questions = dailyQuestions(state.pool, state.schedule, state.day);
    state.results = [];
    state.index = 0;
    $("#puzzle-no").textContent = `#${state.day} (practice)`;
    $("#share").textContent = "Copy result";
    $("#share-text").hidden = true;
    showQuestion();
    window.scrollTo(0, 0);
  };
  $("#share").onclick = async () => {
    const text = shareText();
    try { await navigator.clipboard.writeText(text); $("#share").textContent = "Copied!"; }
    catch {
      const box = $("#share-text");
      box.hidden = false; box.value = text; box.select();
      $("#share").textContent = "Copy the text below";
    }
  };
}

// "Better than X% of players" and today's score graph, from /api/scores.
// Each device sends its score once per day. If the API isn't there (local
// copies, or no database yet) the panel just stays hidden.
async function showCrowd(day, total, submit) {
  const box = $("#s-crowd");
  box.hidden = false;
  $("#c-loading").hidden = false;
  $("#c-body").hidden = true;
  const key = `bullseye-sent-${day}`;
  let sent = false;
  try { sent = localStorage.getItem(key) === "1"; } catch {}
  let data;
  try {
    const res = submit && !sent
      ? await fetch("api/scores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day, total }) })
      : await fetch(`api/scores?day=${day}&total=${total}`);
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    if (submit && !sent) try { localStorage.setItem(key, "1"); } catch {}
  } catch { box.hidden = true; return; }
  if (state.day !== day) return; // moved on to another set meanwhile
  const s = crowdStanding(data, total);
  $("#c-you").textContent = total;
  $("#c-chart-wrap").hidden = !s;
  if (!s) {
    $("#c-avg").textContent = "–";
    $("#c-line").textContent = "You're one of the first to finish. Check back later for the community average!";
    $("#c-loading").hidden = true;
    $("#c-body").hidden = false;
    return;
  }
  $("#c-avg").textContent = s.average;
  $("#c-line").textContent = s.diff > 0 ? `${s.diff} above average. Nice!`
    : s.diff < 0 ? `${-s.diff} below average. Get 'em tomorrow!` : "Bang on average!";
  // Graph: players per 50 points, with your bar lit up.
  const chart = $("#c-chart");
  chart.innerHTML = "";
  const peak = Math.max(...s.bins, 1);
  const mine = Math.min(s.bins.length - 1, Math.floor(total / 50));
  s.bins.forEach((n, i) => {
    const bar = document.createElement("span");
    bar.className = i === mine ? "bar you" : "bar";
    bar.style.setProperty("--h", `${Math.max(n ? 6 : 2, (n / peak) * 100)}%`);
    bar.style.animationDelay = `${i * 25}ms`;
    if (i === mine) bar.innerHTML = "<em>You</em>";
    chart.appendChild(bar);
  });
  $("#c-chart-wrap").setAttribute("aria-label", `Graph of everyone's scores. You scored ${total}; the average is ${s.average}.`);
  $("#c-loading").hidden = true;
  $("#c-body").hidden = false;
}

// Scratchpad: a calculator and a notepad that share one panel. What you type
// stays put while the panel is closed, and both clear at each new question.
const tools = (() => {
  const panel = $("#tool-panel");
  const btns = { calc: $("#tool-calc"), notes: $("#tool-notes") };
  let tab = "calc", expr = "";
  const result = () => calculate(expr);
  const render = () => {
    const r = result();
    $("#calc-expr").textContent = expr;
    $("#calc-out").textContent = expr ? (r == null ? "…" : formatCalc(r)) : "0";
    $("#calc-use").disabled = r == null || r < 0;
  };
  const show = (name) => {
    tab = name;
    panel.hidden = false;
    $("#tab-calc").hidden = name !== "calc";
    $("#tab-notes").hidden = name !== "notes";
    for (const t of document.querySelectorAll(".tool-tab")) t.setAttribute("aria-selected", String(t.dataset.tab === name));
    for (const [k, b] of Object.entries(btns)) b.setAttribute("aria-expanded", String(k === name));
    if (name === "notes") $("#notes-text").focus({ preventScroll: true });
  };
  const close = () => {
    panel.hidden = true;
    for (const b of Object.values(btns)) b.setAttribute("aria-expanded", "false");
  };
  const press = (k) => {
    if (k === "C") expr = "";
    else if (k === "⌫") expr = expr.slice(0, -1);
    else if (k === "=") { const r = result(); if (r != null) expr = String(Number(r.toPrecision(12))); }
    else expr += k;
    render();
  };
  for (const [k, b] of Object.entries(btns)) b.onclick = () => (!panel.hidden && tab === k ? close() : show(k));
  for (const t of document.querySelectorAll(".tool-tab")) t.onclick = () => show(t.dataset.tab);
  $("#tool-close").onclick = close;
  for (const key of document.querySelectorAll(".calc-keys button")) key.onclick = () => press(key.dataset.k);
  $("#calc-use").onclick = () => { const r = result(); if (r != null) { api.useGuess(Math.round(r)); close(); } };
  // Typing works while the calculator is open, unless you're in a text box.
  document.addEventListener("keydown", (e) => {
    if (panel.hidden || tab !== "calc" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.("input, textarea")) return;
    if (e.key === "Enter" && e.target.closest?.("button")) return; // that button's own click
    const map = { "*": "×", x: "×", "/": "÷", "-": "−", Enter: "=", Backspace: "⌫", Escape: "C" };
    const k = map[e.key] ?? (/^[0-9.+()=]$/.test(e.key) ? e.key : null);
    if (k) { e.preventDefault(); press(k); }
  });
  const api = {
    useGuess: () => {},
    reset() { expr = ""; $("#notes-text").value = ""; render(); },
  };
  render();
  return api;
})();

setupSound();
start();
