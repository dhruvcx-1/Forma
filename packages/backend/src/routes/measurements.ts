import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CreateDefinitionSchema = z.object({
  name: z.string().min(1).max(64),
  unit: z.string().min(1).max(16),
});

const CreateEntrySchema = z.object({
  definition_id: z.string().optional(),
  definitionId: z.union([z.string(), z.number()]).optional(),
  value: z.number(),
  recorded_at: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().max(500).optional(),
});

const BatchCreateSchema = z.union([
  z.object({
    entries: z.array(CreateEntrySchema).min(1).max(50),
  }),
  z.array(CreateEntrySchema).min(1).max(50),
]);

const UpdateEntrySchema = z.object({
  value: z.number().optional(),
  recorded_at: z.string().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const ListEntriesQuerySchema = z.object({
  definition_id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DefinitionRow {
  id: string;
  profile_id: string | null;
  name: string;
  slug: string;
  unit: string;
  is_system: number;
  display_order: number;
  created_at: string;
}

interface EntryRow {
  id: string;
  profile_id: string;
  definition_id: string;
  value: number;
  recorded_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helper: slugify a name
// ---------------------------------------------------------------------------
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const measurementsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/measurements/definitions
   * Returns system definitions plus custom definitions for the authenticated profile.
   */
  fastify.get(
    '/api/measurements/definitions',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      const definitions = db
        .prepare(
          `SELECT * FROM measurement_definitions
           WHERE is_system = 1 OR profile_id = ?
           ORDER BY is_system DESC, display_order ASC, name ASC`,
        )
        .all(profileId) as DefinitionRow[];

      return reply.send(definitions);
    },
  );

  /**
   * POST /api/measurements/definitions
   * Create a custom measurement definition.
   */
  fastify.post(
    '/api/measurements/definitions',
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = CreateDefinitionSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: result.error.issues });
      }

      const { name, unit } = result.data;
      const profileId = request.profile!.id;
      const slug = slugify(name);
      const id = nanoid();

      // Determine display_order (put after last custom definition for this profile)
      const maxOrder = (
        db
          .prepare(
            `SELECT COALESCE(MAX(display_order), 100) as max_order FROM measurement_definitions WHERE profile_id = ?`,
          )
          .get(profileId) as { max_order: number }
      ).max_order;

      db.prepare(
        `INSERT INTO measurement_definitions (id, profile_id, name, slug, unit, is_system, display_order)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
      ).run(id, profileId, name, slug, unit, maxOrder + 1);

      const definition = db
        .prepare('SELECT * FROM measurement_definitions WHERE id = ?')
        .get(id) as DefinitionRow;

      return reply.code(201).send(definition);
    },
  );

  /**
   * DELETE /api/measurements/definitions/:id
   * Only custom (non-system) definitions owned by the profile can be deleted.
   */
  fastify.delete(
    '/api/measurements/definitions/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const profileId = request.profile!.id;

      const def = db
        .prepare('SELECT * FROM measurement_definitions WHERE id = ?')
        .get(id) as DefinitionRow | undefined;

      if (!def) {
        return reply.code(404).send({ error: 'Definition not found' });
      }

      if (def.is_system) {
        return reply.code(403).send({ error: 'Cannot delete system measurement definitions' });
      }

      if (def.profile_id !== profileId) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      db.prepare('DELETE FROM measurement_definitions WHERE id = ?').run(id);
      return reply.send({ ok: true });
    },
  );

  /**
   * GET /api/measurements/entries
   * List measurement entries, optionally filtered by definition_id and date range.
   */
  fastify.get(
    '/api/measurements/entries',
    { preHandler: requireAuth },
    async (request, reply) => {
      const qResult = ListEntriesQuerySchema.safeParse(request.query);
      if (!qResult.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: qResult.error.issues });
      }

      const { definition_id, from, to } = qResult.data;
      const profileId = request.profile!.id;

      let sql = `
        SELECT me.*, md.name, md.slug, md.unit, md.is_system, md.display_order
        FROM measurement_entries me
        LEFT JOIN measurement_definitions md ON md.id = me.definition_id
        WHERE me.profile_id = ?
      `;
      const params: (string | number)[] = [profileId];

      if (definition_id) { sql += ` AND me.definition_id = ?`; params.push(definition_id); }
      if (from) { sql += ` AND me.recorded_at >= ?`; params.push(from); }
      if (to) { sql += ` AND me.recorded_at <= ?`; params.push(to); }

      sql += ` ORDER BY me.recorded_at DESC`;

      const rows = db.prepare(sql).all(...params) as any[];
      const entries = rows.map((r) => ({
        ...r,
        date: (r.recorded_at || '').split('T')[0],
        definitionId: r.definition_id,
        definition: {
          id: r.definition_id,
          name: r.name,
          slug: r.slug,
          unit: r.unit,
        },
      }));
      return reply.send(entries);
    },
  );

  /**
   * GET /api/measurements/entries/latest
   * Returns the latest value for each definition available to the profile.
   */
  fastify.get(
    '/api/measurements/entries/latest',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      const latest = db
        .prepare(
          `SELECT me.*, md.name as definition_name, md.slug, md.unit as definition_unit
           FROM measurement_entries me
           JOIN measurement_definitions md ON md.id = me.definition_id
           WHERE me.profile_id = ?
             AND me.recorded_at = (
               SELECT MAX(me2.recorded_at)
               FROM measurement_entries me2
               WHERE me2.profile_id = me.profile_id
                 AND me2.definition_id = me.definition_id
             )
           ORDER BY md.display_order ASC, md.name ASC`,
        )
        .all(profileId);

      return reply.send(latest);
    },
  );

  /**
   * POST /api/measurements/entries
   * Batch-create measurement entries.
   */
  fastify.post(
    '/api/measurements/entries',
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = BatchCreateSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: result.error.issues });
      }

      const profileId = request.profile!.id;
      const rawEntries = Array.isArray(result.data) ? result.data : result.data.entries;

      const insertStmt = db.prepare(
        `INSERT INTO measurement_entries (id, profile_id, definition_id, value, recorded_at, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );

      const created: any[] = [];

      const insertAll = db.transaction(() => {
        for (const entry of rawEntries) {
          const defId = String(entry.definition_id ?? entry.definitionId);
          const recAt = (entry.recorded_at ?? entry.date ?? new Date().toISOString()).split('T')[0];

          // Verify the definition belongs to the profile or is a system one
          const def = db
            .prepare(
              `SELECT id FROM measurement_definitions
               WHERE id = ? AND (is_system = 1 OR profile_id = ?)`,
            )
            .get(defId, profileId);

          if (!def) {
            throw Object.assign(new Error(`Definition not found: ${defId}`), {
              statusCode: 404,
            });
          }

          const id = nanoid();
          insertStmt.run(
            id,
            profileId,
            defId,
            entry.value,
            recAt,
            entry.notes ?? null,
          );

          const row = db
            .prepare('SELECT * FROM measurement_entries WHERE id = ?')
            .get(id) as any;
          created.push({
            ...row,
            date: (row.recorded_at || '').split('T')[0],
            definitionId: row.definition_id,
          });
        }
      });

      try {
        insertAll();
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string };
        return reply
          .code(e.statusCode ?? 500)
          .send({ error: e.message ?? 'Internal error' });
      }

      return reply.code(201).send(created);
    },
  );

  /**
   * PUT /api/measurements/entries/:id
   */
  fastify.put(
    '/api/measurements/entries/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const profileId = request.profile!.id;

      const existing = db
        .prepare('SELECT * FROM measurement_entries WHERE id = ? AND profile_id = ?')
        .get(id, profileId) as EntryRow | undefined;

      if (!existing) {
        return reply.code(404).send({ error: 'Entry not found' });
      }

      const result = UpdateEntrySchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: result.error.issues });
      }

      const updates = result.data;

      db.prepare(
        `UPDATE measurement_entries SET
           value = COALESCE(?, value),
           recorded_at = COALESCE(?, recorded_at),
           notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END,
           updated_at = datetime('now')
         WHERE id = ? AND profile_id = ?`,
      ).run(
        updates.value ?? null,
        updates.recorded_at ?? null,
        updates.notes !== undefined ? 1 : null,
        updates.notes ?? null,
        id,
        profileId,
      );

      const updated = db
        .prepare('SELECT * FROM measurement_entries WHERE id = ?')
        .get(id) as EntryRow;

      return reply.send(updated);
    },
  );

  /**
   * DELETE /api/measurements/entries/:id
   */
  fastify.delete(
    '/api/measurements/entries/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const profileId = request.profile!.id;

      const result = db
        .prepare('DELETE FROM measurement_entries WHERE id = ? AND profile_id = ?')
        .run(id, profileId);

      if (result.changes === 0) {
        return reply.code(404).send({ error: 'Entry not found' });
      }

      return reply.send({ ok: true });
    },
  );
};

export default measurementsRoutes;
