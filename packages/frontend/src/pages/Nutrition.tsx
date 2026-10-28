import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Utensils,
  Flame,
  Dumbbell,
  Scale,
  Sparkles,
  Info,
  Check,
  Plus,
  Save,
  TrendingDown,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NutritionPlanData {
  plan: {
    diet_type: string;
    activity_level: string;
    daily_calories: number;
    protein_grams: number;
    carbs_grams: number;
    fat_grams: number;
    protein_pct: number;
    carbs_pct: number;
    fat_pct: number;
  } | null;
  calculated: {
    bmr: number;
    tdee: number;
    dailyCalories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    proteinPct: number;
    carbsPct: number;
    fatPct: number;
    dietType: string;
    activityLevel: string;
    basisWeightKg: number;
    isIdealWeightUsed: boolean;
    maxIdealWeightKg: number;
  };
  userDetails: {
    heightCm: number;
    sex: string;
    ageYears: number;
    weightKg: number;
    goal: string;
  };
  dietConfigs: Record<
    string,
    { name: string; description: string; proteinPct: number; carbsPct: number; fatPct: number }
  >;
}

interface DailyLogResponse {
  log: {
    id: string;
    date: string;
    calories: number | null;
    protein_grams: number | null;
    carbs_grams: number | null;
    fat_grams: number | null;
    notes: string | null;
  } | null;
}

const ACTIVITY_LABELS: Record<string, { title: string; desc: string }> = {
  sedentary: { title: 'Sedentary', desc: 'Little to no exercise, desk job' },
  light: { title: 'Lightly Active', desc: 'Light exercise 1–3 days/week' },
  moderate: { title: 'Moderately Active', desc: 'Moderate workout 3–5 days/week' },
  very_active: { title: 'Very Active', desc: 'Hard training 6–7 days/week' },
  extra_active: { title: 'Extra Active', desc: 'Athlete or intense physical labor' },
};

