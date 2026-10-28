import React from 'react';
import { Scale, ArrowLeftRight, Minus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnboardingData } from '../types';

interface StepWeightProps {
  data: OnboardingData;
  updateData: (fields: Partial<OnboardingData>) => void;
}

export const StepWeight: React.FC<StepWeightProps> = ({ data, updateData }) => {
  const isKg = data.weightUnit === 'kg';

  const handleUnitToggle = (newUnit: 'kg' | 'lbs') => {
    if (newUnit === data.weightUnit) return;

    if (data.weightValue !== null) {
      if (newUnit === 'lbs') {
        // kg to lbs: kg * 2.20462
        const lbsVal = Math.round(data.weightValue * 2.20462 * 10) / 10;
        updateData({ weightUnit: 'lbs', weightValue: lbsVal });
      } else {
        // lbs to kg: lbs / 2.20462
        const kgVal = Math.round((data.weightValue / 2.20462) * 10) / 10;
        updateData({ weightUnit: 'kg', weightValue: kgVal });
      }
    } else {
      updateData({ weightUnit: newUnit });
    }
  };

  const handleValueChange = (valStr: string) => {
    const num = parseFloat(valStr);
    updateData({ weightValue: isNaN(num) ? null : num });
  };

  const adjustWeight = (delta: number) => {
    const current = data.weightValue ?? (isKg ? 70 : 154);
    const updated = Math.round((current + delta) * 10) / 10;
    if (updated > 0) {
      updateData({ weightValue: updated });
    }
  };

  const convertedText =
    data.weightValue !== null && data.weightValue > 0
      ? isKg
        ? `≈ ${(data.weightValue * 2.20462).toFixed(1)} lbs`
        : `≈ ${(data.weightValue / 2.20462).toFixed(1)} kg`
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          What is your current weight?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          This will be logged as your baseline entry to measure your journey over time.
        </p>
      </div>

      {/* Unit Selector Toggle */}
      <div className="flex items-center justify-between p-1.5 rounded-xl bg-secondary/60 border border-border/60">
        <button
          type="button"
          onClick={() => handleUnitToggle('kg')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            isKg
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Kilograms (kg)
        </button>
        <button
          type="button"
          onClick={() => handleUnitToggle('lbs')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            !isKg
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Pounds (lbs)
        </button>
      </div>

      {/* Main Input Control */}
      <div className="space-y-2">
        <Label htmlFor="ob-weight-val" className="text-xs font-medium">
          Current Body Weight
        </Label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => adjustWeight(-0.5)}
            className="w-12 h-14 rounded-xl border border-border/80 bg-secondary/40 hover:bg-secondary flex items-center justify-center text-foreground transition-colors shrink-0"
            title="Decrease 0.5"
          >
            <Minus className="w-5 h-5" />
          </button>

          <div className="relative flex-1">
            <Scale className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              id="ob-weight-val"
              type="number"
              step="0.1"
              min="20"
              max="500"
              placeholder={isKg ? '70.0' : '155.0'}
              value={data.weightValue ?? ''}
              onChange={(e) => handleValueChange(e.target.value)}
              className="pl-10 pr-14 h-14 text-2xl font-bold bg-background/50 text-center"
              autoFocus
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
              {data.weightUnit}
            </span>
          </div>

          <button
            type="button"
            onClick={() => adjustWeight(0.5)}
            className="w-12 h-14 rounded-xl border border-border/80 bg-secondary/40 hover:bg-secondary flex items-center justify-center text-foreground transition-colors shrink-0"
            title="Increase 0.5"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Real-time conversion badge */}
      {convertedText && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
          <span>Equivalent: <strong className="text-foreground">{convertedText}</strong></span>
        </div>
      )}

      {/* Quick nudge buttons */}
      <div className="space-y-2 pt-1">
        <span className="text-[11px] text-muted-foreground">Quick nudges:</span>
        <div className="grid grid-cols-4 gap-2">
          {[-2, -1, 1, 2].map((delta) => (
            <button
              key={delta}
              type="button"
              onClick={() => adjustWeight(delta)}
              className="text-xs py-2 rounded-lg border border-border/60 hover:border-border text-muted-foreground hover:text-foreground transition-all"
            >
              {delta > 0 ? `+${delta}` : delta} {data.weightUnit}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
