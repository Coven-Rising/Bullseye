import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { sliderMax, bullseyeTolerance, scoreGuess, dailyQuestions, planDays, puzzleNumber } from "../js/rules.js";

const pool = JSON.parse(fs.readFileSync(new URL("../data/questions.json", import.meta.url)));
const schedule = JSON.parse(fs.readFileSync(new URL("../data/schedule.json", import.meta.url)));

test("slider top is a clean number at or above the answer", () => {
  for (const q of pool) {
    const max = sliderMax(q);
    assert.ok(max >= q.answer, q.id);
    assert.ok(max <= q.answer * 10 + 10, q.id);
  }
  assert.equal(sliderMax({ id: "x", answer: 99 }) >= 100, true);
});

test("the answer never sits at the very end of the bar", () => {
  for (const q of pool) assert.ok(q.answer <= sliderMax(q) * 0.9, q.id);
  assert.ok(sliderMax({ id: "y", answer: 100 }) > 100);
});

test("small scales need an exact answer", () => {
  assert.equal(bullseyeTolerance({ type: "fact" }, 100), 0);
  assert.equal(bullseyeTolerance({ type: "fact" }, 1000000), 5000);
  assert.equal(bullseyeTolerance({ type: "fermi" }, 250000), 5000);
});

test("scoring", () => {
  const q = { type: "fact", answer: 26 };
  assert.deepEqual(scoreGuess(q, 100, 26), { points: 100, bullseye: true });
  assert.equal(scoreGuess(q, 100, 31).points, 75);
  assert.equal(scoreGuess(q, 100, 90).points, 0);
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
