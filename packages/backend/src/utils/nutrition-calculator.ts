/**
 * Nutrition & Macro Calculation Utility
 * Implements scientific BMR formulas (Mifflin-St Jeor & Katch-McArdle),
 * TDEE multipliers, and diet-specific macronutrient targets.
 *
 * Special Rule:
 * If user weighs > 80 kg, protein requirements are calculated using their
 * Max Ideal Weight (derived from BMI 24.9) to prevent over-prescribing
 * protein relative to excessive adipose tissue.
 */

export type DietType =
  | 'high_protein_low_carb'
  | 'keto'
  | 'balanced'
  | 'mediterranean'
  | 'carnivore'
  | 'custom';

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'very_active'
  | 'extra_active';

export type FitnessGoal = 'lose' | 'maintain' | 'gain';

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2, // Little or no exercise
  light: 1.375, // Light exercise 1-3 days/week
  moderate: 1.55, // Moderate exercise 3-5 days/week
  very_active: 1.725, // Hard exercise 6-7 days/week
  extra_active: 1.9, // Very hard exercise, physical job or 2x/day training
};

export const DIET_CONFIGS: Record<
  DietType,
  { name: string; description: string; proteinPct: number; carbsPct: number; fatPct: number }
> = {
  high_protein_low_carb: {
    name: 'High-Protein / Low-Carb',
    description: 'Sparing lean mass, high satiety, accelerated fat loss.',
    proteinPct: 35,
    carbsPct: 25,
    fatPct: 40,
  },
  keto: {
    name: 'Ketogenic (Keto)',
    description: 'Very low carb to stimulate deep nutritional ketosis.',
    proteinPct: 25,
    carbsPct: 5,
    fatPct: 70,
  },
  balanced: {
    name: 'Balanced',
    description: 'Even distribution for steady energy and balanced nutrition.',
    proteinPct: 30,
    carbsPct: 40,
    fatPct: 30,
  },
  mediterranean: {
    name: 'Mediterranean',
    description: 'Nutrient-rich complex carbs with heart-healthy fats.',
    proteinPct: 25,
    carbsPct: 45,
    fatPct: 30,
  },
  carnivore: {
    name: 'Carnivore / Zero Carb',
    description: 'Animal-based nutrition, zero carbohydrate intake.',
    proteinPct: 45,
    carbsPct: 0,
    fatPct: 55,
  },
  custom: {
    name: 'Custom',
    description: 'Custom macronutrient distribution.',
    proteinPct: 30,
    carbsPct: 40,
    fatPct: 30,
  },
};

/**
 * Calculates Max Ideal Weight based on upper limit of healthy BMI (24.9)
 * Formula: 24.9 * (height_m)^2
 */
export function calculateMaxIdealWeightKg(heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round(24.9 * heightM * heightM * 10) / 10;
}

/**
 * Calculates BMR using Mifflin-St Jeor
 */
export function calculateMifflinStJeorBmr(
  weightKg: number,
  heightCm: number,
  sex: 'male' | 'female' | 'other',
  ageYears: number = 30
): number {
  // Male: (10 * weight) + (6.25 * height) - (5 * age) + 5
  // Female: (10 * weight) + (6.25 * height) - (5 * age) - 161
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  if (sex === 'male') return Math.round(base + 5);
  if (sex === 'female') return Math.round(base - 161);
  return Math.round(base - 78); // Average for 'other'
}

/**
 * Calculates BMR using Katch-McArdle (when lean body mass is available)
 * Formula: 370 + (21.6 * leanMassKg)
 */
export function calculateKatchMcArdleBmr(leanMassKg: number): number {
  return Math.round(370 + 21.6 * leanMassKg);
}

/**
 * Calculates TDEE from BMR and activity level
 */
export function calculateTdee(bmr: number, activityLevel: ActivityLevel = 'moderate'): number {
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] || 1.55;
  return Math.round(bmr * multiplier);
}

/**
 * Calculates Protein Target in grams.
 * CRITICAL RULE:
 * If user weighs > 80 kg, calculate protein intake using Max Ideal Weight (BMI 24.9)
 * to avoid prescribing excessive protein due to high adiposity.
 */
