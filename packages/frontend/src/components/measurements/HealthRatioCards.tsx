import React from 'react';
import { Activity, Heart, ShieldCheck, Info } from 'lucide-react';
import { GlassCard } from '@/components/ui/card';
import { calculateWhr, calculateWhtr } from '@/utils/healthRatios';

interface HealthRatioCardsProps {
  waistCm?: number | null;
  hipsCm?: number | null;
  heightCm?: number | null;
  sex?: 'male' | 'female' | 'other';
}

export function HealthRatioCards({
  waistCm,
  hipsCm,
  heightCm,
  sex = 'male',
}: HealthRatioCardsProps) {
  if (!waistCm) return null;

  const whr = hipsCm ? calculateWhr(waistCm, hipsCm, sex) : null;
  const whtr = heightCm ? calculateWhtr(waistCm, heightCm) : null;

  if (!whr && !whtr) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Waist to Hip Ratio (WHR) */}
      {whr && (
        <GlassCard className="p-4 sm:p-5 border-border/60 hover:border-border transition-all flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Heart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-foreground">
                    Waist-to-Hip Ratio (WHR)
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Visceral body fat distribution indicator
                  </p>
                </div>
              </div>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${whr.badgeBg} ${whr.badgeText}`}
              >
                {whr.categoryLabel}
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-foreground tabular-nums">
                  {whr.value.toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({Math.round(waistCm)}cm / {Math.round(hipsCm || 0)}cm)
                </span>
              </div>
              <span className="text-xs font-semibold text-muted-foreground">
                Target: &lt; {sex === 'female' ? '0.85' : '0.90'}
              </span>
            </div>

            {/* Visual Risk Gauge */}
            <div className="space-y-1">
              <div className="w-full h-2 bg-secondary/80 rounded-full overflow-hidden flex">
                <div className="w-1/3 h-full bg-emerald-500/70" title="Low Risk" />
                <div className="w-1/3 h-full bg-amber-500/70" title="Moderate Risk" />
                <div className="w-1/3 h-full bg-rose-500/70" title="High Risk" />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                <span>Lean (&lt;0.90)</span>
                <span>Moderate (0.90–0.99)</span>
                <span>Elevated (≥1.0)</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed pt-1">
              {whr.description}
            </p>
          </div>
        </GlassCard>
      )}

      {/* Waist to Height Ratio (WHtR) */}
      {whtr && (
        <GlassCard className="p-4 sm:p-5 border-border/60 hover:border-border transition-all flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-foreground">
                    Waist-to-Height Ratio (WHtR)
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Universal cardiometabolic health rule
                  </p>
                </div>
              </div>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${whtr.badgeBg} ${whtr.badgeText}`}
              >
                {whtr.categoryLabel}
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-foreground tabular-nums">
                  {whtr.value.toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({Math.round(waistCm)}cm / {Math.round(heightCm || 0)}cm)
                </span>
              </div>
              <span className="text-xs font-semibold text-emerald-500">
                Rule: &lt; 0.50 ("Waist &lt; Half Height")
              </span>
            </div>

            {/* Visual Risk Gauge */}
            <div className="space-y-1">
              <div className="w-full h-2 bg-secondary/80 rounded-full overflow-hidden flex">
                <div className="w-1/2 h-full bg-emerald-500/70" title="Healthy (<0.50)" />
                <div className="w-1/4 h-full bg-amber-500/70" title="Increased (0.50–0.59)" />
                <div className="w-1/4 h-full bg-rose-500/70" title="High (≥0.60)" />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                <span>Healthy (&lt;0.50)</span>
                <span>Increased (0.50–0.59)</span>
                <span>High (≥0.60)</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed pt-1">
              {whtr.description}
            </p>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
