export type OnboardingMode = 'setup' | 'register';

export type SexOption = 'male' | 'female' | 'other';
export type UnitSystem = 'metric' | 'imperial';
export type GoalType = 'lose' | 'maintain' | 'gain';

export interface OnboardingData {
  // Step 1: Account
  username: string;
  password: string;
  confirmPassword: string;

  // Step 2: Name
  displayName: string;

  // Step 3: Gender / Biological Sex
  sex: SexOption;

  // Step 4: Height
  unitSystem: UnitSystem;
  heightCm: number | null;
  heightFt: number | null;
  heightIn: number | null;

  // Step 5: Current Weight
  weightValue: number | null;
  weightUnit: 'kg' | 'lbs';

  // Step 6: Goal
  goalType: GoalType;
  targetWeight: number | null;
  targetDate?: string;
}

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  username: '',
  password: '',
  confirmPassword: '',
  displayName: '',
  sex: 'male',
  unitSystem: 'metric',
  heightCm: 175,
  heightFt: 5,
  heightIn: 9,
  weightValue: 75,
  weightUnit: 'kg',
  goalType: 'maintain',
  targetWeight: null,
  targetDate: '',
};
