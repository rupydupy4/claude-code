import type {
  AppData,
  CategoryId,
  CheckInStatus,
  Habit,
  HabitCheckIn,
  HabitEvent,
  TrackingMode,
  TriggerId,
  UserPreferences,
} from '../models/types';
import { CATEGORIES, DEFAULT_MILESTONES, TRIGGERS } from '../data/categories';
import { isDateKey, isTimeOfDay } from '../utils/dates';

export const SCHEMA_VERSION = 2;

export function defaultPrefs(): UserPreferences {
  return {
    name: '',
    theme: 'dark',
    onboarded: false,
    interests: [],
    preferredModes: [],
    gamification: true,
    reducedMotion: 'system',
    weekStartsOn: 1,
    reminders: {
      enabled: false,
      native: false,
      quietStart: '22:00',
      quietEnd: '07:00',
      reflection: { enabled: false, time: '21:00' },
      focus: { enabled: false, time: '10:00' },
      goals: { enabled: false, time: '18:00' },
      missions: false,
      routines: false,
    },
    focusDefaults: { workMin: 25, breakMin: 5 },
  };
}

export function emptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    prefs: defaultPrefs(),
    habits: [],
    checkIns: [],
    events: [],
    journal: [],
    missions: [],
    missionCompletions: [],
    routines: [],
    focusSessions: [],
    resetSessions: [],
    goals: [],
    achievements: [],
    blockedSites: [],
    distractionLogs: [],
  };
}

// ---------------------------------------------------------------- migrations

type Raw = Record<string, unknown>;

/**
 * Each migration upgrades data from version N to N+1. Never mutate the input.
 * v0 → v1: data saved before versioning; fills in missing collections.
 * v1 → v2: habits gained `successRule`, `milestones` and `linkedHabitId`; prefs gained `focusDefaults`.
 */
const MIGRATIONS: Record<number, (d: Raw) => Raw> = {
  0: (d) => ({ ...emptyData(), ...d, schemaVersion: 1 }),
  1: (d) => ({
    ...d,
    schemaVersion: 2,
    habits: Array.isArray(d.habits)
      ? (d.habits as Raw[]).map((h) => ({ successRule: '', milestones: DEFAULT_MILESTONES, ...h }))
      : [],
    prefs: { ...defaultPrefs(), ...(d.prefs as Raw | undefined), focusDefaults: (d.prefs as Raw | undefined)?.focusDefaults ?? defaultPrefs().focusDefaults },
  }),
};

export class MigrationError extends Error {}

export function migrate(input: Raw): Raw {
  let data = input;
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new MigrationError(`This data was saved by a newer version of BREAKFREE (schema ${version}). Update the app before loading it.`);
  }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new MigrationError(`No migration from schema ${version}.`);
    data = step(data);
    version = data.schemaVersion as number;
  }
  return data;
}

// ---------------------------------------------------------------- validation

const MODES: TrackingMode[] = ['abstinence', 'frequency', 'time', 'quantity', 'replacement', 'observation'];
const CATS = new Set<CategoryId>(CATEGORIES.map((c) => c.id));
const TRIG = new Set<TriggerId>(TRIGGERS.map((t) => t.id));
const STATUSES: CheckInStatus[] = ['met', 'partial', 'notMet'];

const isStr = (v: unknown): v is string => typeof v === 'string';
const isId = (v: unknown): v is string => isStr(v) && v.length > 0 && v.length <= 100;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIso = (v: unknown): v is string => isStr(v) && !Number.isNaN(Date.parse(v));
const optNum = (v: unknown) => v === undefined || (isNum(v) && v >= 0);

type Validator = (r: Raw) => string | null;