export function calculateProteinGrams(
  weightKg: number,
  heightCm: number,
  dietType: DietType = 'high_protein_low_carb',
  leanMassKg?: number | null
): {
  proteinGrams: number;
  basisWeightKg: number;
  isIdealWeightUsed: boolean;
  maxIdealWeightKg: number;
} {
  const maxIdealWeightKg = calculateMaxIdealWeightKg(heightCm);
  let basisWeightKg = weightKg;
  let isIdealWeightUsed = false;

  if (weightKg > 80 && maxIdealWeightKg < weightKg) {
    basisWeightKg = maxIdealWeightKg;
    isIdealWeightUsed = true;
  }

  // Protein grams multiplier per kg of basis weight
  let gPerKg = 2.2; // High-Protein / Low-Carb default
  if (dietType === 'keto') gPerKg = 1.8;
  if (dietType === 'carnivore') gPerKg = 2.4;
  if (dietType === 'balanced' || dietType === 'mediterranean') gPerKg = 1.8;

  const proteinGrams = Math.round(basisWeightKg * gPerKg);

  return {
    proteinGrams,
    basisWeightKg,
    isIdealWeightUsed,
    maxIdealWeightKg,
  };
}

export interface MacroPlanCalculation {
  bmr: number;
  tdee: number;
  dailyCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  dietType: DietType;
  activityLevel: ActivityLevel;
  basisWeightKg: number;
  isIdealWeightUsed: boolean;
  maxIdealWeightKg: number;
}

/**
 * Generates full tailored macro target plan
 */
export function generateMacroPlan(params: {
  weightKg: number;
  heightCm: number;
  sex?: 'male' | 'female' | 'other';
  ageYears?: number;
  activityLevel?: ActivityLevel;
  goal?: FitnessGoal;
  dietType?: DietType;
  leanMassKg?: number | null;
}): MacroPlanCalculation {
  const {
    weightKg,
    heightCm,
    sex = 'male',
    ageYears = 30,
    activityLevel = 'moderate',
    goal = 'maintain',
    dietType = 'high_protein_low_carb',
    leanMassKg,
  } = params;

  // 1. Calculate BMR
  const bmr = leanMassKg
    ? calculateKatchMcArdleBmr(leanMassKg)
    : calculateMifflinStJeorBmr(weightKg, heightCm, sex, ageYears);

  // 2. Calculate TDEE
  const tdee = calculateTdee(bmr, activityLevel);

  // 3. Goal Calorie Adjustment
  let targetCalories = tdee;
  if (goal === 'lose') {
    targetCalories = Math.max(1200, Math.round(tdee - 500)); // 500 kcal deficit
  } else if (goal === 'gain') {
    targetCalories = Math.round(tdee + 300); // 300 kcal surplus
  }

  // 4. Protein calculation (applying >80kg rule)
  const proteinInfo = calculateProteinGrams(weightKg, heightCm, dietType, leanMassKg);
  const proteinGrams = proteinInfo.proteinGrams;
  const proteinCalories = proteinGrams * 4;

  // 5. Calculate Carbs and Fat based on Diet Type
  const config = DIET_CONFIGS[dietType] || DIET_CONFIGS.high_protein_low_carb;
  let fatGrams: number;
  let carbsGrams: number;

  if (dietType === 'carnivore') {
    carbsGrams = 0;
    const remainingCalories = Math.max(0, targetCalories - proteinCalories);
    fatGrams = Math.round(remainingCalories / 9);
  } else if (dietType === 'keto') {
    // Net carbs capped at ~25g (100 kcal)
    carbsGrams = 25;
    const remainingCalories = Math.max(0, targetCalories - proteinCalories - (carbsGrams * 4));
    fatGrams = Math.round(remainingCalories / 9);
  } else {
    // Default & other types: distribute remainder between carbs and fat
    const remainingCalories = Math.max(0, targetCalories - proteinCalories);
    const nonProteinRatio = (config.carbsPct + config.fatPct) || 1;
    const carbShare = config.carbsPct / nonProteinRatio;
    const fatShare = config.fatPct / nonProteinRatio;

    carbsGrams = Math.max(20, Math.round((remainingCalories * carbShare) / 4));
    fatGrams = Math.max(30, Math.round((remainingCalories * fatShare) / 9));
  }

  // Compute final effective percentages
  const totalCalculatedCalories = (proteinGrams * 4) + (carbsGrams * 4) + (fatGrams * 9);
  const finalCalories = Math.max(targetCalories, totalCalculatedCalories);
  const proteinPct = Math.round(((proteinGrams * 4) / finalCalories) * 100);
  const carbsPct = Math.round(((carbsGrams * 4) / finalCalories) * 100);
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct);

  return {
    bmr,
    tdee,
    dailyCalories: finalCalories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    proteinPct,
    carbsPct,
    fatPct,
    dietType,
    activityLevel,
    basisWeightKg: proteinInfo.basisWeightKg,
    isIdealWeightUsed: proteinInfo.isIdealWeightUsed,
    maxIdealWeightKg: proteinInfo.maxIdealWeightKg,
  };
}
