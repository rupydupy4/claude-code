// Browser-free checks of the habit logic and the app files. Run: node tests/test-app.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const L = require("../app.js");

const root = path.join(__dirname, "..");
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok   " + name); }
  catch (e) { console.error("FAIL " + name + "\n     " + e.message); process.exitCode = 1; }
}

const today = new Date(2026, 10, 9); // 9 Nov 2026
const key = (n) => L.dateKey(L.addDays(today, n));

test("dateKey is local and zero padded", () => {
  assert.strictEqual(L.dateKey(new Date(2026, 0, 5)), "2026-01-05");
});

test("addDays crosses month and year boundaries", () => {
  assert.strictEqual(L.dateKey(L.addDays(new Date(2026, 0, 1), -1)), "2025-12-31");
  assert.strictEqual(L.dateKey(L.addDays(new Date(2024, 1, 28), 1)), "2024-02-29");
  assert.strictEqual(L.dateKey(L.addDays(new Date(2026, 2, 28), 2)), "2026-03-30"); // UK clocks change
});

test("createHabit trims and fills defaults", () => {
  const h = L.createHabit("  Read  ", "📚", "#3b82f6");
  assert.strictEqual(h.name, "Read");
  assert.strictEqual(h.emoji, "📚");
  assert.strictEqual(h.color, "#3b82f6");
  assert.deepStrictEqual(h.done, {});
  assert.ok(h.id);
  const d = L.createHabit("Walk", "", "red");
  assert.strictEqual(d.emoji, "✅");
  assert.strictEqual(d.color, L.COLOURS[0]);
  assert.strictEqual(L.createHabit("   ", "x", "#000000"), null);
});

test("toggleDay ticks and unticks", () => {
  const h = L.createHabit("Water", "💧", "#22c55e");
  L.toggleDay(h, key(0));
  assert.ok(L.isDone(h, key(0)));
  L.toggleDay(h, key(0));
  assert.ok(!L.isDone(h, key(0)));
});

test("streak counts back from today", () => {
  const h = L.createHabit("Run", "🏃", "#22c55e");
  [0, -1, -2].forEach((n) => L.toggleDay(h, key(n)));
  L.toggleDay(h, key(-4));
  assert.strictEqual(L.currentStreak(h, today), 3);
});

test("streak survives when today isn't ticked yet", () => {
  const h = L.createHabit("Run", "🏃", "#22c55e");
  [-1, -2].forEach((n) => L.toggleDay(h, key(n)));
  assert.strictEqual(L.currentStreak(h, today), 2);
});

test("streak is zero after a missed day", () => {
  const h = L.createHabit("Run", "🏃", "#22c55e");
  L.toggleDay(h, key(-2));
  assert.strictEqual(L.currentStreak(h, today), 0);
  assert.strictEqual(L.currentStreak(L.createHabit("New", "", ""), today), 0);
});

test("streak across a month boundary", () => {
  const d = new Date(2026, 11, 2);
  const h = L.createHabit("Yoga", "🧘", "#a855f7");
  ["2026-12-02", "2026-12-01", "2026-11-30", "2026-11-29"].forEach((k) => L.toggleDay(h, k));
  assert.strictEqual(L.currentStreak(h, d), 4);
});

test("bestStreak finds the longest run", () => {
  const h = L.createHabit("Read", "📚", "#3b82f6");
  ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-10", "2026-10-31", "2026-11-01"].forEach((k) => L.toggleDay(h, k));
  assert.strictEqual(L.bestStreak(h), 4);
  assert.strictEqual(L.bestStreak(L.createHabit("x", "", "")), 0);
});

test("lastSevenDays is oldest first and ends today", () => {
  const h = L.createHabit("Read", "📚", "#3b82f6");
  L.toggleDay(h, key(-6));
  L.toggleDay(h, key(0));
  const w = L.lastSevenDays(h, today);
  assert.strictEqual(w.length, 7);
  assert.strictEqual(w[0].key, key(-6));
  assert.strictEqual(w[6].key, key(0));
  assert.ok(w[0].done && w[6].done && !w[3].done);
  assert.ok(w[6].isToday && !w[5].isToday);
});

test("save and load round trip", () => {
  const h = L.createHabit("Floss", "🦷", "#14b8a6");
  L.toggleDay(h, key(0));
  const back = L.parseHabits(L.serialiseHabits([h]));
  assert.deepStrictEqual(back, [h]);
});

test("parseHabits copes with bad or old data", () => {
  assert.deepStrictEqual(L.parseHabits(null), []);
  assert.deepStrictEqual(L.parseHabits("not json{"), []);
  assert.deepStrictEqual(L.parseHabits("42"), []);
  const list = L.parseHabits(JSON.stringify([{ name: "Old", done: { "2026-11-01": true, junk: true, "2026-11-02": false } }, { name: "" }, null]));
  assert.strictEqual(list.length, 1);
  assert.deepStrictEqual(list[0].done, { "2026-11-01": true });
});

test("index.html has every element app.js looks up", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const ids = new Set([...js.matchAll(/\$\("([\w-]+)"\)/g)].map((m) => m[1]));
  assert.ok(ids.size > 10);
  ids.forEach((id) => assert.ok(html.includes('id="' + id + '"'), "missing id " + id));
  const htmlIds = [...html.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]);
  assert.strictEqual(new Set(htmlIds).size, htmlIds.length, "duplicate ids in index.html");
});

test("manifest is valid and its icons exist", () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  assert.strictEqual(m.display, "standalone");
  m.icons.forEach((i) => assert.ok(fs.existsSync(path.join(root, i.src)), "missing " + i.src));
});

test("PNG icons are real PNGs of the right size", () => {
  [192, 512].forEach((s) => {
    const b = fs.readFileSync(path.join(root, "icon-" + s + ".png"));
    assert.strictEqual(b.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.strictEqual(b.readUInt32BE(16), s);
    assert.strictEqual(b.readUInt32BE(20), s);
  });
});

test("service worker caches every app file", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  new Function(sw); // syntax check
  ["index.html", "styles.css", "app.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"].forEach((f) => {
    assert.ok(sw.includes("./" + f), "sw.js does not cache " + f);
    assert.ok(fs.existsSync(path.join(root, f)), "file missing: " + f);
  });
});

console.log("\n" + passed + " checks passed" + (process.exitCode ? ", some FAILED" : ""));