export default function Nutrition() {
  const queryClient = useQueryClient();
  const todayStr = new Date().toISOString().split('T')[0];

  // Fetch plan
  const { data: planData, isLoading } = useQuery({
    queryKey: ['nutrition-plan'],
    queryFn: () => api.get<NutritionPlanData>('/nutrition/plan'),
  });

  // Fetch today's log
  const { data: todayLogData } = useQuery({
    queryKey: ['nutrition-log-today', todayStr],
    queryFn: () => api.get<DailyLogResponse>(`/nutrition/logs?date=${todayStr}`),
  });

  // State for plan editing
  const [selectedDiet, setSelectedDiet] = useState<string>('high_protein_low_carb');
  const [selectedActivity, setSelectedActivity] = useState<string>('moderate');
  const [calories, setCalories] = useState<number>(2000);
  const [proteinGrams, setProteinGrams] = useState<number>(160);
  const [carbsGrams, setCarbsGrams] = useState<number>(100);
  const [fatGrams, setFatGrams] = useState<number>(75);
  const [hasCustomized, setHasCustomized] = useState(false);

  // Daily log state
  const [todayCalories, setTodayCalories] = useState<number>(0);
  const [todayProtein, setTodayProtein] = useState<number>(0);
  const [todayCarbs, setTodayCarbs] = useState<number>(0);
  const [todayFat, setTodayFat] = useState<number>(0);
  const [todayNotes, setTodayNotes] = useState<string>('');

  // Sync state when planData arrives
  useEffect(() => {
    if (planData) {
      if (planData.plan) {
        setSelectedDiet(planData.plan.diet_type || 'high_protein_low_carb');
        setSelectedActivity(planData.plan.activity_level || 'moderate');
        setCalories(Math.round(planData.plan.daily_calories));
        setProteinGrams(Math.round(planData.plan.protein_grams));
        setCarbsGrams(Math.round(planData.plan.carbs_grams));
        setFatGrams(Math.round(planData.plan.fat_grams));
      } else {
        setSelectedDiet(planData.calculated.dietType || 'high_protein_low_carb');
        setSelectedActivity(planData.calculated.activityLevel || 'moderate');
        setCalories(Math.round(planData.calculated.dailyCalories));
        setProteinGrams(Math.round(planData.calculated.proteinGrams));
        setCarbsGrams(Math.round(planData.calculated.carbsGrams));
        setFatGrams(Math.round(planData.calculated.fatGrams));
      }
    }
  }, [planData]);

  // Sync today's log
  useEffect(() => {
    if (todayLogData?.log) {
      setTodayCalories(todayLogData.log.calories || 0);
      setTodayProtein(todayLogData.log.protein_grams || 0);
      setTodayCarbs(todayLogData.log.carbs_grams || 0);
      setTodayFat(todayLogData.log.fat_grams || 0);
      setTodayNotes(todayLogData.log.notes || '');
    }
  }, [todayLogData]);

  // Mutations
  const savePlanMutation = useMutation({
    mutationFn: (payload: any) => api.put('/nutrition/plan', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition-plan'] });
      setHasCustomized(false);
    },
  });

  const saveLogMutation = useMutation({
    mutationFn: (payload: any) => api.post('/nutrition/logs', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition-log-today'] });
    },
  });

  const handleDietSelect = (dietKey: string) => {
    setSelectedDiet(dietKey);
    setHasCustomized(true);

    if (planData) {
      // Recompute targets for selected diet
      const basisWeight = planData.calculated.basisWeightKg;
      let multiplier = 2.2;
      if (dietKey === 'keto') multiplier = 1.8;
      if (dietKey === 'carnivore') multiplier = 2.4;
      if (dietKey === 'balanced' || dietKey === 'mediterranean') multiplier = 1.8;

      const pGrams = Math.round(basisWeight * multiplier);
      const targetCals = calories;
      const pCals = pGrams * 4;

      if (dietKey === 'carnivore') {
        setProteinGrams(pGrams);
        setCarbsGrams(0);
        setFatGrams(Math.round(Math.max(0, targetCals - pCals) / 9));
      } else if (dietKey === 'keto') {
        setProteinGrams(pGrams);
        setCarbsGrams(25);
        setFatGrams(Math.round(Math.max(0, targetCals - pCals - 100) / 9));
      } else if (dietKey === 'high_protein_low_carb') {
        setProteinGrams(pGrams);
        setCarbsGrams(Math.round((targetCals * 0.25) / 4));
        setFatGrams(Math.round((targetCals * 0.40) / 9));
      } else {
        setProteinGrams(pGrams);
        setCarbsGrams(Math.round((targetCals * 0.40) / 4));
        setFatGrams(Math.round((targetCals * 0.30) / 9));
      }
    }
  };

  const handleSavePlan = () => {
    const totalCals = proteinGrams * 4 + carbsGrams * 4 + fatGrams * 9;
    const finalCals = Math.max(calories, totalCals);
    const pPct = Math.round(((proteinGrams * 4) / finalCals) * 100);
    const cPct = Math.round(((carbsGrams * 4) / finalCals) * 100);
    const fPct = Math.max(0, 100 - pPct - cPct);

    savePlanMutation.mutate({
      diet_type: selectedDiet,
      activity_level: selectedActivity,
      daily_calories: finalCals,
      protein_grams: proteinGrams,
      carbs_grams: carbsGrams,
      fat_grams: fatGrams,
      protein_pct: pPct,
      carbs_pct: cPct,
      fat_pct: fPct,
    });
  };

  const handleSaveTodayLog = () => {
    saveLogMutation.mutate({
      date: todayStr,
      calories: todayCalories,
      protein_grams: todayProtein,
      carbs_grams: todayCarbs,
      fat_grams: todayFat,
      notes: todayNotes || undefined,
    });
  };

  const addQuickNutrient = (field: 'cal' | 'protein', amount: number) => {
    if (field === 'cal') {
      const next = Math.max(0, todayCalories + amount);
      setTodayCalories(next);
      saveLogMutation.mutate({
        date: todayStr,
        calories: next,
        protein_grams: todayProtein,
        carbs_grams: todayCarbs,
        fat_grams: todayFat,
        notes: todayNotes || undefined,
      });
    } else {
      const next = Math.max(0, todayProtein + amount);
      setTodayProtein(next);
      saveLogMutation.mutate({
        date: todayStr,
        calories: todayCalories,
        protein_grams: next,
        carbs_grams: todayCarbs,
        fat_grams: todayFat,
        notes: todayNotes || undefined,
      });
    }
  };

  if (isLoading || !planData) {
    return <div className="p-8 text-center text-muted-foreground text-sm">Loading nutrition engine...</div>;
  }

  const { calculated, userDetails, dietConfigs } = planData;
  const isOver80Kg = userDetails.weightKg > 80 && calculated.isIdealWeightUsed;

  const proteinProgress = Math.min(100, Math.round((todayProtein / (proteinGrams || 1)) * 100));
  const calorieProgress = Math.min(100, Math.round((todayCalories / (calories || 1)) * 100));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
          <Utensils className="w-7 h-7 text-primary" />
          <span>Macro Planning & Nutrition</span>
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
          Scientific macronutrient planning, energy expenditure, and daily quick tracking.
        </p>
      </div>

      {/* Over 80 kg Ideal Weight Rule Alert */}
      {isOver80Kg && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/10 flex items-start gap-3 shadow-sm">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
              <span>Over 80 kg Ideal Body Weight Protocol Active</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-primary text-white">
                Clinical Best Practice
              </span>
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Because your current scale weight is <strong>{userDetails.weightKg} kg</strong> (&gt; 80 kg), your daily protein requirement is calculated from your <strong>Max Ideal Weight ({calculated.maxIdealWeightKg} kg at BMI 24.9 ceiling)</strong>. This avoids prescribing excessive protein ({Math.round(userDetails.weightKg * 2.2)}g) while guaranteeing optimal lean muscle retention ({proteinGrams}g).
            </p>
          </div>
        </div>
      )}

      {/* Metabolic Baseline Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GlassCard className="p-4 border-border/60">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Basal Metabolic Rate
          </div>
          <div className="text-2xl font-black text-foreground mt-1">
            {calculated.bmr} <span className="text-xs font-normal text-muted-foreground">kcal/d</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">Mifflin-St Jeor baseline</div>
        </GlassCard>

        <GlassCard className="p-4 border-border/60">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Maintenance TDEE
          </div>
          <div className="text-2xl font-black text-foreground mt-1">
            {calculated.tdee} <span className="text-xs font-normal text-muted-foreground">kcal/d</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">Total energy expenditure</div>
        </GlassCard>

        <GlassCard className="p-4 border-border/60">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Target Calories
          </div>
          <div className="text-2xl font-black text-primary mt-1">
            {calories} <span className="text-xs font-normal text-muted-foreground">kcal/d</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 capitalize">Goal: {userDetails.goal}</div>
        </GlassCard>

        <GlassCard className="p-4 border-border/60">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Protein Target
          </div>
          <div className="text-2xl font-black text-emerald-500 mt-1">
            {proteinGrams} <span className="text-xs font-normal text-muted-foreground">grams</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {isOver80Kg ? `Based on ${calculated.maxIdealWeightKg}kg max IBW` : `Based on ${userDetails.weightKg}kg`}
          </div>
        </GlassCard>
      </div>

      {/* Diet Archetype Selector */}
      <GlassCard className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>Choose Diet Archetype</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Select your nutritional framework. <strong>High-Protein / Low-Carb</strong> is active by default.
              </CardDescription>
            </div>
            {hasCustomized && (
              <Button size="sm" onClick={handleSavePlan} disabled={savePlanMutation.isPending} className="gap-1.5 shadow-md shadow-primary/20">
                <Save className="w-3.5 h-3.5" />
                <span>Save Targets</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(dietConfigs).map(([key, cfg]) => {
              const isSelected = selectedDiet === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleDietSelect(key)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                      : 'border-border/60 hover:border-border hover:bg-secondary/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-foreground">{cfg.name}</span>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {cfg.description}
                  </p>
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/40 text-[10px] font-semibold text-muted-foreground">
                    <span className="text-emerald-500">{cfg.proteinPct}% P</span>
                    <span>•</span>
                    <span className="text-amber-500">{cfg.carbsPct}% C</span>
                    <span>•</span>
                    <span className="text-blue-500">{cfg.fatPct}% F</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Target Macro Inputs */}
          <div className="mt-6 pt-4 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Calories (kcal)</Label>
              <Input
                type="number"
                value={calories}
                onChange={(e) => {
                  setCalories(parseInt(e.target.value) || 0);
                  setHasCustomized(true);
                }}
                className="h-10 text-sm font-bold"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-emerald-500">Protein (g)</Label>
              <Input
                type="number"
                value={proteinGrams}
                onChange={(e) => {
                  setProteinGrams(parseInt(e.target.value) || 0);
                  setHasCustomized(true);
                }}
                className="h-10 text-sm font-bold border-emerald-500/40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-amber-500">Carbs (g)</Label>
              <Input
                type="number"
                value={carbsGrams}
                onChange={(e) => {
                  setCarbsGrams(parseInt(e.target.value) || 0);
                  setHasCustomized(true);
                }}
                className="h-10 text-sm font-bold border-amber-500/40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-blue-500">Fats (g)</Label>
              <Input
                type="number"
                value={fatGrams}
                onChange={(e) => {
                  setFatGrams(parseInt(e.target.value) || 0);
                  setHasCustomized(true);
                }}
                className="h-10 text-sm font-bold border-blue-500/40"
              />
            </div>
          </div>
        </CardContent>
      </GlassCard>

      {/* Daily Quick Tracker Section */}
      <GlassCard className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span>Today's Nutrition Intake</span>
            </div>
            <span className="text-xs font-normal text-muted-foreground">{todayStr}</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Quickly log your daily totals. No tedious ingredient-by-ingredient logging required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Calorie Bar */}
            <div className="space-y-1.5 p-3.5 rounded-xl bg-secondary/30 border border-border/50">
              <div className="flex justify-between text-xs font-semibold">
                <span>Calories</span>
                <span>
                  {todayCalories} / {calories} kcal ({calorieProgress}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-secondary/80 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    todayCalories > calories ? 'bg-amber-500' : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min(100, calorieProgress)}%` }}
                />
              </div>
              <div className="flex gap-1.5 pt-1.5">
                {[100, 250, 500].map((cal) => (
                  <button
                    key={cal}
                    type="button"
                    onClick={() => addQuickNutrient('cal', cal)}
                    className="text-[10px] font-semibold px-2 py-1 rounded-md border border-border/60 hover:bg-secondary text-muted-foreground hover:text-foreground"
                  >
                    +{cal} kcal
                  </button>
                ))}
              </div>
            </div>

            {/* Protein Bar */}
            <div className="space-y-1.5 p-3.5 rounded-xl bg-secondary/30 border border-border/50">
              <div className="flex justify-between text-xs font-semibold text-emerald-500">
                <span>Protein</span>
                <span>
                  {todayProtein} / {proteinGrams} g ({proteinProgress}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-secondary/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, proteinProgress)}%` }}
                />
              </div>
              <div className="flex gap-1.5 pt-1.5">
                {[10, 25, 40].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => addQuickNutrient('protein', p)}
                    className="text-[10px] font-semibold px-2 py-1 rounded-md border border-border/60 hover:bg-secondary text-muted-foreground hover:text-foreground"
                  >
                    +{p}g Protein
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Direct Inputs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Logged Calories</Label>
              <Input
                type="number"
                value={todayCalories || ''}
                placeholder="0"
                onChange={(e) => setTodayCalories(parseInt(e.target.value) || 0)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Logged Protein (g)</Label>
              <Input
                type="number"
                value={todayProtein || ''}
                placeholder="0"
                onChange={(e) => setTodayProtein(parseInt(e.target.value) || 0)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Logged Carbs (g)</Label>
              <Input
                type="number"
                value={todayCarbs || ''}
                placeholder="0"
                onChange={(e) => setTodayCarbs(parseInt(e.target.value) || 0)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Logged Fat (g)</Label>
              <Input
                type="number"
                value={todayFat || ''}
                placeholder="0"
                onChange={(e) => setTodayFat(parseInt(e.target.value) || 0)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Input
              placeholder="Notes for today (e.g. Post-workout shake, steak & eggs)"
              value={todayNotes}
              onChange={(e) => setTodayNotes(e.target.value)}
              className="text-xs flex-1 h-9"
            />
            <Button
              size="sm"
              onClick={handleSaveTodayLog}
              disabled={saveLogMutation.isPending}
              className="shadow-md shadow-primary/20 shrink-0"
            >
              {saveLogMutation.isPending ? 'Saving...' : 'Update Daily Log'}
            </Button>
          </div>
        </CardContent>
      </GlassCard>
    </div>
  );
}
