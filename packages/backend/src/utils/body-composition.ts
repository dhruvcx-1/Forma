/**
 * US Navy body fat estimation method, BMI calculator, and comprehensive
 * anthropometric health and fitness formulas.
 *
 * References:
 *   - Hodgdon, J. A., & Beckett, M. B. (1984). Prediction of percent body fat for U.S. Navy men and women
 *     from body circumferences and height. Reports No. 84-29 and 84-11, Naval Health Research Center.
 *   - Siri, W. E. (1961). Body composition from fluid spaces and density.
 *   - CDC / WHO BMI Standards: https://www.cdc.gov/healthyweight/assessing/bmi/index.html
 *   - Deurenberg, P., Weststrate, J. A., & Seidell, J. C. (1991). Body mass index as a measure of body fatness.
 *   - Mifflin, M. D., et al. (1990). A new predictive equation for resting energy expenditure in healthy individuals.
 *   - Watson, P. E., Watson, I. D., & Batt, R. D. (1980). Total body water volumes for adult males and females.
 *   - Ashwell, M., & Gibson, S. (2016). Waist-to-height ratio as an indicator of early health risk.
 */

/**
 * Estimate body fat percentage for males using the US Navy Method (Hodgdon-Beckett, metric).
 *
 * @param waistCm  Waist circumference in centimetres (at navel)
 * @param neckCm   Neck circumference in centimetres
 * @param heightCm Height in centimetres
 * @returns Body fat percentage (0–100)
 */
export function navyBodyFatMale(
  waistCm: number,
  neckCm: number,
  heightCm: number,
): number {
  if (waistCm <= neckCm || heightCm <= 0) return 0;
  // Metric Hodgdon-Beckett equation for male body density:
  // Density = 1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(height)
  const density =
    1.0324 -
    0.19077 * Math.log10(waistCm - neckCm) +
    0.15456 * Math.log10(heightCm);

  // Siri equation: % Fat = (495 / Density) - 450
  const result = 495 / density - 450;
  return Math.max(0, Math.min(100, parseFloat(result.toFixed(1))));
}

/**
 * Estimate body fat percentage for females using the US Navy Method (Hodgdon-Beckett, metric).
 *
 * @param waistCm  Waist circumference in centimetres (at navel)
 * @param hipsCm   Hip circumference in centimetres
 * @param neckCm   Neck circumference in centimetres
 * @param heightCm Height in centimetres
 * @returns Body fat percentage (0–100)
 */
export function navyBodyFatFemale(
  waistCm: number,
  hipsCm: number,
  neckCm: number,
  heightCm: number,
): number {
  if (waistCm + hipsCm <= neckCm || heightCm <= 0) return 0;
  // Metric Hodgdon-Beckett equation for female body density:
  // Density = 1.29579 - 0.35004 * log10(waist + hips - neck) + 0.22100 * log10(height)
  const density =
    1.29579 -
    0.35004 * Math.log10(waistCm + hipsCm - neckCm) +
    0.221 * Math.log10(heightCm);

  // Siri equation: % Fat = (495 / Density) - 450
  const result = 495 / density - 450;
  return Math.max(0, Math.min(100, parseFloat(result.toFixed(1))));
}

/**
 * Calculate Body Mass Index (BMI).
 *
 * @param weightKg Weight in kilograms
 * @param heightCm Height in centimetres
 * @returns BMI value
 */
export function calculateBMI(weightKg: number, heightCm: number): number {
  if (heightCm <= 0 || weightKg <= 0) return 0;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return parseFloat(bmi.toFixed(1));
}

/**
 * Return the WHO BMI category label for a given BMI value.
 */
export function bmiCategory(bmi: number): 'Underweight' | 'Normal weight' | 'Overweight' | 'Obese' {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25.0) return 'Normal weight';
  if (bmi < 30.0) return 'Overweight';
  return 'Obese';
}

/**
 * Calculate the healthy weight range (BMI 18.5 to 24.9) for a given height.
 */
export function getHealthyWeightRange(heightCm: number): { minKg: number; maxKg: number } {
  if (heightCm <= 0) return { minKg: 0, maxKg: 0 };
  const heightM = heightCm / 100;
  const h2 = heightM * heightM;
  return {
    minKg: parseFloat((18.5 * h2).toFixed(1)),
    maxKg: parseFloat((24.9 * h2).toFixed(1)),
  };
}

/**
 * Estimate body fat percentage using the Deurenberg formula based on BMI, age, and sex.
 * Formula: BF% = (1.20 * BMI) + (0.23 * Age) - (10.8 * Sex) - 5.4 (Sex: 1 for male, 0 for female)
 */
export function deurenbergBodyFat(bmi: number, ageYears: number, sex: string | null): number {
  if (bmi <= 0) return 0;
  const isMale = sex === 'female' ? 0 : 1;
  const age = Math.max(10, Math.min(100, ageYears || 30));
  const bf = 1.2 * bmi + 0.23 * age - 10.8 * isMale - 5.4;
  return Math.max(3, Math.min(65, parseFloat(bf.toFixed(1))));
}

