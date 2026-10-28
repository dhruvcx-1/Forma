import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Utensils, ArrowRight, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { GlassCard } from '@/components/ui/card';

export function NutritionWidget() {
  const todayStr = new Date().toISOString().split('T')[0];

  const { data: planData } = useQuery({
    queryKey: ['nutrition-plan'],
    queryFn: () => api.get<any>('/nutrition/plan'),
  });

  const { data: todayLogData } = useQuery({
    queryKey: ['nutrition-log-today', todayStr],
    queryFn: () => api.get<any>(`/nutrition/logs?date=${todayStr}`),
  });

  const activePlan = planData?.plan || planData?.calculated;
  const targetCalories = activePlan?.daily_calories || activePlan?.dailyCalories || 2000;
  const targetProtein = activePlan?.protein_grams || activePlan?.proteinGrams || 160;

  const loggedCalories = todayLogData?.log?.calories || 0;
  const loggedProtein = todayLogData?.log?.protein_grams || 0;

  const caloriePct = Math.min(100, Math.round((loggedCalories / targetCalories) * 100));
  const proteinPct = Math.min(100, Math.round((loggedProtein / targetProtein) * 100));

  return (
    <GlassCard className="p-4 sm:p-5 border-border/60 hover:border-border transition-all flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Utensils className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Daily Nutrition</h3>
            <p className="text-[11px] text-muted-foreground capitalize">
              {activePlan?.diet_type?.replace(/_/g, ' ') || 'High-Protein / Low-Carb'}
            </p>
          </div>
        </div>

        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-500">
          Target: {targetCalories} kcal
        </span>
      </div>

      <div className="space-y-3">
        {/* Protein Meter */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-emerald-500">Protein</span>
            <span>
              {loggedProtein} / {targetProtein} g ({proteinPct}%)
            </span>
          </div>
          <div className="w-full h-1.5 bg-secondary/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${proteinPct}%` }}
            />
          </div>
        </div>

        {/* Calorie Meter */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold text-foreground">
            <span>Calories</span>
            <span>
              {loggedCalories} / {targetCalories} kcal ({caloriePct}%)
            </span>
          </div>
          <div className="w-full h-1.5 bg-secondary/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${caloriePct}%` }}
            />
          </div>
        </div>

        <Link
          to="/nutrition"
          className="flex items-center justify-between text-xs font-semibold text-primary hover:underline pt-1"
        >
          <span>Log Meal & Macro Targets</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </GlassCard>
  );
}
