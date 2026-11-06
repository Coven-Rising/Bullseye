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

  let lastNotch = 0;
  slider.oninput = () => {
    box.value = Math.round(Number(slider.value)); updateFill();
    // Tick each time the handle crosses one of 40 notches along the bar.
    const notch = Math.round((Number(slider.value) / max) * 40);
    if (notch !== lastNotch) { lastNotch = notch; sliderTick(); }
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
  sliderTick();
  const box = $("#guess-box");
  const v = Math.min(max, Math.max(0, Math.round(Number(box.value) || 0) + d));
  box.value = v; $("#slider").value = v; updateFill();
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
  countUp($("#r-points"), points, (n) => String(Math.round(n)), bullseye ? BULL_FX_MS : 250);
  $("#r-answer").textContent = fmt(q.answer) + unit;
  $("#r-guess").textContent = fmt(guess) + unit;
  // Off by, as a share of the slider's scale (the same measure the score uses).
  const offPct = (Math.abs(guess - q.answer) / max) * 100;
  $("#r-accuracy").hidden = bullseye;
  const offText = (n) => `${n > 0 && n < 0.1 ? "0.1" : n.toFixed(1)}%`;
  countUp($("#r-accuracy-value"), offPct, offText, 250);
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
  if (!reducedMotion()) {
    // Guess slides along the track, then the answer marker pops in.
    void $("#t-guess").offsetWidth;
    requestAnimationFrame(() => {
      $("#t-guess").classList.add("anim");
      $("#t-guess").style.left = pos(guess);
      $("#t-answer").style.left = pos(q.answer);
      $("#t-answer").classList.add("anim");
    });
  }
  if (bullseye) playBullseye();
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
let lastTick = 0;
function click(freq, gain, minGap) {
  if (!soundOn) return;
  const now = performance.now();
  if (now - lastTick < minGap) return;
  lastTick = now;
  const a = ctx(); if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = "square"; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.02);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.03);
}
const sliderTick = () => click(1400, 0.06, 28);
const countTick = () => click(2600, 0.045, 38);

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

// Full-screen dartboard: the board pops up, a dart flies into the bull.
function playBullseye() {
  bullseyeSound();
  if (reducedMotion()) return;
  const fx = $("#bull-fx");
  fx.hidden = false;
  fx.classList.remove("play");
  void fx.offsetWidth;
  fx.classList.add("play");
  const close = () => { fx.hidden = true; fx.classList.remove("play"); };
  clearTimeout(fx._t);
  fx._t = setTimeout(close, BULL_FX_MS + 200);
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
