import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DateKey } from '../models/types';
import { addDays, formatDate, startOfWeek } from '../utils/dates';

const axis = { stroke: 'var(--text-3)', fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: 'var(--elevated)', border: '1px solid var(--border-strong)', borderRadius: 10, color: 'var(--text)', fontSize: 13 },
  labelStyle: { color: 'var(--text-2)' },
  cursor: { fill: 'var(--accent-soft)' },
};

/**
 * Bar chart with an accessible text summary. `description` is read by screen readers and
 * the hidden table lists every value.
 */
type Row = Record<string, string | number>;

export function BarSeries({
  data, xKey, yKey, name, color = 'var(--chart-1)', description, reference, unit = '', height = 220,
}: { data: Row[]; xKey: string; yKey: string; name: string; color?: string; description: string; reference?: { y: number; label: string }; unit?: string; height?: number }) {
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart-box" style={{ height }} role="img" aria-label={description}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...axis} allowDecimals={false} width={44} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v}${unit}`, name]} />
            {reference && <ReferenceLine y={reference.y} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: reference.label, fill: 'var(--warning)', fontSize: 11, position: 'insideTopRight' }} />}
            <Bar dataKey={yKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable caption={description} rows={data.map((d) => [String(d[xKey]), `${d[yKey]}${unit}`])} />
    </figure>
  );
}

export function LineSeries({
  data, xKey, lines, description, height = 220,
}: { data: Row[]; xKey: string; lines: { key: string; name: string; color: string }[]; description: string; height?: number }) {
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart-box" style={{ height }} role="img" aria-label={description}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" minTickGap={12} />
            <YAxis {...axis} allowDecimals={false} width={44} />
            <Tooltip {...tooltipStyle} cursor={{ stroke: 'var(--border-strong)' }} />
            {lines.map((l) => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="legend" aria-hidden="true">
        {lines.map((l) => <span key={l.key}><i className="swatch" style={{ background: l.color }} />{l.name}</span>)}
      </div>
      <DataTable caption={description} rows={data.map((d) => [String(d[xKey]), lines.map((l) => `${l.name}: ${d[l.key]}`).join(', ')])} />
    </figure>
  );
}

function DataTable({ caption, rows }: { caption: string; rows: string[][] }) {
  return (
    // Tables ignore width constraints, so the visually-hidden wrapper is a div.
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** GitHub-style calendar heatmap. Values are counts per day; intensity uses opacity plus a text alternative. */
export function Heatmap({ values, end, weeks = 18, weekStartsOn, label }: { values: Map<DateKey, number>; end: DateKey; weeks?: number; weekStartsOn: 0 | 1; label: string }) {
  const start = addDays(startOfWeek(end, weekStartsOn), -(weeks - 1) * 7);
  const max = Math.max(1, ...Array.from(values.values()));
  const cells: { d: DateKey; v: number }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push({ d, v: values.get(d) ?? 0 });
  const active = cells.filter((c) => c.v > 0).length;
  return (
    <div>
      <div className="heatmap" role="img" aria-label={`${label}: activity on ${active} of the last ${cells.length} days`}>
        {cells.map((c) => (
          <i
            key={c.d}
            title={`${formatDate(c.d, { day: 'numeric', month: 'short' })}: ${c.v}`}
            style={c.v ? { background: 'var(--chart-1)', opacity: 0.25 + 0.75 * (c.v / max) } : undefined}
          />
        ))}
      </div>
      <div className="legend" aria-hidden="true">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((o) => <i key={o} className="swatch" style={o ? { background: 'var(--chart-1)', opacity: 0.25 + 0.75 * o } : { background: 'var(--bg-2)' }} />)}
        <span>More</span>
      </div>
    </div>
  );
}
