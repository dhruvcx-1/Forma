import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';
import { toKg } from '../utils/units.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const WeightEntrySchema = z.object({
  value: z.number().positive().optional(),
  weight: z.number().positive().optional(),
  unit: z.enum(['kg', 'lbs']).default('kg'),
  recorded_at: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().max(500).optional(),
}).refine((data) => data.value !== undefined || data.weight !== undefined, {
  message: 'Must provide either value or weight',
}).refine((data) => data.recorded_at !== undefined || data.date !== undefined, {
  message: 'Must provide either recorded_at or date',
});

const WeightUpdateSchema = z.object({
  value: z.number().positive().optional(),
  weight: z.number().positive().optional(),
  unit: z.enum(['kg', 'lbs']).optional(),
  recorded_at: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const WeightQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  offset: z.coerce.number().int().min(0).default(0),
  paginate: z.enum(['true', 'false', '1', '0']).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WeightRow {
  id: string;
  profile_id: string;
  value: number;
  unit: string;
  recorded_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const weightRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/weight
   * Paginated list of weight entries for the authenticated profile.
   */
  fastify.get(
    '/api/weight',
    { preHandler: requireAuth },
    async (request, reply) => {
      const qResult = WeightQuerySchema.safeParse(request.query);
      if (!qResult.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: qResult.error.issues });
      }

      const { from, to, limit, offset } = qResult.data;
      const profileId = request.profile!.id;

      let sql = `SELECT * FROM weight_entries WHERE profile_id = ?`;
      const params: (string | number)[] = [profileId];

      if (from) { sql += ` AND recorded_at >= ?`; params.push(from); }
      if (to) { sql += ` AND recorded_at <= ?`; params.push(to); }

      const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
      const total = (db.prepare(countSql).get(...params) as { count: number }).count;

      sql += ` ORDER BY recorded_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const entries = (db.prepare(sql).all(...params) as WeightRow[]).map((e) => ({
        ...e,
        date: e.recorded_at.split('T')[0],
        weight: toKg(e.value, e.unit),
      }));

      if (qResult.data.paginate === 'true' || qResult.data.paginate === '1') {
        return reply.send({ entries, total, limit, offset });
      }
      return reply.send(entries);
    },
  );

  /**
   * GET /api/weight/stats
   * Aggregate statistics over all weight entries.
   */
  fastify.get(
    '/api/weight/stats',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      const entries = db
        .prepare(
          `SELECT value, unit, recorded_at FROM weight_entries
           WHERE profile_id = ? ORDER BY recorded_at ASC`,
        )
        .all(profileId) as Array<{ value: number; unit: string; recorded_at: string }>;

      if (entries.length === 0) {
        return reply.send({
          currentWeight: null,
          startingWeight: null,
          totalChange: null,
          percentChange: null,
          weeklyAvg: null,
          trend: null,
        });
      }

      // Normalise everything to kg for calculations
      const normalised = entries.map((e) => ({
        valueKg: toKg(e.value, e.unit),
        recorded_at: e.recorded_at,
      }));

      const first = normalised[0];
      const last = normalised[normalised.length - 1];

      const totalChange = parseFloat((last.valueKg - first.valueKg).toFixed(2));
      const percentChange = parseFloat(
        (((last.valueKg - first.valueKg) / first.valueKg) * 100).toFixed(2),
      );

      // Weekly average: group by ISO week, average values per week
      const weekMap = new Map<string, number[]>();
      for (const e of normalised) {
        const d = new Date(e.recorded_at);
        const week = `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, '0')}`;
        const bucket = weekMap.get(week) ?? [];
        bucket.push(e.valueKg);
        weekMap.set(week, bucket);
      }
      const weeklyAvgs = [...weekMap.values()].map(
        (vals) => vals.reduce((a, b) => a + b, 0) / vals.length,
      );
      const weeklyAvg =
        weeklyAvgs.length > 0
          ? parseFloat((weeklyAvgs.reduce((a, b) => a + b, 0) / weeklyAvgs.length).toFixed(2))
          : null;

      // Trend: simple linear regression slope (kg per day)
      let trend: number | null = null;
      if (normalised.length >= 2) {
        const t0 = new Date(first.recorded_at).getTime();
        const points = normalised.map((e) => ({
          x: (new Date(e.recorded_at).getTime() - t0) / 86_400_000, // days
          y: e.valueKg,
        }));
        const n = points.length;
        const sumX = points.reduce((a, p) => a + p.x, 0);
        const sumY = points.reduce((a, p) => a + p.y, 0);
        const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
        const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
        const denom = n * sumX2 - sumX * sumX;
        trend = denom !== 0 ? parseFloat(((n * sumXY - sumX * sumY) / denom).toFixed(4)) : 0;
      }

      return reply.send({
        currentWeight: { value: last.valueKg, unit: 'kg', recorded_at: last.recorded_at },
        startingWeight: { value: first.valueKg, unit: 'kg', recorded_at: first.recorded_at },
        totalChange,
        percentChange,
        weeklyAvg,
        trend,
      });
    },
  );

  /**
   * POST /api/weight
   * Create a new weight entry.
   */
  fastify.post(
    '/api/weight',
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = WeightEntrySchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: result.error.issues });
      }

      const val = result.data.value ?? result.data.weight!;
      const unit = result.data.unit ?? 'kg';
      const recorded_at = (result.data.recorded_at ?? result.data.date!).split('T')[0];
      const notes = result.data.notes;
      const profileId = request.profile!.id;

      // Check for duplicate date
      const existing = db
        .prepare('SELECT * FROM weight_entries WHERE profile_id = ? AND recorded_at = ?')
        .get(profileId, recorded_at) as WeightRow | undefined;

      if (existing) {
        return reply.code(409).send({ error: 'Entry already exists for this date', existing });
      }

      const id = nanoid();
      db.prepare(
        `INSERT INTO weight_entries (id, profile_id, value, unit, recorded_at, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, profileId, val, unit, recorded_at, notes ?? null);

      const entry = db.prepare('SELECT * FROM weight_entries WHERE id = ?').get(id) as WeightRow;
      return reply.code(201).send({
        ...entry,
        date: entry.recorded_at.split('T')[0],
        weight: toKg(entry.value, entry.unit),
      });
    },
  );

  /**
   * PUT /api/weight/:id
   * Update an existing weight entry.
   */
  fastify.put(
    '/api/weight/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const profileId = request.profile!.id;

      const existing = db
        .prepare('SELECT * FROM weight_entries WHERE id = ? AND profile_id = ?')
        .get(id, profileId) as WeightRow | undefined;

      if (!existing) {
        return reply.code(404).send({ error: 'Entry not found' });
      }

      const result = WeightUpdateSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: result.error.issues });
      }

      const updates = result.data;

      // Check date uniqueness if changing recorded_at
      if (updates.recorded_at && updates.recorded_at !== existing.recorded_at) {
        const conflict = db
          .prepare('SELECT id FROM weight_entries WHERE profile_id = ? AND recorded_at = ? AND id != ?')
          .get(profileId, updates.recorded_at, id);
        if (conflict) {
          return reply.code(409).send({ error: 'Another entry already exists for this date' });
        }
      }

      db.prepare(
        `UPDATE weight_entries SET
           value = COALESCE(?, value),
           unit = COALESCE(?, unit),
           recorded_at = COALESCE(?, recorded_at),
           notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END,
           updated_at = datetime('now')
         WHERE id = ? AND profile_id = ?`,
      ).run(
        updates.value ?? null,
        updates.unit ?? null,
        updates.recorded_at ?? null,
        updates.notes !== undefined ? 1 : null,
        updates.notes ?? null,
        id,
        profileId,
      );

      const updated = db.prepare('SELECT * FROM weight_entries WHERE id = ?').get(id) as WeightRow;
      return reply.send(updated);
    },
  );

  /**
   * DELETE /api/weight/:id
   */
  fastify.delete(
    '/api/weight/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const profileId = request.profile!.id;

      const result = db
        .prepare('DELETE FROM weight_entries WHERE id = ? AND profile_id = ?')
        .run(id, profileId);

      if (result.changes === 0) {
        return reply.code(404).send({ error: 'Entry not found' });
      }

      return reply.send({ ok: true });
    },
  );
};

// ---------------------------------------------------------------------------
// ISO week helper (avoids heavy dependency for a single use)
// ---------------------------------------------------------------------------
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default weightRoutes;
