import { describe, it, expect } from 'vitest';
import { INITIAL_ONBOARDING_DATA, type OnboardingData } from './types';

describe('Onboarding Wizard Data & Validations', () => {
  it('initializes with sensible default configuration', () => {
    expect(INITIAL_ONBOARDING_DATA.sex).toBe('male');
    expect(INITIAL_ONBOARDING_DATA.unitSystem).toBe('metric');
    expect(INITIAL_ONBOARDING_DATA.heightCm).toBe(175);
    expect(INITIAL_ONBOARDING_DATA.weightValue).toBe(75);
    expect(INITIAL_ONBOARDING_DATA.weightUnit).toBe('kg');
    expect(INITIAL_ONBOARDING_DATA.goalType).toBe('maintain');
  });

  it('validates account step credentials', () => {
    const isStep1Valid = (d: OnboardingData) => {
      const u = d.username.trim();
      return (
        u.length >= 3 &&
        /^[a-zA-Z0-9_-]+$/.test(u) &&
        d.password.length >= 8 &&
        d.password === d.confirmPassword
      );
    };

    const invalidShortUser = {
      ...INITIAL_ONBOARDING_DATA,
      username: 'ab',
      password: 'password123',
      confirmPassword: 'password123',
    };
    expect(isStep1Valid(invalidShortUser)).toBe(false);

    const invalidMismatch = {
      ...INITIAL_ONBOARDING_DATA,
      username: 'validuser',
      password: 'password123',
      confirmPassword: 'differentpassword',
    };
    expect(isStep1Valid(invalidMismatch)).toBe(false);

    const validAccount = {
      ...INITIAL_ONBOARDING_DATA,
      username: 'valid_user',
      password: 'password123',
      confirmPassword: 'password123',
    };
    expect(isStep1Valid(validAccount)).toBe(true);
  });

  it('validates height and weight bounds', () => {
    const isHeightValid = (cm: number | null) => cm !== null && cm >= 50 && cm <= 270;
    const isWeightValid = (val: number | null) => val !== null && val >= 20 && val <= 500;

    expect(isHeightValid(175)).toBe(true);
    expect(isHeightValid(20)).toBe(false);
    expect(isHeightValid(300)).toBe(false);
    expect(isHeightValid(null)).toBe(false);

    expect(isWeightValid(75)).toBe(true);
    expect(isWeightValid(10)).toBe(false);
    expect(isWeightValid(600)).toBe(false);
    expect(isWeightValid(null)).toBe(false);
  });
});
