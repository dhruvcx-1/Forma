import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';
import { getProfileById } from '../auth/index.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PHOTOS_PATH = path.resolve(process.env.PHOTOS_PATH ?? './data/photos');
const AVATARS_PATH = path.join(PHOTOS_PATH, 'avatars');
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Ensure avatars directory exists
if (!fs.existsSync(AVATARS_PATH)) {
  fs.mkdirSync(AVATARS_PATH, { recursive: true });
}

// ---------------------------------------------------------------------------
// Helper: safe avatar path to prevent traversal
// ---------------------------------------------------------------------------

function safeAvatarPath(filename: string): string {
  const resolved = path.resolve(AVATARS_PATH, filename);
  if (!resolved.startsWith(AVATARS_PATH + path.sep) && resolved !== AVATARS_PATH) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const UpdateProfileSchema = z.object({
  display_name: z.string().max(64).nullable().optional(),
  displayName: z.string().max(64).nullable().optional(),
  bio: z.string().max(256).nullable().optional(),
  is_public: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const profileRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/profile
   * Returns current user's profile info
   */
  fastify.get('/api/profile', { preHandler: requireAuth }, async (request, reply) => {
    const profile = getProfileById(request.profile!.id);
    if (!profile) return reply.code(404).send({ error: 'Profile not found' });
    return reply.send(profile);
  });

  /**
   * PUT /api/profile
   * Updates display_name, bio, and is_public
   */
  fastify.put('/api/profile', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = UpdateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parsed.error.issues });
    }

    const profileId = request.profile!.id;
    const { display_name, displayName, bio, is_public, isPublic } = parsed.data;

    const resolvedDisplayName = display_name !== undefined ? display_name : displayName;
    const resolvedIsPublic = is_public !== undefined ? is_public : isPublic;

    const current = getProfileById(profileId);
    if (!current) return reply.code(404).send({ error: 'Profile not found' });

    const newDisplayName = resolvedDisplayName !== undefined ? resolvedDisplayName : current.display_name;
    const newBio = bio !== undefined ? bio : current.bio;
    const newIsPublic = resolvedIsPublic !== undefined ? (resolvedIsPublic ? 1 : 0) : (current.is_public ? 1 : 0);

    db.prepare(`
      UPDATE profiles
      SET display_name = ?, bio = ?, is_public = ?
      WHERE id = ?
    `).run(newDisplayName, newBio, newIsPublic, profileId);

    const updated = getProfileById(profileId);
    return reply.send(updated);
  });

  /**
   * POST /api/profile/avatar
   * Upload user avatar image
   */
  fastify.post('/api/profile/avatar', { preHandler: requireAuth }, async (request, reply) => {
    const data = await request.file({ limits: { fileSize: MAX_AVATAR_SIZE } });
    if (!data) {
      return reply.code(400).send({ error: 'No image file uploaded' });
    }

    if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
      return reply.code(400).send({ error: 'Unsupported file type. Allowed types: JPEG, PNG, WebP.' });
    }

    const ext = MIME_TO_EXT[data.mimetype] ?? 'jpg';
    const filename = `avatar_${nanoid(16)}.${ext}`;
    const targetPath = safeAvatarPath(filename);

    await pipeline(data.file, fs.createWriteStream(targetPath));

    if (data.file.truncated) {
      fs.unlink(targetPath, () => {});
      return reply.code(413).send({ error: 'File exceeds 5MB size limit' });
    }

    const profileId = request.profile!.id;
    const current = getProfileById(profileId);

    // Delete old avatar file from disk if it exists
    if (current?.avatar_url && current.avatar_url.includes('/api/profile/avatar/')) {
      const oldFilename = path.basename(current.avatar_url);
      try {
        const oldPath = safeAvatarPath(oldFilename);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch {
        // Ignore deletion errors for old avatar
      }
    }

    const avatarUrl = `/api/profile/avatar/${filename}`;
    db.prepare('UPDATE profiles SET avatar_url = ? WHERE id = ?').run(avatarUrl, profileId);

    return reply.send({
      ok: true,
      avatar_url: avatarUrl,
      avatarUrl,
    });
  });

  /**
   * DELETE /api/profile/avatar
   * Remove user avatar image
   */
  fastify.delete('/api/profile/avatar', { preHandler: requireAuth }, async (request, reply) => {
    const profileId = request.profile!.id;
    const current = getProfileById(profileId);

    if (current?.avatar_url && current.avatar_url.includes('/api/profile/avatar/')) {
      const filename = path.basename(current.avatar_url);
      try {
        const targetPath = safeAvatarPath(filename);
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      } catch {
        // ignore
      }
    }

    db.prepare('UPDATE profiles SET avatar_url = NULL WHERE id = ?').run(profileId);

    return reply.send({ ok: true });
  });

  /**
   * GET /api/profile/avatar/:filename
   * Public avatar delivery
   */
  fastify.get('/api/profile/avatar/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    let filePath: string;
    try {
      filePath = safeAvatarPath(filename);
    } catch {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Avatar not found' });
    }

    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const contentType = mimeMap[ext] ?? 'application/octet-stream';

    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  });
};

export default profileRoutes;
