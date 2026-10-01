import {
  AlarmClock, Archive, ArchiveRestore, ArrowDown, ArrowUp, Bell, BellOff, BookOpen, Brain, Calendar, ChartColumn, Check,
  ChevronLeft, ChevronRight, Cigarette, Circle, CircleCheck, CircleDashed, CircleX, Clock, Coffee, Dices, Download, Droplet,
  Ellipsis, Flag, Flame, Folder, Footprints, Gamepad2, Globe, Goal, Heart, Info, LayoutDashboard, Library, LifeBuoy, List,
  ListChecks, Lock, Medal, MessageSquare, Minus, Moon, NotebookPen, Pause, PenLine, Pencil, Pill, Pin, PinOff, Play, Plus,
  Repeat, RotateCcw, Search, Settings, Shield, ShieldCheck, Shuffle, SkipForward, Smartphone, Sparkles, Sprout, Square, Star,
  Sun, Target, Timer, Trash2, TriangleAlert, Trophy, Tv, Upload, Users, Utensils, Wallet, Wind, Wine, X, Zap,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  alarm: AlarmClock, archive: Archive, restore: ArchiveRestore, 'arrow-down': ArrowDown, 'arrow-up': ArrowUp, bell: Bell,
  'bell-off': BellOff, book: BookOpen, brain: Brain, calendar: Calendar, chart: ChartColumn, check: Check,
  'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, cigarette: Cigarette, circle: Circle, 'circle-check': CircleCheck,
  'circle-dashed': CircleDashed, 'circle-x': CircleX, clock: Clock, coffee: Coffee, dice: Dices, download: Download,
  droplet: Droplet, more: Ellipsis, flag: Flag, flame: Flame, folder: Folder, footprints: Footprints, gamepad: Gamepad2,
  globe: Globe, goal: Goal, heart: Heart, info: Info, dashboard: LayoutDashboard, library: Library, lifebuoy: LifeBuoy,
  list: List, missions: ListChecks, lock: Lock, medal: Medal, message: MessageSquare, minus: Minus, moon: Moon,
  journal: NotebookPen, pause: Pause, pen: PenLine, edit: Pencil, pill: Pill, pin: Pin, unpin: PinOff, play: Play, plus: Plus,
  repeat: Repeat, reset: RotateCcw, search: Search, settings: Settings, shield: Shield, 'shield-check': ShieldCheck,
  shuffle: Shuffle, skip: SkipForward, smartphone: Smartphone, sparkles: Sparkles, sprout: Sprout, stop: Square, star: Star,
  sun: Sun, target: Target, timer: Timer, trash: Trash2, warning: TriangleAlert, trophy: Trophy, tv: Tv, upload: Upload,
  users: Users, utensils: Utensils, wallet: Wallet, wind: Wind, wine: Wine, x: X, zap: Zap,
};

export function Icon({ name, size = 18, className, label }: { name: string; size?: number; className?: string; label?: string }) {
  const C = ICONS[name] ?? Sparkles;
  return <C size={size} className={className} aria-hidden={label ? undefined : true} aria-label={label} strokeWidth={2} />;
}
