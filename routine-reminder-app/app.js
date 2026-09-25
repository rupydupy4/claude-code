'use strict';

// ---------- Storage ----------
const STORE_KEY = 'routine-reminders:v1';
const FIRED_KEY = 'routine-reminders:fired';
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const LEAD_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const INTERVAL_OPTIONS = [5, 10, 15, 20, 30];
// A reminder is still shown if the app wakes up to it this late; older ones are skipped.
const CATCH_UP_MS = 5 * 60 * 1000;

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

let state = load(STORE_KEY, null) || { items: [], defaults: { lead: 30, interval: 10 } };

function persist() {
  save(STORE_KEY, state);
  scheduleAhead();
  render();
}

// ---------- Time helpers ----------
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

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

// Minutes-before for every reminder, e.g. lead 30 / interval 10 → [30, 20, 10, 0].
function offsetsFor(item) {
  const lead = item.lead ?? state.defaults.lead;
  const interval = item.interval ?? state.defaults.interval;
  const out = [];
  for (let m = lead; m > 0; m -= interval) out.push(m);
  out.push(0);
  return out;
}

// All reminders for an item on a given calendar day.
function remindersOn(item, day) {
  if (!item.enabled || !item.days.includes(day.getDay())) return [];
  const due = atTime(day, item.time);
  return offsetsFor(item).map((minsBefore) => ({
    item,
    minsBefore,
    due,
    at: new Date(due.getTime() - minsBefore * 60000),
    key: `${item.id}|${dateKey(due)}|${minsBefore}`,
  }));
}

// Reminders between two instants (looks at yesterday–tomorrow so reminders that cross midnight work).
function remindersBetween(from, to) {
  const out = [];
  for (let offset = -1; offset <= 2; offset++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    for (const item of state.items) {
      for (const r of remindersOn(item, day)) {
        if (r.at >= from && r.at < to) out.push(r);
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

function messageFor(r) {
  const name = r.item.name;
  if (r.minsBefore === 0) return { title: `${name} — now`, body: `It's ${fmtTime(r.item.time)}. Time for ${name.toLowerCase()}!` };
  return { title: `${name} in ${fmtDuration(r.minsBefore)}`, body: `${name} starts at ${fmtTime(r.item.time)}.` };
}

// ---------- Notifications ----------
let swReg = null;

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
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
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
  render();
}

// Where supported (Notification Triggers), hand the next 24 h of reminders to the OS so they
// fire even when the app is closed. Most browsers don't support this yet; tick() covers the rest.
async function scheduleAhead() {
  if (!swReg || typeof window.TimestampTrigger === 'undefined' || Notification.permission !== 'granted') return;
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

// ---------- Calendar export ----------
function icsEscape(s) { return s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n'); }

function buildIcs() {
  const byday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Routine Reminders//EN', 'CALSCALE:GREGORIAN'];
  const today = new Date();
  for (const item of state.items.filter((i) => i.enabled && i.days.length)) {
    const [h, m] = item.time.split(':');
    const start = `${dateKey(today).replace(/-/g, '')}T${h}${m}00`;
    const end = new Date(atTime(today, item.time).getTime() + 15 * 60000);
    const endStr = `${dateKey(end).replace(/-/g, '')}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.id}@routine-reminders`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${endStr}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${item.days.map((d) => byday[d]).join(',')}`,
      `SUMMARY:${icsEscape(item.name)}`,
    );
    for (const minsBefore of offsetsFor(item)) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(item.name)}`,
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

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
let editingId = null;

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}

function describeSchedule(item) {
  const offs = offsetsFor(item);
  if (offs.length === 1) return 'At the time only';
  const interval = item.interval ?? state.defaults.interval;
  return `From ${fmtDuration(offs[0])} before, every ${interval} min`;
}

function describeDays(days) {
  if (days.length === 7) return 'Every day';
  const s = [...days].sort().join('');
  if (s === '12345') return 'Weekdays';
  if (s === '06') return 'Weekends';
  return [...days].sort().map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
}

function render() {
  const now = new Date();
  $('today-label').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const permBanner = $('perm-banner');
  permBanner.hidden = !('Notification' in window) || Notification.permission === 'granted';
  if ('Notification' in window && Notification.permission === 'denied') {
    permBanner.querySelector('p').textContent = 'Notifications are blocked. Allow them for this site in your browser or phone settings.';
    $('perm-btn').hidden = true;
  } else if (!('Notification' in window)) {
    $('bg-hint').textContent = 'This browser can\'t show notifications. On iPhone, tap Share → Add to Home Screen, then open the app from your home screen.';
  }

  const items = [...state.items].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  $('empty').hidden = items.length > 0;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const list = $('list');
  list.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    const today = item.days.includes(now.getDay());
    if (!item.enabled) li.classList.add('off');
    else if (today && toMinutes(item.time) < nowMin) li.classList.add('done');
    li.innerHTML = `
      <span class="time"></span>
      <div class="info"><div class="name"></div><div class="meta"></div></div>
      <label class="switch" aria-label="On/off"><input type="checkbox"><span></span></label>
      <button class="edit" aria-label="Edit">✎</button>`;
    li.querySelector('.time').textContent = fmtTime(item.time);
    li.querySelector('.name').textContent = item.name;
    li.querySelector('.meta').textContent = `${describeDays(item.days)} · ${describeSchedule(item)}`;
    const toggle = li.querySelector('input');
    toggle.checked = item.enabled;
    toggle.addEventListener('change', () => { item.enabled = toggle.checked; persist(); });
    li.querySelector('.edit').addEventListener('click', () => openItem(item));
    return li;
  }));

  const upcoming = remindersBetween(now, new Date(now.getTime() + 2 * 86400000)).find((r) => r.minsBefore === 0);
  const card = $('next-card');
  card.hidden = !upcoming;
  if (upcoming) {
    const mins = Math.max(0, Math.ceil((upcoming.due - now) / 60000));
    $('next-name').textContent = upcoming.item.name;
    const sameDay = dateKey(upcoming.due) === dateKey(now);
    $('next-when').textContent = `${sameDay ? '' : 'Tomorrow '}${fmtTime(upcoming.item.time)} · in ${fmtDuration(mins)}`;
  }
}

function fillSelect(select, options, fmt, value) {
  select.replaceChildren(...options.map((v) => new Option(fmt(v), v)));
  select.value = String(value);
}

function buildDayPicker() {
  $('days').replaceChildren(...DAY_LABELS.map((label, i) => {
    const l = document.createElement('label');
    l.innerHTML = '<input type="checkbox" name="day"><span></span>';
    l.querySelector('input').value = i;
    l.querySelector('span').textContent = label;
    return l;
  }));
}

function updatePreview() {
  const form = $('item-form');
  const item = {
    name: form.name.value.trim() || 'This step',
    time: form.time.value || '00:00',
    lead: Number(form.lead.value),
    interval: Number(form.interval.value),
  };
  const offs = offsetsFor(item);
  const [h, m] = item.time.split(':').map(Number);
  const times = offs.map((o) => {
    const d = new Date(2000, 0, 1, h, m - o);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  });
  $('preview').textContent = `You'll be notified at ${times.join(', ')}.`;
}

function openItem(item) {
  editingId = item ? item.id : null;
  const form = $('item-form');
  $('item-title').textContent = item ? 'Edit step' : 'Add step';
  $('delete-btn').hidden = !item;
  form.name.value = item ? item.name : '';
  form.time.value = item ? item.time : '10:30';
  fillSelect(form.lead, LEAD_OPTIONS, (v) => (v ? `${fmtDuration(v)} before` : 'At the time'), item?.lead ?? state.defaults.lead);
  fillSelect(form.interval, INTERVAL_OPTIONS, (v) => `${v} min`, item?.interval ?? state.defaults.interval);
  const days = item ? item.days : [0, 1, 2, 3, 4, 5, 6];
  form.querySelectorAll('input[name=day]').forEach((cb) => { cb.checked = days.includes(Number(cb.value)); });
  updatePreview();
  $('item-dialog').showModal();
}

function saveItem(e) {
  e.preventDefault();
  const form = $('item-form');
  const days = [...form.querySelectorAll('input[name=day]:checked')].map((cb) => Number(cb.value));
  if (!days.length) { toast('Pick at least one day.'); return; }
  const data = {
    name: form.name.value.trim(),
    time: form.time.value,
    days,
    lead: Number(form.lead.value),
    interval: Number(form.interval.value),
  };
  if (!data.name || !data.time) return;
  if (editingId) {
    Object.assign(state.items.find((i) => i.id === editingId), data);
  } else {
    state.items.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), enabled: true, ...data });
  }
  $('item-dialog').close();
  persist();
  if ('Notification' in window && Notification.permission === 'default') askPermission();
}

