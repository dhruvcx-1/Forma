import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';
import {
  generateMacroPlan,
  type DietType,
  type ActivityLevel,
  type FitnessGoal,
  DIET_CONFIGS,
} from '../utils/nutrition-calculator.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const UpsertPlanSchema = z.object({
  diet_type: z.enum([
    'high_protein_low_carb',
    'keto',
    'balanced',
    'mediterranean',
    'carnivore',
    'custom',
  ]).default('high_protein_low_carb'),
  activity_level: z.enum([
    'sedentary',
    'light',
    'moderate',
    'very_active',
    'extra_active',
  ]).default('moderate'),
  daily_calories: z.number().positive(),
  protein_grams: z.number().nonnegative(),
  carbs_grams: z.number().nonnegative(),
  fat_grams: z.number().nonnegative(),
  protein_pct: z.number().min(0).max(100),
  carbs_pct: z.number().min(0).max(100),
  fat_pct: z.number().min(0).max(100),
});

const UpsertDailyLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  calories: z.number().nonnegative().nullable().optional(),
  protein_grams: z.number().nonnegative().nullable().optional(),
  carbs_grams: z.number().nonnegative().nullable().optional(),
  fat_grams: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserProfileDetails(profileId: string) {
  // 1. Settings (height, sex, dob)
  const settingsRows = db
    .prepare('SELECT key, value FROM settings WHERE profile_id = ?')
    .all(profileId) as Array<{ key: string; value: string }>;

  const settings: Record<string, string> = {};
  for (const row of settingsRows) {
    settings[row.key] = row.value;
  }

  const heightCm = settings.height_cm ? parseFloat(settings.height_cm) : 175;
  const sex = (settings.sex as 'male' | 'female' | 'other') || 'male';

  // Calculate age from date_of_birth if present
  let ageYears = 30;
  if (settings.date_of_birth) {
    const birthYear = new Date(settings.date_of_birth).getFullYear();
    if (!isNaN(birthYear)) {
      ageYears = Math.max(16, new Date().getFullYear() - birthYear);
    }
  }

  // 2. Latest Weight
  const latestWeightRow = db
    .prepare(
      `SELECT value, unit FROM weight_entries 
       WHERE profile_id = ? 
       ORDER BY recorded_at DESC LIMIT 1`
    )
    .get(profileId) as { value: number; unit: string } | undefined;

  let weightKg = 75;
  if (latestWeightRow) {
    weightKg =
      latestWeightRow.unit === 'lbs'
        ? Math.round((latestWeightRow.value / 2.20462) * 10) / 10
        : latestWeightRow.value;
  }

  // 3. Goal
  const goalRow = db
    .prepare(
      `SELECT starting_weight, target_weight FROM goals 
       WHERE profile_id = ? 
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(profileId) as
    | { starting_weight: number | null; target_weight: number | null }
    | undefined;

  let goal: FitnessGoal = 'maintain';
  if (goalRow && goalRow.target_weight && latestWeightRow) {
    if (goalRow.target_weight < latestWeightRow.value - 0.5) {
      goal = 'lose';
    } else if (goalRow.target_weight > latestWeightRow.value + 0.5) {
      goal = 'gain';
    }
  }

  return { heightCm, sex, ageYears, weightKg, goal };
}

// ---------------------------------------------------------------------------
// Route Plugin
// ---------------------------------------------------------------------------

const nutritionRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/nutrition/plan
   * Returns saved plan or auto-generated default (High-Protein / Low-Carb).
   */
  fastify.get(
    '/api/nutrition/plan',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;
      const userDetails = getUserProfileDetails(profileId);

      const savedPlan = db
        .prepare(`SELECT * FROM nutrition_plans WHERE profile_id = ?`)
        .get(profileId) as any;

      // Always calculate current recommended baseline (with >80kg Max Ideal Weight rule)
      const calculated = generateMacroPlan({
        weightKg: userDetails.weightKg,
        heightCm: userDetails.heightCm,
        sex: userDetails.sex,
        ageYears: userDetails.ageYears,
        activityLevel: (savedPlan?.activity_level as ActivityLevel) || 'moderate',
        goal: userDetails.goal,
        dietType: (savedPlan?.diet_type as DietType) || 'high_protein_low_carb',
      });

      return reply.send({
        plan: savedPlan || null,
        calculated,
        userDetails,
        dietConfigs: DIET_CONFIGS,
      });
    }
  );

  /**
   * PUT /api/nutrition/plan
   * Upserts the user's custom or selected nutrition plan.
   */
  fastify.put(
    '/api/nutrition/plan',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;
      const result = UpsertPlanSchema.safeParse(request.body);

      if (!result.success) {
        return reply.code(400).send({
          error: 'Validation failed',
          issues: result.error.issues,
        });
      }

      const d = result.data;
      const id = nanoid();

      db.prepare(
        `INSERT INTO nutrition_plans 
         (id, profile_id, diet_type, activity_level, daily_calories, protein_grams, carbs_grams, fat_grams, protein_pct, carbs_pct, fat_pct, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(profile_id) DO UPDATE SET
           diet_type = excluded.diet_type,
           activity_level = excluded.activity_level,
           daily_calories = excluded.daily_calories,
           protein_grams = excluded.protein_grams,
           carbs_grams = excluded.carbs_grams,
           fat_grams = excluded.fat_grams,
           protein_pct = excluded.protein_pct,
           carbs_pct = excluded.carbs_pct,
           fat_pct = excluded.fat_pct,
           updated_at = datetime('now')`
      ).run(
        id,
        profileId,
        d.diet_type,
        d.activity_level,
        d.daily_calories,
        d.protein_grams,
        d.carbs_grams,
        d.fat_grams,
        d.protein_pct,
        d.carbs_pct,
        d.fat_pct
      );

      const saved = db
        .prepare(`SELECT * FROM nutrition_plans WHERE profile_id = ?`)
        .get(profileId);

      return reply.send(saved);
    }
  );

  /**
   * GET /api/nutrition/logs
   * Retrieves daily nutrition intake logs.
   */
  fastify.get(
    '/api/nutrition/logs',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;
      const { from, to, date } = request.query as {
        from?: string;
        to?: string;
        date?: string;
      };

      if (date) {
        const log = db
          .prepare(
            `SELECT * FROM daily_nutrition_logs WHERE profile_id = ? AND date = ?`
          )
          .get(profileId, date);
        return reply.send({ log: log || null });
      }

      let query = `SELECT * FROM daily_nutrition_logs WHERE profile_id = ?`;
      const params: any[] = [profileId];

      if (from) {
        query += ` AND date >= ?`;
        params.push(from);
      }
      if (to) {
        query += ` AND date <= ?`;
        params.push(to);
      }

      query += ` ORDER BY date DESC LIMIT 60`;

      const logs = db.prepare(query).all(...params);
      return reply.send({ logs });
    }
  );

  /**
   * POST /api/nutrition/logs
   * Upserts a daily nutrition log.
   */
  fastify.post(
    '/api/nutrition/logs',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;
      const result = UpsertDailyLogSchema.safeParse(request.body);

      if (!result.success) {
        return reply.code(400).send({
          error: 'Validation failed',
          issues: result.error.issues,
        });
      }

      const { date, calories, protein_grams, carbs_grams, fat_grams, notes } =
        result.data;
      const id = nanoid();

      db.prepare(
        `INSERT INTO daily_nutrition_logs 
         (id, profile_id, date, calories, protein_grams, carbs_grams, fat_grams, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(profile_id, date) DO UPDATE SET
           calories = excluded.calories,
           protein_grams = excluded.protein_grams,
           carbs_grams = excluded.carbs_grams,
           fat_grams = excluded.fat_grams,
           notes = excluded.notes,
           updated_at = datetime('now')`
      ).run(
        id,
        profileId,
        date,
        calories ?? null,
        protein_grams ?? null,
        carbs_grams ?? null,
        fat_grams ?? null,
        notes ?? null
      );

      const saved = db
        .prepare(
          `SELECT * FROM daily_nutrition_logs WHERE profile_id = ? AND date = ?`
        )
        .get(profileId, date);

      return reply.send(saved);
    }
  );
};

export default nutritionRoutes;
