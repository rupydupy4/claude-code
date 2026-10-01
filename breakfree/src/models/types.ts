/** Calendar day in the user's local time zone, formatted YYYY-MM-DD. */
export type DateKey = string;
/** Wall-clock time, formatted HH:MM (24h). */
export type TimeOfDay = string;
/** ISO-8601 timestamp. */
export type Timestamp = string;

export type TrackingMode = 'abstinence' | 'frequency' | 'time' | 'quantity' | 'replacement' | 'observation';

export type CategoryId =
  | 'digital'
  | 'substances'
  | 'productivity'
  | 'sleep'
  | 'eating'
  | 'activity'
  | 'emotional'
  | 'social'
  | 'financial'
  | 'organisation'
  | 'communication'
  | 'custom';

export type TriggerId =
  | 'boredom'
  | 'stress'
  | 'anxiety'
  | 'social-pressure'
  | 'loneliness'
  | 'fatigue'
  | 'procrastination'
  | 'routine'
  | 'environment'
  | 'emotional-discomfort'
  | 'easy-access'
  | 'other'
  | 'prefer-not';

export interface HabitTemplate {
  id: string;
  name: string;
  category: CategoryId;
  description: string;
  icon: string;
  suggestedMode: TrackingMode;
  /** Modes that make sense for this habit; the suggested mode is always included. */
  modes: TrackingMode[];
  /** Unit for quantity mode, e.g. "drinks". */
  unit?: string;
  alternatives?: string[];
  guidance?: string;
  /** Shown prominently where a behaviour can involve dependence or health risk. */
  caution?: string;
  milestones?: number[];
  /** Order in which templates were added to the library, for "recently added" sorting. */
  addedOrder: number;
}

export interface ReminderConfiguration {
  enabled: boolean;
  time: TimeOfDay;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
}

/**
 * Targets mean different things per mode:
 * - abstinence: none (success is defined by `successRule`).
 * - frequency: max events per day / week.
 * - time: max minutes per day / week.
 * - quantity: max amount (in `unit`) per day / week.
 * - replacement: min times per day / week.
 * - observation: no targets.
 */
export interface HabitGoal {
  daily?: number;
  weekly?: number;
  unit?: string;
}

export interface Habit {
  id: string;
  templateId?: string;
  name: string;
  category: CategoryId;
  description: string;
  icon: string;
  mode: TrackingMode;
  goal: HabitGoal;
  /** For abstinence habits: what counts as a successful day, in the user's words. */
  successRule: string;
  triggers: TriggerId[];
  alternative: string;
  /** Another habit (usually replacement mode) linked as the healthier alternative. */
  linkedHabitId?: string;
  reminder: ReminderConfiguration;
  milestones: number[];
  notes: string;
  archived: boolean;
  startDate: DateKey;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CheckInStatus = 'met' | 'partial' | 'notMet';

export interface HabitCheckIn {
  id: string;
  habitId: string;
  date: DateKey;
  status: CheckInStatus;
  note: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * One occurrence of a habit. Doubles as a "session" for time-mode habits
 * (amount = minutes) and carries the optional trigger record.
 */
export interface HabitEvent {
  id: string;
  habitId: string;
  date: DateKey;
  time: TimeOfDay;
  /** Count (frequency/replacement), minutes (time), or quantity in the habit's unit. */
  amount: number;
  trigger?: TriggerId;
  /** 1 (mild) – 5 (very strong). */
  intensity?: number;
  context: string;
  note: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type JournalTag = 'reflection' | 'progress' | 'challenge' | 'trigger' | 'gratitude' | 'other';

export interface JournalEntry {
  id: string;
  date: DateKey;
  title: string;
  body: string;
  tag: JournalTag;
  prompt?: string;
  habitId?: string;
  pinned: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type Recurrence =
  | { type: 'once'; date: DateKey }
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] };

export type MissionCategory = 'focus' | 'learning' | 'wellbeing' | 'home' | 'social' | 'health' | 'planning' | 'other';

export interface Mission {
  id: string;
  title: string;
  category: MissionCategory;
  durationMin?: number;
  preferredTime?: TimeOfDay;
  recurrence: Recurrence;
  reminder: boolean;
  archived: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MissionCompletion {
  id: string;
  missionId: string;
  date: DateKey;
  completedAt: Timestamp;
}

export type RoutineSlot = 'morning' | 'afternoon' | 'evening';

export interface RoutineStep {
  id: string;
  missionId: string;
}

export interface Routine {
  id: string;
  name: string;
  slot: RoutineSlot;
  steps: RoutineStep[];
  /** Optional reminder time for the start of the routine. */
  startTime?: TimeOfDay;
  paused: boolean;
  archived: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * A finished or ended focus session. Only `completed` sessions (the timer reached zero)
 * count towards focus-time totals; `ended-early` sessions are kept for history.
 */
export interface FocusSession {
  id: string;
  startedAt: Timestamp;
  endedAt: Timestamp;
  plannedMin: number;
  focusedMin: number;
  status: 'completed' | 'ended-early';
  category: string;
  note: string;
}

export interface ResetSession {
  id: string;
  startedAt: Timestamp;
  durationSec: number;
  completed: boolean;
  activityId?: string;
  helped?: 'yes' | 'somewhat' | 'no';
  feeling?: string;
  note?: string;
}

export interface GoalMilestone {
  id: string;
  title: string;
  value?: number;
  done: boolean;
}

export type GoalCategory = 'habit' | 'routine' | 'focus' | 'savings' | 'project' | 'other';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface PersonalGoal {
  id: string;
  title: string;
  description: string;
  category: GoalCategory;
  kind: 'numeric' | 'completion';
  target?: number;
  progress: number;
  unit: string;
  startDate: DateKey;
  targetDate?: DateKey;
  milestones: GoalMilestone[];
  status: GoalStatus;
  notes: string;
  habitId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Achievement {
  id: string;
  earnedAt: Timestamp;
}

export interface BlockedSite {
  id: string;
  domain: string;
  reason: string;
  createdAt: Timestamp;
}

export interface DistractionLog {
  id: string;
  date: DateKey;
  time: TimeOfDay;
  site: string;
  note: string;
  createdAt: Timestamp;
}

export type ThemePreference = 'dark' | 'light' | 'system';

export interface ReminderSettings {
  /** Master switch — off by default. */
  enabled: boolean;
  /** Use native notifications when permitted; otherwise in-app banners only. */
  native: boolean;
  quietStart: TimeOfDay;
  quietEnd: TimeOfDay;
  reflection: { enabled: boolean; time: TimeOfDay };
  focus: { enabled: boolean; time: TimeOfDay };
  goals: { enabled: boolean; time: TimeOfDay };
  missions: boolean;
  routines: boolean;
}

export interface UserPreferences {
  name: string;
  theme: ThemePreference;
  onboarded: boolean;
  interests: string[];
  preferredModes: TrackingMode[];
  gamification: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  weekStartsOn: 0 | 1;
  reminders: ReminderSettings;
  focusDefaults: { workMin: number; breakMin: number };
}

export interface AppData {
  schemaVersion: number;
  prefs: UserPreferences;
  habits: Habit[];
  checkIns: HabitCheckIn[];
  events: HabitEvent[];
  journal: JournalEntry[];
  missions: Mission[];
  missionCompletions: MissionCompletion[];
  routines: Routine[];
  focusSessions: FocusSession[];
  resetSessions: ResetSession[];
  goals: PersonalGoal[];
  achievements: Achievement[];
  blockedSites: BlockedSite[];
  distractionLogs: DistractionLog[];
}
