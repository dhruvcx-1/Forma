import { describe, it, expect } from 'vitest';
import {
  kgToLbs,
  lbsToKg,
  cmToInches,
  inchesToCm,
  cmToFtIn,
  formatHeight,
  displayWeight,
  displayLength,
  formatWeightWithUnit,
  formatLengthWithUnit,
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

  it('converts cm to feet and inches correctly', () => {
    const ftIn = cmToFtIn(178); // ~70 inches = 5'10"
    expect(ftIn.feet).toBe(5);
    expect(ftIn.inches).toBe(10);
  });

  it('formats height cleanly in metric and imperial', () => {
    expect(formatHeight(178, 'metric')).toBe('178 cm');
    expect(formatHeight(178, 'imperial')).toBe("5′10″");
  });

  it('formats display weight based on selected unit system', () => {
    expect(displayWeight(75, 'metric')).toBe(75);
    expect(displayWeight(75, 'imperial')).toBeCloseTo(165.3, 1);
  });

  it('formats weights and lengths with unit symbols', () => {
    expect(formatWeightWithUnit(70, 'metric')).toBe('70.0 kg');
    expect(formatWeightWithUnit(70, 'imperial')).toBe('154.3 lbs');
    expect(formatLengthWithUnit(80, 'metric')).toBe('80.0 cm');
    expect(formatLengthWithUnit(80, 'imperial')).toBe('31.5 in');
  });

  it('returns correct unit symbols', () => {
    expect(weightUnit('metric')).toBe('kg');
    expect(weightUnit('imperial')).toBe('lbs');
    expect(lengthUnit('metric')).toBe('cm');
    expect(lengthUnit('imperial')).toBe('in');
  });
});
