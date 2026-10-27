import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';

// ---------------------------------------------------------------------------
// Types
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

interface DefinitionRow {
  id: string;
  name: string;
  slug: string;
  unit: string;
  is_system: number;
  profile_id: string | null;
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

interface PhotoRow {
  id: string;
  profile_id: string;
  filename: string;
  original_name: string;
  view_type: string;
  recorded_at: string;
  notes: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Import Zod schema
// ---------------------------------------------------------------------------

const ImportWeightEntrySchema = z.object({
  recorded_at: z.string(),
  value: z.number(),
  unit: z.enum(['kg', 'lbs']).default('kg'),
  notes: z.string().optional(),
});

const ImportMeasurementEntrySchema = z.object({
  definition_id: z.string(),
  recorded_at: z.string(),
  value: z.number(),
  notes: z.string().optional(),
});

const ImportGoalSchema = z.object({
  starting_weight: z.number().optional(),
  starting_weight_unit: z.enum(['kg', 'lbs']).optional(),
  target_weight: z.number().optional(),
  target_weight_unit: z.enum(['kg', 'lbs']).optional(),
  target_date: z.string().optional(),
  notes: z.string().optional(),
});

const ImportSchema = z.object({
  weight_entries: z.array(ImportWeightEntrySchema).optional().default([]),
  measurement_entries: z.array(ImportMeasurementEntrySchema).optional().default([]),
  goals: z.array(ImportGoalSchema).optional().default([]),
});

// ---------------------------------------------------------------------------
// CSV escape helper
// ---------------------------------------------------------------------------

function csvEscape(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(...cols: (string | number | null | undefined)[]): string {
  return cols.map(csvEscape).join(',');
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const dataRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/export/json
   * Full JSON export of all profile data.
   */
  fastify.get(
    '/api/export/json',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      const weight_entries = db
        .prepare('SELECT * FROM weight_entries WHERE profile_id = ? ORDER BY recorded_at ASC')
        .all(profileId) as WeightRow[];

      const measurement_definitions = db
        .prepare(
          `SELECT * FROM measurement_definitions
           WHERE is_system = 1 OR profile_id = ?
           ORDER BY is_system DESC, display_order ASC`,
        )
        .all(profileId) as DefinitionRow[];

      const measurement_entries = db
        .prepare('SELECT * FROM measurement_entries WHERE profile_id = ? ORDER BY recorded_at ASC')
        .all(profileId) as EntryRow[];

      const goals = db
        .prepare('SELECT * FROM goals WHERE profile_id = ? ORDER BY created_at ASC')
        .all(profileId) as GoalRow[];

      const photos = db
        .prepare('SELECT * FROM progress_photos WHERE profile_id = ? ORDER BY recorded_at ASC')
        .all(profileId) as PhotoRow[];

      const payload = {
        exportedAt: new Date().toISOString(),
        profileId,
        weight_entries,
        measurement_definitions,
        measurement_entries,
        goals,
        photos,
      };

      reply.header('Content-Disposition', 'attachment; filename="body-tracker-export.json"');
      reply.header('Content-Type', 'application/json');
      return reply.send(payload);
    },
  );

  /**
   * GET /api/export/csv/weight
   * CSV export: date,value,unit,notes
   */
  fastify.get(
    '/api/export/csv/weight',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      const entries = db
        .prepare(
          'SELECT recorded_at, value, unit, notes FROM weight_entries WHERE profile_id = ? ORDER BY recorded_at ASC',
        )
        .all(profileId) as Pick<WeightRow, 'recorded_at' | 'value' | 'unit' | 'notes'>[];

      const lines = ['date,value,unit,notes'];
      for (const e of entries) {
        lines.push(csvRow(e.recorded_at, e.value, e.unit, e.notes));
      }

      reply.header('Content-Disposition', 'attachment; filename="weight-export.csv"');
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      return reply.send(lines.join('\n'));
    },
  );

  /**
   * GET /api/export/csv/measurements
   * CSV export: date,measurement_name,value,unit,notes
   */
  fastify.get(
    '/api/export/csv/measurements',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      const entries = db
        .prepare(
          `SELECT me.recorded_at, md.name, me.value, md.unit, me.notes
           FROM measurement_entries me
           JOIN measurement_definitions md ON md.id = me.definition_id
           WHERE me.profile_id = ?
           ORDER BY me.recorded_at ASC, md.name ASC`,
        )
        .all(profileId) as Array<{
          recorded_at: string;
          name: string;
          value: number;
          unit: string;
          notes: string | null;
        }>;

      const lines = ['date,measurement_name,value,unit,notes'];
      for (const e of entries) {
        lines.push(csvRow(e.recorded_at, e.name, e.value, e.unit, e.notes));
      }

      reply.header('Content-Disposition', 'attachment; filename="measurements-export.csv"');
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      return reply.send(lines.join('\n'));
    },
  );

