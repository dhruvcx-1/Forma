/**
 * US Navy body fat estimation method and BMI calculator.
 *
 * References:
 *   - Hodgdon, J. A., & Beckett, M. B. (1984). Prediction of percent body fat for U.S. Navy men and women
 *     from body circumferences and height. Reports No. 84-29 and 84-11, Naval Health Research Center.
 *   - Siri, W. E. (1961). Body composition from fluid spaces and density.
 *   - CDC / WHO BMI Standards: https://www.cdc.gov/healthyweight/assessing/bmi/index.html
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
  if (heightCm <= 0) return 0;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return parseFloat(bmi.toFixed(1));
}

/**
 * Return the WHO BMI category label for a given BMI value.
 */
export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25.0) return 'Normal weight';
  if (bmi < 30.0) return 'Overweight';
  return 'Obese';
}
