import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';

// ---------------------------------------------------------------------------
// Valid setting keys and their allowed value validators
// ---------------------------------------------------------------------------

const VALID_KEYS = ['unit_system', 'height_cm', 'sex', 'date_of_birth'] as const;
type SettingKey = (typeof VALID_KEYS)[number];

const VALUE_VALIDATORS: Record<SettingKey, z.ZodTypeAny> = {
  unit_system: z.enum(['metric', 'imperial']),
  height_cm: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a numeric string'),
  sex: z.enum(['male', 'female', 'other']),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
};

const validKeySet = new Set<string>(VALID_KEYS);

const UpsertSettingsSchema = z
  .record(z.string(), z.string())
  .refine(
    (obj) => Object.keys(obj).every((k) => validKeySet.has(k)),
    { message: 'Unknown setting key(s)' },
  );

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettingRow {
  id: string;
  profile_id: string;
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/settings
   * Returns all settings for the authenticated profile as { key: value }.
   */
  fastify.get(
    '/api/settings',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      const rows = db
        .prepare('SELECT key, value FROM settings WHERE profile_id = ?')
        .all(profileId) as SettingRow[];

      const settings: Record<string, string> = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }

      return reply.send(settings);
    },
  );

  /**
   * PUT /api/settings
   * Upsert one or more settings. Body: { [key: string]: string }
   * Valid keys: unit_system, height_cm, sex, date_of_birth
   */
  fastify.put(
    '/api/settings',
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = UpsertSettingsSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: result.error.issues });
      }

      const profileId = request.profile!.id;
      const entries = Object.entries(result.data);

      // Validate individual values against their type-specific schemas
      const valueErrors: Array<{ key: string; message: string }> = [];
      for (const [key, value] of entries) {
        const validator = VALUE_VALIDATORS[key as SettingKey];
        if (validator) {
          const vResult = validator.safeParse(value);
          if (!vResult.success) {
            valueErrors.push({ key, message: vResult.error.issues[0]?.message ?? 'Invalid value' });
          }
        }
      }

      if (valueErrors.length > 0) {
        return reply.code(400).send({ error: 'Validation failed', issues: valueErrors });
      }

      const upsertStmt = db.prepare(
        `INSERT INTO settings (id, profile_id, key, value)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(profile_id, key) DO UPDATE SET value = excluded.value`,
      );

      const upsertAll = db.transaction(() => {
        for (const [key, value] of entries) {
          upsertStmt.run(nanoid(), profileId, key, value);
        }
      });

      upsertAll();

      // Return updated settings
      const rows = db
        .prepare('SELECT key, value FROM settings WHERE profile_id = ?')
        .all(profileId) as SettingRow[];

      const settings: Record<string, string> = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }

      return reply.send(settings);
    },
  );
};

export default settingsRoutes;
