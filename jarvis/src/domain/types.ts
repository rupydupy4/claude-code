/** ISO-8601 timestamp (UTC). */
export type Timestamp = string;
/** Local calendar day, YYYY-MM-DD. */
export type DateKey = string;
/** Local wall-clock time, HH:MM. */
export type TimeOfDay = string;

export interface Base {
  id: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Example content created on first launch; removable in one step. */
  demo?: boolean;
}

export type TaskStatus = 'not_started' | 'in_progress' | 'waiting' | 'completed';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task extends Base {
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  dueDate?: DateKey;
  dueTime?: TimeOfDay;
  projectId?: string;
  tags: string[];
  notes: string;
  completedAt?: Timestamp;
}

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed';

export interface Project extends Base {
  name: string;
  description: string;
  status: ProjectStatus;
  deadline?: DateKey;
}

export interface Note extends Base {
  title: string;
  content: string;
  tags: string[];
  projectId?: string;
}

export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

export interface Reminder extends Base {
  text: string;
  /** Next time it is due (ISO). */
  at: Timestamp;
  recurrence: Recurrence;
  taskId?: string;
  /** One-time reminders become done after firing; recurring ones move `at` forward. */
  done: boolean;
  lastFiredAt?: Timestamp;
}

export interface CalendarEvent extends Base {
  title: string;
  description: string;
  start: Timestamp;
  end: Timestamp;
  location: string;
  projectId?: string;
  /** Minutes before start to remind; undefined = no reminder. */
  reminderMinutes?: number;
}

export type MemoryCategory = 'preferences' | 'projects' | 'people' | 'work' | 'instructions' | 'important';

export interface Memory extends Base {
  content: string;
  category: MemoryCategory;
}

export interface DocumentMeta extends Base {
  name: string;
  mimeType: string;
  size: number;
  /** Characters of extracted text stored (text lives in the documentText collection). */
  textLength: number;
  truncated: boolean;
  summary: string;
  projectId?: string;
  /** Latest analysis; `ai` says whether it came from the AI or the offline heuristics. */
  analysis?: {
    ai: boolean;
    at: Timestamp;
    keyPoints: string[];
    actionItems: { title: string; dueDate?: DateKey }[];
    deadlines: { what: string; date: DateKey }[];
  };
}

export interface DocumentText {
  id: string;
  text: string;
}

export interface ToolCallRecord {
  name: string;
  /** Short human-readable result, e.g. "Created task “Finish homepage”". */
  summary: string;
  ok: boolean;
}

export interface Source {
  title: string;
  url: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Timestamp;
  tools?: ToolCallRecord[];
  sources?: Source[];
  /** The answer stopped early (cancelled, error or length limit). */
  interrupted?: boolean;
  /** Pending destructive action awaiting the user's confirmation. */
  confirm?: PendingAction;
}

export interface PendingAction {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  description: string;
  state: 'pending' | 'confirmed' | 'cancelled';
}

export interface Conversation extends Base {
  title: string;
  /** Last few thousand characters of text, used by global search without loading messages. */
  searchText: string;
  messageCount: number;
  lastMessageAt: Timestamp;
}

/** Messages of one conversation, kept together in one record (paged by `before`). */
export interface ConversationMessages {
  id: string;
  messages: Message[];
}

export type EntityType = 'task' | 'project' | 'note' | 'reminder' | 'event' | 'memory' | 'document' | 'conversation' | 'settings';

export interface Activity {
  id: string;
  createdAt: Timestamp;
  verb: 'created' | 'updated' | 'completed' | 'reopened' | 'deleted' | 'analysed' | 'fired';
  entity: EntityType;
  entityId?: string;
  label: string;
  demo?: boolean;
}

export type ThemePref = 'light' | 'dark' | 'system';
export type AiSpeed = 'quick' | 'default' | 'complex';
export type ResponseStyle = 'concise' | 'balanced' | 'detailed';

export interface Settings {
  userName: string;
  /** How the assistant addresses the user, e.g. "Sir". Defaults to the user's name. */
  address: string;
  assistantName: string;
  workType: string;
  theme: ThemePref;
  accent: 'brass' | 'teal' | 'blue' | 'rose';
  voice: { enabled: boolean; rate: number; voiceURI: string; autoRead: boolean };
  responseStyle: ResponseStyle;
  aiSpeed: AiSpeed;
  memoryEnabled: boolean;
  notifications: { enabled: boolean; reminders: boolean; deadlines: boolean; proactive: boolean };
  onboarded: boolean;
  demoLoaded: boolean;
  /** Dismissed proactive insight ids for today (yyyy-mm-dd|id). */
  dismissedInsights: string[];
}

export interface Profile {
  id: string;
  createdAt: Timestamp;
}

export const COLLECTIONS = [
  'tasks',
  'projects',
  'notes',
  'reminders',
  'events',
  'memories',
  'documents',
  'documentText',
  'conversations',
  'messages',
  'activity',
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export interface CollectionTypes {
  tasks: Task;
  projects: Project;
  notes: Note;
  reminders: Reminder;
  events: CalendarEvent;
  memories: Memory;
  documents: DocumentMeta;
  documentText: DocumentText;
  conversations: Conversation;
  messages: ConversationMessages;
  activity: Activity;
}
