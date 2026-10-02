export type Role = 'parent' | 'child';
export type ChoreStatus = 'assigned' | 'submitted' | 'approved' | 'needs_changes';
export type RewardType = 'money' | 'screen_time' | 'custom';
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
}

export interface Household {
  name: string;
  /** Salted SHA-256 of the parent PIN. */
  parentPinHash: string;
  pinSalt: string;
  createdAt: string;
  demo?: boolean;
}

export interface Data {
  version: 1;
  household: Household | null;
  members: Member[];
  chores: Chore[];
}
