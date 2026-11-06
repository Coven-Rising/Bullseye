// Bullseye: a daily estimation game. Prototype, no build step.
import { pickDaily, puzzleNumber, sliderMax, bullseyeTolerance, scoreGuess, shareSquare } from "./rules.js";

const QUESTIONS_PER_DAY = 10;
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Math.round(n).toLocaleString("en-US");

const state = { day: 0, questions: [], index: 0, results: [] };

function storageKey() { return `bullseye-day-${state.day}`; }
function save() {
  try { localStorage.setItem(storageKey(), JSON.stringify(state.results)); } catch {}
}
function load() {
  try { return JSON.parse(localStorage.getItem(storageKey())) || []; } catch { return []; }
}

async function start() {
  const pool = await (await fetch("data/questions.json")).json();
  const params = new URLSearchParams(location.search);
  state.day = params.has("day") ? Number(params.get("day")) : puzzleNumber(new Date());
  state.pool = pool;
  state.questions = pickDaily(pool, state.day, QUESTIONS_PER_DAY);
  state.results = params.has("fresh") ? [] : load();
  state.index = state.results.length;
  $("#puzzle-no").textContent = `#${state.day}`;
  if (state.index >= state.questions.length) showSummary(); else showQuestion();
}

function showQuestion() {
  const q = state.questions[state.index];
  const max = sliderMax(q);
  $("#screen-question").hidden = false;
  $("#screen-reveal").hidden = true;
  $("#screen-summary").hidden = true;

  const dots = $("#q-progress");
  dots.innerHTML = "";
  dots.setAttribute("aria-label", `Question ${state.index + 1} of ${state.questions.length}`);
  state.questions.forEach((_, i) => {
    const d = document.createElement("span");
    d.className = i < state.index ? "dot done" : i === state.index ? "dot now" : "dot";
    dots.appendChild(d);
  });
  $("#q-category").textContent = q.category;
  $("#q-fermi").hidden = q.type !== "fermi";
  $("#q-prompt").textContent = q.prompt;
  $("#q-max").textContent = fmt(max) + (q.unit ? ` ${q.unit}` : "");

  const slider = $("#slider");
  const box = $("#guess-box");
  slider.max = max;
  slider.step = max <= 2000 ? 1 : max / 2000;
  slider.value = 0;
  box.max = max;
  box.value = 0;
  updateFill();

  let lastVal = 0;
  slider.oninput = () => {
    const v = Math.round(Number(slider.value));
    box.value = v; updateFill();
    // Tick on every change, however small. Fast drags are paced to a steady
    // rattle by the throttle in click(); pitch rises as the handle goes up.
    if (v !== lastVal) { lastVal = v; sliderTick(v / max); }
  };
  box.oninput = () => {
    const v = Math.min(max, Math.max(0, Math.round(Number(box.value) || 0)));
    slider.value = v; updateFill();
  };
  box.onblur = () => { box.value = Math.min(max, Math.max(0, Math.round(Number(box.value) || 0))); };
  $("#minus").onclick = () => nudge(-1, max);
  $("#plus").onclick = () => nudge(1, max);
  $("#lock").onclick = () => lock(q, max, Math.min(max, Math.max(0, Math.round(Number(box.value) || 0))));
}

function nudge(d, max) {
  const box = $("#guess-box");
  const v = Math.min(max, Math.max(0, Math.round(Number(box.value) || 0) + d));
  box.value = v; $("#slider").value = v; updateFill();
  sliderTick(v / max);
}

function updateFill() {
  const s = $("#slider");
  const pct = (Number(s.value) / Number(s.max)) * 100;
  s.style.setProperty("--fill", `${pct}%`);
}

function lock(q, max, guess) {
  const { points, bullseye } = scoreGuess(q, max, guess);
  state.results.push({ id: q.id, guess, points, bullseye });
  save();
  showReveal(q, max, guess, points, bullseye);
}

