import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { sliderMax, sliderRange, bullseyeTolerance, scoreGuess, formatValue, parseGuess, crowdStanding, calculate, formatCalc, dailyQuestions, planDays, puzzleNumber } from "../js/rules.js";

const pool = JSON.parse(fs.readFileSync(new URL("../data/questions.json", import.meta.url)));
const schedule = JSON.parse(fs.readFileSync(new URL("../data/schedule.json", import.meta.url)));

test("slider top is a clean number at or above the answer", () => {
  for (const q of pool.filter((q) => q.type !== "year")) {
    const max = sliderMax(q);
    assert.ok(max >= q.answer, q.id);
    assert.ok(max <= q.answer * 10 + 10, q.id);
  }
  assert.equal(sliderMax({ id: "x", answer: 99 }) >= 100, true);
});

test("the answer never sits at the very end of the bar", () => {
  for (const q of pool) {
    const { min, max } = sliderRange(q);
    const at = (q.answer - min) / (max - min);
    assert.ok(at <= 0.9 && (q.type !== "year" || at >= 0.1), q.id);
  }
  assert.ok(sliderMax({ id: "y", answer: 100 }) > 100);
});

test("bullseye is 2% of the answer (5% Fermi), and small counts must be exact", () => {
  const r = { min: 0, max: 50000 };
  assert.equal(bullseyeTolerance({ type: "fact", answer: 40990 }, r), 819);
  assert.equal(bullseyeTolerance({ type: "fact", answer: 8 }, r), 0);
  assert.equal(bullseyeTolerance({ type: "fact", answer: 49 }, r), 0);
  assert.equal(bullseyeTolerance({ type: "fact", answer: 236 }, r), 4);
  assert.equal(bullseyeTolerance({ type: "fermi", answer: 25463 }, r), 1273);
  assert.equal(bullseyeTolerance({ type: "year", answer: 1853 }, { min: 1800, max: 1900 }), 0);
});

test("scoring is measured against the real answer, the same on any scale", () => {
  const q = { type: "fact", answer: 1000 };
  assert.deepEqual(scoreGuess(q, { min: 0, max: 2000 }, 1020), { points: 100, bullseye: true });
  assert.equal(scoreGuess(q, { min: 0, max: 2000 }, 1100).points, 82);
  assert.equal(scoreGuess(q, { min: 0, max: 5000 }, 900).points, 81);
  assert.equal(scoreGuess(q, { min: 0, max: 2000 }, 1250).points, 72);
  assert.equal(scoreGuess(q, { min: 0, max: 2000 }, 1500).points, 57);
  // Too high and too low by the same factor score the same.
  assert.equal(scoreGuess(q, { min: 0, max: 5000 }, 2000).points, 33);
  assert.equal(scoreGuess(q, { min: 0, max: 5000 }, 500).points, 33);
  assert.equal(scoreGuess(q, { min: 0, max: 5000 }, 3000).points, 0);
  assert.equal(scoreGuess(q, { min: 0, max: 5000 }, 0).points, 0);
  assert.equal(scoreGuess({ type: "fact", answer: 8 }, { min: 0, max: 10 }, 9).points, 80);
});

test("schedule: every day has 10 real questions and nothing is ever reused", () => {
  const ids = new Set(pool.map((q) => q.id));
  const seen = new Set();
  for (const [i, day] of schedule.days.entries()) {
    assert.equal(day.length, 10, `day ${i + 1}`);
    for (const id of day) {
      assert.ok(ids.has(id), `day ${i + 1}: unknown question ${id}`);
      assert.ok(!seen.has(id), `day ${i + 1}: ${id} was already used`);
      seen.add(id);
    }
  }
  assert.equal(dailyQuestions(pool, schedule, 1).length, 10);
});

test("planning new days never changes old ones or reuses questions", () => {
  const fake = Array.from({ length: 35 }, (_, i) => ({ id: "q" + i, category: "c" + (i % 7), type: i % 5 ? "fact" : "fermi" }));
  const s = { days: planDays(fake.slice(0, 20), { days: [] }, 10) };
  const before = JSON.stringify(s.days);
  const more = planDays(fake, s, 10);
  assert.equal(JSON.stringify(s.days), before);
  assert.equal(more.length, 1);
  const all = [...s.days, ...more].flat();
  assert.equal(new Set(all).size, all.length);
});

