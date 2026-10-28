import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';
import {
  navyBodyFatMale,
  navyBodyFatFemale,
  calculateBMI,
  bmiCategory,
  getHealthyWeightRange,
  deurenbergBodyFat,
  calculateLBM,
  calculateWHtR,
  calculateWHR,
  calculateChestToWaist,
  calculateBMR,
  calculateTDEE,
  calculateTBW,
  calculateSymmetry,
} from '../utils/body-composition.js';
import { toKg } from '../utils/units.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettingRow { key: string; value: string }
interface WeightRow { value: number; unit: string; recorded_at: string }
interface MeasurementRow { value: number; recorded_at: string }

// ---------------------------------------------------------------------------
// Helper — look up the latest measurement value for a definition slug
// ---------------------------------------------------------------------------

function getLatestMeasurement(
  profileId: string,
  slug: string,
): number | null {
  const row = db
    .prepare(
      `SELECT me.value FROM measurement_entries me
       JOIN measurement_definitions md ON md.id = me.definition_id
       WHERE me.profile_id = ? AND md.slug = ?
       ORDER BY me.recorded_at DESC
       LIMIT 1`,
    )
    .get(profileId, slug) as MeasurementRow | undefined;

  return row ? row.value : null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const bodyCompositionRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/body-composition
   *
   * Computes comprehensive anthropometric health analytics:
   *  - Current BMI, WHO category, healthy weight range & distance
   *  - BMI history series (automatically backfilled across all weight entries)
   *  - Body Fat % (US Navy method and Deurenberg BMI-based estimation)
   *  - Body Fat % history timeline
   *  - Lean Body Mass (LBM) vs. Fat Mass split
   *  - Cardiometabolic ratios (WHtR, WHR, Chest-to-Waist)
   *  - Energy expenditure (Mifflin-St Jeor BMR, TDEE maintenance calories)
   *  - Watson Total Body Water (TBW) in Liters
   *  - Left vs. Right limb symmetry
   *  - Next unlocks guide
   */
  fastify.get(
    '/api/body-composition',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      // 1. Fetch user settings (sex, height_cm, date_of_birth, unit_system)
      const settingRows = db
        .prepare('SELECT key, value FROM settings WHERE profile_id = ?')
        .all(profileId) as SettingRow[];

      const settings: Record<string, string> = {};
      for (const s of settingRows) settings[s.key] = s.value;

      const sex = settings['sex'] ?? null;
      const heightCmSetting = settings['height_cm'] ? parseFloat(settings['height_cm']) : null;
      const unitSystem = (settings['unit_system'] as 'metric' | 'imperial') || 'metric';

      // Calculate age in years
      let ageYears = 30; // sensible default if DOB not provided
      if (settings['date_of_birth']) {
        const birthDate = new Date(settings['date_of_birth']);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        if (age >= 10 && age <= 120) {
          ageYears = age;
        }
      }

      // 2. Fetch latest measurements
      const waistCm = getLatestMeasurement(profileId, 'waist');
      const neckCm = getLatestMeasurement(profileId, 'neck');
      const hipsCm = getLatestMeasurement(profileId, 'hips');
      const chestCm = getLatestMeasurement(profileId, 'chest');
      const heightCmMeasurement = getLatestMeasurement(profileId, 'height');

      // Limbs
      const leftArm = getLatestMeasurement(profileId, 'left_upper_arm');
      const rightArm = getLatestMeasurement(profileId, 'right_upper_arm');
      const leftForearm = getLatestMeasurement(profileId, 'left_forearm');
      const rightForearm = getLatestMeasurement(profileId, 'right_forearm');
      const leftThigh = getLatestMeasurement(profileId, 'left_thigh');
      const rightThigh = getLatestMeasurement(profileId, 'right_thigh');
      const leftCalf = getLatestMeasurement(profileId, 'left_calf');
      const rightCalf = getLatestMeasurement(profileId, 'right_calf');

      // Prefer height from measurements, fall back to settings
      const heightCm = heightCmMeasurement ?? heightCmSetting;

      // 3. Fetch all weight entries ordered chronologically
      const weightRows = db
        .prepare(
          `SELECT value, unit, recorded_at FROM weight_entries
           WHERE profile_id = ? ORDER BY recorded_at ASC`,
        )
        .all(profileId) as WeightRow[];

      const latestWeight = weightRows[weightRows.length - 1];
      const latestWeightKg = latestWeight ? toKg(latestWeight.value, latestWeight.unit) : null;

      // 4. Build BMI History Series
      const bmiHistory: Array<{
        date: string;
        weightKg: number;
        bmi: number;
        category: string;
      }> = [];

      if (heightCm && heightCm > 0) {
        for (const w of weightRows) {
          const wKg = toKg(w.value, w.unit);
          const bmiVal = calculateBMI(wKg, heightCm);
          bmiHistory.push({
            date: w.recorded_at,
            weightKg: parseFloat(wKg.toFixed(2)),
            bmi: bmiVal,
            category: bmiCategory(bmiVal),
          });
        }
      }

      // 5. Current BMI & Healthy Weight Range
      let currentBmiData: {
        value: number;
        category: string;
        healthyWeightRangeKg: { minKg: number; maxKg: number };
        distanceToNormalKg: number;
        change7d: number | null;
        change30d: number | null;
        formula: string;
        inputs: { weightKg: number; heightCm: number };
      } | null = null;

      if (latestWeightKg && heightCm && heightCm > 0) {
        const bmiVal = calculateBMI(latestWeightKg, heightCm);
        const healthyRange = getHealthyWeightRange(heightCm);

        let distanceToNormalKg = 0;
        if (latestWeightKg > healthyRange.maxKg) {
          distanceToNormalKg = parseFloat((latestWeightKg - healthyRange.maxKg).toFixed(1));
        } else if (latestWeightKg < healthyRange.minKg) {
          distanceToNormalKg = parseFloat((latestWeightKg - healthyRange.minKg).toFixed(1));
        }

        // Calculate 7D & 30D changes
        let change7d: number | null = null;
        let change30d: number | null = null;

        if (bmiHistory.length > 1) {
          const nowTime = new Date().getTime();
          const day7Ago = nowTime - 7 * 24 * 60 * 60 * 1000;
          const day30Ago = nowTime - 30 * 24 * 60 * 60 * 1000;

          // Find closest entries before 7d / 30d
          for (let i = bmiHistory.length - 2; i >= 0; i--) {
            const entryTime = new Date(bmiHistory[i].date).getTime();
            if (change7d === null && entryTime <= day7Ago) {
              change7d = parseFloat((bmiVal - bmiHistory[i].bmi).toFixed(1));
            }
            if (change30d === null && entryTime <= day30Ago) {
              change30d = parseFloat((bmiVal - bmiHistory[i].bmi).toFixed(1));
            }
          }
        }

        currentBmiData = {
          value: bmiVal,
          category: bmiCategory(bmiVal),
          healthyWeightRangeKg: healthyRange,
          distanceToNormalKg,
          change7d,
          change30d,
          formula: 'BMI = weight(kg) / height(m)²',
          inputs: { weightKg: latestWeightKg, heightCm },
        };
      }

      // 6. Body Fat Estimates (US Navy + Deurenberg)
      let navyBf: number | null = null;
      let navyFormula = '';

      if (heightCm && waistCm && neckCm) {
        if (sex === 'male') {
          navyBf = navyBodyFatMale(waistCm, neckCm, heightCm);
          navyFormula = 'US Navy Method (Male): 86.010 × log10(waist − neck) − 70.041 × log10(height) + 36.76';
        } else if (sex === 'female' && hipsCm) {
          navyBf = navyBodyFatFemale(waistCm, hipsCm, neckCm, heightCm);
          navyFormula = 'US Navy Method (Female): 163.205 × log10(waist + hips − neck) − 97.684 × log10(height) − 78.387';
        }
      }

      let deurenbergBf: number | null = null;
      if (currentBmiData) {
        deurenbergBf = deurenbergBodyFat(currentBmiData.value, ageYears, sex);
      }

      const preferredBf = navyBf ?? deurenbergBf;
      let leanMassKg: number | null = null;
      let fatMassKg: number | null = null;

      if (latestWeightKg && preferredBf !== null) {
        const lbm = calculateLBM(latestWeightKg, preferredBf);
        leanMassKg = lbm.leanMassKg;
        fatMassKg = lbm.fatMassKg;
      }

      // 7. Body Fat History Timeline (based on historical measurements or weight entries)
      const bodyFatHistory: Array<{ date: string; value: number; method: 'navy' | 'deurenberg' }> = [];
      if (heightCm) {
        // If we have waist & neck measurement history:
        const circumferenceRows = db
          .prepare(
            `SELECT me.recorded_at, me.value, md.slug
             FROM measurement_entries me
             JOIN measurement_definitions md ON md.id = me.definition_id
             WHERE me.profile_id = ? AND md.slug IN ('waist', 'neck', 'hips')
             ORDER BY me.recorded_at ASC`,
          )
          .all(profileId) as Array<{ recorded_at: string; value: number; slug: string }>;

        const entriesByDate = new Map<string, Record<string, number>>();
        for (const row of circumferenceRows) {
          if (!entriesByDate.has(row.recorded_at)) {
            entriesByDate.set(row.recorded_at, {});
          }
          entriesByDate.get(row.recorded_at)![row.slug] = row.value;
        }

        for (const [date, values] of entriesByDate.entries()) {
          if (values.waist && values.neck) {
            if (sex === 'male') {
              const val = navyBodyFatMale(values.waist, values.neck, heightCm);
              bodyFatHistory.push({ date, value: val, method: 'navy' });
            } else if (sex === 'female' && values.hips) {
              const val = navyBodyFatFemale(values.waist, values.hips, values.neck, heightCm);
              bodyFatHistory.push({ date, value: val, method: 'navy' });
            }
          }
        }

        // If no Navy points exist yet but we have weight history, populate with Deurenberg points
        if (bodyFatHistory.length === 0 && bmiHistory.length > 0) {
          for (const b of bmiHistory) {
            bodyFatHistory.push({
              date: b.date,
              value: deurenbergBodyFat(b.bmi, ageYears, sex),
              method: 'deurenberg',
            });
          }
        }
      }

      // 8. Cardiometabolic Ratios
      const whtr = waistCm && heightCm ? calculateWHtR(waistCm, heightCm) : null;
      const whr = waistCm && hipsCm ? calculateWHR(waistCm, hipsCm, sex) : null;
      const chestToWaist = chestCm && waistCm ? calculateChestToWaist(chestCm, waistCm) : null;

      // 9. Metabolism & Energy Expenditure
      let bmr: number | null = null;
      let tdee: { sedentary: number; light: number; moderate: number; active: number } | null = null;
      let waterLiters: number | null = null;

      if (latestWeightKg && heightCm) {
        bmr = calculateBMR(latestWeightKg, heightCm, ageYears, sex);
        tdee = calculateTDEE(bmr);
        waterLiters = calculateTBW(latestWeightKg, heightCm, ageYears, sex);
      }

      // 10. Limb Symmetry
      const symmetry = {
        arms: leftArm && rightArm ? calculateSymmetry(leftArm, rightArm) : null,
        forearms: leftForearm && rightForearm ? calculateSymmetry(leftForearm, rightForearm) : null,
        thighs: leftThigh && rightThigh ? calculateSymmetry(leftThigh, rightThigh) : null,
        calves: leftCalf && rightCalf ? calculateSymmetry(leftCalf, rightCalf) : null,
      };

      // 11. What unlocks next
      const nextUnlocks: Array<{ metric: string; missing: string[] }> = [];
      if (!heightCm) {
        nextUnlocks.push({ metric: 'BMI & Body Fat History', missing: ['Height'] });
      }
      if (!waistCm || !neckCm) {
        nextUnlocks.push({ metric: 'US Navy Body Fat %', missing: ['Waist', 'Neck'] });
      }
      if (sex === 'female' && !hipsCm) {
        nextUnlocks.push({ metric: 'Female US Navy Body Fat %', missing: ['Hips'] });
      }
      if (!chestCm || !waistCm) {
        nextUnlocks.push({ metric: 'Chest-to-Waist (V-Taper)', missing: ['Chest'] });
      }
      if ((!leftArm || !rightArm) && (!leftThigh || !rightThigh)) {
        nextUnlocks.push({ metric: 'Limb Symmetry Balance', missing: ['Left & Right Upper Arm / Thigh'] });
      }

      return reply.send({
        bmi: currentBmiData,
        bmiHistory,
        bodyFat: preferredBf !== null ? {
          navy: navyBf !== null ? { value: navyBf, formula: navyFormula } : null,
          deurenberg: deurenbergBf !== null ? { value: deurenbergBf, formula: 'Deurenberg: 1.2 × BMI + 0.23 × Age − 10.8 × Sex − 5.4' } : null,
          preferredValue: preferredBf,
          category: preferredBf < (sex === 'female' ? 21 : 14) ? 'Athletic' : preferredBf < (sex === 'female' ? 25 : 18) ? 'Fitness' : preferredBf < (sex === 'female' ? 32 : 25) ? 'Average' : 'High',
          leanMassKg,
          fatMassKg,
        } : null,
        bodyFatHistory,
        metabolism: bmr !== null ? {
          bmr,
          tdee,
          waterLiters,
        } : null,
        ratios: {
          whtr,
          whr,
          chestToWaist,
        },
        symmetry,
        availableData: {
          sex,
          ageYears,
          heightCm,
          waistCm,
          neckCm,
          hipsCm,
          chestCm,
          latestWeightKg,
          latestWeightRecordedAt: latestWeight?.recorded_at ?? null,
          unitSystem,
        },
        nextUnlocks,
      });
    },
  );
};

export default bodyCompositionRoutes;
