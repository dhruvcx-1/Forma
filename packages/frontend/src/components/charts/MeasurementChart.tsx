import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { format, parseISO, subDays, subMonths, subYears } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import type { MeasurementEntry } from '@/types/api';
import { cn } from '@/lib/utils';

type TimeRange = '30D' | '90D' | '6M' | '1Y' | 'ALL';
const TIME_RANGES: TimeRange[] = ['30D', '90D', '6M', '1Y', 'ALL'];

interface MeasurementChartProps {
  entries: MeasurementEntry[];
  unit: string;
  color?: string;
}

function filterByRange(entries: MeasurementEntry[], range: TimeRange): MeasurementEntry[] {
  const now = new Date();
  const cutoff =
    range === '30D' ? subDays(now, 30) :
    range === '90D' ? subDays(now, 90) :
    range === '6M' ? subMonths(now, 6) :
    range === '1Y' ? subYears(now, 1) :
    null;
  if (!cutoff) return entries;
  return entries.filter((e) => parseISO(e.date) >= cutoff);
}

export function MeasurementChart({ entries, unit, color = 'hsl(262 83% 58%)' }: MeasurementChartProps) {
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

  const gradientId = `mGradient-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 flex-wrap">
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
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="h-48"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
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
                width={36}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  backdropFilter: 'blur(24px)',
                  fontSize: '12px',
                }}
                formatter={(v) => [`${v} ${unit}`, 'Value']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
