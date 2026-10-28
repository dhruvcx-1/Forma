import React from 'react';
import { Check, Info } from 'lucide-react';
import type { OnboardingData, SexOption } from '../types';

interface StepGenderProps {
  data: OnboardingData;
  updateData: (fields: Partial<OnboardingData>) => void;
}

interface GenderOptionConfig {
  value: SexOption;
  label: string;
  symbol: string;
  subtitle: string;
  description: string;
}

const GENDER_OPTIONS: GenderOptionConfig[] = [
  {
    value: 'male',
    label: 'Male',
    symbol: '♂',
    subtitle: 'Male physiology formulas',
    description: 'Calibrates Jackson-Pollock 3/7, Navy body fat, and Mifflin-St Jeor BMR algorithms.',
  },
  {
    value: 'female',
    label: 'Female',
    symbol: '♀',
    subtitle: 'Female physiology formulas',
    description: 'Calibrates body fat equations tailored for essential female fat distribution and metabolism.',
  },
  {
    value: 'other',
    label: 'Prefer not to say',
    symbol: '✧',
    subtitle: 'Standard baseline formulas',
    description: 'Applies normalized average body composition calculations.',
  },
];

export const StepGender: React.FC<StepGenderProps> = ({ data, updateData }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Biological Sex / Gender
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select the physiological profile that best matches your body metrics.
        </p>
      </div>

      <div className="space-y-3">
        {GENDER_OPTIONS.map((option) => {
          const isSelected = data.sex === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => updateData({ sex: option.value })}
              className={`w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-start gap-4 ${
                isSelected
                  ? 'border-primary bg-primary/10 shadow-sm shadow-primary/10 ring-1 ring-primary'
                  : 'border-border/70 hover:border-border hover:bg-secondary/40 bg-card/60'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-secondary text-foreground'
                }`}
              >
                {option.symbol}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    {option.label}
                  </h3>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                  )}
                </div>
                <p className="text-xs font-medium text-primary/90 mt-0.5">
                  {option.subtitle}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-3 rounded-xl bg-secondary/50 border border-border/50 flex items-start gap-2.5 text-xs text-muted-foreground">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>
          Forma respects your privacy. This calculation coefficient is stored securely on your instance and can be updated anytime in Settings.
        </span>
      </div>
    </div>
  );
};
