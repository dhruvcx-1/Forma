import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  Activity,
  Scale,
  Flame,
  Droplets,
  Ruler,
  TrendingDown,
  TrendingUp,
  History,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Info,
  Lock,
} from 'lucide-react';
import { format, parseISO, subDays, subMonths, subYears } from 'date-fns';
import { api } from '@/lib/api';
import type { BodyCompositionData, BmiHistoryPoint } from '@/types/api';
import { useUnits } from '@/hooks/useUnits';
import {
  displayWeight,
  weightUnit,
  formatHeight,
  displayLength,
  lengthUnit,
  formatWeightWithUnit,
} from '@/lib/units';
import { formatDate } from '@/lib/utils';
import { GlassCard, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BmiHistoryModal } from './BmiHistoryModal';

type TimeRange = '30D' | '90D' | '1Y' | 'ALL';
const TIME_RANGES: TimeRange[] = ['30D', '90D', '1Y', 'ALL'];

type ChartMode = 'bmi' | 'bodyFat';

export function BodyCompositionSection() {
  const { units } = useUnits();
  const queryClient = useQueryClient();

  const [timeRange, setTimeRange] = useState<TimeRange>('90D');
  const [chartMode, setChartMode] = useState<ChartMode>('bmi');
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Setup form states for missing height
  const [quickHeightCm, setQuickHeightCm] = useState('');
  const [quickHeightFeet, setQuickHeightFeet] = useState('');
  const [quickHeightInches, setQuickHeightInches] = useState('');

  // Fetch full body composition & history payload
  const { data: comp, isLoading } = useQuery<BodyCompositionData>({
    queryKey: ['body-composition'],
    queryFn: () => api.get<BodyCompositionData>('/body-composition'),
    staleTime: 60 * 1000,
  });

  // Save height mutation
  const saveHeight = useMutation({
    mutationFn: (cm: number) => api.put('/settings', { height_cm: String(cm) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['body-composition'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  const handleQuickSaveHeight = (e: React.FormEvent) => {
    e.preventDefault();
    let finalCm = 0;
    if (units === 'imperial') {
      const ft = parseFloat(quickHeightFeet) || 0;
      const inch = parseFloat(quickHeightInches) || 0;
      finalCm = Math.round((ft * 12 + inch) * 2.54);
    } else {
      finalCm = parseFloat(quickHeightCm) || 0;
    }

    if (finalCm > 50 && finalCm < 300) {
      saveHeight.mutate(finalCm);
    }
  };

  // Filter history points according to time range
  const filteredBmiHistory = useMemo(() => {
    if (!comp?.bmiHistory) return [];
    if (timeRange === 'ALL') return comp.bmiHistory;

    const now = new Date();
    const cutoff =
      timeRange === '30D'
        ? subDays(now, 30)
        : timeRange === '90D'
        ? subDays(now, 90)
        : subYears(now, 1);

    return comp.bmiHistory.filter((p) => parseISO(p.date) >= cutoff);
  }, [comp?.bmiHistory, timeRange]);

  const filteredBfHistory = useMemo(() => {
    if (!comp?.bodyFatHistory) return [];
    if (timeRange === 'ALL') return comp.bodyFatHistory;

    const now = new Date();
    const cutoff =
      timeRange === '30D'
        ? subDays(now, 30)
        : timeRange === '90D'
        ? subDays(now, 90)
        : subYears(now, 1);

    return comp.bodyFatHistory.filter((p) => parseISO(p.date) >= cutoff);
  }, [comp?.bodyFatHistory, timeRange]);

  // Chart data formatters
  const chartData = useMemo(() => {
    if (chartMode === 'bmi') {
      return filteredBmiHistory.map((p) => ({
        date: format(parseISO(p.date), 'MMM d'),
        fullDate: p.date,
        value: p.bmi,
        weightKg: p.weightKg,
        category: p.category,
      }));
    } else {
      return filteredBfHistory.map((p) => ({
        date: format(parseISO(p.date), 'MMM d'),
        fullDate: p.date,
        value: p.value,
        method: p.method,
      }));
    }
  }, [chartMode, filteredBmiHistory, filteredBfHistory]);

  if (isLoading) {
    return (
      <div className="glass-card p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const heightCm = comp?.availableData.heightCm;

  // -------------------------------------------------------------------------
  // Case 1: Height Missing -> Empty Setup State
  // -------------------------------------------------------------------------
  if (!heightCm) {
    return (
      <GlassCard className="p-6 relative overflow-hidden border-primary/30">
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10 gap-1 text-xs">
                <Sparkles className="h-3 w-3" />
                Automatic Analytics
              </Badge>
            </div>
            <h3 className="text-lg font-bold text-foreground">
              Unlock Automatic BMI, Body Fat & Health Metrics
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Forma tracks your weight logs and circumferences over time. Enter your height once to automatically compute your BMI history, WHO category spectrum, healthy weight target, and body composition analytics.
            </p>
          </div>

          {/* Quick Setup Form */}
          <form
            onSubmit={handleQuickSaveHeight}
            className="w-full md:w-auto p-4 rounded-xl bg-secondary/40 border border-border/60 space-y-3 shrink-0"
          >
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5 text-primary" />
              <span>Enter your height ({units === 'imperial' ? 'ft & in' : 'cm'}):</span>
            </p>
            {units === 'imperial' ? (
              <div className="flex items-center gap-2">
                <div className="relative w-20">
                  <Input
                    type="number"
                    placeholder="5"
                    min="3"
                    max="8"
                    value={quickHeightFeet}
                    onChange={(e) => setQuickHeightFeet(e.target.value)}
                    className="h-8 text-xs pr-6"
                    required
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                    ft
                  </span>
                </div>
                <div className="relative w-20">
                  <Input
                    type="number"
                    placeholder="10"
                    min="0"
                    max="11"
                    value={quickHeightInches}
                    onChange={(e) => setQuickHeightInches(e.target.value)}
                    className="h-8 text-xs pr-6"
                    required
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                    in
                  </span>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saveHeight.isPending}
                  className="h-8 text-xs px-3"
                >
                  {saveHeight.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative w-28">
                  <Input
                    type="number"
                    placeholder="178"
                    min="60"
                    max="260"
                    value={quickHeightCm}
                    onChange={(e) => setQuickHeightCm(e.target.value)}
                    className="h-8 text-xs pr-8"
                    required
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                    cm
                  </span>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saveHeight.isPending}
                  className="h-8 text-xs px-3"
                >
                  {saveHeight.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )}
          </form>
        </div>
      </GlassCard>
    );
  }

  // -------------------------------------------------------------------------
  // Case 2: Height Present -> Render Full Body Composition Suite
  // -------------------------------------------------------------------------
  const bmi = comp?.bmi;
  const bodyFat = comp?.bodyFat;
  const ratios = comp?.ratios;
  const metabolism = comp?.metabolism;
  const symmetry = comp?.symmetry;

  // Calculate position along WHO BMI continuum (scale 14 to 36)
  const bmiPosition = bmi
    ? Math.max(2, Math.min(98, ((bmi.value - 14) / (36 - 14)) * 100))
    : 0;

  const getBmiBadgeColor = (category?: string) => {
    switch (category) {
      case 'Underweight':
        return 'bg-sky-500/15 text-sky-500 border-sky-500/30';
      case 'Normal weight':
        return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
      case 'Overweight':
        return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
      case 'Obese':
        return 'bg-rose-500/15 text-rose-500 border-rose-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Hero Cards: BMI & Body Fat */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BMI Card */}
        <GlassCard className="p-5 relative overflow-hidden border-primary/20">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Body Mass Index (BMI)
                  </span>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                    Height: {formatHeight(heightCm, units)}
                  </Badge>
                </div>
                <div className="flex items-baseline gap-2.5 mt-1.5">
                  <span className="text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
                    {bmi ? bmi.value.toFixed(1) : '—'}
                  </span>
                  {bmi && (
                    <Badge
                      variant="outline"
                      className={`text-xs px-2 py-0.5 font-semibold border ${getBmiBadgeColor(
                        bmi.category
                      )}`}
                    >
                      {bmi.category}
                    </Badge>
                  )}
                </div>
              </div>

              {bmi?.change30d !== null && bmi?.change30d !== undefined && bmi.change30d !== 0 && (
                <div
                  className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${
                    bmi.change30d < 0
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-rose-500/10 text-rose-500'
                  }`}
                  title="30-day BMI change"
                >
                  {bmi.change30d < 0 ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingUp className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {bmi.change30d > 0 ? `+${bmi.change30d}` : bmi.change30d} (30d)
                  </span>
                </div>
              )}
            </div>

            {/* Visual Category Meter Spectrum */}
            {bmi && (
              <div className="space-y-1.5 pt-1">
                <div className="relative h-2.5 rounded-full overflow-hidden flex bg-secondary/80">
                  <div className="w-[20.4%] bg-sky-500/40" title="Underweight (< 18.5)" />
                  <div className="w-[29.1%] bg-emerald-500/50" title="Normal weight (18.5 - 24.9)" />
                  <div className="w-[22.7%] bg-amber-500/50" title="Overweight (25.0 - 29.9)" />
                  <div className="w-[27.8%] bg-rose-500/50" title="Obese (≥ 30.0)" />

                  {/* Marker Pin */}
                  <motion.div
                    className="absolute top-0 bottom-0 w-1 bg-foreground shadow-md rounded-full ring-2 ring-primary"
                    initial={{ left: '0%' }}
                    animate={{ left: `${bmiPosition}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                  <span>18.5</span>
                  <span>25.0</span>
                  <span>30.0</span>
                </div>
              </div>
            )}

            {/* Healthy Target Callout */}
            {bmi?.healthyWeightRangeKg && (
              <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/50 text-xs space-y-1">
                <p className="text-muted-foreground">
                  Healthy weight for your height:{' '}
                  <span className="font-semibold text-foreground">
                    {formatWeightWithUnit(bmi.healthyWeightRangeKg.minKg, units)} –{' '}
                    {formatWeightWithUnit(bmi.healthyWeightRangeKg.maxKg, units)}
                  </span>
                </p>
                {bmi.distanceToNormalKg > 0 && (
                  <p className="text-[11px] text-primary font-medium">
                    {bmi.value > 24.9 ? '↓ ' : '↑ '}
                    {displayWeight(bmi.distanceToNormalKg, units).toFixed(1)}{' '}
                    {weightUnit(units)} to reach normal weight range
                  </p>
                )}
              </div>
            )}
          </div>
        </GlassCard>

        {/* Body Fat Card */}
        <GlassCard className="p-5 relative overflow-hidden border-primary/20">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Body Fat Percentage
                  </span>
                  {bodyFat?.navy ? (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal text-emerald-500 border-emerald-500/30">
                      US Navy Method
                    </Badge>
                  ) : bodyFat?.deurenberg ? (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal text-amber-500 border-amber-500/30">
                      Estimated (BMI)
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-baseline gap-2.5 mt-1.5">
                  <span className="text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
                    {bodyFat?.preferredValue ? `${bodyFat.preferredValue.toFixed(1)}%` : '—'}
                  </span>
                  {bodyFat?.category && (
                    <Badge variant="outline" className="text-xs px-2 py-0.5 font-semibold">
                      {bodyFat.category}
                    </Badge>
                  )}
                </div>
              </div>

              <Activity className="h-5 w-5 text-primary opacity-80" />
            </div>

            {/* Lean Mass vs Fat Mass Split */}
            {bodyFat && bodyFat.leanMassKg !== null && bodyFat.fatMassKg !== null && (
              <div className="space-y-2 pt-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-emerald-500">
                    Lean: {formatWeightWithUnit(bodyFat.leanMassKg, units)}
                  </span>
                  <span className="text-amber-500">
                    Fat: {formatWeightWithUnit(bodyFat.fatMassKg, units)}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden flex bg-secondary">
                  <div
                    className="bg-emerald-500/80 transition-all duration-500"
                    style={{
                      width: `${Math.max(
                        5,
                        100 - (bodyFat.preferredValue || 20)
                      )}%`,
                    }}
                    title="Lean Mass"
                  />
                  <div
                    className="bg-amber-500/80 transition-all duration-500"
                    style={{ width: `${Math.min(95, bodyFat.preferredValue || 20)}%` }}
                    title="Fat Mass"
                  />
                </div>
              </div>
            )}

            {/* Method info footnote */}
            <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>
                {bodyFat?.navy
                  ? 'Calculated from waist, neck, and height circumferences.'
                  : bodyFat?.deurenberg
                  ? 'Estimated from BMI, age, and sex. Log waist & neck for Navy tape measurement.'
                  : 'Log waist and neck circumferences to calculate precise body fat %.'}
              </span>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Interactive History Chart Card */}
      <GlassCard className="p-5 space-y-4">
        {/* Header Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-secondary/80 rounded-xl border border-border/50">
            <button
              type="button"
              onClick={() => setChartMode('bmi')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                chartMode === 'bmi'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              BMI History
            </button>
            <button
              type="button"
              onClick={() => setChartMode('bodyFat')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                chartMode === 'bodyFat'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Body Fat % History
            </button>
          </div>

          {/* Time Range Filters & History Table Trigger */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex items-center gap-1 p-1 bg-secondary/80 rounded-xl border border-border/50">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTimeRange(r)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                    timeRange === r
                      ? 'bg-background text-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryModalOpen(true)}
              className="h-8 text-xs gap-1.5 shrink-0"
              title="Inspect complete history table"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">View Log History</span>
            </Button>
          </div>
        </div>

        {/* Chart View */}
        <div className="h-64 w-full pt-2">
          {chartData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <Scale className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium">No history data available for this range</p>
              <p className="text-xs">Log weight or circumferences to generate trend history.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="bmiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(262 83% 58%)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(262 83% 58%)" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="bfGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                {/* Shaded Reference Area for WHO Normal BMI (18.5 to 24.9) */}
                {chartMode === 'bmi' && (
                  <ReferenceArea
                    y1={18.5}
                    y2={24.9}
                    fill="hsl(142 71% 45%)"
                    fillOpacity={0.08}
                    stroke="none"
                  />
                )}

                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  domain={chartMode === 'bmi' ? ['dataMin - 1', 'dataMax + 1'] : [5, 'auto']}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => (chartMode === 'bmi' ? v.toFixed(1) : `${v}%`)}
                />

                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="glass-card p-2.5 shadow-xl border-border/80 text-xs space-y-1">
                        <p className="text-muted-foreground font-medium">
                          {formatDate(data.fullDate)}
                        </p>
                        <p className="font-bold text-foreground flex items-center gap-2">
                          <span>
                            {chartMode === 'bmi' ? 'BMI:' : 'Body Fat:'}{' '}
                            {data.value.toFixed(1)}
                            {chartMode === 'bmi' ? '' : '%'}
                          </span>
                          {data.category && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1 font-normal">
                              {data.category}
                            </Badge>
                          )}
                        </p>
                        {data.weightKg && (
                          <p className="text-muted-foreground text-[11px]">
                            Weight: {formatWeightWithUnit(data.weightKg, units)}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={chartMode === 'bmi' ? 'hsl(262 83% 58%)' : 'hsl(142 71% 45%)'}
                  strokeWidth={2.5}
                  fill={chartMode === 'bmi' ? 'url(#bmiGradient)' : 'url(#bfGradient)'}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </GlassCard>

      {/* Advanced Derived Metrics Grid ("We can calculate a lot") */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Waist-to-Height Ratio (WHtR) */}
        <GlassCard className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Waist-to-Height</span>
            <Ruler className="h-4 w-4 text-primary" />
          </div>
          {ratios?.whtr ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {ratios.whtr.ratio.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">WHtR</span>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] py-0 px-1.5 mt-1 border ${
                  ratios.whtr.ratio < 0.5
                    ? 'text-emerald-500 border-emerald-500/30'
                    : 'text-amber-500 border-amber-500/30'
                }`}
              >
                {ratios.whtr.category}
              </Badge>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">No waist logged</span>
              <p className="text-[10px] text-muted-foreground">Log waist to unlock</p>
            </div>
          )}
        </GlassCard>

        {/* Metric 2: Waist-to-Hip Ratio (WHR) */}
        <GlassCard className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Waist-to-Hip</span>
            <Activity className="h-4 w-4 text-primary" />
          </div>
          {ratios?.whr ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {ratios.whr.ratio.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">WHR</span>
              </div>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 mt-1 border border-border">
                {ratios.whr.category}
              </Badge>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">Need waist & hips</span>
              <p className="text-[10px] text-muted-foreground">WHO cardiometabolic risk</p>
            </div>
          )}
        </GlassCard>

        {/* Metric 3: Basal Metabolic Rate (BMR) */}
        <GlassCard className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Basal Metabolic Rate</span>
            <Flame className="h-4 w-4 text-amber-500" />
          </div>
          {metabolism?.bmr ? (
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {metabolism.bmr.toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">kcal/day</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Sedentary TDEE: ~{metabolism.tdee.sedentary.toLocaleString()} kcal
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">Unavailable</span>
              <p className="text-[10px] text-muted-foreground">Requires weight & height</p>
            </div>
          )}
        </GlassCard>

        {/* Metric 4: Total Body Water (TBW) */}
        <GlassCard className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Total Body Water</span>
            <Droplets className="h-4 w-4 text-sky-500" />
          </div>
          {metabolism?.waterLiters ? (
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {metabolism.waterLiters.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {units === 'imperial'
                    ? `${(metabolism.waterLiters * 0.264172).toFixed(1)} gal`
                    : 'Liters'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Watson clinical estimate
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">Unavailable</span>
              <p className="text-[10px] text-muted-foreground">Hydration volume model</p>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Muscle Symmetry & Next Unlocks Footnote */}
      {comp?.nextUnlocks && comp.nextUnlocks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Next unlocks:
          </span>
          {comp.nextUnlocks.map((u, i) => (
            <Badge
              key={i}
              variant="outline"
              className="text-[11px] bg-secondary/50 font-normal border-border/80"
            >
              Log {u.missing.join(', ')} for {u.metric}
            </Badge>
          ))}
        </div>
      )}

      {/* History Inspection Modal */}
      <BmiHistoryModal
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
        history={comp?.bmiHistory || []}
        units={units}
        heightCm={heightCm}
      />
    </div>
  );
}
