// Adds new days to data/schedule.json from questions that have never been
// used. Existing days are never touched.
//   node scripts/schedule.mjs          add as many full days as the pool allows
//   node scripts/schedule.mjs --check  report how many days are left
import fs from "node:fs";
import { planDays, puzzleNumber, LAUNCH_DATE } from "../js/rules.js";

const PER_DAY = 10;
const qPath = new URL("../data/questions.json", import.meta.url);
const sPath = new URL("../data/schedule.json", import.meta.url);
const pool = JSON.parse(fs.readFileSync(qPath));
const schedule = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath)) : { launch: LAUNCH_DATE, days: [] };

const today = puzzleNumber(new Date());
if (!process.argv.includes("--check")) {
  const added = planDays(pool, schedule, PER_DAY);
  schedule.days.push(...added);
  const body = schedule.days.map((d) => "    " + JSON.stringify(d)).join(",\n");
  fs.writeFileSync(sPath, `{\n  "launch": "${schedule.launch}",\n  "days": [\n${body}\n  ]\n}\n`);
  console.log(`Added ${added.length} days.`);
}
const used = new Set(schedule.days.flat());
const spare = pool.filter((q) => !used.has(q.id)).length;
const left = schedule.days.length - today;
console.log(`${schedule.days.length} days scheduled (through ${dateOf(schedule.days.length)}). Today is #${today}, so ${left} days remain. ${spare} unused questions waiting.`);
if (left < 14) console.log("Running low: add more questions, then run this again.");

function dateOf(n) {
  const [y, m, d] = schedule.launch.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n - 1)).toISOString().slice(0, 10);
}
