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

  /**
   * GET /api/fasting/widget-token
   * Retrieves or creates the profile's secure widget token.
   */
  fastify.get(
    '/api/fasting/widget-token',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;
      let row = db
        .prepare('SELECT value FROM settings WHERE profile_id = ? AND key = ?')
        .get(profileId, 'fasting_widget_token') as { value: string } | undefined;

      if (!row) {
        const token = 'fwt_' + nanoid(24);
        db.prepare(
          'INSERT INTO settings (id, profile_id, key, value) VALUES (?, ?, ?, ?)'
        ).run(nanoid(), profileId, 'fasting_widget_token', token);
        row = { value: token };
      }

      return reply.send({ token: row.value });
    }
  );

  /**
   * POST /api/fasting/widget-token/regenerate
   * Regenerates a new widget token, revoking the previous one.
   */
  fastify.post(
    '/api/fasting/widget-token/regenerate',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;
      const newToken = 'fwt_' + nanoid(24);

      const existing = db
        .prepare('SELECT id FROM settings WHERE profile_id = ? AND key = ?')
        .get(profileId, 'fasting_widget_token') as { id: string } | undefined;

      if (existing) {
        db.prepare(
          "UPDATE settings SET value = ? WHERE id = ?"
        ).run(newToken, existing.id);
      } else {
        db.prepare(
          'INSERT INTO settings (id, profile_id, key, value) VALUES (?, ?, ?, ?)'
        ).run(nanoid(), profileId, 'fasting_widget_token', newToken);
      }

      return reply.send({ token: newToken });
    }
  );

  /**
   * GET /api/public/fasting/widget
   * Public unauthenticated endpoint for external widgets, iframes, and JSON clients.
   */
  fastify.get('/api/public/fasting/widget', async (request, reply) => {
    const { token, username } = request.query as { token?: string; username?: string };

    const STAGES = [
      { id: 1, minHours: 0, maxHours: 4, name: 'Fed & Anabolic State', tagline: 'Digestion & Nutrient Absorption', color: '#3b82f6' },
      { id: 2, minHours: 4, maxHours: 8, name: 'Post-Absorptive State', tagline: 'Blood Sugar Normalization', color: '#06b6d4' },
      { id: 3, minHours: 8, maxHours: 12, name: 'Early Fat Burning', tagline: 'Glycogen Depletion Commences', color: '#10b981' },
      { id: 4, minHours: 12, maxHours: 16, name: 'The Metabolic Switch', tagline: 'Fat Oxidation & Early Ketones', color: '#eab308' },
      { id: 5, minHours: 16, maxHours: 24, name: 'Deep Ketosis & Autophagy', tagline: 'Cellular Cleansing & Recycling', color: '#f97316' },
      { id: 6, minHours: 24, maxHours: 48, name: 'Peak Autophagy & HGH Surge', tagline: 'Deep Repair & Renewal', color: '#a855f7' },
      { id: 7, minHours: 48, maxHours: 999999, name: 'Stem Cell & Immune Reset', tagline: 'Immune System Regeneration', color: '#ec4899' },
    ];

    let profile: { id: string; username: string; display_name: string | null } | undefined;

    if (token) {
      const setting = db
        .prepare(
          "SELECT s.profile_id, p.username, p.display_name FROM settings s JOIN profiles p ON p.id = s.profile_id WHERE s.key = 'fasting_widget_token' AND s.value = ?"
        )
        .get(token) as { profile_id: string; username: string; display_name: string | null } | undefined;

      if (setting) {
        profile = { id: setting.profile_id, username: setting.username, display_name: setting.display_name };
      }
    } else if (username) {
      const clean = username.replace(/^@/, '').trim();
      const p = db
        .prepare(
          'SELECT id, username, display_name FROM profiles WHERE LOWER(username) = LOWER(?) AND is_public = 1'
        )
        .get(clean) as { id: string; username: string; display_name: string | null } | undefined;
      if (p) profile = p;
    }

    if (!profile) {
      return reply.code(404).send({ error: 'Widget not found or invalid token' });
    }

    const activeFast = db
      .prepare(
        "SELECT * FROM fasting_sessions WHERE profile_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1"
      )
      .get(profile.id) as {
        id: string;
        fast_type: string;
        target_duration_hours: number;
        started_at: string;
      } | undefined;

    if (!activeFast) {
      return reply.send({
        active: false,
        profile: {
          username: profile.username,
          display_name: profile.display_name,
        },
        fast: null,
      });
    }

    const nowMs = Date.now();
    const startMs = new Date(activeFast.started_at).getTime();
    const elapsedMs = Math.max(0, nowMs - startMs);
    const elapsedSecs = Math.floor(elapsedMs / 1000);
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    const targetHours = Number(activeFast.target_duration_hours);
    const remainingHours = Math.max(0, targetHours - elapsedHours);
    const remainingSecs = Math.max(0, Math.floor(remainingHours * 3600));
    const progressPercent = Math.min(100, Math.round((elapsedHours / targetHours) * 100));

    let currentStage = STAGES[STAGES.length - 1];
    for (const s of STAGES) {
      if (elapsedHours >= s.minHours && elapsedHours < s.maxHours) {
        currentStage = s;
        break;
      }
    }

    return reply.send({
      active: true,
      profile: {
        username: profile.username,
        display_name: profile.display_name,
      },
      fast: {
        id: activeFast.id,
        fast_type: activeFast.fast_type,
        target_duration_hours: targetHours,
        started_at: activeFast.started_at,
        elapsed_seconds: elapsedSecs,
        elapsed_hours: Math.round(elapsedHours * 100) / 100,
        remaining_seconds: remainingSecs,
        remaining_hours: Math.round(remainingHours * 100) / 100,
        progress_percent: progressPercent,
        is_goal_reached: elapsedHours >= targetHours,
        stage: currentStage,
      },
    });
  });
};

export default fastingRoutes;
