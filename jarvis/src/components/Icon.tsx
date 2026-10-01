import {
  Activity, AlarmClock, ArrowLeft, ArrowUp, Bell, BellOff, BookOpen, Brain, Calendar, CalendarPlus, Check, ChevronLeft,
  ChevronRight, CircleAlert, CircleCheck, Clock, Copy, Download, Ellipsis, FileText, Flag, Folder, FolderPlus, Globe, Info,
  LayoutDashboard, LayoutGrid, ListChecks, ListPlus, LoaderCircle, Lock, MapPin, Menu, MessageSquare, MessageSquarePlus, Mic,
  MicOff, Moon, NotebookPen, Paperclip, PenLine, Pencil, Plus, Repeat, RotateCcw, Search, Send, Settings, ShieldCheck,
  Sparkles, Square, Sun, Trash2, TriangleAlert, Upload, Volume2, VolumeX, Wand, X,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  activity: Activity, alarm: AlarmClock, back: ArrowLeft, send: ArrowUp, 'send-alt': Send, bell: Bell, 'bell-off': BellOff,
  book: BookOpen, brain: Brain, calendar: Calendar, 'calendar-plus': CalendarPlus, check: Check, 'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight, alert: CircleAlert, 'circle-check': CircleCheck, clock: Clock, copy: Copy, download: Download,
  more: Ellipsis, file: FileText, flag: Flag, folder: Folder, 'folder-plus': FolderPlus, globe: Globe, info: Info,
  dashboard: LayoutDashboard, workspace: LayoutGrid, tasks: ListChecks, 'task-plus': ListPlus, loader: LoaderCircle, lock: Lock,
  pin: MapPin, menu: Menu, message: MessageSquare, 'message-plus': MessageSquarePlus, mic: Mic, 'mic-off': MicOff, moon: Moon,
  note: NotebookPen, attach: Paperclip, write: PenLine, edit: Pencil, plus: Plus, repeat: Repeat, retry: RotateCcw,
  search: Search, settings: Settings, shield: ShieldCheck, sparkles: Sparkles, stop: Square, sun: Sun, trash: Trash2,
  warning: TriangleAlert, upload: Upload, speak: Volume2, mute: VolumeX, wand: Wand, x: X,
};

export function Icon({ name, size = 18, className, label }: { name: string; size?: number; className?: string; label?: string }) {
  const C = ICONS[name] ?? Sparkles;
  return <C size={size} className={className} aria-hidden={label ? undefined : true} aria-label={label} strokeWidth={1.9} />;
}
