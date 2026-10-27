import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Area,
  AreaChart,
  Legend,
} from 'recharts';
import { format, parseISO, subDays, subMonths, subYears } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import type { WeightEntry } from '@/types/api';
import { useUnits } from '@/hooks/useUnits';
import { displayWeight } from '@/lib/units';
import { movingAverage, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { Scale } from 'lucide-react';

type TimeRange = '7D' | '30D' | '90D' | '6M' | '1Y' | 'ALL';

interface WeightChartProps {
  entries: WeightEntry[];
  targetWeight?: number | null; // in kg
}

const TIME_RANGES: TimeRange[] = ['7D', '30D', '90D', '6M', '1Y', 'ALL'];

function filterByRange(entries: WeightEntry[], range: TimeRange): WeightEntry[] {
  const now = new Date();
  const cutoff =
    range === '7D' ? subDays(now, 7) :
    range === '30D' ? subDays(now, 30) :
    range === '90D' ? subDays(now, 90) :
    range === '6M' ? subMonths(now, 6) :
    range === '1Y' ? subYears(now, 1) :
    null;
  if (!cutoff) return entries;
  return entries.filter((e) => parseISO(e.date) >= cutoff);
}

interface ChartPoint {
  date: string;
  weight: number;
  ma?: number | null;
  raw: WeightEntry;
}

// Custom tooltip with glass styling
function CustomTooltip({ active, payload, label, units }: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
  units: 'metric' | 'imperial';
}) {
  if (!active || !payload?.length) return null;
  const w = payload.find((p) => p.dataKey === 'weight');
  const ma = payload.find((p) => p.dataKey === 'ma');
  return (
    <div className="glass-card px-3 py-2.5 text-xs space-y-1 shadow-xl pointer-events-none">
      <p className="text-muted-foreground font-medium">{label}</p>
      {w && (
        <p className="font-semibold text-sm">
          {displayWeight(w.value, units).toFixed(1)}{' '}
          <span className="text-muted-foreground font-normal">
            {units === 'metric' ? 'kg' : 'lbs'}
          </span>
        </p>
      )}
      {ma?.value != null && (
        <p className="text-muted-foreground">
          7-day avg: {displayWeight(ma.value, units).toFixed(1)}
        </p>
      )}
    </div>
  );
}

export function WeightChart({ entries, targetWeight }: WeightChartProps) {
  const [range, setRange] = useState<TimeRange>('30D');
  const [showMA, setShowMA] = useState(false);
  const { units, weightUnit } = useUnits();

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries]
  );

  const filtered = useMemo(() => filterByRange(sorted, range), [sorted, range]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const weights = filtered.map((e) => e.weight);
    const maArr = movingAverage(weights, 7);
    return filtered.map((e, i) => ({
      date: format(parseISO(e.date), 'MMM d'),
      weight: e.weight,
      ma: maArr[i],
      raw: e,
    }));
  }, [filtered]);

  const yDomain: [any, any] = useMemo(() => {
    if (!chartData.length) return ['auto', 'auto'];
    const vals = chartData.map((d) => d.weight);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.1, 2);
    return [
      displayWeight(min - pad, units),
      displayWeight(max + pad, units),
    ];
  }, [chartData, units]);

  if (!entries.length) {
    return (
      <EmptyState
        icon={<Scale className="h-6 w-6" />}
        title="No weight entries yet"
        description="Start logging your weight to see your progress chart here."
      />
    );
  }

  const targetDisplay = targetWeight ? displayWeight(targetWeight, units) : null;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <button
          onClick={() => setShowMA((s) => !s)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
            showMA
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-border hover:text-foreground'
          )}
        >
          <span className="w-3 h-0.5 rounded-full bg-current inline-block" />
          7-day avg
        </button>
      </div>

      {/* Chart */}
      <AnimatePresence mode="wait">
        <motion.div
          key={range}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="h-64"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(262 83% 58%)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(262 83% 58%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${typeof v === 'number' ? displayWeight(v, units).toFixed(1) : v}`}
                width={42}
              />
              <Tooltip
                content={<CustomTooltip units={units} />}
                cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
              />
              {targetDisplay != null && targetWeight != null && (
                <ReferenceLine
                  y={targetWeight}
                  stroke="hsl(var(--warning))"
                  strokeDasharray="4 4"
                  label={{ value: `Goal ${targetDisplay.toFixed(1)} ${weightUnit}`, position: 'right', fontSize: 10, fill: 'hsl(var(--warning))' }}
                />
              )}
              <Area
                type="monotone"
                dataKey="weight"
                stroke="hsl(262 83% 58%)"
                strokeWidth={2}
                fill="url(#weightGradient)"
                dot={false}
                activeDot={{ r: 4, fill: 'hsl(262 83% 58%)', strokeWidth: 0 }}
              />
              {showMA && (
                <Line
                  type="monotone"
                  dataKey="ma"
                  stroke="hsl(var(--warning))"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 2"
                  activeDot={false}
                  connectNulls
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
