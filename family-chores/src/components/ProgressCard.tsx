import { Flame, Star, Trophy } from 'lucide-react';
import { POINTS_PER_LEVEL, type Progress } from '@/lib/progress';
import { Card, ProgressBar } from './ui';

function streakMessage(p: Progress) {
  if (p.streak === 0) return p.bestStreak ? `Your best was ${p.bestStreak} ${p.bestStreak === 1 ? 'day' : 'days'}. Get a chore approved to start a new streak!` : 'Get a chore approved to start your streak!';
  if (!p.doneToday) return 'Hand in a chore today to keep your streak going.';
  if (p.streak >= p.bestStreak && p.streak > 1) return 'That’s your best streak yet. Brilliant!';
  return 'Nice work today. Keep it up!';
}

/** The child's points, level and streak, in friendly words. */
export function ProgressCard({ p, name }: { p: Progress; name: string }) {
  const toNext = POINTS_PER_LEVEL - p.levelPoints;
  return (
    <Card className="overflow-hidden" role="region" aria-labelledby="progress-title">
      <div className="bg-accent-soft px-5 py-4">
        <h2 id="progress-title" className="flex items-center gap-2 text-[17px] font-semibold text-accent-strong">
          <Trophy size={20} aria-hidden="true" />Level {p.level}
        </h2>
        <p className="mt-0.5 text-sm text-accent-strong/80">{name}, you’re {toNext} {toNext === 1 ? 'point' : 'points'} away from level {p.level + 1}.</p>
        <div className="mt-3"><ProgressBar value={p.levelPoints} max={POINTS_PER_LEVEL} label={`Progress to level ${p.level + 1}`} /></div>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-line">
        <div className="px-4 py-4">
          <dt className="text-xs font-medium text-ink-3 sm:text-sm">Points</dt>
          <dd className="mt-0.5 flex items-center gap-1 text-xl font-semibold tabular sm:text-2xl"><Star size={18} className="text-gold" aria-hidden="true" />{p.points}</dd>
        </div>
        <div className="px-4 py-4">
          <dt className="text-xs font-medium text-ink-3 sm:text-sm">This week</dt>
          <dd className="mt-0.5 text-xl font-semibold tabular sm:text-2xl">+{p.pointsThisWeek}</dd>
        </div>
        <div className="px-4 py-4">
          <dt className="text-xs font-medium text-ink-3 sm:text-sm">Streak</dt>
          <dd className="mt-0.5 flex items-center gap-1 text-xl font-semibold tabular sm:text-2xl">
            <Flame size={18} className={p.streak ? 'text-gold' : 'text-ink-3'} aria-hidden="true" />{p.streak}<span className="sr-only"> {p.streak === 1 ? 'day' : 'days'}</span>
          </dd>
        </div>
      </dl>
      <p className="border-t border-line px-5 py-3 text-sm text-ink-2" role="status">{streakMessage(p)}</p>
    </Card>
  );
}
