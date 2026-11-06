import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { sliderMax, bullseyeTolerance, scoreGuess, pickDaily, puzzleNumber } from "../js/rules.js";

const pool = JSON.parse(fs.readFileSync(new URL("../data/questions.json", import.meta.url)));

test("slider top is a clean number at or above the answer", () => {
  for (const q of pool) {
    const max = sliderMax(q);
    assert.ok(max >= q.answer, q.id);
    assert.ok(max <= q.answer * 10 + 10, q.id);
  }
  assert.equal(sliderMax({ id: "x", answer: 99 }) >= 100, true);
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

test("daily pick has no repeats within a day and is stable", () => {
  for (let d = 1; d < 20; d++) {
    const ids = pickDaily(pool, d, 10).map((q) => q.id);
    assert.equal(new Set(ids).size, 10);
    assert.deepEqual(ids, pickDaily(pool, d, 10).map((q) => q.id));
  }
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
