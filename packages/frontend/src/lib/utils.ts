import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

/** Merge Tailwind class names safely */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format an ISO date string for display */
export function formatDate(dateStr: string, fmt = 'MMM d, yyyy'): string {
  try {
    return format(parseISO(dateStr), fmt);
  } catch {
    return dateStr;
  }
}

/** Format an ISO date/time string with full seconds display when available */
export function formatDateTime(dateStr: string, fmt = 'MMM d, yyyy · h:mm:ss a'): string {
  try {
    if (!dateStr) return '';
    // If only date string YYYY-MM-DD without time
    if (dateStr.length === 10 && !dateStr.includes('T')) {
      return format(parseISO(dateStr), 'MMM d, yyyy');
    }
    return format(parseISO(dateStr), fmt);
  } catch {
    return dateStr;
  }
}

/** Format a date as relative time (e.g., "3 days ago") */
export function formatRelative(dateStr: string): string {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

/** Format a weight value with unit */
export function formatWeight(kg: number, unit: 'metric' | 'imperial'): string {
  if (unit === 'imperial') {
    const lbs = kg * 2.20462;
    return `${lbs.toFixed(1)} lbs`;
  }
  return `${kg.toFixed(1)} kg`;
}

/** Format a change value with +/- sign */
export function formatChange(value: number, decimals = 1): string {
  if (value > 0) return `+${value.toFixed(decimals)}`;
  return value.toFixed(decimals);
}

/** Compute moving average of an array */
export function movingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / window;
  });
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Format a number as a percentage */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/** Generate today's date as ISO string YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** Check if prefers-reduced-motion */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
