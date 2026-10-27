import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const UpsertGoalSchema = z.object({
  starting_weight: z.number().positive().optional(),
  startWeight: z.number().positive().optional(),
  starting_weight_unit: z.enum(['kg', 'lbs']).optional(),
  target_weight: z.number().positive().optional(),
  targetWeight: z.number().positive().optional(),
  target_weight_unit: z.enum(['kg', 'lbs']).optional(),
  target_date: z.string().optional(),
  targetDate: z.string().optional(),
  notes: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoalRow {
  id: string;
  profile_id: string;
  starting_weight: number | null;
  starting_weight_unit: string;
  target_weight: number | null;
  target_weight_unit: string;
  target_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const goalsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/goals
   * Returns the current goal for the authenticated profile, or null.
   */
  const getGoalHandler = async (request: any, reply: any) => {
    const profileId = request.profile!.id;

    const goal = db
      .prepare('SELECT * FROM goals WHERE profile_id = ? ORDER BY updated_at DESC LIMIT 1')
      .get(profileId) as GoalRow | undefined;

    if (!goal) return reply.send(null);

    return reply.send({
      ...goal,
      startWeight: goal.starting_weight,
      targetWeight: goal.target_weight,
      targetDate: goal.target_date,
      isActive: true,
    });
  };

  fastify.get('/api/goals', { preHandler: requireAuth }, getGoalHandler);
  fastify.get('/api/goals/active', { preHandler: requireAuth }, getGoalHandler);

  /**
   * POST /api/goals
   * Upsert the goal for the authenticated profile.
   * If a goal already exists, it is updated. Otherwise a new one is created.
   */
  fastify.post(
    '/api/goals',
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = UpsertGoalSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: result.error.issues });
      }

      const profileId = request.profile!.id;
      const data = result.data;

      const existing = db
        .prepare('SELECT id FROM goals WHERE profile_id = ?')
        .get(profileId) as { id: string } | undefined;

      const startW = data.starting_weight ?? data.startWeight;
      const targetW = data.target_weight ?? data.targetWeight;
      const targetD = data.target_date ?? data.targetDate;

      if (existing) {
        // Update existing goal
        db.prepare(
          `UPDATE goals SET
             starting_weight = COALESCE(?, starting_weight),
             starting_weight_unit = COALESCE(?, starting_weight_unit),
             target_weight = COALESCE(?, target_weight),
             target_weight_unit = COALESCE(?, target_weight_unit),
             target_date = COALESCE(?, target_date),
             notes = COALESCE(?, notes),
             updated_at = datetime('now')
           WHERE id = ?`,
        ).run(
          startW ?? null,
          data.starting_weight_unit ?? null,
          targetW ?? null,
          data.target_weight_unit ?? null,
          targetD ?? null,
          data.notes ?? null,
          existing.id,
        );

        const updated = db.prepare('SELECT * FROM goals WHERE id = ?').get(existing.id) as GoalRow;
        return reply.send({
          ...updated,
          startWeight: updated.starting_weight,
          targetWeight: updated.target_weight,
          targetDate: updated.target_date,
          isActive: true,
        });
      } else {
        // Create new goal
        const id = nanoid();
        db.prepare(
          `INSERT INTO goals (id, profile_id, starting_weight, starting_weight_unit, target_weight, target_weight_unit, target_date, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          profileId,
          startW ?? null,
          data.starting_weight_unit ?? 'kg',
          targetW ?? null,
          data.target_weight_unit ?? 'kg',
          targetD ?? null,
          data.notes ?? null,
        );

        const created = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow;
        return reply.code(201).send({
          ...created,
          startWeight: created.starting_weight,
          targetWeight: created.target_weight,
          targetDate: created.target_date,
          isActive: true,
        });
      }
    },
  );
};

export default goalsRoutes;
