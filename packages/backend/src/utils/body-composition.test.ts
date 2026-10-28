import { describe, it, expect } from 'vitest';
import {
  navyBodyFatMale,
  navyBodyFatFemale,
  calculateBMI,
  bmiCategory,
  getHealthyWeightRange,
  deurenbergBodyFat,
  calculateLBM,
  calculateWHtR,
  calculateWHR,
  calculateChestToWaist,
  calculateBMR,
  calculateTDEE,
  calculateTBW,
  calculateSymmetry,
} from './body-composition.js';

describe('US Navy Body Fat & BMI Calculations', () => {
  it('calculates male body fat with reasonable outputs', () => {
    // 178 cm height, 84 cm waist, 38 cm neck
    const bf = navyBodyFatMale(84, 38, 178);
    expect(bf).toBeGreaterThan(10);
    expect(bf).toBeLessThan(25);
  });

  it('calculates female body fat with reasonable outputs', () => {
    // 165 cm height, 72 cm waist, 98 cm hips, 34 cm neck
    const bf = navyBodyFatFemale(72, 98, 34, 165);
    expect(bf).toBeGreaterThan(18);
    expect(bf).toBeLessThan(35);
  });

  it('calculates BMI accurately', () => {
    // 70 kg, 175 cm (1.75m) -> 70 / (1.75 * 1.75) ≈ 22.9
    const bmi = calculateBMI(70, 175);
    expect(bmi).toBeCloseTo(22.9, 1);
    expect(bmiCategory(bmi)).toBe('Normal weight');
  });

  it('categorizes BMI according to WHO standards', () => {
    expect(bmiCategory(17.5)).toBe('Underweight');
    expect(bmiCategory(22.0)).toBe('Normal weight');
    expect(bmiCategory(27.0)).toBe('Overweight');
    expect(bmiCategory(32.0)).toBe('Obese');
  });

  it('computes healthy weight range according to BMI 18.5 - 24.9', () => {
    const range = getHealthyWeightRange(180);
    // 1.8 * 1.8 = 3.24
    // 18.5 * 3.24 = 59.94 -> 59.9
    // 24.9 * 3.24 = 80.67 -> 80.7
    expect(range.minKg).toBeCloseTo(59.9, 1);
    expect(range.maxKg).toBeCloseTo(80.7, 1);
  });

  it('estimates Deurenberg body fat from BMI, age, and sex', () => {
    const bfMale = deurenbergBodyFat(24, 30, 'male');
    const bfFemale = deurenbergBodyFat(24, 30, 'female');
    expect(bfMale).toBeGreaterThan(10);
    expect(bfFemale).toBeGreaterThan(bfMale);
  });

  it('computes lean mass and fat mass split', () => {
    const lbm = calculateLBM(80, 20); // 80kg at 20% fat
    expect(lbm.fatMassKg).toBe(16);
    expect(lbm.leanMassKg).toBe(64);
  });

  it('computes Waist-to-Height Ratio (WHtR) and identifies risk', () => {
    const healthy = calculateWHtR(80, 180);
    expect(healthy.ratio).toBe(0.44);
    expect(healthy.category).toContain('Healthy');

    const highRisk = calculateWHtR(110, 170);
    expect(highRisk.ratio).toBe(0.65);
    expect(highRisk.category).toContain('High Risk');
  });

  it('computes Waist-to-Hip Ratio (WHR)', () => {
    const whrMale = calculateWHR(85, 100, 'male');
    expect(whrMale.ratio).toBe(0.85);
    expect(whrMale.category).toContain('Normal');
  });

  it('calculates chest to waist ratio', () => {
    const ratio = calculateChestToWaist(104, 80);
    expect(ratio).toBe(1.3);
  });

  it('computes Mifflin-St Jeor BMR and TDEE calorie needs', () => {
    const bmr = calculateBMR(75, 178, 28, 'male');
    expect(bmr).toBeGreaterThan(1600);
    expect(bmr).toBeLessThan(1900);

    const tdee = calculateTDEE(bmr);
    expect(tdee.sedentary).toBeGreaterThan(bmr);
    expect(tdee.moderate).toBeGreaterThan(tdee.sedentary);
  });

  it('computes Watson Total Body Water in Liters', () => {
    const tbw = calculateTBW(75, 178, 28, 'male');
    expect(tbw).toBeGreaterThan(35);
    expect(tbw).toBeLessThan(55);
  });

  it('evaluates limb symmetry', () => {
    const balanced = calculateSymmetry(35.5, 36.0);
    expect(balanced.diff).toBe(0.5);
    expect(balanced.balanced).toBe(true);

    const imbalanced = calculateSymmetry(35.0, 37.5);
    expect(imbalanced.diff).toBe(2.5);
    expect(imbalanced.balanced).toBe(false);
  });
});
