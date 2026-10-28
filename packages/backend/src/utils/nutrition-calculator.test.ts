import { describe, it, expect } from 'vitest';
import {
  calculateMaxIdealWeightKg,
  calculateMifflinStJeorBmr,
  calculateKatchMcArdleBmr,
  calculateTdee,
  calculateProteinGrams,
  generateMacroPlan,
} from './nutrition-calculator.js';

describe('Nutrition & Macro Calculator', () => {
  it('calculates Max Ideal Weight (BMI 24.9 ceiling) accurately', () => {
    // 175cm -> 24.9 * 1.75^2 = 76.256 ~ 76.3 kg
    expect(calculateMaxIdealWeightKg(175)).toBeCloseTo(76.3, 1);
    // 180cm -> 24.9 * 1.8^2 = 80.676 ~ 80.7 kg
    expect(calculateMaxIdealWeightKg(180)).toBeCloseTo(80.7, 1);
    // 160cm -> 24.9 * 1.6^2 = 63.744 ~ 63.7 kg
    expect(calculateMaxIdealWeightKg(160)).toBeCloseTo(63.7, 1);
  });

  it('calculates BMR using Mifflin-St Jeor formula', () => {
    // Male: 75kg, 175cm, 30yo -> 10*75 + 6.25*175 - 5*30 + 5 = 750 + 1093.75 - 150 + 5 = 1698.75 ~ 1699
    const maleBmr = calculateMifflinStJeorBmr(75, 175, 'male', 30);
    expect(maleBmr).toBe(1699);

    // Female: 60kg, 165cm, 30yo -> 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25 ~ 1320
    const femaleBmr = calculateMifflinStJeorBmr(60, 165, 'female', 30);
    expect(femaleBmr).toBe(1320);
  });

  it('calculates BMR using Katch-McArdle when lean mass is provided', () => {
    // 60 kg lean mass -> 370 + 21.6 * 60 = 1666
    const bmr = calculateKatchMcArdleBmr(60);
    expect(bmr).toBe(1666);
  });

  it('calculates TDEE correctly across activity levels', () => {
    const bmr = 1700;
    expect(calculateTdee(bmr, 'sedentary')).toBe(Math.round(1700 * 1.2));
    expect(calculateTdee(bmr, 'moderate')).toBe(Math.round(1700 * 1.55));
    expect(calculateTdee(bmr, 'very_active')).toBe(Math.round(1700 * 1.725));
  });

  describe('Over 80 kg Protein Rule', () => {
    it('uses actual weight for users weighing <= 80 kg', () => {
      const res = calculateProteinGrams(75, 175, 'high_protein_low_carb');
      expect(res.isIdealWeightUsed).toBe(false);
      expect(res.basisWeightKg).toBe(75);
      // 75 * 2.2 = 165g
      expect(res.proteinGrams).toBe(165);
    });

    it('caps protein calculation basis to Max Ideal Weight for users > 80 kg with lower ideal weight', () => {
      // 100 kg person at 175cm -> max ideal weight is 76.3 kg
      const res = calculateProteinGrams(100, 175, 'high_protein_low_carb');
      expect(res.isIdealWeightUsed).toBe(true);
      expect(res.basisWeightKg).toBeCloseTo(76.3, 1);
      // 76.3 * 2.2 = 167.86 ~ 168g (instead of 100 * 2.2 = 220g!)
      expect(res.proteinGrams).toBe(168);
    });

    it('uses actual weight if user is very tall and their max ideal weight exceeds their weight', () => {
      // 85 kg person at 195cm -> max ideal weight is 24.9 * 1.95^2 = 94.7 kg
      const res = calculateProteinGrams(85, 195, 'high_protein_low_carb');
      expect(res.isIdealWeightUsed).toBe(false);
      expect(res.basisWeightKg).toBe(85);
      expect(res.proteinGrams).toBe(Math.round(85 * 2.2));
    });
  });

  it('generates a full High-Protein / Low-Carb plan by default', () => {
    const plan = generateMacroPlan({
      weightKg: 80,
      heightCm: 180,
      sex: 'male',
      ageYears: 28,
      activityLevel: 'moderate',
      goal: 'lose',
      dietType: 'high_protein_low_carb',
    });

    expect(plan.dietType).toBe('high_protein_low_carb');
    expect(plan.proteinGrams).toBeGreaterThan(150);
    expect(plan.proteinPct).toBeGreaterThanOrEqual(30);
    expect(plan.carbsGrams).toBeGreaterThan(0);
    expect(plan.fatGrams).toBeGreaterThan(0);
    expect(plan.dailyCalories).toBeLessThan(plan.tdee); // because goal is lose
  });
});
