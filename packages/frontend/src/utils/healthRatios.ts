/**
 * Health Ratios Utility
 * Implements clinical calculations for Waist-to-Hip Ratio (WHR) and
 * Waist-to-Height Ratio (WHtR) according to WHO and clinical standards.
 */

export interface RatioResult {
  value: number;
  category: 'low_risk' | 'moderate_risk' | 'high_risk';
  categoryLabel: string;
  badgeBg: string;
  badgeText: string;
  description: string;
}

/**
 * Calculates Waist-to-Hip Ratio (WHR)
 * WHO Guidelines:
 * Men:
 *   < 0.90: Low Risk
 *   0.90 - 0.99: Moderate Risk
 *   >= 1.00: High Risk
 * Women:
 *   < 0.85: Low Risk
 *   0.85 - 0.89: Moderate Risk
 *   >= 0.90: High Risk
 */
export function calculateWhr(
  waistCm: number,
  hipsCm: number,
  sex: 'male' | 'female' | 'other' = 'male'
): RatioResult | null {
  if (!waistCm || !hipsCm || waistCm <= 0 || hipsCm <= 0) return null;

  const whr = Math.round((waistCm / hipsCm) * 100) / 100;
  const isFemale = sex === 'female';

  if (isFemale) {
    if (whr < 0.85) {
      return {
        value: whr,
        category: 'low_risk',
        categoryLabel: 'Low Risk',
        badgeBg: 'bg-emerald-500/15',
        badgeText: 'text-emerald-500',
        description: 'Optimal waist-to-hip ratio associated with low cardiovascular risk.',
      };
    } else if (whr <= 0.89) {
      return {
        value: whr,
        category: 'moderate_risk',
        categoryLabel: 'Moderate Risk',
        badgeBg: 'bg-amber-500/15',
        badgeText: 'text-amber-500',
        description: 'Moderate abdominal fat distribution; lifestyle modifications recommended.',
      };
    } else {
      return {
        value: whr,
        category: 'high_risk',
        categoryLabel: 'Elevated Risk',
        badgeBg: 'bg-rose-500/15',
        badgeText: 'text-rose-500',
        description: 'Elevated visceral fat accumulation associated with cardiometabolic risk.',
      };
    }
  }

  // Male / Other
  if (whr < 0.90) {
    return {
      value: whr,
      category: 'low_risk',
      categoryLabel: 'Low Risk',
      badgeBg: 'bg-emerald-500/15',
      badgeText: 'text-emerald-500',
      description: 'Optimal waist-to-hip ratio associated with healthy abdominal fat distribution.',
    };
  } else if (whr <= 0.99) {
    return {
      value: whr,
      category: 'moderate_risk',
      categoryLabel: 'Moderate Risk',
      badgeBg: 'bg-amber-500/15',
      badgeText: 'text-amber-500',
      description: 'Moderate abdominal fat distribution; steady fat loss will improve profile.',
    };
  } else {
    return {
      value: whr,
      category: 'high_risk',
      categoryLabel: 'Elevated Risk',
      badgeBg: 'bg-rose-500/15',
      badgeText: 'text-rose-500',
      description: 'Elevated visceral fat accumulation; fat loss in waist is prioritized.',
    };
  }
}

/**
 * Calculates Waist-to-Height Ratio (WHtR)
 * Universal Rule: "Keep your waist to less than half your height"
 *   < 0.40: Underweight
 *   0.40 - 0.49: Healthy / Low Risk (Waist < 50% of height)
 *   0.50 - 0.59: Increased Risk (Waist 50-60% of height)
 *   >= 0.60: Substantially Increased Risk
 */
export function calculateWhtr(
  waistCm: number,
  heightCm: number
): RatioResult | null {
  if (!waistCm || !heightCm || waistCm <= 0 || heightCm <= 0) return null;

  const whtr = Math.round((waistCm / heightCm) * 100) / 100;

  if (whtr < 0.40) {
    return {
      value: whtr,
      category: 'low_risk',
      categoryLabel: 'Very Lean',
      badgeBg: 'bg-blue-500/15',
      badgeText: 'text-blue-500',
      description: 'Waist circumference is significantly below 40% of height.',
    };
  } else if (whtr <= 0.49) {
    return {
      value: whtr,
      category: 'low_risk',
      categoryLabel: 'Healthy (Ideal)',
      badgeBg: 'bg-emerald-500/15',
      badgeText: 'text-emerald-500',
      description: 'Optimal: Waist is less than half your height (clinical gold standard).',
    };
  } else if (whtr <= 0.59) {
    return {
      value: whtr,
      category: 'moderate_risk',
      categoryLabel: 'Increased Risk',
      badgeBg: 'bg-amber-500/15',
      badgeText: 'text-amber-500',
      description: 'Waist exceeds half of height; reducing waist circumference will lower risk.',
    };
  } else {
    return {
      value: whtr,
      category: 'high_risk',
      categoryLabel: 'High Risk',
      badgeBg: 'bg-rose-500/15',
      badgeText: 'text-rose-500',
      description: 'Waist exceeds 60% of height; significant visceral adiposity present.',
    };
  }
}
