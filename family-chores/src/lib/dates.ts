/** Plain calendar-day helpers. Days are 'YYYY-MM-DD' strings in the household's time zone. */

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string) {
  const w = new Date(`${day}T12:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Monday and Sunday of the week containing `day`. */
export function weekRange(day: string) {
  const start = addDays(day, 1 - isoWeekday(day));
  return { start, end: addDays(start, 6) };
}

/** The calendar day (YYYY-MM-DD) of a moment, in a time zone. */
export function dayIn(timeZone: string, at: Date | string = new Date()) {
  const d = typeof at === 'string' ? new Date(at) : at;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
