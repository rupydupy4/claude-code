export type Role = 'parent' | 'child';
export type ChoreStatus = 'assigned' | 'submitted' | 'approved' | 'needs_changes';
export type RewardType = 'money' | 'screen_time' | 'custom';
/** How often a chore comes back. Weekly chores repeat on chosen ISO weekdays (1 = Monday … 7 = Sunday). */
export type Repeat = 'none' | 'daily' | 'weekly';
export const AVATAR_COLORS = ['slate', 'teal', 'blue', 'violet', 'rose', 'amber', 'green'] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export interface Member {
  id: string;
  role: Role;
  name: string;
  avatarColor: AvatarColor;
  createdAt: string;
}

export interface Chore {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  rewardType: RewardType;
  /** Money: cents. Screen time: minutes. Custom: unused. */
  rewardAmount: number | null;
  rewardNote: string | null;
  dueDate: string | null;
  status: ChoreStatus;
  /** A photo stored on this device (IndexedDB), keyed by chore id. */
  hasPhoto: boolean;
  childNote: string | null;
  feedback: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  repeat: Repeat;
  /** ISO weekdays for weekly chores (sorted, unique); empty otherwise. */
  repeatDays: number[];
  /** Points the child earns when the chore is approved (0–1000). */
  points: number;
  /** All instances of a repeating chore share the id of the first one. */
  seriesId: string | null;
  /** When a parent marked this approved reward as handed over. A record only: no money moves. */
  paidAt: string | null;
}

export interface Household {
  name: string;
  /** Salted SHA-256 of the parent PIN. */
  parentPinHash: string;
  pinSalt: string;
  createdAt: string;
  demo?: boolean;
}

export interface Prefs {
  /** Small vibrations on key actions (phones that support it). */
  haptics: boolean;
}

export interface Data {
  version: 2;
  household: Household | null;
  members: Member[];
  chores: Chore[];
  prefs: Prefs;
}
