import React from 'react';
import {
  TrendingDown,
  TrendingUp,
  Activity,
  Check,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnboardingData, GoalType } from '../types';

interface StepGoalProps {
  data: OnboardingData;
  updateData: (fields: Partial<OnboardingData>) => void;
}

interface GoalConfig {
  type: GoalType;
  title: string;
  icon: React.ReactNode;
  description: string;
}

const GOAL_OPTIONS: GoalConfig[] = [
  {
    type: 'lose',
    title: 'Lose Weight',
    icon: <TrendingDown className="w-5 h-5" />,
    description: 'Trim body fat and achieve a leaner, toned physique.',
  },
  {
    type: 'maintain',
    title: 'Maintain / Recompose',
    icon: <Activity className="w-5 h-5" />,
    description: 'Optimize body composition, sustain energy, and tone up.',
  },
  {
    type: 'gain',
    title: 'Build Muscle',
    icon: <TrendingUp className="w-5 h-5" />,
    description: 'Increase lean muscle mass and overall strength.',
  },
];

export const StepGoal: React.FC<StepGoalProps> = ({ data, updateData }) => {
  const currentWeight = data.weightValue ?? (data.weightUnit === 'kg' ? 70 : 154);

  const handleGoalSelect = (goalType: GoalType) => {
    let suggestedTarget: number | null = null;
    if (goalType === 'lose') {
      suggestedTarget = Math.max(
        10,
        Math.round((currentWeight - (data.weightUnit === 'kg' ? 5 : 10)) * 10) / 10
      );
    } else if (goalType === 'gain') {
      suggestedTarget =
        Math.round((currentWeight + (data.weightUnit === 'kg' ? 4 : 8)) * 10) / 10;
    } else {
      suggestedTarget = currentWeight;
    }

    updateData({
      goalType,
      targetWeight: suggestedTarget,
    });
  };

  const handleTargetWeightChange = (valStr: string) => {
    const num = parseFloat(valStr);
    updateData({ targetWeight: isNaN(num) ? null : num });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          What is your primary goal?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Forma personalizes your progress charts and target lines based on this objective.
        </p>
      </div>

      {/* Goal selection cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {GOAL_OPTIONS.map((g) => {
          const isSelected = data.goalType === g.type;
          return (
            <button
              key={g.type}
              type="button"
              onClick={() => handleGoalSelect(g.type)}
              className={`p-4 rounded-xl border text-left transition-all relative flex flex-col justify-between h-full ${
                isSelected
                  ? 'border-primary bg-primary/10 shadow-sm shadow-primary/10 ring-1 ring-primary'
                  : 'border-border/70 hover:border-border hover:bg-secondary/40 bg-card/60'
              }`}
            >
              <div>
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 transition-colors ${
                    isSelected
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-secondary text-foreground'
                  }`}
                >
                  {g.icon}
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  {g.title}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  {g.description}
                </p>
              </div>

              {isSelected && (
                <div className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center self-end mt-3">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Target weight input & target date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        <div className="space-y-1.5">
          <Label htmlFor="ob-target-weight" className="text-xs font-medium">
            Target Weight ({data.weightUnit})
          </Label>
          <div className="relative">
            <Input
              id="ob-target-weight"
              type="number"
              step="0.1"
              min="20"
              max="500"
              placeholder={currentWeight.toString()}
              value={data.targetWeight ?? ''}
              onChange={(e) => handleTargetWeightChange(e.target.value)}
              className="h-11 bg-background/50 text-base font-semibold"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
              {data.weightUnit}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ob-target-date" className="text-xs font-medium">
            Target Date (Optional)
          </Label>
          <div className="relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              id="ob-target-date"
              type="date"
              value={data.targetDate || ''}
              onChange={(e) => updateData({ targetDate: e.target.value })}
              className="pl-10 h-11 bg-background/50 text-xs sm:text-sm"
            />
          </div>
        </div>
      </div>

      {/* Summary Profile Pill */}
      <div className="p-3.5 rounded-xl border border-border/80 bg-secondary/30 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Profile Summary</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-background/60">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Starting
            </div>
            <div className="font-semibold text-foreground">
              {data.weightValue} {data.weightUnit}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-background/60">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Target
            </div>
            <div className="font-semibold text-foreground">
              {data.targetWeight ? `${data.targetWeight} ${data.weightUnit}` : 'Maintain'}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-background/60">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Height
            </div>
            <div className="font-semibold text-foreground">
              {data.unitSystem === 'metric'
                ? `${data.heightCm} cm`
                : `${data.heightFt}' ${data.heightIn}"`}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-background/60">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Units
            </div>
            <div className="font-semibold text-foreground capitalize">
              {data.unitSystem}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