function showReveal(q, max, guess, points, bullseye) {
  $("#screen-question").hidden = true;
  $("#screen-reveal").hidden = false;
  const unit = q.unit ? ` ${q.unit}` : "";
  const tol = bullseyeTolerance(q, max);

  $("#r-prompt").textContent = q.prompt;
  $("#r-badge").hidden = !bullseye;
  setValue($("#r-answer"), fmt(q.answer), q.unit);
  setValue($("#r-guess"), fmt(guess), q.unit);
  // The range of guesses that would have scored a bullseye.
  const lo = Math.max(0, q.answer - tol), hi = Math.min(max, q.answer + tol);
  setValue($("#r-range"), tol === 0 ? fmt(q.answer) : `${fmt(lo)}–${fmt(hi)}`, q.unit);
  $("#r-range-note").textContent = tol === 0 ? "Exact answer only" : `Within ±${fmt(tol)}`;
  // Off by, as a share of the slider's scale (the same measure the score uses).
  const offPct = (Math.abs(guess - q.answer) / max) * 100;
  $("#r-accuracy").hidden = bullseye;
  const offText = (n) => `${n > 0 && n < 0.1 ? "0.1" : n.toFixed(1)}%`;
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
  const pos = (v) => `${(v / max) * 100}%`;
  for (const [sel, v] of [["#t-answer", q.answer], ["#t-guess", guess]]) {
    const el = $(sel);
    el.dataset.edge = v / max > 0.88 ? "end" : v / max < 0.12 ? "start" : "";
    el.classList.remove("anim");
    el.style.left = reducedMotion() ? pos(v) : "0%";
  }
  // After the dart lands (or is skipped): count up the stats and slide the markers.
  const runStats = () => {
    countUp($("#r-points"), points, (n) => String(Math.round(n)), 150);
    countUp($("#r-accuracy-value"), offPct, offText, 150);
    if (reducedMotion()) return;
    void $("#t-guess").offsetWidth;
    requestAnimationFrame(() => {
      $("#t-guess").classList.add("anim");
      $("#t-guess").style.left = pos(guess);
      $("#t-answer").style.left = pos(q.answer);
      $("#t-answer").classList.add("anim");
    });
  };
  playThrow(throwTier(points, bullseye), runStats);
  $("#t-window").style.left = pos(Math.max(0, q.answer - tol));
  $("#t-window").style.width = `max(2px, ${(Math.min(max, q.answer + tol) - Math.max(0, q.answer - tol)) / max * 100}%)`;
  $("#t-max").textContent = fmt(max);

  const last = state.index === state.questions.length - 1;
  $("#next").textContent = last ? "See results!" : "Next question";
  $("#next").onclick = () => {
    state.index++;
    if (state.index >= state.questions.length) showSummary(); else showQuestion();
  };
  $("#next").focus();
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
  if (tier === "miss") { thunk(1.0); womp(1.2, 233, 0.42); womp(1.66, 208, 1.0, true); }
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
  $("#s-total").textContent = total;
  $("#s-max").textContent = state.questions.length * 100;
  $("#s-squares").textContent = state.results.map(shareSquare).join("");
  const list = $("#s-list");
  list.innerHTML = "";
  state.results.forEach((r, i) => {
    const q = state.questions[i];
    const li = document.createElement("li");
    li.innerHTML = `<span class="s-sq"></span><span class="s-q"></span><span class="s-pts"></span>`;
    li.querySelector(".s-sq").textContent = shareSquare(r);
    li.querySelector(".s-q").textContent = `${q.prompt} ${fmt(q.answer)}${q.unit ? " " + q.unit : ""} (you: ${fmt(r.guess)})`;
    li.querySelector(".s-pts").textContent = r.points;
    list.appendChild(li);
  });
  // Prototype only: jump to the next set of questions to keep playing.
  $("#practice").onclick = () => {
    state.day++;
    state.questions = pickDaily(state.pool, state.day, QUESTIONS_PER_DAY);
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

setupSound();
start();
