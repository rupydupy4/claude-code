export type Role = 'parent' | 'child';
export type ChoreStatus = 'assigned' | 'submitted' | 'approved' | 'needs_changes';
export type RewardType = 'money' | 'screen_time' | 'custom';
export const AVATAR_COLORS = ['slate', 'teal', 'blue', 'violet', 'rose', 'amber', 'green'] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export interface Household {
  id: string;
  name: string;
  join_code: string;
  time_zone: string;
}

export interface Member {
  id: string;
  household_id: string;
  role: Role;
  name: string;
  avatar_color: AvatarColor;
  created_at: string;
}

export interface Chore {
  id: string;
  household_id: string;
  title: string;
  description: string;
  assigned_to: string;
  reward_type: RewardType;
  reward_amount: number | null;
  reward_note: string | null;
  due_date: string | null;
  status: ChoreStatus;
  photo_path: string | null;
  child_note: string | null;
  feedback: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
}