const validators: Record<string, Validator> = {
  habits: (r) => {
    if (!isId(r.id)) return 'missing id';
    if (!isStr(r.name) || !r.name.trim()) return 'missing name';
    if (!MODES.includes(r.mode as TrackingMode)) return `unsupported tracking mode "${String(r.mode)}"`;
    if (!CATS.has(r.category as CategoryId)) return `unknown category "${String(r.category)}"`;
    const g = (r.goal ?? {}) as Raw;
    if (!optNum(g.daily) || !optNum(g.weekly)) return 'invalid goal';
    if (!isDateKey(r.startDate)) return 'invalid start date';
    return null;
  },
  checkIns: (r) => {
    if (!isId(r.id) || !isId(r.habitId)) return 'missing id';
    if (!isDateKey(r.date)) return 'invalid date';
    if (!STATUSES.includes(r.status as CheckInStatus)) return 'invalid status';
    return null;
  },
  events: (r) => {
    if (!isId(r.id) || !isId(r.habitId)) return 'missing id';
    if (!isDateKey(r.date)) return 'invalid date';
    if (!isTimeOfDay(r.time)) return 'invalid time';
    if (!isNum(r.amount) || r.amount < 0) return 'invalid amount';
    if (r.trigger !== undefined && !TRIG.has(r.trigger as TriggerId)) return 'invalid trigger';
    if (r.intensity !== undefined && (!isNum(r.intensity) || r.intensity < 1 || r.intensity > 5)) return 'invalid intensity';
    return null;
  },
  journal: (r) => (!isId(r.id) ? 'missing id' : !isDateKey(r.date) ? 'invalid date' : !isStr(r.body) ? 'invalid text' : null),
  missions: (r) => {
    if (!isId(r.id) || !isStr(r.title)) return 'missing id or title';
    const rec = r.recurrence as Raw | undefined;
    if (!rec || !['once', 'daily', 'weekdays'].includes(rec.type as string)) return 'invalid recurrence';
    if (rec.type === 'once' && !isDateKey(rec.date)) return 'invalid date';
    if (rec.type === 'weekdays' && !(Array.isArray(rec.days) && rec.days.every((x) => isNum(x) && x >= 0 && x <= 6))) return 'invalid weekdays';
    return null;
  },
  missionCompletions: (r) => (!isId(r.id) || !isId(r.missionId) ? 'missing id' : !isDateKey(r.date) ? 'invalid date' : null),
  routines: (r) => (!isId(r.id) || !Array.isArray(r.steps) ? 'invalid routine' : null),
  focusSessions: (r) =>
    !isId(r.id) ? 'missing id' : !isIso(r.startedAt) || !isIso(r.endedAt) ? 'invalid time' : !isNum(r.focusedMin) || r.focusedMin < 0 ? 'invalid duration' : null,
  resetSessions: (r) => (!isId(r.id) ? 'missing id' : !isIso(r.startedAt) ? 'invalid time' : !isNum(r.durationSec) || r.durationSec < 0 ? 'invalid duration' : null),
  goals: (r) => {
    if (!isId(r.id) || !isStr(r.title)) return 'missing id or title';
    if (!isNum(r.progress)) return 'invalid progress';
    if (r.target !== undefined && (!isNum(r.target) || r.target < 0)) return 'invalid target';
    return null;
  },
  achievements: (r) => (!isId(r.id) || !isIso(r.earnedAt) ? 'invalid achievement' : null),
  blockedSites: (r) => (!isId(r.id) || !isStr(r.domain) ? 'invalid site' : null),
  distractionLogs: (r) => (!isId(r.id) || !isDateKey(r.date) ? 'invalid log' : null),
};

export const COLLECTIONS = Object.keys(validators) as (keyof typeof validators)[];

export interface ValidationResult {
  data: AppData;
  errors: string[];
  /** Records that failed validation (repair mode only). */
  dropped: number;
  counts: Record<string, number>;
}

/**
 * Validates migrated data. In `strict` mode (imports) any problem is reported and the caller
 * should reject the data. In repair mode (startup) invalid records are dropped and counted,
 * and the caller keeps a raw recovery copy.
 */
