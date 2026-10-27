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

/** Display a weight value in the user's preferred unit */
export function displayWeight(kg: number, unit: 'metric' | 'imperial'): number {
  return unit === 'imperial' ? parseFloat(kgToLbs(kg).toFixed(2)) : parseFloat(kg.toFixed(2));
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
  return unit === 'imperial' ? parseFloat(cmToInches(cm).toFixed(2)) : parseFloat(cm.toFixed(2));
}

/** Get the unit label for length measurements */
export function lengthUnit(unit: 'metric' | 'imperial'): string {
  return unit === 'imperial' ? 'in' : 'cm';
}