async function askPermission() {
  if (!('Notification' in window)) return;
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    toast('Notifications on.');
    scheduleAhead();
  }
  render();
}

function addExample() {
  const every = [0, 1, 2, 3, 4, 5, 6];
  const mk = (name, time, lead) => ({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    name, time, days: [...every], enabled: true, lead, interval: state.defaults.interval,
  });
  state.items.push(
    mk('Wake up', '10:00', 0),
    mk('Workout', '10:30', 30),
    mk('Shower', '11:30', 10),
    mk('Lunch', '13:00', 30),
  );
  persist();
}

function init() {
  buildDayPicker();
  const form = $('item-form');
  form.addEventListener('submit', saveItem);
  form.addEventListener('input', updatePreview);
  $('add-btn').addEventListener('click', () => openItem(null));
  $('cancel-btn').addEventListener('click', () => $('item-dialog').close());
  $('delete-btn').addEventListener('click', () => {
    state.items = state.items.filter((i) => i.id !== editingId);
    $('item-dialog').close();
    persist();
  });
  $('example-btn').addEventListener('click', addExample);
  $('perm-btn').addEventListener('click', askPermission);

  $('settings-btn').addEventListener('click', () => {
    fillSelect($('def-lead'), LEAD_OPTIONS, (v) => (v ? `${fmtDuration(v)} before` : 'At the time'), state.defaults.lead);
    fillSelect($('def-interval'), INTERVAL_OPTIONS, (v) => `${v} min`, state.defaults.interval);
    $('settings-dialog').showModal();
  });
  $('def-lead').addEventListener('change', (e) => { state.defaults.lead = Number(e.target.value); persist(); });
  $('def-interval').addEventListener('change', (e) => { state.defaults.interval = Number(e.target.value); persist(); });
  $('test-btn').addEventListener('click', async () => {
    if (Notification.permission !== 'granted') await askPermission();
    const ok = await notify('Test reminder', 'Notifications are working.', 'routine-test');
    if (!ok) toast('Notifications are off for this app.');
  });
  $('ics-btn').addEventListener('click', downloadIcs);

  // Catch up immediately whenever the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  render();
  registerSW().then(() => { scheduleAhead(); tick(); });
  setInterval(tick, 15000);
}

init();
