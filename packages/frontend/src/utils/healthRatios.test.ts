import { describe, it, expect } from 'vitest';
import { calculateWhr, calculateWhtr } from './healthRatios';

describe('Cardiometabolic Health Ratios', () => {
  it('calculates Waist-to-Hip Ratio (WHR) for men and women', () => {
    // Male: 92.5cm waist / 101.0cm hips = 0.916 -> 0.92 (Moderate Risk: 0.90 - 0.99)
    const maleWhr = calculateWhr(92.5, 101.0, 'male');
    expect(maleWhr?.value).toBe(0.92);
    expect(maleWhr?.category).toBe('moderate_risk');

    // Male: 82cm waist / 100cm hips = 0.82 (Low Risk: < 0.90)
    const maleLean = calculateWhr(82, 100, 'male');
    expect(maleLean?.value).toBe(0.82);
    expect(maleLean?.category).toBe('low_risk');

    // Female: 75cm waist / 90cm hips = 0.83 (Low Risk: < 0.85)
    const femaleLean = calculateWhr(75, 90, 'female');
    expect(femaleLean?.value).toBe(0.83);
    expect(femaleLean?.category).toBe('low_risk');
  });

  it('calculates Waist-to-Height Ratio (WHtR) against universal gold standard', () => {
    // 92.5cm waist / 178cm height = 0.5197 -> 0.52 (Moderate Risk: 0.50 - 0.59)
    const res = calculateWhtr(92.5, 178);
    expect(res?.value).toBe(0.52);
    expect(res?.category).toBe('moderate_risk');

    // 80cm waist / 178cm height = 0.449 -> 0.45 (Ideal: < 0.50)
    const lean = calculateWhtr(80, 178);
    expect(lean?.value).toBe(0.45);
    expect(lean?.category).toBe('low_risk');
    expect(lean?.categoryLabel).toContain('Healthy');
  });

  it('returns null for missing or invalid values', () => {
    expect(calculateWhr(0, 100)).toBeNull();
    expect(calculateWhtr(80, 0)).toBeNull();
  });
});
