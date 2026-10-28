import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/index.js';
import { requireAdmin } from '../auth/plugin.js';
import { isRegistrationEnabled } from './auth.js';

const PHOTOS_PATH =
  process.env.PHOTOS_PATH ??
  path.join(process.cwd(), 'data', 'photos');

const UpdateSettingsSchema = z.object({
  registration_enabled: z.boolean(),
});

const UpdateRoleSchema = z.object({
  role: z.enum(['admin', 'user']),
});

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // All admin routes require admin authentication
  fastify.addHook('preHandler', requireAdmin);

  /**
   * GET /api/admin/settings
   * Returns system administration settings.
   */
  fastify.get('/api/admin/settings', async (_request, reply) => {
    const row = db
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get('registration_enabled') as { value: string } | undefined;

    return reply.send({
      registration_enabled: isRegistrationEnabled(),
      has_override: row !== undefined,
    });
  });

  /**
   * PUT /api/admin/settings
   * Updates system settings (e.g. registration toggle).
   */
  fastify.put('/api/admin/settings', async (request, reply) => {
    const result = UpdateSettingsSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: result.error.issues,
      });
    }

    const { registration_enabled } = result.data;

    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('registration_enabled', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(registration_enabled ? 'true' : 'false');

    return reply.send({
      ok: true,
      registration_enabled,
    });
  });

  /**
   * GET /api/admin/users
   * Lists all registered user accounts with activity stats.
   */
  fastify.get('/api/admin/users', async (_request, reply) => {
    interface UserRow {
      id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      bio: string | null;
      role: string;
      is_public: number;
      created_at: string;
      weight_count: number;
      measurement_count: number;
    }

    const users = db
      .prepare(`
        SELECT 
          p.id, 
          p.username, 
          p.display_name, 
          p.avatar_url, 
          p.bio, 
          p.role, 
          p.is_public, 
          p.created_at,
          (SELECT COUNT(*) FROM weight_entries WHERE profile_id = p.id) as weight_count,
          (SELECT COUNT(*) FROM measurement_entries WHERE profile_id = p.id) as measurement_count
        FROM profiles p
        ORDER BY p.created_at ASC
      `)
      .all() as UserRow[];

    return reply.send(
      users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        display_name: u.display_name,
        avatarUrl: u.avatar_url,
        avatar_url: u.avatar_url,
        bio: u.bio,
        role: u.role,
        isPublic: Boolean(u.is_public),
        is_public: Boolean(u.is_public),
        createdAt: u.created_at,
        created_at: u.created_at,
        weightCount: u.weight_count,
        measurementCount: u.measurement_count,
      }))
    );
  });

  /**
   * PUT /api/admin/users/:id/role
   * Promotes or demotes a user's role.
   */
  fastify.put('/api/admin/users/:id/role', async (request, reply) => {
    const { id: targetId } = request.params as { id: string };

    const result = UpdateRoleSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: result.error.issues,
      });
    }

    const { role: newRole } = result.data;

    const target = db
      .prepare('SELECT id, role FROM profiles WHERE id = ?')
      .get(targetId) as { id: string; role: string } | undefined;

    if (!target) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // Safety guard: prevent demoting the only admin
    if (target.role === 'admin' && newRole === 'user') {
      const adminCount = (
        db.prepare("SELECT COUNT(*) as count FROM profiles WHERE role = 'admin'").get() as {
          count: number;
        }
      ).count;

      if (adminCount <= 1) {
        return reply.code(400).send({
          error: 'Cannot demote the only administrator',
        });
      }
    }

    db.prepare('UPDATE profiles SET role = ? WHERE id = ?').run(newRole, targetId);

    return reply.send({ ok: true, role: newRole });
  });

  /**
   * DELETE /api/admin/users/:id
   * Deletes a user account and cascades their data.
   */
  fastify.delete('/api/admin/users/:id', async (request, reply) => {
    const { id: targetId } = request.params as { id: string };

    // Prevent self-deletion
    if (targetId === request.profile!.id) {
      return reply.code(400).send({ error: 'Cannot delete your own administrator account' });
    }

    const target = db
      .prepare('SELECT id, avatar_url FROM profiles WHERE id = ?')
      .get(targetId) as { id: string; avatar_url: string | null } | undefined;

    if (!target) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // Clean up avatar image file if exists
    if (target.avatar_url) {
      const filename = path.basename(target.avatar_url);
      const filePath = path.join(PHOTOS_PATH, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore cleanup error
        }
      }
    }

    // Clean up photos from disk for this user
    interface PhotoRow {
      filename: string;
    }
    const photos = db
      .prepare('SELECT filename FROM progress_photos WHERE profile_id = ?')
      .all(targetId) as PhotoRow[];

    for (const photo of photos) {
      const filePath = path.join(PHOTOS_PATH, photo.filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore cleanup error
        }
      }
    }

    // Delete profile (FOREIGN KEY CASCADE removes weight, measurements, goals, photos, settings, sessions)
    db.prepare('DELETE FROM profiles WHERE id = ?').run(targetId);

    return reply.send({ ok: true });
  });
};

export default adminRoutes;
