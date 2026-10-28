/** Unit conversion utilities for Forma */

/** Convert kg to lbs */
export function kgToLbs(kg: number): number {
  return kg * 2.20462;
}

/** Convert lbs to kg */
export function lbsToKg(lbs: number): number {
  return lbs / 2.20462;
}

/** Convert cm to inches */
export function cmToInches(cm: number): number {
  return cm / 2.54;
}

/** Convert inches to cm */
export function inchesToCm(inches: number): number {
  return inches * 2.54;
}

/** Convert cm to feet and inches */
export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet, inches };
}

/** Format height cleanly according to unit system */
export function formatHeight(cm: number, unit: 'metric' | 'imperial'): string {
  if (!cm || cm <= 0) return '—';
  if (unit === 'imperial') {
    const { feet, inches } = cmToFtIn(cm);
    return `${feet}′${inches}″`;
  }
  return `${Math.round(cm)} cm`;
}

/** Display a weight value in the user's preferred unit */
export function displayWeight(kg: number, unit: 'metric' | 'imperial'): number {
  return unit === 'imperial' ? parseFloat(kgToLbs(kg).toFixed(1)) : parseFloat(kg.toFixed(1));
}

/** Format weight with unit symbol */
export function formatWeightWithUnit(kg: number, unit: 'metric' | 'imperial'): string {
  if (kg === null || kg === undefined || isNaN(kg)) return '—';
  const val = displayWeight(kg, unit);
  return `${val.toFixed(1)} ${weightUnit(unit)}`;
}

/** Convert a display weight back to kg for storage */
export function toKg(value: number, unit: 'metric' | 'imperial'): number {
  return unit === 'imperial' ? lbsToKg(value) : value;
}

/** Get the unit label for weight */
export function weightUnit(unit: 'metric' | 'imperial'): string {
  return unit === 'imperial' ? 'lbs' : 'kg';
}

/** Display a length value in the user's preferred unit */
export function displayLength(cm: number, unit: 'metric' | 'imperial'): number {
  return unit === 'imperial' ? parseFloat(cmToInches(cm).toFixed(1)) : parseFloat(cm.toFixed(1));
}

/** Format length with unit symbol */
export function formatLengthWithUnit(cm: number, unit: 'metric' | 'imperial'): string {
  if (cm === null || cm === undefined || isNaN(cm)) return '—';
  const val = displayLength(cm, unit);
  return `${val.toFixed(1)} ${lengthUnit(unit)}`;
}

/** Get the unit label for length measurements */
export function lengthUnit(unit: 'metric' | 'imperial'): string {
  return unit === 'imperial' ? 'in' : 'cm';
}
