// Daily score counts for "better than X% of players" and the results graph.
// Runs as a Cloudflare Pages Function at /api/scores, backed by a D1 database
// bound to this project as DB. With no database bound it answers 503 and the
// page simply hides the crowd stats.
//
//   POST /api/scores {day, total}   records one finished game
//   GET  /api/scores?day=N&total=T  returns the day's numbers
//
// Response: { day, players, below, same, bins }
//   below / same: how many players scored under / exactly T
//   bins: players per 50 points (0-49, 50-99, ... 950-999, 1000)

const LAUNCH = Date.UTC(2026, 10, 7); // puzzle #1, matches js/rules.js
const MAX_TOTAL = 1000;
const BIN = 50;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Latest puzzle anyone could be playing: tomorrow in UTC covers every time zone.
const latestDay = () => Math.floor((Date.now() - LAUNCH) / 86400000) + 2;
const validDay = (d) => Number.isInteger(d) && d >= 1 && d <= latestDay();
const validTotal = (t) => Number.isInteger(t) && t >= 0 && t <= MAX_TOTAL;

async function ensureTable(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS scores (day INTEGER NOT NULL, total INTEGER NOT NULL, at INTEGER NOT NULL)"
  ).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS scores_day ON scores (day, total)").run();
}

async function summary(db, day, total) {
  const bins = new Array(MAX_TOTAL / BIN + 1).fill(0);
  const { results } = await db
    .prepare(`SELECT CAST(total / ${BIN} AS INTEGER) AS b, COUNT(*) AS n FROM scores WHERE day = ? GROUP BY b`)
    .bind(day)
    .all();
  for (const r of results) bins[Math.min(bins.length - 1, r.b)] = r.n;
  const players = bins.reduce((a, n) => a + n, 0);
  let below = 0, same = 0;
  if (validTotal(total)) {
    const row = await db
      .prepare("SELECT SUM(total < ?1) AS below, SUM(total = ?1) AS same FROM scores WHERE day = ?2")
      .bind(total, day)
      .first();
    below = row?.below ?? 0;
    same = row?.same ?? 0;
  }
  return { day, players, below, same, bins };
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "no database" }, 503);
  const url = new URL(request.url);
  const day = Number(url.searchParams.get("day"));
  const total = Number(url.searchParams.get("total"));
  if (!validDay(day)) return json({ error: "bad day" }, 400);
  await ensureTable(env.DB);
  return json(await summary(env.DB, day, total));
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "no database" }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const day = Number(body?.day), total = Number(body?.total);
  if (!validDay(day) || !validTotal(total)) return json({ error: "bad score" }, 400);
  await ensureTable(env.DB);
  await env.DB.prepare("INSERT INTO scores (day, total, at) VALUES (?, ?, ?)").bind(day, total, Date.now()).run();
  return json(await summary(env.DB, day, total));
}