  /**
   * POST /api/import/json
   * Import data. Preview mode: ?preview=1 returns stats without writing.
   * Full import: upserts by recorded_at.
   */
  fastify.post(
    '/api/import/json',
    { preHandler: requireAuth },
    async (request, reply) => {
      const preview = (request.query as Record<string, string>)['preview'] === '1';
      const profileId = request.profile!.id;

      const result = ImportSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: result.error.issues });
      }

      const { weight_entries, measurement_entries, goals } = result.data;

      const report = {
        preview,
        weight_entries: { total: weight_entries.length, imported: 0, skipped: 0 },
        measurement_entries: { total: measurement_entries.length, imported: 0, skipped: 0 },
        goals: { total: goals.length, imported: 0 },
      };

      if (preview) {
        // Count what would be upserted
        for (const entry of weight_entries) {
          const exists = db
            .prepare(
              'SELECT id FROM weight_entries WHERE profile_id = ? AND recorded_at = ?',
            )
            .get(profileId, entry.recorded_at);
          if (exists) {
            report.weight_entries.skipped++;
          } else {
            report.weight_entries.imported++;
          }
        }

        for (const entry of measurement_entries) {
          const defExists = db
            .prepare(
              'SELECT id FROM measurement_definitions WHERE id = ? AND (is_system = 1 OR profile_id = ?)',
            )
            .get(entry.definition_id, profileId);
          if (!defExists) {
            report.measurement_entries.skipped++;
          } else {
            report.measurement_entries.imported++;
          }
        }

        report.goals.imported = goals.length;
        return reply.send(report);
      }

      // Full import — run in a transaction
      const doImport = db.transaction(() => {
        const insertWeight = db.prepare(
          `INSERT INTO weight_entries (id, profile_id, value, unit, recorded_at, notes)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(profile_id, recorded_at) DO NOTHING`,
        );

        for (const entry of weight_entries) {
          const result = insertWeight.run(
            nanoid(),
            profileId,
            entry.value,
            entry.unit,
            entry.recorded_at,
            entry.notes ?? null,
          );
          if (result.changes > 0) {
            report.weight_entries.imported++;
          } else {
            report.weight_entries.skipped++;
          }
        }

        const insertMeasurement = db.prepare(
          `INSERT INTO measurement_entries (id, profile_id, definition_id, value, recorded_at, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
        );

        for (const entry of measurement_entries) {
          const defExists = db
            .prepare(
              'SELECT id FROM measurement_definitions WHERE id = ? AND (is_system = 1 OR profile_id = ?)',
            )
            .get(entry.definition_id, profileId);

          if (!defExists) {
            report.measurement_entries.skipped++;
            continue;
          }

          insertMeasurement.run(
            nanoid(),
            profileId,
            entry.definition_id,
            entry.value,
            entry.recorded_at,
            entry.notes ?? null,
          );
          report.measurement_entries.imported++;
        }

        // Upsert goals (last one wins)
        const upsertGoal = db.prepare(
          `INSERT INTO goals (id, profile_id, starting_weight, starting_weight_unit, target_weight, target_weight_unit, target_date, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        const existingGoal = db
          .prepare('SELECT id FROM goals WHERE profile_id = ?')
          .get(profileId) as { id: string } | undefined;

        for (const goal of goals) {
          if (existingGoal) {
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
              goal.starting_weight ?? null,
              goal.starting_weight_unit ?? null,
              goal.target_weight ?? null,
              goal.target_weight_unit ?? null,
              goal.target_date ?? null,
              goal.notes ?? null,
              existingGoal.id,
            );
          } else {
            upsertGoal.run(
              nanoid(),
              profileId,
              goal.starting_weight ?? null,
              goal.starting_weight_unit ?? 'kg',
              goal.target_weight ?? null,
              goal.target_weight_unit ?? 'kg',
              goal.target_date ?? null,
              goal.notes ?? null,
            );
          }
          report.goals.imported++;
        }
      });

      doImport();
      return reply.send(report);
    },
  );
};

export default dataRoutes;