/**
 * Calculate Lean Body Mass and Fat Mass from total weight and body fat percentage.
 */
export function calculateLBM(weightKg: number, bodyFatPct: number): { leanMassKg: number; fatMassKg: number } {
  if (weightKg <= 0 || bodyFatPct <= 0) return { leanMassKg: weightKg, fatMassKg: 0 };
  const pct = Math.max(0, Math.min(100, bodyFatPct));
  const fatMassKg = parseFloat(((weightKg * pct) / 100).toFixed(1));
  const leanMassKg = parseFloat((weightKg - fatMassKg).toFixed(1));
  return { leanMassKg, fatMassKg };
}

/**
 * Waist-to-Height Ratio (WHtR) and cardiovascular risk classification.
 * Healthy benchmark: Keep waist circumference to less than half your height (< 0.50).
 */
export function calculateWHtR(waistCm: number, heightCm: number): { ratio: number; category: string } {
  if (waistCm <= 0 || heightCm <= 0) return { ratio: 0, category: 'Unknown' };
  const ratio = parseFloat((waistCm / heightCm).toFixed(2));
  let category = 'Healthy';
  if (ratio < 0.4) category = 'Take Care (Underweight risk)';
  else if (ratio <= 0.49) category = 'Healthy (< 0.50)';
  else if (ratio <= 0.59) category = 'Increased Risk (0.50–0.59)';
  else category = 'High Risk (≥ 0.60)';
  return { ratio, category };
}

/**
 * Waist-to-Hip Ratio (WHR) and WHO cardiometabolic risk category.
 */
export function calculateWHR(waistCm: number, hipsCm: number, sex: string | null): { ratio: number; category: string } {
  if (waistCm <= 0 || hipsCm <= 0) return { ratio: 0, category: 'Unknown' };
  const ratio = parseFloat((waistCm / hipsCm).toFixed(2));
  const isFemale = sex === 'female';
  let category = 'Normal';
  if (isFemale) {
    if (ratio < 0.85) category = 'Normal (< 0.85)';
    else if (ratio <= 0.89) category = 'Moderate Risk';
    else category = 'High Risk (≥ 0.90)';
  } else {
    if (ratio < 0.9) category = 'Normal (< 0.90)';
    else if (ratio <= 0.99) category = 'Moderate Risk';
    else category = 'High Risk (≥ 1.0)';
  }
  return { ratio, category };
}

/**
 * Chest-to-Waist Ratio (Golden ratio / V-taper index).
 */
export function calculateChestToWaist(chestCm: number, waistCm: number): number {
  if (chestCm <= 0 || waistCm <= 0) return 0;
  return parseFloat((chestCm / waistCm).toFixed(2));
}

/**
 * Basal Metabolic Rate (BMR) using the Mifflin-St Jeor equation.
 * Men: 10 * weight(kg) + 6.25 * height(cm) - 5 * age + 5
 * Women: 10 * weight(kg) + 6.25 * height(cm) - 5 * age - 161
 */
export function calculateBMR(weightKg: number, heightCm: number, ageYears: number, sex: string | null): number {
  if (weightKg <= 0 || heightCm <= 0) return 0;
  const age = Math.max(12, Math.min(100, ageYears || 30));
  const isFemale = sex === 'female';
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (isFemale ? -161 : 5);
  return Math.round(bmr);
}

/**
 * Daily Maintenance Calories (TDEE) estimated across typical activity multipliers.
 */
export function calculateTDEE(bmr: number): { sedentary: number; light: number; moderate: number; active: number } {
  if (bmr <= 0) return { sedentary: 0, light: 0, moderate: 0, active: 0 };
  return {
    sedentary: Math.round(bmr * 1.2),
    light: Math.round(bmr * 1.375),
    moderate: Math.round(bmr * 1.55),
    active: Math.round(bmr * 1.725),
  };
}

/**
 * Total Body Water (TBW) in Liters using the Watson formula.
 */
export function calculateTBW(weightKg: number, heightCm: number, ageYears: number, sex: string | null): number {
  if (weightKg <= 0 || heightCm <= 0) return 0;
  const age = Math.max(12, Math.min(100, ageYears || 30));
  const isFemale = sex === 'female';
  let tbw: number;
  if (isFemale) {
    tbw = -2.097 + 0.1069 * heightCm + 0.2466 * weightKg;
  } else {
    tbw = 2.447 - 0.09156 * age + 0.1074 * heightCm + 0.3362 * weightKg;
  }
  return parseFloat(Math.max(15, tbw).toFixed(1));
}

/**
 * Limb Symmetry between left and right measurements (in cm).
 */
export function calculateSymmetry(leftCm: number, rightCm: number): { left: number; right: number; diff: number; balanced: boolean } {
  const diff = parseFloat(Math.abs(leftCm - rightCm).toFixed(1));
  return {
    left: leftCm,
    right: rightCm,
    diff,
    balanced: diff <= 1.0,
  };
}
