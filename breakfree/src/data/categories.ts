import type { CategoryId, TrackingMode, TriggerId } from '../models/types';

export interface CategoryInfo {
  id: CategoryId;
  name: string;
  short: string;
  icon: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'digital', name: 'Digital and online habits', short: 'Digital', icon: 'smartphone' },
  { id: 'substances', name: 'Smoking and potentially addictive habits', short: 'Substances', icon: 'cigarette' },
  { id: 'productivity', name: 'Productivity and discipline', short: 'Productivity', icon: 'target' },
  { id: 'sleep', name: 'Sleep habits', short: 'Sleep', icon: 'moon' },
  { id: 'eating', name: 'Eating and food-related patterns', short: 'Eating', icon: 'utensils' },
  { id: 'activity', name: 'Physical activity and daily routines', short: 'Activity', icon: 'footprints' },
  { id: 'emotional', name: 'Emotional and mental patterns', short: 'Emotional', icon: 'brain' },
  { id: 'social', name: 'Social habits', short: 'Social', icon: 'users' },
  { id: 'financial', name: 'Financial habits', short: 'Financial', icon: 'wallet' },
  { id: 'organisation', name: 'Personal organisation', short: 'Organisation', icon: 'folder' },
  { id: 'communication', name: 'Communication and behaviour', short: 'Communication', icon: 'message' },
  { id: 'custom', name: 'Custom habits', short: 'Custom', icon: 'sparkles' },
];

export const categoryById = (id: CategoryId): CategoryInfo =>
  CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

/** Onboarding interests. Several map onto the same library category. */
export const INTERESTS: { id: string; label: string; category: CategoryId }[] = [
  { id: 'digital', label: 'Digital and online habits', category: 'digital' },
  { id: 'nicotine', label: 'Smoking and nicotine', category: 'substances' },
  { id: 'substances', label: 'Other substance-related habits', category: 'substances' },
  { id: 'productivity', label: 'Productivity and discipline', category: 'productivity' },
  { id: 'sleep', label: 'Sleep', category: 'sleep' },
  { id: 'eating', label: 'Eating patterns', category: 'eating' },
  { id: 'activity', label: 'Physical activity', category: 'activity' },
  { id: 'emotional', label: 'Emotional patterns', category: 'emotional' },
  { id: 'social', label: 'Social habits', category: 'social' },
  { id: 'financial', label: 'Financial habits', category: 'financial' },
  { id: 'organisation', label: 'Personal organisation', category: 'organisation' },
  { id: 'communication', label: 'Communication and behaviour', category: 'communication' },
  { id: 'custom', label: 'Custom habits', category: 'custom' },
];

export interface ModeInfo {
  id: TrackingMode;
  name: string;
  short: string;
  description: string;
  /** What a "goal met / partly met / not met" check-in means in this mode. */
  checkInMeaning: { met: string; partial: string; notMet: string } | null;
  logLabel: string;
  amountLabel?: string;
}

export const MODES: ModeInfo[] = [
  {
    id: 'abstinence',
    name: 'Quit completely',
    short: 'Quit',
    description: 'Count the days you keep to an avoidance goal you define yourself.',
    checkInMeaning: {
      met: 'You kept to your goal for the whole day.',
      partial: 'Mostly kept to it — the day does not extend your streak, but it is recorded honestly.',
      notMet: 'The behaviour happened. Your past days still count.',
    },
    logLabel: 'Record an occurrence',
  },
  {
    id: 'frequency',
    name: 'Reduce frequency',
    short: 'Reduce',
    description: 'Log each time it happens and aim to stay within a daily or weekly limit.',
    checkInMeaning: {
      met: 'You stayed within your limit today.',
      partial: 'Close to your limit.',
      notMet: 'Over your limit today.',
    },
    logLabel: 'Record an event',
    amountLabel: 'Times',
  },
  {
    id: 'time',
    name: 'Limit time spent',
    short: 'Limit time',
    description: 'Log sessions in minutes and compare them with a time budget.',
    checkInMeaning: {
      met: 'You stayed within your time budget.',
      partial: 'Slightly over your time budget.',
      notMet: 'Well over your time budget.',
    },
    logLabel: 'Log a session',
    amountLabel: 'Minutes',
  },
  {
    id: 'quantity',
    name: 'Track a quantity',
    short: 'Quantity',
    description: 'Track an amount in a unit you choose — drinks, money, pages — against a limit.',
    checkInMeaning: {
      met: 'You stayed within your limit.',
      partial: 'Close to your limit.',
      notMet: 'Over your limit.',
    },
    logLabel: 'Record an amount',
    amountLabel: 'Amount',
  },
  {
    id: 'replacement',
    name: 'Build a healthier alternative',
    short: 'Build',
    description: 'Count how often you do the alternative you want more of.',
    checkInMeaning: {
      met: 'You did your alternative as planned.',
      partial: 'You did some of it.',
      notMet: 'Not today — that is fine, tomorrow is a new chance.',
    },
    logLabel: 'Record progress',
    amountLabel: 'Times',
  },
  {
    id: 'observation',
    name: 'Observe and understand',
    short: 'Observe',
    description: 'Record events, context and feelings with no target, to understand the pattern first.',
    checkInMeaning: null,
    logLabel: 'Add an observation',
  },
];

export const modeById = (id: TrackingMode): ModeInfo => MODES.find((m) => m.id === id) ?? MODES[5];

export const TRIGGERS: { id: TriggerId; label: string }[] = [
  { id: 'boredom', label: 'Boredom' },
  { id: 'stress', label: 'Stress' },
  { id: 'anxiety', label: 'Anxiety or tension' },
  { id: 'social-pressure', label: 'Social pressure' },
  { id: 'loneliness', label: 'Loneliness' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'procrastination', label: 'Procrastination' },
  { id: 'routine', label: 'Habitual routine' },
  { id: 'environment', label: 'Environmental cue' },
  { id: 'emotional-discomfort', label: 'Emotional discomfort' },
  { id: 'easy-access', label: 'Easy access' },
  { id: 'other', label: 'Other' },
  { id: 'prefer-not', label: 'Prefer not to say' },
];

export const triggerLabel = (id?: TriggerId): string => TRIGGERS.find((t) => t.id === id)?.label ?? '';

export const DEFAULT_MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365];
