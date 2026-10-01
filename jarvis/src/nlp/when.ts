import type { DateKey, Recurrence, TimeOfDay } from '../domain/types';
import { addDays, isDateKey, startOfWeek, toDateKey, toTime } from '../utils/dates';

export interface When {
  date?: DateKey;
  time?: TimeOfDay;
  recurrence?: Recurrence;
  /** False when `date` was inferred from a bare time (“at 4 PM”) rather than stated. */
  explicitDate: boolean;
  /** The text with the date/time phrases removed. */
  rest: string;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WD = '(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?';
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const weekdayIndex = (s: string) => WEEKDAYS.findIndex((w) => w.startsWith(s.slice(0, 3).toLowerCase()));
const monthIndex = (s: string) => MONTHS.findIndex((m) => m.startsWith(s.slice(0, 3).toLowerCase()));

function nextWeekday(from: Date, target: number, forceNext: boolean): DateKey {
  const today = toDateKey(from);
  let delta = (target - from.getDay() + 7) % 7;
  if (forceNext && delta === 0) delta = 7;
  return addDays(today, delta);
}

/**
 * Extracts a date, time and recurrence from natural language, relative to `now`.
 * Understands: today, tonight, tomorrow, day after tomorrow, weekday names (this/next/on),
 * "in N minutes/hours/days/weeks", "at 7 PM", "10:30", noon, midnight, morning/afternoon/evening,
 * "12 October", "October 12th", ISO dates, "next week", "every day/weekday/Monday/month".
 * Unknown text is left in `rest`.
 */
export function parseWhen(input: string, now = new Date()): When {
  let text = ` ${input} `;
  let date: DateKey | undefined;
  let time: TimeOfDay | undefined;
  let recurrence: Recurrence | undefined;
  const take = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    const m = re.exec(text);
    if (!m) return false;
    fn(m);
    text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
    return true;
  };

  // Recurrence
  take(new RegExp(`\\b(?:every|each)\\s+${WD}\\b`, 'i'), (m) => {
    recurrence = 'weekly';
    date = nextWeekday(now, weekdayIndex(m[1]), false);
  }) ||
    take(/\b(?:every\s+weekday|on\s+weekdays|every\s+work\s*day|weekdays)\b/i, () => { recurrence = 'weekdays'; }) ||
    take(/\b(?:every\s*day|daily|each\s+day|every\s+morning|every\s+evening|every\s+night)\b/i, (m) => {
      recurrence = 'daily';
      if (/morning/i.test(m[0])) time ??= '09:00';
      if (/evening|night/i.test(m[0])) time ??= '19:00';
    }) ||
    take(/\b(?:every\s+month|monthly|each\s+month)\b/i, () => { recurrence = 'monthly'; }) ||
    take(/\b(?:every\s+week|weekly)\b/i, () => { recurrence = 'weekly'; });

  // Relative offsets
  take(/\bin\s+(\d+|an?|one|two|three|half an)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?)\b/i, (m) => {
    const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, 'half an': 0.5 };
    const n = /\d/.test(m[1]) ? Number(m[1]) : words[m[1].toLowerCase()] ?? 1;
    const unit = m[2].toLowerCase();
    const d = new Date(now);
    if (unit.startsWith('min')) d.setMinutes(d.getMinutes() + n);
    else if (unit.startsWith('h')) d.setMinutes(d.getMinutes() + Math.round(n * 60));
    else if (unit.startsWith('d')) d.setDate(d.getDate() + n);
    else d.setDate(d.getDate() + 7 * n);
    date = toDateKey(d);
    if (unit.startsWith('min') || unit.startsWith('h')) time = toTime(d);
  });

  // Absolute dates
  take(/\b(\d{4}-\d{2}-\d{2})\b/, (m) => { if (isDateKey(m[1])) date = m[1]; }) ||
    take(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}(?:\\s+(\\d{4}))?\\b`, 'i'), (m) => setDay(Number(m[1]), monthIndex(m[2]), m[3])) ||
    take(new RegExp(`\\b(?:on\\s+)?${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'), (m) => setDay(Number(m[2]), monthIndex(m[1]), m[3]));

  function setDay(day: number, month: number, year?: string) {
    if (month < 0) return;
    let y = year ? Number(year) : now.getFullYear();
    let key = `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!year && isDateKey(key) && key < toDateKey(now)) {
      y += 1;
      key = `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    if (isDateKey(key)) date = key;
  }

  if (!date) {
    take(/\b(?:the\s+)?day\s+after\s+tomorrow\b/i, () => { date = addDays(toDateKey(now), 2); }) ||
      take(/\btomorrow\b/i, () => { date = addDays(toDateKey(now), 1); }) ||
      take(/\btonight\b/i, () => { date = toDateKey(now); time ??= '20:00'; }) ||
      take(/\btoday\b/i, () => { date = toDateKey(now); }) ||
      take(/\b(?:this\s+)?weekend\b/i, () => { date = nextWeekday(now, 6, false); }) ||
      take(/\bnext\s+week\b/i, () => { date = nextWeekday(now, 1, true); }) ||
      take(new RegExp(`\\b(next|this|on|by|due|before)?\\s*${WD}\\b`, 'i'), (m) => {
        const isNext = m[1]?.toLowerCase() === 'next';
        date = nextWeekday(now, weekdayIndex(m[2]), isNext);
        // “next Friday” means Friday of next week, not the coming Friday this week.
        if (isNext && date < addDays(startOfWeek(toDateKey(now)), 7)) date = addDays(date, 7);
      });
  }

  // Times
  take(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\W|$)/i, (m) => {
    let h = Number(m[1]) % 12;
    if (/p/i.test(m[3])) h += 12;
    time = `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
  }) ||
    take(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/, (m) => { time = `${m[1].padStart(2, '0')}:${m[2]}`; }) ||
    take(/\b(?:at\s+)?noon\b|\bmidday\b/i, () => { time = '12:00'; }) ||
    take(/\b(?:at\s+)?midnight\b/i, () => { time = '00:00'; }) ||
    take(/\bat\s+(\d{1,2})\b(?!\s*(?:minutes?|hours?|days?|%|percent))/i, (m) => {
      const h = Number(m[1]);
      if (h >= 0 && h <= 23) time = `${String(h >= 1 && h <= 7 ? h + 12 : h).padStart(2, '0')}:00`;
    }) ||
    take(/\b(?:in\s+the\s+|this\s+)?(morning|afternoon|evening)\b/i, (m) => {
      time ??= { morning: '09:00', afternoon: '14:00', evening: '18:00' }[m[1].toLowerCase() as 'morning'];
    });

  const explicitDate = date !== undefined;
  if (time && !date && !recurrence) {
    // A bare time means the next time it happens.
    const [h, mi] = time.split(':').map(Number);
    const cand = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
    date = cand > now ? toDateKey(now) : addDays(toDateKey(now), 1);
  }
  if (recurrence && !date && time) {
    const [h, mi] = time.split(':').map(Number);
    const cand = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
    date = cand > now ? toDateKey(now) : addDays(toDateKey(now), 1);
  }

  const rest = text.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
  return { date, time, recurrence, explicitDate, rest };
}
