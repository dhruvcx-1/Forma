/**
 * Unit conversion helpers for weight and length measurements.
 */

/** Convert kilograms to pounds. */
export function kgToLbs(kg: number): number {
  return parseFloat((kg * 2.20462262185).toFixed(4));
}

/** Convert pounds to kilograms. */
export function lbsToKg(lbs: number): number {
  return parseFloat((lbs / 2.20462262185).toFixed(4));
}

/** Convert centimetres to inches. */
export function cmToIn(cm: number): number {
  return parseFloat((cm / 2.54).toFixed(4));
}

/** Convert inches to centimetres. */
export function inToCm(inches: number): number {
  return parseFloat((inches * 2.54).toFixed(4));
}

/**
 * Normalise a weight value to kilograms regardless of the source unit.
 *
 * @param value The numeric weight value
 * @param unit  'kg' or 'lbs'
 */
export function toKg(value: number, unit: string): number {
  return unit === 'lbs' ? lbsToKg(value) : value;
}
