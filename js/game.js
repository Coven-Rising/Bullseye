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

  slider.oninput = () => { box.value = Math.round(Number(slider.value)); updateFill(); };
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
  $("#r-points").textContent = points;
  $("#r-answer").textContent = fmt(q.answer) + unit;
  $("#r-guess").textContent = fmt(guess) + unit;
  // Off by, as a share of the slider's scale (the same measure the score uses).
  const offPct = (Math.abs(guess - q.answer) / max) * 100;
  $("#r-accuracy").hidden = bullseye;
  $("#r-accuracy-value").textContent = `${offPct > 0 && offPct < 0.1 ? "0.1" : offPct.toFixed(1)}%`;
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
    el.style.left = pos(v);
    el.dataset.edge = v / max > 0.88 ? "end" : v / max < 0.12 ? "start" : "";
  }
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

start();
