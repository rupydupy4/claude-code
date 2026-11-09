// Runs the real interface code against a tiny fake DOM (no browser needed).
// Run: node tests/test-ui.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

class El {
  constructor(tag, id) {
    this.tagName = tag; this.id = id || ""; this.children = []; this.listeners = {};
    this.style = { setProperty() {} }; this.dataset = {}; this.attrs = {};
    this.hidden = false; this.value = ""; this._text = ""; this.className = "";
    const self = this;
    this.classList = {
      add(c) { if (!self.classList.contains(c)) self.className = (self.className + " " + c).trim(); },
      remove(c) { self.className = self.className.split(" ").filter((x) => x !== c).join(" "); },
      contains(c) { return self.className.split(" ").includes(c); },
      toggle(c, on) { if (on === undefined) on = !self.classList.contains(c); on ? self.classList.add(c) : self.classList.remove(c); }
    };
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  set innerHTML(v) { this.children = []; this._text = ""; }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  focus() {}
  fire(t, extra) { (this.listeners[t] || []).forEach((f) => f(Object.assign({ target: this, preventDefault() {} }, extra))); }
  all() { return this.children.reduce((a, c) => a.concat([c], c.all()), []); }
}

const byId = {};
for (const m of html.matchAll(/<(\w+)[^>]*\sid="([\w-]+)"[^>]*>/g)) {
  byId[m[2]] = new El(m[1], m[2]);
  if (/\shidden[\s>]/.test(m[0])) byId[m[2]].hidden = true;
}
const docListeners = {};
const document = {
  readyState: "complete", hidden: false,
  getElementById: (id) => byId[id] || null,
  createElement: (t) => new El(t),
  querySelectorAll: (sel) => {
    const cls = sel.replace(".", "");
    return [byId["emoji-picker"], byId["colour-picker"]].flatMap((p) => p.all()).filter((e) => e.classList.contains(cls));
  },
  addEventListener: (t, f) => { docListeners[t] = f; }
};
const store = {};
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

const ctx = { document, localStorage, navigator: {}, location: { protocol: "file:" }, confirm: () => true,
  setTimeout: (f) => 0, clearTimeout() {}, console, Date, Math, JSON, Object, Array, String, Number, RegExp };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), ctx, { filename: "app.js" });

const list = byId["habit-list"];
const saved = () => JSON.parse(store["habit-tracker.v1"]).habits;
const cards = () => list.children;
const find = (el, cls) => el.all().filter((e) => e.classList.contains(cls));

// Starts empty
assert.strictEqual(byId["empty"].hidden, false);
assert.strictEqual(cards().length, 0);

// Add a habit
byId["add-btn"].fire("click");
assert.strictEqual(byId["dialog"].hidden, false);
assert.strictEqual(byId["delete-btn"].hidden, true);
byId["habit-name"].value = "Drink water";
find(byId["colour-picker"], "pick-colour")[2].fire("click");
byId["habit-form"].fire("submit");
assert.strictEqual(byId["dialog"].hidden, true);
assert.strictEqual(cards().length, 1);
assert.strictEqual(saved()[0].name, "Drink water");
assert.strictEqual(saved()[0].color, "#a855f7");
assert.strictEqual(byId["empty"].hidden, true);

// Empty name is refused
byId["add-btn"].fire("click");
byId["habit-name"].value = "   ";
byId["habit-form"].fire("submit");
assert.strictEqual(byId["dialog"].hidden, false);
byId["cancel-btn"].fire("click");
assert.strictEqual(cards().length, 1);

// Tick today
find(cards()[0], "tick")[0].fire("click");
const todayKey = ctx.HabitLogic.dateKey(new Date());
assert.strictEqual(saved()[0].done[todayKey], true);
assert.ok(cards()[0].classList.contains("done"));
assert.ok(find(cards()[0], "habit-streak")[0].textContent.includes("1 day streak"));
assert.strictEqual(byId["summary"].textContent, "1 of 1 done today");

// Tick yesterday via the 7-day grid -> streak 2
const days = find(cards()[0], "day");
assert.strictEqual(days.length, 7);
days[5].fire("click");
assert.ok(find(cards()[0], "habit-streak")[0].textContent.includes("2 days streak"));

// Edit with a typed emoji
find(cards()[0], "icon-btn")[0].fire("click");
assert.strictEqual(byId["habit-name"].value, "Drink water");
assert.strictEqual(byId["delete-btn"].hidden, false);
byId["habit-name"].value = "Water";
byId["habit-emoji"].value = "🥤";
byId["habit-form"].fire("submit");
assert.strictEqual(saved()[0].name, "Water");
assert.strictEqual(saved()[0].emoji, "🥤");
assert.strictEqual(Object.keys(saved()[0].done).length, 2);

// Reload from storage keeps everything
assert.strictEqual(ctx.HabitLogic.parseHabits(store["habit-tracker.v1"]).length, 1);

// Delete
find(cards()[0], "icon-btn")[0].fire("click");
byId["delete-btn"].fire("click");
assert.strictEqual(cards().length, 0);
assert.strictEqual(saved().length, 0);
assert.strictEqual(byId["empty"].hidden, false);

console.log("UI checks passed");
