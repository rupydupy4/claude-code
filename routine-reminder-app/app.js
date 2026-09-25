'use strict';

// ============================================================
// Constants
// ============================================================
const STORE_KEY = 'routine-reminders:v1';
const FIRED_KEY = 'routine-reminders:fired';
const HISTORY_KEY = 'routine-reminders:history';
const DAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LEAD_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const INTERVAL_OPTIONS = [5, 10, 15, 20, 30];
const DURATION_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];
const EMOJIS = ['⏰', '💧', '🏋️', '🏃', '🧘', '🚿', '🪥', '🍳',
  '☕', '🥗', '🍽️', '💊', '📚', '💻', '📝', '🎯',
  '🧹', '🐶', '🎧', '🎮', '📖', '📵', '🛏️', '🙏'];
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9'];
// A reminder is still shown if the app wakes up to it this late; older ones are skipped.
const CATCH_UP_MS = 5 * 60 * 1000;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

// Quick-add sets. `at` is minutes after your wake-up time.
const TEMPLATES = [
  {
    id: 'morning', name: 'Morning kickstart', emoji: '🌅', c1: '#f59e0b', c2: '#f43f5e',
    steps: [
      { title: 'Wake up', emoji: '⏰', color: '#f59e0b', at: 0, lead: 0, duration: 5 },
      { title: 'Drink water', emoji: '💧', color: '#0ea5e9', at: 5, lead: 0, duration: 5 },
      { title: 'Stretch', emoji: '🧘', color: '#8b5cf6', at: 15, lead: 10, duration: 10 },
      { title: 'Breakfast', emoji: '🍳', color: '#f97316', at: 60, lead: 15, duration: 20 },
    ],
  },
  {
    id: 'gym', name: 'Gym day', emoji: '🏋️', c1: '#6366f1', c2: '#8b5cf6',
    steps: [
      { title: 'Workout', emoji: '🏋️', color: '#6366f1', at: 30, lead: 30, duration: 60 },
      { title: 'Shower', emoji: '🚿', color: '#14b8a6', at: 95, lead: 10, duration: 15 },
    ],
  },
  {
    id: 'focus', name: 'Focus block', emoji: '💻', c1: '#0ea5e9', c2: '#6366f1',
    steps: [
      { title: 'Deep work', emoji: '💻', color: '#0ea5e9', at: 180, lead: 15, duration: 90 },
      { title: 'Walk break', emoji: '🏃', color: '#22c55e', at: 270, lead: 5, duration: 15 },
      { title: 'Study', emoji: '📚', color: '#8b5cf6', at: 300, lead: 15, duration: 60 },
    ],
  },
  {
    id: 'wind', name: 'Wind down', emoji: '🌙', c1: '#312e81', c2: '#7c3aed',
    steps: [
      { title: 'Dinner', emoji: '🍽️', color: '#f97316', at: 600, lead: 30, duration: 45 },
      { title: 'No screens', emoji: '📵', color: '#ec4899', at: 840, lead: 15, duration: 30 },
      { title: 'Read', emoji: '📖', color: '#8b5cf6', at: 870, lead: 0, duration: 30 },
      { title: 'Sleep', emoji: '🛏️', color: '#312e81', at: 900, lead: 30, duration: 5 },
    ],
  },
];

// ============================================================
// Storage
// ============================================================
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

let state = load(STORE_KEY, null) || { items: [], defaults: { lead: 30, interval: 10 } };
// Fill in fields added after v1 so older saved routines keep working.
state.defaults = { lead: 30, interval: 10, ...state.defaults };
state.wake = state.wake || '10:00';
state.theme = state.theme || 'auto';
state.userName = state.userName || '';
if (state.onboarded === undefined) state.onboarded = state.items.length > 0;
state.items.forEach((item, i) => {
  if (item.name && !item.title) { item.title = item.name; delete item.name; }
  item.emoji = item.emoji || EMOJIS[i % EMOJIS.length];
  item.color = item.color || COLORS[i % COLORS.length];
  item.duration = item.duration || 15;
  item.note = item.note || '';
});

let history = load(HISTORY_KEY, {}); // { 'YYYY-MM-DD': [itemId, ...] }
// Stats ignore days before you started, so a new routine doesn't count as "missed" last week.
state.startedAt = state.startedAt || [...Object.keys(history).sort(), dateKeyOf(new Date())][0];
save(STORE_KEY, state);

function dateKeyOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function persist() {
  save(STORE_KEY, state);
  scheduleAhead();
  renderAll();
}
function saveHistory() { save(HISTORY_KEY, history); }

