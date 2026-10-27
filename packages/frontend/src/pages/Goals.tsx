import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Target,
  Calendar,
  Check,
  TrendingDown,
  TrendingUp,
  Clock,
  Sparkles,
  ArrowRight,
  Award,
} from 'lucide-react';
import { differenceInDays, differenceInWeeks, format, parseISO, addWeeks } from 'date-fns';
import { api } from '@/lib/api';
import type { Goal, WeightEntry } from '@/types/api';
import { useUnits } from '@/hooks/useUnits';
import { displayWeight, toKg } from '@/lib/units';
import { formatDate, clamp, formatChange } from '@/lib/utils';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';

export default function Goals() {
  const queryClient = useQueryClient();
  const { units, weightUnit } = useUnits();

  // Queries
  const { data: goal } = useQuery<Goal | null>({
    queryKey: ['goal'],
    queryFn: () => api.get<Goal | null>('/goals'),
  });

  const { data: weightEntries = [] } = useQuery<WeightEntry[]>({
    queryKey: ['weight-entries'],
    queryFn: () => api.get<WeightEntry[]>('/weight'),
  });

  const sortedWeights = useMemo(() => {
    return [...weightEntries].sort((a, b) => a.date.localeCompare(b.date));
  }, [weightEntries]);

  const currentWeightKg = sortedWeights.length > 0 ? sortedWeights[sortedWeights.length - 1].weight : null;
  const initialRecordedWeightKg = sortedWeights.length > 0 ? sortedWeights[0].weight : null;

  // Form State
  const [targetWeightInput, setTargetWeightInput] = useState<string>('');
  const [startWeightInput, setStartWeightInput] = useState<string>('');
  const [targetDateInput, setTargetDateInput] = useState<string>('');
  const [notesInput, setNotesInput] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  // Sync inputs with existing goal
  useMemo(() => {
    if (goal) {
      if (goal.targetWeight != null) {
        setTargetWeightInput(displayWeight(goal.targetWeight, units).toFixed(1));
      }
      if (goal.startWeight != null) {
        setStartWeightInput(displayWeight(goal.startWeight, units).toFixed(1));
      }
      if (goal.targetDate) {
        setTargetDateInput(goal.targetDate.split('T')[0]);
      }
      if (goal.notes) {
        setNotesInput(goal.notes);
      }
    } else if (currentWeightKg && !startWeightInput) {
      setStartWeightInput(displayWeight(currentWeightKg, units).toFixed(1));
    }
  }, [goal, currentWeightKg, units]);

  // Goal Save Mutation
  const saveGoalMutation = useMutation({
    mutationFn: async () => {
      const targetNum = parseFloat(targetWeightInput);
      const startNum = parseFloat(startWeightInput);
      if (isNaN(targetNum) || targetNum <= 0) throw new Error('Valid target weight required');

      const targetKg = toKg(targetNum, units);
      const startKg = !isNaN(startNum) && startNum > 0 ? toKg(startNum, units) : (currentWeightKg ?? targetKg);

      return api.post('/goals', {
        startWeight: targetKg ? targetKg : undefined, // upsert
        starting_weight: startKg,
        target_weight: targetKg,
        target_date: targetDateInput || undefined,
        notes: notesInput.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goal'] });
      setIsEditing(false);
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 3000);
    },
  });

  // Goal Math & Progress calculations
  const progressMetrics = useMemo(() => {
    if (!goal || goal.targetWeight == null || currentWeightKg == null) return null;

    const startKg = goal.startWeight ?? initialRecordedWeightKg ?? currentWeightKg;
    const targetKg = goal.targetWeight;
    const isWeightLoss = targetKg < startKg;

    const totalToLoseOrGain = Math.abs(startKg - targetKg);
    const progressSoFar = isWeightLoss ? startKg - currentWeightKg : currentWeightKg - startKg;
    const remainingKg = Math.abs(currentWeightKg - targetKg);

    const percent = totalToLoseOrGain > 0 ? clamp((progressSoFar / totalToLoseOrGain) * 100, 0, 100) : 0;
    const isComplete = isWeightLoss ? currentWeightKg <= targetKg : currentWeightKg >= targetKg;

    // Time calculations
    let daysRemaining: number | null = null;
    let weeksRemaining: number | null = null;
    let requiredWeeklyRate: number | null = null;

    if (goal.targetDate) {
      try {
        const tDate = parseISO(goal.targetDate);
        const days = differenceInDays(tDate, new Date());
        daysRemaining = Math.max(0, days);
        weeksRemaining = Math.max(0, differenceInWeeks(tDate, new Date()));
        if (weeksRemaining > 0 && remainingKg > 0) {
          requiredWeeklyRate = remainingKg / weeksRemaining;
        }
      } catch {
        // invalid date
      }
    }

    return {
      startKg,
      targetKg,
      currentWeightKg,
      isWeightLoss,
      totalToLoseOrGain,
      progressSoFar,
      remainingKg,
      percent,
      isComplete,
      daysRemaining,
      weeksRemaining,
      requiredWeeklyRate,
    };
  }, [goal, currentWeightKg, initialRecordedWeightKg]);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Target className="h-7 w-7 text-primary" />
            <span>Goals & Trajectory</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define realistic targets and follow your projected path to accomplishment.
          </p>
        </div>

        {goal && !isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="rounded-xl text-xs h-9"
          >
            Adjust Goal
          </Button>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Progress Card or Setup Form */}
        <div className="lg:col-span-7 space-y-6">
          {!goal || isEditing ? (
            <GlassCard className="border-border/70 shadow-xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  {goal ? 'Edit Your Goal' : 'Set Your Target'}
                </CardTitle>
                <CardDescription className="text-xs">
                  Choose a target weight and an optional target date for milestone pacing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Starting Weight ({weightUnit})</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 80.0"
                      value={startWeightInput}
                      onChange={(e) => setStartWeightInput(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Target Weight ({weightUnit}) *</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 72.0"
                      value={targetWeightInput}
                      onChange={(e) => setTargetWeightInput(e.target.value)}
                      className="rounded-xl"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="targetDate" className="text-xs">
                    Target Date (optional)
                  </Label>
                  <div className="relative">
                    <Calendar className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="targetDate"
                      type="date"
                      value={targetDateInput}
                      onChange={(e) => setTargetDateInput(e.target.value)}
                      className="pl-9 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs">
                    Motivation / Goal Notes
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder="e.g. Preparing for summer half-marathon, feeling lighter and more energized..."
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    rows={2}
                    className="rounded-xl text-xs resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  {isEditing && (
                    <Button variant="ghost" onClick={() => setIsEditing(false)} className="rounded-xl text-xs">
                      Cancel
                    </Button>
                  )}
                  <Button
                    onClick={() => saveGoalMutation.mutate()}
                    disabled={saveGoalMutation.isPending || !targetWeightInput}
                    className="rounded-xl h-11 px-6 text-sm font-medium gap-2 shadow-lg shadow-primary/20"
                  >
                    <Check className="h-4 w-4" />
                    <span>{saveGoalMutation.isPending ? 'Saving...' : 'Save Goal'}</span>
                  </Button>
                </div>
              </CardContent>
            </GlassCard>
          ) : progressMetrics ? (
            <GlassCard className="p-6 md:p-8 border-border/70 shadow-2xl relative overflow-hidden">
              <div className="flex flex-col md:flex-row items-center gap-8">
                {/* Custom Circular Progress SVG */}
                <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      className="stroke-secondary"
                      strokeWidth="8"
                      fill="transparent"
                    />
                    <motion.circle
                      cx="50"
                      cy="50"
                      r="40"
                      className="stroke-primary"
                      strokeWidth="8"
                      strokeDasharray="251.2"
                      initial={{ strokeDashoffset: 251.2 }}
                      animate={{
                        strokeDashoffset: 251.2 - (251.2 * progressMetrics.percent) / 100,
                      }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      strokeLinecap="round"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-extrabold tracking-tight text-foreground tabular-nums">
                      {progressMetrics.percent.toFixed(0)}%
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Accomplished
                    </span>
                  </div>
                </div>

                {/* Metrics Breakdown */}
                <div className="space-y-4 flex-1 text-center md:text-left">
                  <div>
                    <Badge variant={progressMetrics.isComplete ? 'default' : 'secondary'} className="mb-2">
                      {progressMetrics.isComplete ? 'Goal Achieved!' : `${progressMetrics.isWeightLoss ? 'Weight Reduction' : 'Weight Gain'} Goal`}
                    </Badge>
                    <h3 className="text-xl font-bold text-foreground">
                      {displayWeight(progressMetrics.remainingKg, units).toFixed(1)} {weightUnit} Remaining
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Target:{' '}
                      <span className="font-semibold text-foreground">
                        {displayWeight(progressMetrics.targetKg, units).toFixed(1)} {weightUnit}
                      </span>{' '}
                      (Started at {displayWeight(progressMetrics.startKg, units).toFixed(1)} {weightUnit})
                    </p>
                  </div>

                  {goal.notes && (
                    <p className="text-xs italic text-muted-foreground bg-secondary/40 p-2.5 rounded-xl border border-border/40">
                      "{goal.notes}"
                    </p>
                  )}
                </div>
              </div>
            </GlassCard>
          ) : (
            <EmptyState
              icon={Target}
              title="No Goal Configured"
              description="Set a target weight to visualize your progress trajectory"
            />
          )}
        </div>

        {/* Right: Milestone / Pacing Insights */}
        <div className="lg:col-span-5 space-y-4">
          <GlassCard className="p-6 border-border/70 shadow-xl space-y-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Pacing & Trajectory</span>
            </CardTitle>

            {progressMetrics ? (
              <div className="space-y-3.5 divide-y divide-border/40">
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Target Date</span>
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    {goal?.targetDate ? formatDate(goal.targetDate) : 'Not specified'}
                  </span>
                </div>

                {progressMetrics.daysRemaining !== null && (
                  <div className="pt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Time Remaining</span>
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {progressMetrics.daysRemaining} days ({progressMetrics.weeksRemaining} wks)
                    </span>
                  </div>
                )}

                {progressMetrics.requiredWeeklyRate !== null && (
                  <div className="pt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Award className="h-3.5 w-3.5" />
                      <span>Required Weekly Rate</span>
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      {displayWeight(progressMetrics.requiredWeeklyRate, units).toFixed(2)} {weightUnit}/wk
                    </span>
                  </div>
                )}

                <div className="pt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Progress to Date</span>
                  <span className="text-xs font-semibold text-emerald-400">
                    {displayWeight(progressMetrics.progressSoFar, units).toFixed(1)} {weightUnit}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Set a goal with a target date to see required weekly pace calculations and progress insights.
              </p>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
