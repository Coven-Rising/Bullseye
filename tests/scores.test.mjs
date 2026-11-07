// The /api/scores function, run against an in-memory SQLite stand-in for D1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { onRequestGet, onRequestPost } from "../functions/api/scores.js";

// Just enough of the D1 API for the function: prepare().bind().run()/all()/first().
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { db.prepare(sql).run(...args); return {}; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
  });
  return { prepare: (sql) => stmt(sql) };
}

const post = (env, body) =>
  onRequestPost({ env, request: new Request("https://x/api/scores", { method: "POST", body: JSON.stringify(body) }) });
const get = (env, q) => onRequestGet({ env, request: new Request(`https://x/api/scores?${q}`) });

test("records scores and reports where a total sits", async () => {
  const env = { DB: fakeD1() };
  for (const total of [120, 480, 510, 690, 700, 700, 950, 1000]) assert.equal((await post(env, { day: 1, total })).status, 200);
  await post(env, { day: 2, total: 300 }); // another day doesn't count
  const data = await (await get(env, "day=1&total=700")).json();
  assert.equal(data.players, 8);
  assert.equal(data.below, 4);
  assert.equal(data.same, 2);
  assert.equal(data.bins.length, 21);
  assert.equal(data.bins[14], 2); // 700-749
  assert.equal(data.bins[20], 1); // a perfect 1000
  assert.equal(data.bins.reduce((a, n) => a + n, 0), 8);
  assert.equal(data.average, 644); // (120+480+510+690+700+700+950+1000) / 8 = 643.75
  const d2 = await (await get(env, "day=2&total=500")).json();
  assert.equal(d2.players, 1);
  assert.equal(d2.average, 300);
  const empty = await (await get({ DB: fakeD1() }, "day=1&total=500")).json();
  assert.equal(empty.players, 0);
  assert.equal(empty.average, null);
});

test("rejects bad scores and days, and 503s without a database", async () => {
  const env = { DB: fakeD1() };
  assert.equal((await post(env, { day: 1, total: 1001 })).status, 400);
  assert.equal((await post(env, { day: 1, total: 12.5 })).status, 400);
  assert.equal((await post(env, { day: 0, total: 500 })).status, 400);
  assert.equal((await post(env, { day: 99999, total: 500 })).status, 400);
  assert.equal((await get({}, "day=1&total=5")).status, 503);
});
