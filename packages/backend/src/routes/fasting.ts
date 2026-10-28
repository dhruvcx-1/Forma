import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const StartFastSchema = z.object({
  fast_type: z.string().default('16:8'),
  target_duration_hours: z.number().positive().default(16),
  started_at: z.string().optional(),
  notes: z.string().max(500).optional(),
});

const EndFastSchema = z.object({
  ended_at: z.string().optional(),
  notes: z.string().max(500).optional(),
  mood: z.enum(['great', 'good', 'neutral', 'struggling']).optional(),
  status: z.enum(['completed', 'cancelled']).default('completed'),
});

const UpdateActiveFastSchema = z.object({
  started_at: z.string().optional(),
  target_duration_hours: z.number().positive().optional(),
  fast_type: z.string().optional(),
  notes: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Fasting Routes Plugin
// ---------------------------------------------------------------------------

const fastingRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/fasting/active
   * Retrieves the currently active fast for the authenticated profile.
   */
  fastify.get(
    '/api/fasting/active',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;
      const activeFast = db
        .prepare(
          `SELECT * FROM fasting_sessions 
           WHERE profile_id = ? AND status = 'active' 
           ORDER BY started_at DESC LIMIT 1`
        )
        .get(profileId);

      return reply.send({ activeFast: activeFast || null });
    }
  );

  /**
   * POST /api/fasting/start
   * Starts a new fasting session.
   */
  fastify.post(
    '/api/fasting/start',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      // Check if an active fast is already in progress
      const existing = db
        .prepare(
          `SELECT id FROM fasting_sessions WHERE profile_id = ? AND status = 'active'`
        )
        .get(profileId);

      if (existing) {
        return reply.code(409).send({
          error: 'An active fast is already running. End or cancel it first.',
        });
      }

      const result = StartFastSchema.safeParse(request.body || {});
      if (!result.success) {
        return reply.code(400).send({
          error: 'Validation failed',
          issues: result.error.issues,
        });
      }

      const { fast_type, target_duration_hours, started_at, notes } = result.data;
      const startTime = started_at || new Date().toISOString();
      const id = nanoid();

      db.prepare(
        `INSERT INTO fasting_sessions 
         (id, profile_id, fast_type, target_duration_hours, started_at, status, notes)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`
      ).run(id, profileId, fast_type, target_duration_hours, startTime, notes ?? null);

      const created = db
        .prepare(`SELECT * FROM fasting_sessions WHERE id = ?`)
        .get(id);

      return reply.code(201).send(created);
    }
  );

  /**
   * POST /api/fasting/end
   * Completes or cancels the active fast.
   */
  fastify.post(
    '/api/fasting/end',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      const activeFast = db
        .prepare(
          `SELECT * FROM fasting_sessions 
           WHERE profile_id = ? AND status = 'active' 
           ORDER BY started_at DESC LIMIT 1`
        )
        .get(profileId) as any;

      if (!activeFast) {
        return reply.code(404).send({ error: 'No active fast found to complete.' });
      }

      const result = EndFastSchema.safeParse(request.body || {});
      if (!result.success) {
        return reply.code(400).send({
          error: 'Validation failed',
          issues: result.error.issues,
        });
      }

      const { ended_at, notes, mood, status } = result.data;
      const finishTime = ended_at || new Date().toISOString();
      const updatedNotes = notes !== undefined ? notes : activeFast.notes;

      db.prepare(
        `UPDATE fasting_sessions 
         SET ended_at = ?, status = ?, notes = ?, mood = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(finishTime, status, updatedNotes, mood ?? null, activeFast.id);

      const completed = db
        .prepare(`SELECT * FROM fasting_sessions WHERE id = ?`)
        .get(activeFast.id);

      return reply.send(completed);
    }
  );

  /**
   * PATCH /api/fasting/active
   * Updates start time, target duration, or notes on current active fast.
   */
  fastify.patch(
    '/api/fasting/active',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      const activeFast = db
        .prepare(
          `SELECT * FROM fasting_sessions 
           WHERE profile_id = ? AND status = 'active' 
           ORDER BY started_at DESC LIMIT 1`
        )
        .get(profileId) as any;

      if (!activeFast) {
        return reply.code(404).send({ error: 'No active fast found.' });
      }

      const result = UpdateActiveFastSchema.safeParse(request.body || {});
      if (!result.success) {
        return reply.code(400).send({
          error: 'Validation failed',
          issues: result.error.issues,
        });
      }

      const data = result.data;
      const started_at = data.started_at ?? activeFast.started_at;
      const target_duration_hours =
        data.target_duration_hours ?? activeFast.target_duration_hours;
      const fast_type = data.fast_type ?? activeFast.fast_type;
      const notes = data.notes !== undefined ? data.notes : activeFast.notes;

      db.prepare(
        `UPDATE fasting_sessions 
         SET started_at = ?, target_duration_hours = ?, fast_type = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(started_at, target_duration_hours, fast_type, notes, activeFast.id);

      const updated = db
        .prepare(`SELECT * FROM fasting_sessions WHERE id = ?`)
        .get(activeFast.id);

      return reply.send(updated);
    }
  );

  /**
   * DELETE /api/fasting/active
   * Discards the active fast.
   */
  fastify.delete(
    '/api/fasting/active',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;
      db.prepare(
        `DELETE FROM fasting_sessions WHERE profile_id = ? AND status = 'active'`
      ).run(profileId);

      return reply.send({ success: true });
    }
  );

  /**
   * GET /api/fasting/history
   * Returns completed fasting sessions and aggregated stats.
   */
  fastify.get(
    '/api/fasting/history',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      const sessions = db
        .prepare(
          `SELECT * FROM fasting_sessions 
           WHERE profile_id = ? AND status != 'active'
           ORDER BY started_at DESC LIMIT 100`
        )
        .all(profileId) as any[];

      // Calculate statistics
      let totalHoursFasted = 0;
      let longestFastHours = 0;
      let completedCount = 0;

      for (const s of sessions) {
        if (s.ended_at && s.status === 'completed') {
          completedCount += 1;
          const durationHours =
            (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) /
            (1000 * 60 * 60);
          if (durationHours > 0) {
            totalHoursFasted += durationHours;
            if (durationHours > longestFastHours) {
              longestFastHours = durationHours;
            }
          }
        }
      }

      return reply.send({
        sessions,
        stats: {
          totalFasts: sessions.length,
          completedFasts: completedCount,
          totalHoursFasted: Math.round(totalHoursFasted * 10) / 10,
          longestFastHours: Math.round(longestFastHours * 10) / 10,
          averageDurationHours:
            completedCount > 0
              ? Math.round((totalHoursFasted / completedCount) * 10) / 10
              : 0,
        },
      });
    }
  );

  /**
   * DELETE /api/fasting/:id
   * Deletes a specific historical fast session.
   */
  fastify.delete(
    '/api/fasting/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;
      const { id } = request.params as { id: string };

      db.prepare(
        `DELETE FROM fasting_sessions WHERE id = ? AND profile_id = ?`
      ).run(id, profileId);

      return reply.send({ success: true });
    }
  );
};

export default fastingRoutes;
