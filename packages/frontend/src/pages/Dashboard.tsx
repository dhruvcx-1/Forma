import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Scale,
  TrendingDown,
  TrendingUp,
  Target,
  Ruler,
  Flame,
  Activity,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { differenceInDays, parseISO, subDays, format } from 'date-fns';
import { api } from '@/lib/api';
import type { WeightEntry, Goal, MeasurementEntry, MeasurementDefinition } from '@/types/api';
import { useUnits } from '@/hooks/useUnits';
import { displayWeight, weightUnit, displayLength, lengthUnit } from '@/lib/units';
import { cn, formatDate, formatChange } from '@/lib/utils';
import { GlassCard, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { WeightChart } from '@/components/charts/WeightChart';
import { Sparkline } from '@/components/charts/Sparkline';
import { EmptyState } from '@/components/shared/EmptyState';
import { BodyCompositionSection } from '@/components/dashboard/BodyCompositionSection';
import { FastingWidget } from '@/components/dashboard/FastingWidget';
import { NutritionWidget } from '@/components/dashboard/NutritionWidget';

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

function StatCard({
  title,
  icon: Icon,
  children,
  footer,
  className,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={cardVariants} className="h-full">
      <GlassCard className={cn('h-full flex flex-col justify-between p-4 space-y-2 border-primary/20 hover:border-primary/40 transition-colors', className)}>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              {title}
            </span>
            {Icon && <Icon className="h-4 w-4 text-primary/80 shrink-0" />}
          </div>
          <div className="pt-0.5">{children}</div>
        </div>
        <div className="pt-2.5 border-t border-border/40 text-xs min-h-[32px] flex items-center">
          {footer || <span className="text-muted-foreground/60 text-[11px]">—</span>}
        </div>
      </GlassCard>
    </motion.div>
  );
}

export default function Dashboard() {
  const { units } = useUnits();

  const { data: weightEntries = [], isLoading: wLoading } = useQuery<WeightEntry[]>({
    queryKey: ['weight-entries'],
    queryFn: () => api.get<WeightEntry[]>('/weight'),
    staleTime: 60 * 1000,
  });

  const { data: goal } = useQuery<Goal | null>({
    queryKey: ['goal'],
    queryFn: () => api.get<Goal | null>('/goals/active'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: measurementEntries = [] } = useQuery<MeasurementEntry[]>({
    queryKey: ['measurement-entries'],
    queryFn: () => api.get<MeasurementEntry[]>('/measurements/entries'),
    staleTime: 60 * 1000,
  });

  const { data: measurementDefs = [] } = useQuery<MeasurementDefinition[]>({
    queryKey: ['measurement-definitions'],
    queryFn: () => api.get<MeasurementDefinition[]>('/measurements/definitions'),
    staleTime: 5 * 60 * 1000,
  });

  const sorted = useMemo(
    () => [...weightEntries].sort((a, b) => b.date.localeCompare(a.date)),
    [weightEntries]
  );

  const latestEntry = sorted[0];
  const secondEntry = sorted[1];

  const last7 = useMemo(() => sorted.slice(0, 7).reverse(), [sorted]);
  const sparkData = last7.map((e) => e.weight);

  const change7d = useMemo(() => {
    const cutoff = subDays(new Date(), 7);
    const old = sorted.find((e) => parseISO(e.date) <= cutoff);
    if (!old || !latestEntry) return null;
    return latestEntry.weight - old.weight;
  }, [sorted, latestEntry]);

  const change30d = useMemo(() => {
    const cutoff = subDays(new Date(), 30);
    const old = sorted.find((e) => parseISO(e.date) <= cutoff);
    if (!old || !latestEntry) return null;
    return latestEntry.weight - old.weight;
  }, [sorted, latestEntry]);

  const streak = useMemo(() => {
    if (!sorted.length) return 0;
    let count = 0;
    let prev = new Date();
    for (const entry of sorted) {
      const d = parseISO(entry.date);
      const diff = differenceInDays(prev, d);
      if (diff <= 1) {
        count++;
        prev = d;
      } else {
        break;
      }
    }
    return count;
  }, [sorted]);

  // Waist measurement
  const waistDef = measurementDefs.find((d) => d.name.toLowerCase().includes('waist'));
  const waistEntries = waistDef
    ? [...measurementEntries]
        .filter((e) => e.definitionId === waistDef.id)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const latestWaist = waistEntries[0];
  const prevWaist = waistEntries[1];

  // Goal progress
  const goalProgress = useMemo(() => {
    if (!goal || goal.targetWeight == null || !latestEntry) return null;
    const startW = goal.startWeight ?? latestEntry.weight;
    const total = Math.abs(goal.targetWeight - startW);
    const done = Math.abs(latestEntry.weight - startW);
    const pct = total === 0 ? 0 : Math.min(100, (done / total) * 100);
    const remaining = latestEntry.weight - goal.targetWeight;
    return { pct, remaining };
  }, [goal, latestEntry]);

  if (wLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card p-5 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Summary cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-3 gap-3"
      >
        {/* Current Weight */}
        <StatCard
          title="Current Weight"
          icon={Scale}
          footer={
            latestEntry ? (
              <div className="w-full flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground truncate">
                  {formatDate(latestEntry.date, 'MMM d, yyyy')}
                </span>
                {sparkData.length > 1 && (
                  <div className="w-20 h-5 shrink-0 opacity-80 hover:opacity-100 transition-opacity">
                    <Sparkline data={sparkData} height={20} />
                  </div>
                )}
              </div>
            ) : null
          }
        >
          {latestEntry ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl lg:text-3xl font-extrabold tabular-nums text-foreground">
                {displayWeight(latestEntry.weight, units).toFixed(1)}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{weightUnit(units)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet</p>
          )}
        </StatCard>

        {/* Weight Change */}
        <StatCard
          title="Weight Change"
          icon={change7d !== null ? (change7d <= 0 ? TrendingDown : TrendingUp) : Activity}
          footer={
            change7d !== null ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-secondary/80 font-medium border border-border/50">
                  7D: {formatChange(displayWeight(change7d, units), 1)}
                </Badge>
                {change30d !== null && (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-secondary/80 font-medium border border-border/50">
                    30D: {formatChange(displayWeight(change30d, units), 1)}
                  </Badge>
                )}
              </div>
            ) : null
          }
        >
          {change7d !== null ? (
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-2xl lg:text-3xl font-extrabold tabular-nums ${
                  change7d <= 0 ? 'text-emerald-500' : 'text-rose-500'
                }`}
              >
                {formatChange(displayWeight(change7d, units), 1)}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{weightUnit(units)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Need 2+ entries</p>
          )}
        </StatCard>

        {/* Goal Progress */}
        <StatCard
          title="Goal Progress"
          icon={Target}
          footer={
            goalProgress ? (
              <div className="w-full space-y-1">
                <div className="h-1.5 bg-secondary/80 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${goalProgress.pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {Math.abs(displayWeight(goalProgress.remaining, units)).toFixed(1)} {weightUnit(units)} remaining
                </p>
              </div>
            ) : (
              <Button asChild size="sm" variant="ghost" className="h-6 text-xs px-2 -ml-1 text-primary hover:text-primary">
                <Link to="/goals">
                  <Plus className="h-3 w-3 mr-1" />
                  Set a goal
                </Link>
              </Button>
            )
          }
        >
          {goalProgress ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl lg:text-3xl font-extrabold tabular-nums text-foreground">
                {goalProgress.pct.toFixed(0)}%
              </span>
              <span className="text-xs font-medium text-muted-foreground">achieved</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No goal set</p>
          )}
        </StatCard>

        {/* Waist */}
        <StatCard
          title="Waist"
          icon={Ruler}
          footer={
            latestWaist ? (
              <div className="w-full flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Latest circumference</span>
                {prevWaist && (
                  <span className={`font-semibold tabular-nums ${
                    latestWaist.value <= prevWaist.value ? 'text-emerald-500' : 'text-rose-500'
                  }`}>
                    {formatChange(displayLength(latestWaist.value - prevWaist.value, units), 1)}
                  </span>
                )}
              </div>
            ) : (
              <Button asChild size="sm" variant="ghost" className="h-6 text-xs px-2 -ml-1 text-primary hover:text-primary">
                <Link to="/measurements">
                  <Plus className="h-3 w-3 mr-1" />
                  Log waist
                </Link>
              </Button>
            )
          }
        >
          {latestWaist ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl lg:text-3xl font-extrabold tabular-nums text-foreground">
                {displayLength(latestWaist.value, units).toFixed(1)}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{lengthUnit(units)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data</p>
          )}
        </StatCard>

        {/* Streak */}
        <StatCard
          title="Log Streak"
          icon={Flame}
          footer={
            <div className="text-[11px] text-muted-foreground">
              {streak > 0 ? `${streak} ${streak === 1 ? 'day' : 'days'} in a row` : 'Log today to start streak'}
            </div>
          }
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl lg:text-3xl font-extrabold tabular-nums text-foreground">
              {streak}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {streak === 1 ? 'day' : 'days'}
            </span>
          </div>
        </StatCard>

        {/* Entries count */}
        <StatCard
          title="Total Entries"
          icon={Activity}
          footer={
            <div className="text-[11px] text-muted-foreground truncate">
              {sorted.length > 0 ? `Since ${formatDate(sorted[sorted.length - 1].date, 'MMM d, yyyy')}` : 'Tracked entries'}
            </div>
          }
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl lg:text-3xl font-extrabold tabular-nums text-foreground">
              {weightEntries.length}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {weightEntries.length === 1 ? 'log' : 'logs'}
            </span>
          </div>
        </StatCard>
      </motion.div>

      {/* Body Composition, BMI & Advanced Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        <BodyCompositionSection />
      </motion.div>

      {/* Fasting & Nutrition Live Trackers */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <FastingWidget />
        <NutritionWidget />
      </motion.div>

      {/* Weight Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <GlassCard>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Weight History</CardTitle>
              <Button asChild size="sm" variant="ghost">
                <Link to="/log">
                  <Plus className="h-4 w-4 mr-1" />
                  Log
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <WeightChart entries={weightEntries} targetWeight={goal?.targetWeight} />
          </CardContent>
        </GlassCard>
      </motion.div>

      {/* Recent entries */}
      {sorted.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          <GlassCard>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Entries</CardTitle>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/log">
                    View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-0.5">
                {sorted.slice(0, 5).map((entry, i) => {
                  const prev = sorted[i + 1];
                  const delta = prev ? entry.weight - prev.weight : null;
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-secondary/50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">{formatDate(entry.date)}</p>
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">
                            {entry.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {delta !== null && (
                          <span
                            className={`text-xs font-medium ${
                              delta < 0 ? 'text-success' : delta > 0 ? 'text-destructive' : 'text-muted-foreground'
                            }`}
                          >
                            {delta < 0 ? '↓' : delta > 0 ? '↑' : '='}{' '}
                            {Math.abs(displayWeight(delta, units)).toFixed(1)}
                          </span>
                        )}
                        <span className="text-sm font-semibold tabular-nums">
                          {displayWeight(entry.weight, units).toFixed(1)}{' '}
                          <span className="text-muted-foreground text-xs font-normal">
                            {weightUnit(units)}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </GlassCard>
        </motion.div>
      )}

      {/* Empty state */}
      {!weightEntries.length && (
        <EmptyState
          icon={<Activity className="h-6 w-6" />}
          title="Start tracking your progress"
          description="Log your first weight entry to see your dashboard come alive with charts and insights."
          action={
            <Button asChild>
              <Link to="/log">
                <Plus className="h-4 w-4 mr-2" />
                Log First Entry
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
