export interface FastingStage {
  id: number;
  minHours: number;
  maxHours: number;
  name: string;
  tagline: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  iconName: string;
  description: string;
  cellularEffects: string[];
}

export const FASTING_STAGES: FastingStage[] = [
  {
    id: 1,
    minHours: 0,
    maxHours: 4,
    name: 'Fed & Anabolic State',
    tagline: 'Digestion & Nutrient Absorption',
    color: '#3b82f6', // blue
    badgeBg: 'bg-blue-500/15',
    badgeText: 'text-blue-500',
    iconName: 'Apple',
    description:
      'Your body is actively processing and absorbing nutrients from your last meal. Blood glucose and circulating insulin levels are elevated.',
    cellularEffects: [
      'Insulin promotes nutrient uptake in muscle and adipose tissue',
      'Excess glucose converted and stored as liver and muscle glycogen',
      'Digestive enzymes and gastrointestinal tract actively engaged',
    ],
  },
  {
    id: 2,
    minHours: 4,
    maxHours: 8,
    name: 'Post-Absorptive State',
    tagline: 'Blood Sugar Normalization',
    color: '#06b6d4', // cyan
    badgeBg: 'bg-cyan-500/15',
    badgeText: 'text-cyan-500',
    iconName: 'Activity',
    description:
      'Nutrient absorption winds down. Blood glucose gradually settles back to baseline and insulin secretion drops significantly.',
    cellularEffects: [
      'Stomach completes digestive emptying',
      'Pancreas reduces insulin and begins basal glucagon signaling',
      'Liver glycogenolysis initiates to maintain steady blood glucose',
    ],
  },
  {
    id: 3,
    minHours: 8,
    maxHours: 12,
    name: 'Early Fat Burning',
    tagline: 'Glycogen Depletion Commences',
    color: '#10b981', // emerald
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-500',
    iconName: 'Flame',
    description:
      'Your digestive system enjoys total physiological rest. Liver glycogen stores decline steadily, priming your metabolism to mobilize stored triglycerides.',
    cellularEffects: [
      'Low insulin removes inhibition on adipose lipolysis',
      'Free fatty acids begin circulating for peripheral tissue fuel',
      'Gastrointestinal lining initiates routine cellular maintenance',
    ],
  },
  {
    id: 4,
    minHours: 12,
    maxHours: 16,
    name: 'The Metabolic Switch',
    tagline: 'Accelerated Fat Oxidation & Early Ketones',
    color: '#eab308', // amber
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-500',
    iconName: 'Zap',
    description:
      'The hallmark of daily 16:8 intermittent fasting. Liver glycogen is depleted by over 75%, forcing cells to flip the metabolic switch to fat oxidation.',
    cellularEffects: [
      'Liver begins synthesizing ketone bodies (acetoacetate & BHB)',
      'AMPK (cellular master fuel sensor) activates',
      'Early upregulation of autophagy housekeeping genes begins',
    ],
  },
  {
    id: 5,
    minHours: 16,
    maxHours: 24,
    name: 'Deep Ketosis & Autophagy',
    tagline: 'Active Cellular Cleansing',
    color: '#f97316', // orange
    badgeBg: 'bg-orange-500/15',
    badgeText: 'text-orange-500',
    iconName: 'Sparkles',
    description:
      'Reaching 16–24 hours (OMAD zone) triggers deep nutritional ketosis. Cells encapsulate and break down damaged proteins, misfolded aggregates, and dysfunctional mitochondria.',
    cellularEffects: [
      'Autophagy surges: cells digest senescent debris for energy',
      'Blood ketones rise, fueling brain neurons with clean energy',
      'mTOR pathway suppressed, prioritizing survival and cellular repair',
    ],
  },
  {
    id: 6,
    minHours: 24,
    maxHours: 48,
    name: 'Peak Autophagy & HGH Surge',
    tagline: 'Extended Fasting: Muscle Preservation & Renewal',
    color: '#8b5cf6', // violet
    badgeBg: 'bg-violet-500/15',
    badgeText: 'text-violet-500',
    iconName: 'Shield',
    description:
      'In extended 24–48 hour fasts, Human Growth Hormone (HGH) surges up to 5x baseline levels to protect lean muscle tissue while autophagy operates at high capacity.',
    cellularEffects: [
      'HGH elevation spares lean muscle mass while mobilizing visceral fat',
      'Intense clearing of senescent ("zombie") cells across multiple tissues',
      'Inflammatory biomarkers (CRP, TNF-α) significantly decline',
    ],
  },
  {
    id: 7,
    minHours: 48,
    maxHours: 168,
    name: 'Stem Cell & Immune Reset',
    tagline: 'Deep Cellular Rejuvenation (72h+)',
    color: '#ec4899', // pink
    badgeBg: 'bg-pink-500/15',
    badgeText: 'text-pink-500',
    iconName: 'HeartPulse',
    description:
      'Prolonged fasting past 48–72 hours signals the recycling of old, damaged white blood cells. Upon refeeding, hematopoietic stem cells activate to regenerate a refreshed immune system.',
    cellularEffects: [
      'Breakdown of damaged immune cells primes stem cell regeneration',
      'Profound insulin resistance reset and cellular sensitivity restoration',
      'Maximal systemic autophagy and oxidative stress mitigation',
    ],
  },
];

export interface StageProgress {
  currentStage: FastingStage;
  nextStage: FastingStage | null;
  hoursInCurrentStage: number;
  hoursToNextStage: number | null;
  stageProgressPct: number;
  totalElapsedHours: number;
}

export function getFastingStage(elapsedHours: number): StageProgress {
  const hours = Math.max(0, elapsedHours);

  let currentStage = FASTING_STAGES[0];
  let nextStage: FastingStage | null = FASTING_STAGES[1] || null;

  for (let i = 0; i < FASTING_STAGES.length; i++) {
    const s = FASTING_STAGES[i];
    if (hours >= s.minHours && hours < s.maxHours) {
      currentStage = s;
      nextStage = FASTING_STAGES[i + 1] || null;
      break;
    }
  }

  // If beyond 72h, stay in Stage 7
  if (hours >= FASTING_STAGES[FASTING_STAGES.length - 1].minHours) {
    currentStage = FASTING_STAGES[FASTING_STAGES.length - 1];
    nextStage = null;
  }

  const hoursInCurrentStage = hours - currentStage.minHours;
  const stageDuration = currentStage.maxHours - currentStage.minHours;
  const stageProgressPct = Math.min(
    100,
    Math.round((hoursInCurrentStage / stageDuration) * 100)
  );

  const hoursToNextStage = nextStage ? Math.max(0, currentStage.maxHours - hours) : null;

  return {
    currentStage,
    nextStage,
    hoursInCurrentStage: Math.round(hoursInCurrentStage * 10) / 10,
    hoursToNextStage: hoursToNextStage !== null ? Math.round(hoursToNextStage * 10) / 10 : null,
    stageProgressPct,
    totalElapsedHours: Math.round(hours * 10) / 10,
  };
}
