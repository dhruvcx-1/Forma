import { describe, it, expect } from 'vitest';
import {
  navyBodyFatMale,
  navyBodyFatFemale,
  calculateBMI,
  bmiCategory,
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
});
