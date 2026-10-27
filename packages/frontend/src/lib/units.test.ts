import { describe, it, expect } from 'vitest';
import {
  kgToLbs,
  lbsToKg,
  cmToInches,
  inchesToCm,
  displayWeight,
  displayLength,
  weightUnit,
  lengthUnit,
} from './units';

describe('Frontend Unit Conversion Helpers', () => {
  it('converts weight between metric and imperial', () => {
    expect(kgToLbs(100)).toBeCloseTo(220.46, 1);
    expect(lbsToKg(220.462)).toBeCloseTo(100, 1);
  });

  it('converts lengths between cm and inches', () => {
    expect(cmToInches(25.4)).toBeCloseTo(10, 1);
    expect(inchesToCm(10)).toBeCloseTo(25.4, 1);
  });

  it('formats display weight based on selected unit system', () => {
    expect(displayWeight(75, 'metric')).toBe(75);
    expect(displayWeight(75, 'imperial')).toBeCloseTo(165.35, 1);
  });

  it('formats display length based on selected unit system', () => {
    expect(displayLength(80, 'metric')).toBe(80);
    expect(displayLength(80, 'imperial')).toBeCloseTo(31.5, 1);
  });

  it('returns correct unit symbols', () => {
    expect(weightUnit('metric')).toBe('kg');
    expect(weightUnit('imperial')).toBe('lbs');
    expect(lengthUnit('metric')).toBe('cm');
    expect(lengthUnit('imperial')).toBe('in');
  });
});
