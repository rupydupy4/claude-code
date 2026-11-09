/* Habit Tracker - plain JavaScript, saved in localStorage.
   The logic functions at the top have no DOM access so they can be tested with Node. */
(function (root) {
  "use strict";

  var STORAGE_KEY = "habit-tracker.v1";
  var COLOURS = ["#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#eab308", "#14b8a6", "#ef4444"];
  var EMOJIS = ["💧", "🏃", "📚", "🧘", "🥗", "😴", "💪", "🎸", "✍️", "🦷", "🚶", "🌱"];

  /* ---------- Pure logic ---------- */

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // Local date as "YYYY-MM-DD" (not UTC, so ticks match the user's own day).
  function dateKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function addDays(d, n) {
    var c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    c.setDate(c.getDate() + n);
    return c;
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function cleanHabit(h) {
    if (!h || typeof h !== "object") return null;
    var name = typeof h.name === "string" ? h.name.trim().slice(0, 60) : "";
    if (!name) return null;
    var done = {};
    if (h.done && typeof h.done === "object") {
      Object.keys(h.done).forEach(function (k) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && h.done[k]) done[k] = true;
      });
    }
    return {
      id: typeof h.id === "string" && h.id ? h.id : makeId(),
      name: name,
      emoji: typeof h.emoji === "string" && h.emoji.trim() ? h.emoji.trim().slice(0, 8) : "✅",
      color: /^#[0-9a-fA-F]{6}$/.test(h.color) ? h.color : COLOURS[0],
      done: done
    };
  }

  function parseHabits(text) {
    if (!text) return [];
    try {
      var data = JSON.parse(text);
      var list = Array.isArray(data) ? data : (data && Array.isArray(data.habits) ? data.habits : []);
      return list.map(cleanHabit).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function serialiseHabits(habits) {
    return JSON.stringify({ version: 1, habits: habits });
  }

  function createHabit(name, emoji, color) {
    return cleanHabit({ id: makeId(), name: name, emoji: emoji, color: color, done: {} });
  }

  function isDone(habit, key) { return !!habit.done[key]; }

  function toggleDay(habit, key) {
    if (habit.done[key]) delete habit.done[key];
    else habit.done[key] = true;
    return habit;
  }

  // Streak = consecutive done days ending today. If today isn't ticked yet,
  // the streak from yesterday still counts (you still have time today).
  function currentStreak(habit, today) {
    var day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!isDone(habit, dateKey(day))) day = addDays(day, -1);
    var count = 0;
    while (isDone(habit, dateKey(day))) {
      count++;
      day = addDays(day, -1);
    }
    return count;
  }

  function bestStreak(habit) {
    var keys = Object.keys(habit.done).sort();
    var best = 0, run = 0, prev = null;
    keys.forEach(function (k) {
      var p = k.split("-");
      var d = new Date(+p[0], +p[1] - 1, +p[2]);
      run = prev && dateKey(addDays(prev, 1)) === k ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    });
    return best;
  }

  // The last 7 days, oldest first, ending today.
  function lastSevenDays(habit, today) {
    var out = [];
    for (var i = 6; i >= 0; i--) {
      var d = addDays(today, -i);
      var k = dateKey(d);
      out.push({ key: k, date: d, done: isDone(habit, k), isToday: i === 0 });
    }
    return out;
  }

  var Logic = {
    COLOURS: COLOURS, EMOJIS: EMOJIS, STORAGE_KEY: STORAGE_KEY,
    dateKey: dateKey, addDays: addDays, cleanHabit: cleanHabit, parseHabits: parseHabits,
    serialiseHabits: serialiseHabits, createHabit: createHabit, isDone: isDone,
    toggleDay: toggleDay, currentStreak: currentStreak, bestStreak: bestStreak,
    lastSevenDays: lastSevenDays
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Logic;
  root.HabitLogic = Logic;

  /* ---------- User interface (browser only) ---------- */

  if (typeof document === "undefined") return;

  var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var habits = [];
  var editingId = null;
  var form = { emoji: EMOJIS[0], color: COLOURS[0] };

  function $(id) { return document.getElementById(id); }

  function load() {
    try { habits = parseHabits(localStorage.getItem(STORAGE_KEY)); }
    catch (e) { habits = []; }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, serialiseHabits(habits)); }
    catch (e) { toast("Couldn't save - storage may be full or blocked."); }
  }

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function render() {
    var today = new Date();
    var todayKey = dateKey(today);
    $("today-label").textContent = today.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

    var doneCount = habits.filter(function (h) { return isDone(h, todayKey); }).length;
    $("summary").textContent = habits.length
      ? doneCount + " of " + habits.length + " done today"
      : "";
    var pct = habits.length ? Math.round(doneCount / habits.length * 100) : 0;
    $("progress-bar").style.width = pct + "%";
    $("progress").hidden = !habits.length;

    var list = $("habit-list");
    list.innerHTML = "";
    $("empty").hidden = habits.length > 0;

    habits.forEach(function (h) {
      var card = el("li", "habit");
      card.style.setProperty("--c", h.color);
      var doneToday = isDone(h, todayKey);
      if (doneToday) card.classList.add("done");

      var top = el("div", "habit-top");
      var tick = el("button", "tick");
      tick.type = "button";
      tick.setAttribute("aria-pressed", doneToday ? "true" : "false");
      tick.setAttribute("aria-label", (doneToday ? "Untick " : "Tick ") + h.name + " for today");
      tick.textContent = doneToday ? "✓" : h.emoji;
      tick.addEventListener("click", function () {
        toggleDay(h, todayKey);
        save();
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
        render();
      });

      var info = el("div", "habit-info");
      info.appendChild(el("div", "habit-name", h.emoji + " " + h.name));
      var s = currentStreak(h, today);
      var best = bestStreak(h);
      info.appendChild(el("div", "habit-streak",
        (s > 0 ? "🔥 " + s + " day" + (s === 1 ? "" : "s") + " streak" : "No streak yet") +
        (best > 0 ? " · best " + best : "")));

      var edit = el("button", "icon-btn", "✎");
      edit.type = "button";
      edit.setAttribute("aria-label", "Edit " + h.name);
      edit.addEventListener("click", function () { openDialog(h.id); });

      top.appendChild(tick);
      top.appendChild(info);
      top.appendChild(edit);
      card.appendChild(top);

      var grid = el("div", "week");
      lastSevenDays(h, today).forEach(function (d) {
        var cell = el("button", "day" + (d.done ? " on" : "") + (d.isToday ? " today" : ""));
        cell.type = "button";
        cell.title = d.date.toLocaleDateString();
        cell.setAttribute("aria-label", d.date.toLocaleDateString() + (d.done ? ", done" : ", not done"));
        cell.appendChild(el("span", "day-name", DAY_NAMES[d.date.getDay()].charAt(0)));
        cell.appendChild(el("span", "day-dot", d.done ? "✓" : String(d.date.getDate())));
        cell.addEventListener("click", function () {
          toggleDay(h, d.key);
          save();
          render();
        });
        grid.appendChild(cell);
      });
      card.appendChild(grid);
      list.appendChild(card);
    });
  }

  function buildPickers() {
    var ep = $("emoji-picker");
    ep.innerHTML = "";
    EMOJIS.forEach(function (e) {
      var b = el("button", "pick-emoji", e);
      b.type = "button";
      b.setAttribute("aria-label", "Emoji " + e);
      b.addEventListener("click", function () { form.emoji = e; $("habit-emoji").value = e; syncPickers(); });
      ep.appendChild(b);
    });
    var cp = $("colour-picker");
    cp.innerHTML = "";
    COLOURS.forEach(function (c) {
      var b = el("button", "pick-colour");
      b.type = "button";
      b.style.background = c;
      b.dataset.c = c;
      b.setAttribute("aria-label", "Colour " + c);
      b.addEventListener("click", function () { form.color = c; syncPickers(); });
      cp.appendChild(b);
    });
  }

  function syncPickers() {
    Array.prototype.forEach.call(document.querySelectorAll(".pick-emoji"), function (b) {
      b.classList.toggle("sel", b.textContent === form.emoji);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".pick-colour"), function (b) {
      b.classList.toggle("sel", b.dataset.c === form.color);
    });
    $("dialog-card").style.setProperty("--c", form.color);
  }

  function openDialog(id) {
    editingId = id || null;
    var h = habits.filter(function (x) { return x.id === id; })[0];
    form.emoji = h ? h.emoji : EMOJIS[habits.length % EMOJIS.length];
    form.color = h ? h.color : COLOURS[habits.length % COLOURS.length];
    $("dialog-title").textContent = h ? "Edit habit" : "New habit";
    $("habit-name").value = h ? h.name : "";
    $("habit-emoji").value = form.emoji;
    $("delete-btn").hidden = !h;
    syncPickers();
    $("dialog").hidden = false;
    setTimeout(function () { $("habit-name").focus(); }, 50);
  }

  function closeDialog() {
    $("dialog").hidden = true;
    editingId = null;
  }

  function submitDialog(ev) {
    ev.preventDefault();
    var name = $("habit-name").value.trim();
    if (!name) { toast("Give your habit a name."); return; }
    var typed = $("habit-emoji").value.trim();
    if (typed) form.emoji = typed;
    if (editingId) {
      var h = habits.filter(function (x) { return x.id === editingId; })[0];
      if (h) { h.name = name.slice(0, 60); h.emoji = form.emoji.slice(0, 8); h.color = form.color; }
      toast("Habit updated");
    } else {
      habits.push(createHabit(name, form.emoji, form.color));
      toast("Habit added");
    }
    save();
    closeDialog();
    render();
  }

  function deleteHabit() {
    var h = habits.filter(function (x) { return x.id === editingId; })[0];
    if (!h) return;
    if (!confirm("Delete \"" + h.name + "\" and all its history?")) return;
    habits = habits.filter(function (x) { return x.id !== editingId; });
    save();
    closeDialog();
    render();
    toast("Habit deleted");
  }

  function init() {
    load();
    buildPickers();
    $("add-btn").addEventListener("click", function () { openDialog(null); });
    $("habit-form").addEventListener("submit", submitDialog);
    $("cancel-btn").addEventListener("click", closeDialog);
    $("delete-btn").addEventListener("click", deleteHabit);
    $("habit-emoji").addEventListener("input", function () {
      var v = $("habit-emoji").value.trim();
      if (v) { form.emoji = v; syncPickers(); }
    });
    $("dialog").addEventListener("click", function (e) { if (e.target === $("dialog")) closeDialog(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("dialog").hidden) closeDialog(); });
    // Refresh when the app comes back into view (e.g. the next morning).
    document.addEventListener("visibilitychange", function () { if (!document.hidden) render(); });
    render();

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : globalThis);