export function validateData(input: Raw, mode: 'strict' | 'repair'): ValidationResult {
  const errors: string[] = [];
  let dropped = 0;
  const out = emptyData() as unknown as Raw;
  out.prefs = sanitizePrefs(input.prefs);
  const counts: Record<string, number> = {};

  for (const key of COLLECTIONS) {
    const arr = input[key];
    if (arr === undefined) {
      out[key] = [];
      counts[key] = 0;
      continue;
    }
    if (!Array.isArray(arr)) {
      errors.push(`"${key}" should be a list.`);
      out[key] = [];
      continue;
    }
    const seen = new Set<string>();
    const kept: Raw[] = [];
    arr.forEach((rec, i) => {
      const problem = rec && typeof rec === 'object' ? validators[key](rec as Raw) : 'not an object';
      const dup = !problem && seen.has((rec as Raw).id as string);
      if (problem || dup) {
        dropped++;
        if (errors.length < 20) errors.push(`${key}[${i}]: ${problem ?? 'duplicate id'}`);
        return;
      }
      seen.add((rec as Raw).id as string);
      kept.push(rec as Raw);
    });
    out[key] = kept;
    counts[key] = kept.length;
  }

  const data = out as unknown as AppData;
  data.schemaVersion = SCHEMA_VERSION;
  normalizeHabits(data.habits);
  // Drop records pointing at habits that no longer exist.
  const habitIds = new Set(data.habits.map((h) => h.id));
  const orphanCheckIns = data.checkIns.filter((c) => !habitIds.has(c.habitId)).length;
  const orphanEvents = data.events.filter((e) => !habitIds.has(e.habitId)).length;
  if (orphanCheckIns + orphanEvents > 0) {
    if (mode === 'strict') errors.push(`${orphanCheckIns + orphanEvents} records refer to habits that are not in the file.`);
    data.checkIns = data.checkIns.filter((c) => habitIds.has(c.habitId));
    data.events = data.events.filter((e) => habitIds.has(e.habitId));
    dropped += orphanCheckIns + orphanEvents;
  }
  // One check-in per habit per day — keep the most recently updated.
  data.checkIns = dedupeCheckIns(data.checkIns);
  return { data, errors, dropped, counts };
}

export function dedupeCheckIns(list: HabitCheckIn[]): HabitCheckIn[] {
  const byKey = new Map<string, HabitCheckIn>();
  for (const c of list) {
    const k = `${c.habitId}|${c.date}`;
    const prev = byKey.get(k);
    if (!prev || (c.updatedAt ?? '') > (prev.updatedAt ?? '')) byKey.set(k, c);
  }
  return Array.from(byKey.values());
}

function normalizeHabits(habits: Habit[]) {
  for (const h of habits) {
    h.description ??= '';
    h.icon ??= 'sparkles';
    h.goal ??= {};
    h.successRule ??= '';
    h.triggers = Array.isArray(h.triggers) ? h.triggers.filter((t) => TRIG.has(t)) : [];
    h.alternative ??= '';
    h.reminder ??= { enabled: false, time: '20:00', days: [0, 1, 2, 3, 4, 5, 6] };
    h.milestones = Array.isArray(h.milestones) ? h.milestones.filter((m) => isNum(m) && m > 0) : DEFAULT_MILESTONES;
    h.notes ??= '';
    h.archived = Boolean(h.archived);
    h.createdAt ??= new Date().toISOString();
    h.updatedAt ??= h.createdAt;
  }
}

function sanitizePrefs(p: unknown): UserPreferences {
  const d = defaultPrefs();
  if (!p || typeof p !== 'object') return d;
  const r = p as Raw;
  const rem = (r.reminders ?? {}) as Raw;
  return {
    ...d,
    name: isStr(r.name) ? r.name.slice(0, 40) : d.name,
    theme: r.theme === 'light' || r.theme === 'system' || r.theme === 'dark' ? r.theme : d.theme,
    onboarded: Boolean(r.onboarded),
    interests: Array.isArray(r.interests) ? r.interests.filter(isStr) : [],
    preferredModes: Array.isArray(r.preferredModes) ? (r.preferredModes.filter((m) => MODES.includes(m as TrackingMode)) as TrackingMode[]) : [],
    gamification: r.gamification === undefined ? d.gamification : Boolean(r.gamification),
    reducedMotion: r.reducedMotion === 'on' || r.reducedMotion === 'off' ? r.reducedMotion : 'system',
    weekStartsOn: r.weekStartsOn === 0 ? 0 : 1,
    reminders: { ...d.reminders, ...rem, enabled: Boolean(rem.enabled) } as UserPreferences['reminders'],
    focusDefaults: {
      workMin: isNum((r.focusDefaults as Raw | undefined)?.workMin) ? ((r.focusDefaults as Raw).workMin as number) : d.focusDefaults.workMin,
      breakMin: isNum((r.focusDefaults as Raw | undefined)?.breakMin) ? ((r.focusDefaults as Raw).breakMin as number) : d.focusDefaults.breakMin,
    },
  };
}

export type { HabitEvent };