test("year questions use a window of years", () => {
  const vg = { id: "van-gogh-born", type: "year", answer: 1853 };
  const r = sliderRange(vg);
  assert.equal(r.max - r.min, 100);
  assert.equal(r.min % 25, 0);
  assert.ok(vg.answer - r.min >= 10 && r.max - vg.answer >= 10);
  assert.ok(sliderRange({ id: "moon", type: "year", answer: 2010 }).max <= 2025);
  assert.equal(sliderRange({ id: "rome", type: "year", answer: 1453 }).max - sliderRange({ id: "rome", type: "year", answer: 1453 }).min, 500);
  assert.deepEqual(scoreGuess(vg, r, 1853), { points: 100, bullseye: true });
  assert.equal(scoreGuess(vg, r, 1863).points, 77);
  assert.equal(formatValue(vg, 1853), "1853");
  assert.equal(formatValue({ type: "fact" }, 1853), "1,853");
  // Different questions land at different spots in their window.
  const spots = new Set(["a", "b", "c", "d", "e", "f"].map((id) => sliderRange({ id, type: "year", answer: 1853 }).min));
  assert.ok(spots.size > 1);
});

test("puzzle numbering", () => {
  assert.equal(puzzleNumber(new Date(2026, 10, 7)), 1);
  assert.equal(puzzleNumber(new Date(2026, 10, 8)), 2);
});

test("every question has an id, answer and source", () => {
  const ids = new Set();
  for (const q of pool) {
    assert.ok(q.id && !ids.has(q.id)); ids.add(q.id);
    assert.ok(Number.isInteger(q.answer) && q.answer > 0, q.id);
    assert.match(q.source, /^https:\/\//);
  }
});

test("big numbers shorten to 3 significant figures, the guess box keeps every digit", () => {
  const f = { type: "fact" };
  assert.equal(formatValue(f, 999999), "999,999");
  assert.equal(formatValue(f, 3333360), "3.33M");
  assert.equal(formatValue(f, 150000000), "150M");
  assert.equal(formatValue(f, 3000000000), "3B");
  assert.equal(formatValue(f, 500000000000), "500B");
  assert.equal(formatValue(f, 2950000000), "2.95B");
  assert.equal(formatValue(f, 3000000000, { full: true }), "3,000,000,000");
  assert.equal(formatValue({ type: "year" }, 1853, { full: true }), "1853");
  assert.equal(parseGuess("3,000,000"), 3000000);
  assert.equal(parseGuess(""), 0);
});

test("crowd standing: your score against the community average", () => {
  const bins = [1];
  assert.deepEqual(crowdStanding({ players: 50, average: 620, bins }, 640), { average: 620, diff: 20, bins });
  assert.equal(crowdStanding({ players: 50, average: 620, bins }, 580).diff, -40);
  assert.equal(crowdStanding({ players: 1, average: 640, bins }, 640), null);
  assert.equal(crowdStanding(null, 640), null);
});

test("scratchpad calculator", () => {
  assert.equal(calculate("2+3×4"), 14);
  assert.equal(calculate("(2+3)×4"), 20);
  assert.equal(calculate("2,200,000,000÷86,400"), 2200000000 / 86400);
  assert.equal(calculate("-5+2"), -3);
  assert.equal(calculate("0.1+0.2"), 0.1 + 0.2);
  assert.equal(calculate("8849÷330"), 8849 / 330);
  assert.equal(calculate("1÷0"), null);
  assert.equal(calculate("2+"), null);
  assert.equal(calculate("(2+3"), null);
  assert.equal(calculate(""), null);
  assert.equal(calculate("alert(1)"), null);
  assert.equal(formatCalc(0.1 + 0.2), "0.3");
  assert.equal(formatCalc(2200000000 / 86400), "25,462.962963");
  assert.equal(formatCalc(null), "");
});
