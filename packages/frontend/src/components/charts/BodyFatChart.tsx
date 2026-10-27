import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { format, parseISO, subDays, subMonths } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import type { MeasurementEntry } from '@/types/api';
import { cn } from '@/lib/utils';

type TimeRange = '30D' | '90D' | '6M' | 'ALL';
const TIME_RANGES: TimeRange[] = ['30D', '90D', '6M', 'ALL'];

interface BodyFatChartProps {
  entries: MeasurementEntry[]; // entries for body fat % measurement
}

// Body fat category reference lines
const CATEGORIES = [
  { value: 6, label: 'Essential', color: 'hsl(var(--destructive))' },
  { value: 14, label: 'Athletic', color: 'hsl(142 71% 45%)' },
  { value: 21, label: 'Fitness', color: 'hsl(var(--warning))' },
  { value: 25, label: 'Average', color: 'hsl(var(--muted-foreground))' },
];

function filterByRange(entries: MeasurementEntry[], range: TimeRange): MeasurementEntry[] {
  const now = new Date();
  const cutoff =
    range === '30D' ? subDays(now, 30) :
    range === '90D' ? subDays(now, 90) :
    range === '6M' ? subMonths(now, 6) :
    null;
  if (!cutoff) return entries;
  return entries.filter((e) => parseISO(e.date) >= cutoff);
}

export function BodyFatChart({ entries }: BodyFatChartProps) {
  const [range, setRange] = useState<TimeRange>('90D');

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries]
  );

  const filtered = useMemo(() => filterByRange(sorted, range), [sorted, range]);

  const chartData = useMemo(() =>
    filtered.map((e) => ({
      date: format(parseISO(e.date), 'MMM d'),
      value: e.value,
    })),
    [filtered]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {TIME_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
              range === r
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={range}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="h-48"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="bfGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(262 83% 58%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(262 83% 58%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={32}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  backdropFilter: 'blur(24px)',
                  fontSize: '12px',
                }}
                formatter={(v) => [`${v}%`, 'Body Fat']}
              />
              {CATEGORIES.map((cat) => (
                <ReferenceLine
                  key={cat.label}
                  y={cat.value}
                  stroke={cat.color}
                  strokeOpacity={0.4}
                  strokeDasharray="3 3"
                />
              ))}
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(262 83% 58%)"
                strokeWidth={2}
                fill="url(#bfGradient)"
                dot={false}
                activeDot={{ r: 4, fill: 'hsl(262 83% 58%)', strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
