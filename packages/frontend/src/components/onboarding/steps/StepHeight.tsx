import React from 'react';
import { Ruler, ArrowLeftRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnboardingData, UnitSystem } from '../types';

interface StepHeightProps {
  data: OnboardingData;
  updateData: (fields: Partial<OnboardingData>) => void;
}

export const StepHeight: React.FC<StepHeightProps> = ({ data, updateData }) => {
  const isMetric = data.unitSystem === 'metric';

  const handleUnitToggle = (newUnit: UnitSystem) => {
    if (newUnit === data.unitSystem) return;

    if (newUnit === 'imperial') {
      // Convert cm to ft + in
      const totalInches = (data.heightCm || 175) / 2.54;
      const ft = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      updateData({
        unitSystem: 'imperial',
        heightFt: ft,
        heightIn: inches,
      });
    } else {
      // Convert ft + in to cm
      const ft = data.heightFt ?? 5;
      const inches = data.heightIn ?? 9;
      const cm = Math.round((ft * 12 + inches) * 2.54);
      updateData({
        unitSystem: 'metric',
        heightCm: cm,
      });
    }
  };

  const handleCmChange = (valStr: string) => {
    const num = parseFloat(valStr);
    const cm = isNaN(num) ? null : Math.max(0, num);
    if (cm !== null) {
      const totalInches = cm / 2.54;
      const ft = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      updateData({ heightCm: cm, heightFt: ft, heightIn: inches });
    } else {
      updateData({ heightCm: null });
    }
  };

  const handleFtInChange = (newFt?: number, newIn?: number) => {
    const ft = newFt !== undefined ? newFt : (data.heightFt ?? 0);
    const inches = newIn !== undefined ? newIn : (data.heightIn ?? 0);
    const cm = Math.round((ft * 12 + inches) * 2.54);
    updateData({
      heightFt: ft,
      heightIn: inches,
      heightCm: cm > 0 ? cm : null,
    });
  };

  // Human friendly conversion display
  const equivalentText = isMetric
    ? data.heightCm
      ? `≈ ${Math.floor((data.heightCm / 2.54) / 12)}' ${Math.round((data.heightCm / 2.54) % 12)}"`
      : null
    : data.heightCm
    ? `≈ ${data.heightCm} cm`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          What is your height?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Height is essential for calculating your Body Mass Index (BMI), surface area, and lean mass ratios.
        </p>
      </div>

      {/* Unit Selector Toggle */}
      <div className="flex items-center justify-between p-1.5 rounded-xl bg-secondary/60 border border-border/60">
        <button
          type="button"
          onClick={() => handleUnitToggle('metric')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            isMetric
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Metric (cm)
        </button>
        <button
          type="button"
          onClick={() => handleUnitToggle('imperial')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            !isMetric
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Imperial (ft / in)
        </button>
      </div>

      {/* Input Fields */}
      {isMetric ? (
        <div className="space-y-2">
          <Label htmlFor="ob-height-cm" className="text-xs font-medium">
            Height in centimeters
          </Label>
          <div className="relative">
            <Ruler className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              id="ob-height-cm"
              type="number"
              step="1"
              min="50"
              max="270"
              placeholder="e.g. 175"
              value={data.heightCm ?? ''}
              onChange={(e) => handleCmChange(e.target.value)}
              className="pl-10 pr-12 h-14 text-xl font-bold bg-background/50"
              autoFocus
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
              cm
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="ob-height-ft" className="text-xs font-medium">
              Feet
            </Label>
            <div className="relative">
              <Input
                id="ob-height-ft"
                type="number"
                step="1"
                min="2"
                max="8"
                placeholder="5"
                value={data.heightFt ?? ''}
                onChange={(e) =>
                  handleFtInChange(parseInt(e.target.value) || 0, undefined)
                }
                className="pr-10 h-14 text-xl font-bold bg-background/50"
                autoFocus
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                ft
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ob-height-in" className="text-xs font-medium">
              Inches
            </Label>
            <div className="relative">
              <Input
                id="ob-height-in"
                type="number"
                step="1"
                min="0"
                max="11"
                placeholder="9"
                value={data.heightIn ?? ''}
                onChange={(e) =>
                  handleFtInChange(undefined, parseInt(e.target.value) || 0)
                }
                className="pr-10 h-14 text-xl font-bold bg-background/50"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                in
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Real-time unit conversion badge */}
      {equivalentText && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
          <span>Equivalent: <strong className="text-foreground">{equivalentText}</strong></span>
        </div>
      )}

      {/* Quick selection chips */}
      <div className="space-y-2 pt-1">
        <span className="text-[11px] text-muted-foreground">Quick presets:</span>
        <div className="flex flex-wrap gap-2">
          {[160, 168, 175, 180, 185].map((cmVal) => {
            const isCurrent = Math.round(data.heightCm || 0) === cmVal;
            const chipLabel = isMetric
              ? `${cmVal} cm`
              : `${Math.floor((cmVal / 2.54) / 12)}' ${Math.round((cmVal / 2.54) % 12)}"`;
            return (
              <button
                key={cmVal}
                type="button"
                onClick={() => {
                  handleCmChange(cmVal.toString());
                }}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                  isCurrent
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border/60 hover:border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {chipLabel}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
