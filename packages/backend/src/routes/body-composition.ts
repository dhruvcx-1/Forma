import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';
import {
  navyBodyFatMale,
  navyBodyFatFemale,
  calculateBMI,
  bmiCategory,
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
   * Computes:
   *  - Body fat % using US Navy Method (if sufficient measurements available)
   *  - BMI (if height and latest weight available)
   *
   * Returns all available estimates with formula descriptions.
   */
  fastify.get(
    '/api/body-composition',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      // Fetch user settings (sex, height_cm)
      const settingRows = db
        .prepare('SELECT key, value FROM settings WHERE profile_id = ?')
        .all(profileId) as SettingRow[];

      const settings: Record<string, string> = {};
      for (const s of settingRows) settings[s.key] = s.value;

      const sex = settings['sex'] ?? null;
      const heightCmSetting = settings['height_cm'] ? parseFloat(settings['height_cm']) : null;

      // Fetch latest measurements
      const waistCm = getLatestMeasurement(profileId, 'waist');
      const neckCm = getLatestMeasurement(profileId, 'neck');
      const hipsCm = getLatestMeasurement(profileId, 'hips');
      const heightCmMeasurement = getLatestMeasurement(profileId, 'height');

      // Prefer height from measurements, fall back to settings
      const heightCm = heightCmMeasurement ?? heightCmSetting;

      // Fetch latest weight entry
      const latestWeight = db
        .prepare(
          `SELECT value, unit, recorded_at FROM weight_entries
           WHERE profile_id = ? ORDER BY recorded_at DESC LIMIT 1`,
        )
        .get(profileId) as WeightRow | undefined;

      const results: {
        bodyFat: {
          value: number;
          formula: string;
          inputs: Record<string, number | null>;
        } | null;
        bmi: {
          value: number;
          category: string;
          formula: string;
          inputs: Record<string, number | null>;
        } | null;
        availableData: {
          sex: string | null;
          heightCm: number | null;
          waistCm: number | null;
          neckCm: number | null;
          hipsCm: number | null;
          latestWeightKg: number | null;
          latestWeightRecordedAt: string | null;
        };
      } = {
        bodyFat: null,
        bmi: null,
        availableData: {
          sex,
          heightCm,
          waistCm,
          neckCm,
          hipsCm,
          latestWeightKg: latestWeight ? toKg(latestWeight.value, latestWeight.unit) : null,
          latestWeightRecordedAt: latestWeight?.recorded_at ?? null,
        },
      };

      // Body fat estimation
      if (heightCm && waistCm && neckCm) {
        if (sex === 'male') {
          const bf = navyBodyFatMale(waistCm, neckCm, heightCm);
          results.bodyFat = {
            value: bf,
            formula:
              'US Navy Method (Male): 86.010 × log10(waist − neck) − 70.041 × log10(height) + 36.76',
            inputs: { waistCm, neckCm, heightCm, hipsCm: null },
          };
        } else if (sex === 'female' && hipsCm) {
          const bf = navyBodyFatFemale(waistCm, hipsCm, neckCm, heightCm);
          results.bodyFat = {
            value: bf,
            formula:
              'US Navy Method (Female): 163.205 × log10(waist + hips − neck) − 97.684 × log10(height) − 78.387',
            inputs: { waistCm, neckCm, heightCm, hipsCm },
          };
        }
      }

      // BMI
      if (latestWeight && heightCm) {
        const weightKg = toKg(latestWeight.value, latestWeight.unit);
        const bmi = calculateBMI(weightKg, heightCm);
        results.bmi = {
          value: bmi,
          category: bmiCategory(bmi),
          formula: 'BMI = weight(kg) / height(m)²',
          inputs: { weightKg, heightCm },
        };
      }

      return reply.send(results);
    },
  );
};

export default bodyCompositionRoutes;
