import { describe, it, expect } from 'vitest';
import { kgToLbs, lbsToKg, cmToIn, inToCm, toKg } from './units.js';

describe('Backend Unit Conversions', () => {
  it('converts kg to lbs accurately', () => {
    expect(kgToLbs(1)).toBeCloseTo(2.2046, 3);
    expect(kgToLbs(70)).toBeCloseTo(154.32, 1);
  });

  it('converts lbs to kg accurately', () => {
    expect(lbsToKg(154.32)).toBeCloseTo(70, 0);
  });

  it('converts cm to inches accurately', () => {
    expect(cmToIn(2.54)).toBeCloseTo(1, 4);
    expect(cmToIn(178)).toBeCloseTo(70.08, 1);
  });

  it('converts inches to cm accurately', () => {
    expect(inToCm(1)).toBeCloseTo(2.54, 4);
  });

  it('normalizes toKg based on unit string', () => {
    expect(toKg(80, 'kg')).toBe(80);
    expect(toKg(176.37, 'lbs')).toBeCloseTo(80, 0);
  });
});
