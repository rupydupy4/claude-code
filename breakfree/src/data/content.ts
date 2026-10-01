import type { JournalTag, MissionCategory } from '../models/types';

export type ActivityCategory = 'move' | 'calm' | 'create' | 'tidy' | 'connect' | 'focus';

export interface Activity {
  id: string;
  title: string;
  category: ActivityCategory;
  minutes: number;
  detail: string;
}

export const ACTIVITY_CATEGORIES: { id: ActivityCategory; label: string }[] = [
  { id: 'move', label: 'Move' },
  { id: 'calm', label: 'Calm' },
  { id: 'create', label: 'Create' },
  { id: 'tidy', label: 'Tidy' },
  { id: 'connect', label: 'Connect' },
  { id: 'focus', label: 'Focus' },
];

export const ACTIVITIES: Activity[] = [
  { id: 'walk', title: 'Take a short walk', category: 'move', minutes: 10, detail: 'Around the block or the room — whatever is practical and safe.' },
  { id: 'water', title: 'Drink some water', category: 'calm', minutes: 1, detail: 'Pour a glass and drink it slowly.' },
  { id: 'stretch', title: 'Stretch gently', category: 'move', minutes: 5, detail: 'Neck, shoulders, back. Stop if anything hurts.' },
  { id: 'tidy', title: 'Tidy a small area', category: 'tidy', minutes: 5, detail: 'One surface, one drawer, one shelf.' },
  { id: 'read', title: 'Read a few pages', category: 'focus', minutes: 10, detail: 'A book, article or anything offline.' },
  { id: 'music', title: 'Listen to music', category: 'calm', minutes: 5, detail: 'Put on one song you like and just listen.' },
  { id: 'instrument', title: 'Practise an instrument', category: 'create', minutes: 15, detail: 'Even a few minutes of scales counts.' },
  { id: 'reflect', title: 'Write a short reflection', category: 'calm', minutes: 5, detail: 'What is going on right now? What do you need?' },
  { id: 'draw', title: 'Draw something', category: 'create', minutes: 10, detail: 'Doodles count. No one has to see it.' },
  { id: 'prepare', title: 'Prepare for tomorrow', category: 'tidy', minutes: 10, detail: 'Lay out clothes, pack a bag, write a short list.' },
  { id: 'small-task', title: 'Complete one small task', category: 'focus', minutes: 5, detail: 'Pick the smallest thing on your list and finish it.' },
  { id: 'screen-break', title: 'Take a screen break', category: 'calm', minutes: 5, detail: 'Look at something far away and rest your eyes.' },
  { id: 'contact', title: 'Contact a trusted person', category: 'connect', minutes: 10, detail: 'A message or a quick call to someone you trust.' },
  { id: 'breathe', title: 'Try a gentle breathing exercise', category: 'calm', minutes: 2, detail: 'Use the breathing guide on this page.' },
  { id: 'workspace', title: 'Organise a workspace', category: 'tidy', minutes: 10, detail: 'Clear your desk so it is ready for the next thing.' },
  { id: 'outdoors', title: 'Spend a few minutes outdoors', category: 'move', minutes: 5, detail: 'Step outside when it is safe to — notice the air and light.' },
];

export const MESSAGES: string[] = [
  'Progress over perfection.',
  'Small steps still move you forward.',
  'Noticing a pattern is already a kind of progress.',
  'A setback is information, not a verdict.',
  'Every check-in is a vote for the person you want to be.',
  'You do not have to get it right every day to be getting somewhere.',
  'Be as patient with yourself as you would be with a friend.',
  'Today is a fresh page. Your past days still count.',
  'Change is rarely a straight line.',
  'The goal is not perfection — it is a life that feels more like yours.',
  'Pausing before you act is a skill, and skills grow with practice.',
  'One honest entry is worth more than a perfect-looking record.',
];

export const MISSION_TEMPLATES: { title: string; category: MissionCategory; durationMin?: number }[] = [
  { title: 'Complete a focus session', category: 'focus', durationMin: 25 },
  { title: 'Read for a few minutes', category: 'learning', durationMin: 10 },
  { title: 'Take a screen break', category: 'wellbeing', durationMin: 5 },
  { title: 'Practise a skill', category: 'learning', durationMin: 15 },
  { title: 'Tidy a small area', category: 'home', durationMin: 5 },
  { title: 'Go outside when practical', category: 'health', durationMin: 10 },
  { title: 'Write a reflection', category: 'wellbeing', durationMin: 5 },
  { title: 'Plan tomorrow', category: 'planning', durationMin: 5 },
  { title: 'Complete one personal task', category: 'other' },
  { title: 'Follow my bedtime routine', category: 'health' },
  { title: 'Prepare a regular meal', category: 'health', durationMin: 20 },
  { title: 'Contact a friend', category: 'social', durationMin: 10 },
];

export const MISSION_CATEGORIES: { id: MissionCategory; label: string }[] = [
  { id: 'focus', label: 'Focus' },
  { id: 'learning', label: 'Learning' },
  { id: 'wellbeing', label: 'Wellbeing' },
  { id: 'home', label: 'Home' },
  { id: 'social', label: 'Social' },
  { id: 'health', label: 'Health' },
  { id: 'planning', label: 'Planning' },
  { id: 'other', label: 'Other' },
];

export const JOURNAL_PROMPTS: string[] = [
  'What went well today?',
  'What was challenging?',
  'What helped me redirect my attention?',
  'What would I like to try next time?',
  'What is one small improvement I can make?',
  'What did I learn about my routine?',
];

export const JOURNAL_TAGS: { id: JournalTag; label: string }[] = [
  { id: 'reflection', label: 'Reflection' },
  { id: 'progress', label: 'Progress' },
  { id: 'challenge', label: 'Challenge' },
  { id: 'trigger', label: 'Trigger' },
  { id: 'gratitude', label: 'Gratitude' },
  { id: 'other', label: 'Other' },
];