// ============================================================
// Time helpers
// ============================================================
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fromMinutes = (mins) => { const m = ((mins % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
function atTime(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}
function describeDays(days) {
  if (days.length === 7) return 'Every day';
  const s = [...days].sort().join('');
  if (s === '12345') return 'Weekdays';
  if (s === '06') return 'Weekends';
  return [...days].sort().map((d) => DAY_NAMES[d]).join(', ');
}

// ============================================================
// Routine logic
// ============================================================
const leadOf = (item) => item.lead ?? state.defaults.lead;
const intervalOf = (item) => item.interval ?? state.defaults.interval;
const scheduledOn = (item, day) => item.enabled && item.days.includes(day.getDay());
const isDone = (item, day) => (history[dateKey(day)] || []).includes(item.id);
const sortByTime = (a, b) => toMinutes(a.time) - toMinutes(b.time);
const itemsOn = (day) => state.items.filter((i) => scheduledOn(i, day)).sort(sortByTime);

// Minutes-before for every reminder, e.g. lead 30 / interval 10 → [30, 20, 10, 0].
function offsetsFor(item) {
  const out = [];
  for (let m = leadOf(item); m > 0; m -= intervalOf(item)) out.push(m);
  out.push(0);
  return out;
}

function remindersOn(item, day) {
  if (!scheduledOn(item, day)) return [];
  const due = atTime(day, item.time);
  return offsetsFor(item).map((minsBefore) => ({
    item, minsBefore, due,
    at: new Date(due.getTime() - minsBefore * 60000),
    key: `${item.id}|${dateKey(due)}|${minsBefore}`,
  }));
}

// Reminders between two instants (looks at yesterday–day after so reminders that cross midnight work).
function remindersBetween(from, to) {
  const out = [];
  for (let offset = -1; offset <= 2; offset++) {
    const day = addDays(from, offset);
    for (const item of state.items) {
      for (const r of remindersOn(item, day)) {
        if (r.at >= from && r.at < to && !isDone(item, r.due)) out.push(r);
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

function messageFor(r) {
  const { title, emoji } = r.item;
  if (r.minsBefore === 0) return { title: `${emoji} ${title} — now`, body: `It's ${fmtTime(r.item.time)}. Time for ${title.toLowerCase()}!` };
  return { title: `${emoji} ${title} in ${fmtDuration(r.minsBefore)}`, body: `${title} starts at ${fmtTime(r.item.time)}.` };
}

function toggleDone(item, day = new Date()) {
  const key = dateKey(day);
  const list = history[key] || [];
  const wasDone = list.includes(item.id);
  history[key] = wasDone ? list.filter((id) => id !== item.id) : [...list, item.id];
  saveHistory();
  if (!wasDone) {
    haptic(15);
    const remaining = itemsOn(day).filter((i) => !isDone(i, day)).length;
    toast(remaining ? `${item.emoji} ${item.title} done!` : '🎉 Routine complete for today!', {
      label: 'Undo', onClick: () => toggleDone(item, day),
    });
  }
  scheduleAhead();
  renderAll();
}

// ============================================================
// Stats
// ============================================================
function dayResult(day) {
  if (dateKey(day) < state.startedAt) return { total: 0, done: 0 };
  const items = itemsOn(day);
  const done = items.filter((i) => isDone(i, day)).length;
  return { total: items.length, done };
}

function computeStats() {
  const today = startOfDay(new Date());

  // Current streak: consecutive fully-completed days, skipping days with nothing scheduled.
  // Today only counts once it's complete, so an unfinished today doesn't break the streak.
  let streak = 0;
  for (let i = 0; i < 366; i++) {
    const r = dayResult(addDays(today, -i));
    if (r.total === 0) continue;
    if (r.done === r.total) streak++;
    else if (i === 0) continue;
    else break;
  }

  // Best streak across recorded history.
  const keys = Object.keys(history).sort();
  let best = streak;
  if (keys.length) {
    let run = 0;
    const [y, m, d] = keys[0].split('-').map(Number);
    for (let day = new Date(y, m - 1, d); day <= today; day = addDays(day, 1)) {
      const r = dayResult(day);
      if (r.total === 0) continue;
      if (r.done === r.total) best = Math.max(best, ++run);
      else if (dateKey(day) !== dateKey(today)) run = 0;
    }
  }

  let weekDone = 0, weekTotal = 0;
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    const r = dayResult(day);
    weekDone += r.done;
    weekTotal += r.total;
    week.push({ day, ...r });
  }
  const total = Object.values(history).reduce((n, ids) => n + ids.length, 0);
  return { streak, best, weekDone, rate: weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0, total, week };
}

// ============================================================
// Notifications
// ============================================================
let swReg = null;
const hasNotif = () => 'Notification' in window;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn('Service worker registration failed', err);
  }
}

async function notify(title, body, tag, timestamp) {
  if (!hasNotif() || Notification.permission !== 'granted') return false;
  const options = {
    body, tag, renotify: true, icon: 'icon-192.png', badge: 'icon-192.png',
    vibrate: [200, 100, 200], timestamp: timestamp || Date.now(), data: { url: './' },
  };
  try {
    // Mobile browsers require notifications to go through the service worker.
    if (swReg) { await swReg.showNotification(title, options); return true; }
    new Notification(title, options);
    return true;
  } catch (err) {
    console.warn('Notification failed', err);
    return false;
  }
}

function loadFired() {
  const fired = load(FIRED_KEY, {});
  const cutoff = Date.now() - 3 * 86400000;
  for (const [k, t] of Object.entries(fired)) if (t < cutoff) delete fired[k];
  return fired;
}

async function tick() {
  const now = new Date();
  const fired = loadFired();
  const due = remindersBetween(new Date(now.getTime() - CATCH_UP_MS), new Date(now.getTime() + 1000));
  for (const r of due) {
    if (fired[r.key]) continue;
    fired[r.key] = Date.now();
    const { title, body } = messageFor(r);
    await notify(title, body, `routine-${r.item.id}`, r.at.getTime());
  }
  save(FIRED_KEY, fired);
  renderToday();
}

// Where supported (Notification Triggers), hand the next 24 h of reminders to the OS so they
// fire even when the app is closed. Most browsers don't support this yet; tick() covers the rest.
async function scheduleAhead() {
  if (!swReg || typeof window.TimestampTrigger === 'undefined' || !hasNotif() || Notification.permission !== 'granted') return;
  try {
    const existing = await swReg.getNotifications({ includeTriggered: false });
    existing.filter((n) => n.data && n.data.scheduled).forEach((n) => n.close());
    const now = new Date();
    for (const r of remindersBetween(now, new Date(now.getTime() + 86400000))) {
      const { title, body } = messageFor(r);
      await swReg.showNotification(title, {
        body, tag: r.key, icon: 'icon-192.png', data: { url: './', scheduled: true },
        showTrigger: new window.TimestampTrigger(r.at.getTime()),
      });
    }
  } catch (err) {
    console.warn('Scheduling ahead failed', err);
  }
}

async function askPermission() {
  if (!hasNotif()) {
    toast(isIOS() ? 'Add Routine to your Home Screen first, then open it from there.' : 'This browser can\'t show notifications.');
    return false;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    toast('🔔 Reminders are on');
    scheduleAhead();
  } else if (result === 'denied') {
    toast('Notifications are blocked in your phone settings.');
  }
  renderAll();
  return result === 'granted';
}

// ============================================================
// Calendar export
// ============================================================
function icsEscape(s) { return s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n'); }

function buildIcs() {
  const byday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Routine Reminders//EN', 'CALSCALE:GREGORIAN'];
  const today = new Date();
  const local = (d) => `${dateKey(d).replace(/-/g, '')}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  for (const item of state.items.filter((i) => i.enabled && i.days.length)) {
    const start = atTime(today, item.time);
    const end = new Date(start.getTime() + (item.duration || 15) * 60000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.id}@routine-reminders`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${local(start)}`,
      `DTEND:${local(end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${item.days.map((d) => byday[d]).join(',')}`,
      `SUMMARY:${icsEscape(`${item.emoji} ${item.title}`)}`,
    );
    if (item.note) lines.push(`DESCRIPTION:${icsEscape(item.note)}`);
    for (const minsBefore of offsetsFor(item)) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(item.title)}`,
        `TRIGGER:${minsBefore ? `-PT${minsBefore}M` : 'PT0M'}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadIcs() {
  if (!state.items.some((i) => i.enabled)) { toast('Add a step first.'); return; }
  const blob = new Blob([buildIcs()], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'routine.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ============================================================
// UI helpers
// ============================================================
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function haptic(ms = 10) { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* unsupported */ } }

function toast(msg, action) {
  const t = $('toast');
  t.replaceChildren(el('span', '', msg));
  if (action) {
    const b = el('button', '', action.label);
    b.addEventListener('click', () => { t.hidden = true; action.onClick(); });
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, action ? 4000 : 2600);
}

function bubble(item, extra = '') {
  const b = el('div', `bubble ${extra}`.trim(), item.emoji);
  b.style.setProperty('--c', item.color);
  return b;
}

function fillSelect(select, options, fmt, value) {
  select.replaceChildren(...options.map((v) => new Option(fmt(v), v)));
  if (!options.includes(Number(value))) select.append(new Option(fmt(Number(value)), value));
  select.value = String(value);
}
const leadLabel = (v) => (v ? `${fmtDuration(v)} before` : 'At the time');
const intervalLabel = (v) => `${v} min`;

function applyTheme() {
  if (state.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
}

// ============================================================
// Navigation
// ============================================================
const TABS = ['today', 'routine', 'progress', 'settings'];
let currentTab = 'today';

function go(tab) {
  if (!TABS.includes(tab)) tab = 'today';
  currentTab = tab;
  document.querySelectorAll('.page').forEach((p) => { p.hidden = p.dataset.page !== tab; });
  document.querySelectorAll('.tabbar button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (location.hash !== `#${tab}`) history_replace(`#${tab}`);
  window.scrollTo(0, 0);
  renderAll();
}
function history_replace(hash) { try { window.history.replaceState(null, '', hash); } catch { /* ignore */ } }

// ============================================================
// Render: Today
// ============================================================
function renderToday() {
  const now = new Date();
  const today = startOfDay(now);
  const hour = now.getHours();
  const part = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  $('greeting').textContent = state.userName ? `${part}, ${state.userName}` : part;
  $('today-date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  // Notification banner
  const banner = $('perm-banner');
  if (!hasNotif()) {
    banner.hidden = !isIOS() || isStandalone();
    $('perm-text').textContent = 'Tap Share → Add to Home Screen, then open Routine from your home screen.';
    $('perm-btn').hidden = true;
  } else if (Notification.permission === 'denied') {
    banner.hidden = false;
    $('perm-text').textContent = 'Notifications are blocked. Allow them in your phone settings.';
    $('perm-btn').hidden = true;
  } else {
    banner.hidden = Notification.permission === 'granted';
    $('perm-text').textContent = 'So we can nudge you before each step.';
    $('perm-btn').hidden = false;
  }

  const items = itemsOn(today);
  const doneCount = items.filter((i) => isDone(i, today)).length;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Progress ring
  const pct = items.length ? doneCount / items.length : 0;
  $('ring-fill').style.strokeDashoffset = String(326.7 * (1 - pct));
  $('ring-count').textContent = `${doneCount}/${items.length}`;

  // Up next
  const nextBtn = $('next-done');
  const pending = items.filter((i) => !isDone(i, today));
  const current = pending.find((i) => toMinutes(i.time) + (i.duration || 15) > nowMin);
  nextBtn.hidden = true;
  if (current) {
    const diff = toMinutes(current.time) - nowMin;
    $('next-name').textContent = `${current.emoji} ${current.title}`;
    $('next-when').textContent = diff > 0 ? `${fmtTime(current.time)} · in ${fmtDuration(diff)}` : `Started ${diff === 0 ? 'just now' : `${fmtDuration(-diff)} ago`}`;
    nextBtn.hidden = false;
    nextBtn.onclick = () => toggleDone(current, today);
  } else if (items.length && !pending.length) {
    $('next-name').textContent = 'All done! 🎉';
    $('next-when').textContent = 'You finished today\'s routine.';
  } else {
    // Nothing left today – look ahead to the next scheduled step.
    let found = null;
    for (let i = 1; i <= 7 && !found; i++) {
      const day = addDays(today, i);
      const first = itemsOn(day)[0];
      if (first) found = { item: first, day, i };
    }
    if (found) {
      $('next-name').textContent = `${found.item.emoji} ${found.item.title}`;
      const when = found.i === 1 ? 'Tomorrow' : found.day.toLocaleDateString([], { weekday: 'long' });
      $('next-when').textContent = `${when} · ${fmtTime(found.item.time)}`;
    } else {
      $('next-name').textContent = 'Nothing yet';
      $('next-when').textContent = 'Add steps in the Routine tab.';
    }
  }

  // Timeline
  $('today-summary').textContent = items.length ? `${items.length} step${items.length === 1 ? '' : 's'}` : '';
  const list = $('timeline');
  list.replaceChildren(...items.map((item) => {
    const done = isDone(item, today);
    const start = toMinutes(item.time);
    const end = start + (item.duration || 15);
    const li = el('li', 'tl-item');
    if (done) li.classList.add('done');
    else if (current && current.id === item.id) li.classList.add('current');

    const card = el('div', 'tl-card');
    const main = el('button', 'tl-main');
    main.type = 'button';
    const timeLine = el('div', 'tl-time', `${fmtTime(item.time)} · ${fmtDuration(item.duration || 15)}`);
    const name = el('div', 'tl-name', item.title);
    if (!done && nowMin >= start && nowMin < end) name.append(el('span', 'tag now', 'Now'));
    else if (!done && nowMin >= end) name.append(el('span', 'tag missed', 'Missed'));
    main.append(timeLine, name);
    if (item.note) main.append(el('div', 'tl-note', item.note));
    main.addEventListener('click', () => openItem(item));

    const check = el('button', 'check');
    check.type = 'button';
    check.innerHTML = CHECK_SVG;
    check.setAttribute('aria-label', done ? `Mark ${item.title} not done` : `Mark ${item.title} done`);
    check.addEventListener('click', () => toggleDone(item, today));

    card.append(main, check);
    li.append(bubble(item), card);
    return li;
  }));

  const empty = $('today-empty');
  empty.hidden = items.length > 0;
  if (!items.length) {
    const any = state.items.some((i) => i.enabled);
    $('today-empty-title').textContent = any ? 'Rest day' : 'Nothing planned yet';
    $('today-empty-text').textContent = any ? 'No steps are scheduled for today. Enjoy it!' : 'Add a few steps and we\'ll remind you before each one.';
    empty.querySelector('button').hidden = any;
  }
}

// ============================================================
// Render: Routine
// ============================================================
function renderRoutine() {
  $('templates').replaceChildren(...TEMPLATES.map((t) => {
    const b = el('button', 'tpl');
    b.type = 'button';
    b.style.setProperty('--c1', t.c1);
    b.style.setProperty('--c2', t.c2);
    b.append(el('div', 'tpl-emoji', t.emoji));
    const txt = el('div');
    txt.append(el('strong', '', t.name), el('span', '', t.steps.map((s) => s.title).join(' · ')));
    b.append(txt);
    b.addEventListener('click', () => {
      const added = addTemplate(t);
      toast(added ? `Added ${added} step${added === 1 ? '' : 's'} from ${t.name}` : `${t.name} is already in your routine`);
    });
    return b;
  }));

  const groups = [
    { name: 'Morning', icon: '🌅', test: (m) => m >= 300 && m < 720 },
    { name: 'Afternoon', icon: '☀️', test: (m) => m >= 720 && m < 1020 },
    { name: 'Evening', icon: '🌙', test: (m) => m >= 1020 || m < 300 },
  ];
  const sorted = [...state.items].sort(sortByTime);
  const container = $('routine-groups');
  container.replaceChildren();
  for (const g of groups) {
    const items = sorted.filter((i) => g.test(toMinutes(i.time)));
    if (!items.length) continue;
    const title = el('div', 'group-title', `${g.icon} ${g.name}`);
    title.append(el('small', '', `${items.length} step${items.length === 1 ? '' : 's'}`));
    const list = el('div', 'r-list');
    for (const item of items) {
      const row = el('div', 'r-row');
      if (!item.enabled) row.classList.add('off');
      const open = el('button', 'r-open');
      open.type = 'button';
      const text = el('div', 'r-text');
      text.append(el('div', 'r-name', item.title),
        el('div', 'r-meta', `${describeDays(item.days)} · ${offsetsFor(item).length} reminder${offsetsFor(item).length === 1 ? '' : 's'}`));
      open.append(bubble(item), text, el('span', 'r-time', fmtTime(item.time)));
      open.addEventListener('click', () => openItem(item));

      const sw = el('label', 'switch');
      sw.setAttribute('aria-label', `${item.title} on or off`);
      sw.innerHTML = '<input type="checkbox"><span></span>';
      const input = sw.querySelector('input');
      input.checked = item.enabled;
      input.addEventListener('change', () => { item.enabled = input.checked; haptic(); persist(); });

      row.append(open, sw);
      list.append(row);
    }
    container.append(title, list);
  }
  $('routine-empty').hidden = state.items.length > 0;
}

function addTemplate(t) {
  const existing = new Set(state.items.map((i) => i.title.toLowerCase()));
  const wake = toMinutes(state.wake);
  let added = 0;
  for (const s of t.steps) {
    if (existing.has(s.title.toLowerCase())) continue;
    state.items.push({
      id: uid(), enabled: true, days: [...EVERY_DAY], note: '',
      title: s.title, emoji: s.emoji, color: s.color, duration: s.duration,
      time: fromMinutes(wake + s.at), lead: s.lead, interval: state.defaults.interval,
    });
    added++;
  }
  if (added) persist();
  return added;
}

// ============================================================
// Render: Progress
// ============================================================
function renderProgress() {
  const s = computeStats();
  $('streak').textContent = s.streak;
  $('streak-text').textContent = s.streak
    ? (s.streak >= s.best && s.streak > 1 ? 'Your best ever — keep it going!' : 'Finish today to keep it alive.')
    : 'Finish every step today to start a streak.';
  $('stat-best').textContent = s.best;
  $('stat-week').textContent = s.weekDone;
  $('stat-rate').textContent = `${s.rate}%`;
  $('stat-total').textContent = s.total;

  const todayKey = dateKey(new Date());
  $('bars').replaceChildren(...s.week.map((d) => {
    const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
    const bar = el('div', 'bar');
    if (dateKey(d.day) === todayKey) bar.classList.add('today');
    const track = el('div', 'bar-track');
    const fill = el('div', 'bar-fill');
    fill.style.height = `${pct}%`;
    track.append(fill);
    bar.append(el('span', 'bar-pct', d.total ? `${pct}%` : '–'), track, el('span', '', DAY_SHORT[d.day.getDay()]));
    return bar;
  }));

  const today = startOfDay(new Date());
  const list = $('habit-list');
  const items = [...state.items].sort(sortByTime);
  list.replaceChildren(...items.map((item) => {
    const li = el('li', 'habit');
    const dots = el('div', 'dots');
    for (let i = 6; i >= 0; i--) {
      const day = addDays(today, -i);
      const dot = el('i');
      if (!scheduledOn(item, day) || dateKey(day) < state.startedAt) dot.className = 'skip';
      else if (isDone(item, day)) dot.className = 'on';
      dots.append(dot);
    }
    li.append(bubble(item), el('div', 'habit-name', item.title), dots);
    return li;
  }));
  if (!items.length) list.append(el('li', 'habit', 'Add steps to see progress here.'));
}

// ============================================================
// Render: Settings
// ============================================================
function renderSettings() {
  const nameInput = $('set-name');
  if (document.activeElement !== nameInput) nameInput.value = state.userName;
  $('avatar').textContent = state.userName ? state.userName.trim()[0].toUpperCase() : '🙂';
  fillSelect($('def-lead'), LEAD_OPTIONS, leadLabel, state.defaults.lead);
  fillSelect($('def-interval'), INTERVAL_OPTIONS, intervalLabel, state.defaults.interval);
  $('set-wake').value = state.wake;
  $('notif-status').textContent = !hasNotif() ? (isIOS() ? 'Add to Home Screen' : 'Unsupported')
    : Notification.permission === 'granted' ? 'On' : Notification.permission === 'denied' ? 'Blocked' : 'Off';
  document.querySelectorAll('[data-theme-opt]').forEach((b) => {
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(b.dataset.themeOpt === state.theme));
  });
}

function renderAll() {
  if (currentTab === 'today') renderToday();
  if (currentTab === 'routine') renderRoutine();
  if (currentTab === 'progress') renderProgress();
  if (currentTab === 'settings') renderSettings();
}

// ============================================================
// Step editor sheet
// ============================================================
let editingId = null;
let draft = { emoji: EMOJIS[2], color: COLORS[0] };

function buildEditor() {
  $('emoji-grid').replaceChildren(...EMOJIS.map((e) => {
    const b = el('button', '', e);
    b.type = 'button';
    b.dataset.emoji = e;
    b.addEventListener('click', () => { draft.emoji = e; syncEditor(); });
    return b;
  }));
  $('color-row').replaceChildren(...COLORS.map((c) => {
    const b = el('button');
    b.type = 'button';
    b.style.setProperty('--c', c);
    b.dataset.color = c;
    b.setAttribute('aria-label', `Colour ${c}`);
    b.addEventListener('click', () => { draft.color = c; syncEditor(); });
    return b;
  }));
  $('days').replaceChildren(...DAY_SHORT.map((label, i) => {
    const l = el('label');
    l.innerHTML = '<input type="checkbox" name="day"><span></span>';
    l.querySelector('input').value = i;
    l.querySelector('input').setAttribute('aria-label', DAY_NAMES[i]);
    l.querySelector('span').textContent = label;
    return l;
  }));
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const set = { all: EVERY_DAY, weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] }[b.dataset.preset];
    $('item-form').querySelectorAll('input[name=day]').forEach((cb) => { cb.checked = set.includes(Number(cb.value)); });
  }));
}

function syncEditor() {
  const f = $('item-form').elements;
  document.querySelectorAll('#emoji-grid button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.emoji === draft.emoji)));
  document.querySelectorAll('#color-row button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === draft.color)));
  const pb = $('preview-bubble');
  pb.textContent = draft.emoji;
  pb.style.setProperty('--c', draft.color);

  const item = { time: f.time.value || '00:00', lead: Number(f.lead.value), interval: Number(f.interval.value) };
  const start = toMinutes(item.time);
  $('preview-chips').replaceChildren(...offsetsFor(item).map((o) => el('span', o === 0 ? 'due' : '', `🔔 ${fmtTime(fromMinutes(start - o))}`)));
}

function openItem(item) {
  editingId = item ? item.id : null;
  const f = $('item-form').elements;
  $('item-title').textContent = item ? 'Edit step' : 'New step';
  $('delete-btn').hidden = !item;
  f.title.value = item ? item.title : '';
  f.time.value = item ? item.time : '10:30';
  f.note.value = item ? item.note || '' : '';
  draft = item ? { emoji: item.emoji, color: item.color }
    : { emoji: EMOJIS[state.items.length % EMOJIS.length], color: COLORS[state.items.length % COLORS.length] };
  fillSelect(f.lead, LEAD_OPTIONS, leadLabel, item ? leadOf(item) : state.defaults.lead);
  fillSelect(f.interval, INTERVAL_OPTIONS, intervalLabel, item ? intervalOf(item) : state.defaults.interval);
  fillSelect(f.duration, DURATION_OPTIONS, fmtDuration, item ? item.duration || 15 : 30);
  const days = item ? item.days : EVERY_DAY;
  $('item-form').querySelectorAll('input[name=day]').forEach((cb) => { cb.checked = days.includes(Number(cb.value)); });
  syncEditor();
  $('item-sheet').showModal();
}

function saveItem(e) {
  e.preventDefault();
  const form = $('item-form');
  const f = form.elements;
  const days = [...form.querySelectorAll('input[name=day]:checked')].map((cb) => Number(cb.value));
  const title = f.title.value.trim();
  if (!title) { toast('Give your step a name.'); f.title.focus(); return; }
  if (!f.time.value) { toast('Pick a time.'); return; }
  if (!days.length) { toast('Pick at least one day.'); return; }
  const data = {
    title, days, time: f.time.value, note: f.note.value.trim(),
    emoji: draft.emoji, color: draft.color,
    lead: Number(f.lead.value), interval: Number(f.interval.value), duration: Number(f.duration.value),
  };
  if (editingId) {
    Object.assign(state.items.find((i) => i.id === editingId), data);
  } else {
    state.items.push({ id: uid(), enabled: true, ...data });
  }
  $('item-sheet').close();
  haptic();
  persist();
  toast(editingId ? 'Step updated' : `${data.emoji} ${data.title} added`);
  if (hasNotif() && Notification.permission === 'default') askPermission();
}

// ============================================================
// Onboarding
// ============================================================
let obStep = 0;
const obPicked = new Set(['morning', 'gym']);

function showOnboarding() {
  obStep = 0;
  $('ob-name').value = state.userName;
  $('ob-wake').value = state.wake;
  $('ob-templates').replaceChildren(...TEMPLATES.map((t) => {
    const b = el('button', 'ob-tpl');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(obPicked.has(t.id)));
    const txt = el('div');
    txt.append(el('strong', '', t.name), el('small', '', t.steps.map((s) => s.title).join(' · ')));
    b.append(el('span', 'tpl-emoji', t.emoji), txt, el('span', 'tick', '✓'));
    b.addEventListener('click', () => {
      if (obPicked.has(t.id)) obPicked.delete(t.id); else obPicked.add(t.id);
      b.setAttribute('aria-pressed', String(obPicked.has(t.id)));
      haptic();
    });
    return b;
  }));
  if (!hasNotif()) {
    $('ob-notif-text').textContent = isIOS()
      ? 'On iPhone, reminders need Routine on your Home Screen: tap Share → Add to Home Screen, then open it from there.'
      : 'This browser can\'t show notifications, but you can still add your routine to your calendar in Settings.';
    $('ob-allow').hidden = true;
    $('ob-finish').textContent = 'Got it';
  }
  $('onboard').hidden = false;
  showObStep();
}

function showObStep() {
  document.querySelectorAll('.ob-slide').forEach((s) => { s.hidden = Number(s.dataset.step) !== obStep; });
  document.querySelectorAll('#ob-dots i').forEach((d, i) => d.classList.toggle('on', i === obStep));
}

function obNext() {
  if (obStep === 1) {
    state.userName = $('ob-name').value.trim();
    state.wake = $('ob-wake').value || '10:00';
  }
  if (obStep === 2) {
    TEMPLATES.filter((t) => obPicked.has(t.id)).forEach((t) => addTemplate(t));
  }
  obStep = Math.min(obStep + 1, 3);
  showObStep();
}

function finishOnboarding() {
  state.onboarded = true;
  $('onboard').hidden = true;
  persist();
  go('today');
}

// ============================================================
// Init
// ============================================================
function init() {
  applyTheme();
  buildEditor();

  // Tabs
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => { haptic(5); go(b.dataset.tab); }));
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));

  // Today
  $('perm-btn').addEventListener('click', askPermission);

  // Routine
  $('add-btn').addEventListener('click', () => openItem(null));
  $('add-btn-2').addEventListener('click', () => openItem(null));

  // Editor
  const form = $('item-form');
  form.addEventListener('submit', saveItem);
  form.addEventListener('input', syncEditor);
  $('cancel-btn').addEventListener('click', () => $('item-sheet').close());
  $('item-sheet').addEventListener('click', (e) => { if (e.target === $('item-sheet')) $('item-sheet').close(); });
  $('delete-btn').addEventListener('click', () => {
    const item = state.items.find((i) => i.id === editingId);
    if (!item || !confirm(`Delete "${item.title}"?`)) return;
    const index = state.items.indexOf(item);
    state.items.splice(index, 1);
    $('item-sheet').close();
    persist();
    toast(`${item.title} deleted`, { label: 'Undo', onClick: () => { state.items.splice(index, 0, item); persist(); } });
  });

  // Settings
  $('set-name').addEventListener('input', (e) => { state.userName = e.target.value.trim(); save(STORE_KEY, state); renderSettings(); });
  $('def-lead').addEventListener('change', (e) => { state.defaults.lead = Number(e.target.value); persist(); });
  $('def-interval').addEventListener('change', (e) => { state.defaults.interval = Number(e.target.value); persist(); });
  $('set-wake').addEventListener('change', (e) => { if (e.target.value) { state.wake = e.target.value; persist(); } });
  $('test-btn').addEventListener('click', async () => {
    if (hasNotif() && Notification.permission !== 'granted' && !(await askPermission())) return;
    const ok = await notify('🔔 Test reminder', 'Notifications are working. You\'re all set!', 'routine-test');
    if (!ok && hasNotif()) toast('Notifications are off for this app.');
    else if (!hasNotif()) toast(isIOS() ? 'Add Routine to your Home Screen first, then open it from there.' : 'This browser can\'t show notifications.');
  });
  $('ics-btn').addEventListener('click', downloadIcs);
  document.querySelectorAll('[data-theme-opt]').forEach((b) => b.addEventListener('click', () => {
    state.theme = b.dataset.themeOpt;
    applyTheme();
    persist();
  }));
  $('replay-onboarding').addEventListener('click', showOnboarding);
  $('reset-btn').addEventListener('click', () => {
    if (!confirm('Delete your whole routine and progress? This can\'t be undone.')) return;
    state = { items: [], defaults: { lead: 30, interval: 10 }, wake: '10:00', theme: 'auto', userName: '', onboarded: false, startedAt: dateKey(new Date()) };
    history = {};
    saveHistory();
    save(FIRED_KEY, {});
    persist();
    applyTheme();
    showOnboarding();
  });

  // Onboarding
  document.querySelectorAll('[data-ob-next]').forEach((b) => b.addEventListener('click', obNext));
  $('ob-allow').addEventListener('click', async () => { await askPermission(); finishOnboarding(); });
  $('ob-finish').addEventListener('click', finishOnboarding);

  // Catch up immediately whenever the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  go(location.hash.slice(1) || 'today');
  if (!state.onboarded) showOnboarding();
  registerSW().then(() => { scheduleAhead(); tick(); });
  setInterval(tick, 15000);
}

init();
