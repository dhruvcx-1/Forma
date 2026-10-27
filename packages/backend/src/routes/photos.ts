import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PHOTOS_PATH = path.resolve(process.env.PHOTOS_PATH ?? './data/photos');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Ensure photos directory exists
if (!fs.existsSync(PHOTOS_PATH)) {
  fs.mkdirSync(PHOTOS_PATH, { recursive: true });
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ListQuerySchema = z.object({
  view_type: z.enum(['front', 'side', 'back', 'other']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Path safety helper
// ---------------------------------------------------------------------------

function safePhotoPath(filename: string): string {
  // Ensure the resolved path starts with PHOTOS_PATH (prevents traversal)
  const resolved = path.resolve(PHOTOS_PATH, filename);
  if (!resolved.startsWith(PHOTOS_PATH + path.sep) && resolved !== PHOTOS_PATH) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const photosRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/photos
   * List photo metadata, optionally filtered by view_type and date range.
   */
  fastify.get(
    '/api/photos',
    { preHandler: requireAuth },
    async (request, reply) => {
      const qResult = ListQuerySchema.safeParse(request.query);
      if (!qResult.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: qResult.error.issues });
      }

      const { view_type, from, to } = qResult.data;
      const profileId = request.profile!.id;

      let sql = `SELECT * FROM progress_photos WHERE profile_id = ?`;
      const params: (string | number)[] = [profileId];

      if (view_type) { sql += ` AND view_type = ?`; params.push(view_type); }
      if (from) { sql += ` AND recorded_at >= ?`; params.push(from); }
      if (to) { sql += ` AND recorded_at <= ?`; params.push(to); }

      sql += ` ORDER BY recorded_at DESC`;

      const photos = (db.prepare(sql).all(...params) as PhotoRow[]).map((p) => ({
        ...p,
        url: `/api/photos/${p.id}/file`,
        date: (p.recorded_at || '').split('T')[0],
        viewType: p.view_type,
      }));
      return reply.send(photos);
    },
  );

  /**
   * POST /api/photos
   * Upload a new progress photo (multipart/form-data).
   * Fields: view_type (required), recorded_at (required), notes (optional)
   * File:   image field, max 10MB, JPEG/PNG/WebP only
   */
  fastify.post(
    '/api/photos',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profileId = request.profile!.id;

      // Parse multipart
      const parts = request.parts();

      let view_type: string | undefined;
      let recorded_at: string | undefined;
      let notes: string | undefined;
      let uploadedFilename: string | undefined;
      let originalName: string | undefined;
      let fileSize = 0;
      let mimeType: string | undefined;

      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'view_type' || part.fieldname === 'viewType') view_type = String(part.value);
          else if (part.fieldname === 'recorded_at' || part.fieldname === 'date') recorded_at = String(part.value);
          else if (part.fieldname === 'notes') notes = String(part.value);
        } else if (part.type === 'file' && (part.fieldname === 'file' || part.fieldname === 'photo' || part.fieldname === 'image')) {
          mimeType = part.mimetype;

          if (!ALLOWED_MIME_TYPES.has(mimeType)) {
            // Drain the stream to avoid hanging
            part.file.resume();
            return reply.code(415).send({
              error: 'Unsupported media type. Only JPEG, PNG, and WebP are allowed.',
            });
          }

          const ext = MIME_TO_EXT[mimeType] ?? 'bin';
          const generatedName = `${nanoid()}.${ext}`;
          originalName = part.filename ?? generatedName;

          const destPath = safePhotoPath(generatedName);

          // Stream to disk while counting bytes
          let bytesWritten = 0;
          const writeStream = fs.createWriteStream(destPath);

          try {
            await new Promise<void>((resolve, reject) => {
              part.file.on('data', (chunk: Buffer) => {
                bytesWritten += chunk.length;
                if (bytesWritten > MAX_FILE_SIZE) {
                  part.file.destroy();
                  writeStream.destroy();
                  fs.unlink(destPath, () => undefined);
                  reject(Object.assign(new Error('File too large'), { statusCode: 413 }));
                }
              });
              pipeline(part.file, writeStream).then(resolve).catch(reject);
            });
          } catch (err: unknown) {
            const e = err as { statusCode?: number; message?: string };
            return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Upload failed' });
          }

          fileSize = bytesWritten;
          uploadedFilename = generatedName;
        }
      }

      // Validate required fields
      const UploadSchema = z.object({
        view_type: z.enum(['front', 'side', 'back', 'other']),
        recorded_at: z.string().min(1),
      });

      const fieldResult = UploadSchema.safeParse({ view_type, recorded_at });
      if (!fieldResult.success) {
        // Clean up uploaded file if it was written
        if (uploadedFilename) {
          fs.unlink(safePhotoPath(uploadedFilename), () => undefined);
        }
        return reply.code(400).send({ error: 'Validation failed', issues: fieldResult.error.issues });
      }

      if (!uploadedFilename || !originalName || !mimeType) {
        return reply.code(400).send({ error: 'No file was uploaded' });
      }

      const id = nanoid();

      db.prepare(
        `INSERT INTO progress_photos (id, profile_id, filename, original_name, view_type, recorded_at, notes, file_size, mime_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        profileId,
        uploadedFilename,
        originalName,
        fieldResult.data.view_type,
        fieldResult.data.recorded_at,
        notes ?? null,
        fileSize,
        mimeType,
      );

      const photo = db.prepare('SELECT * FROM progress_photos WHERE id = ?').get(id) as PhotoRow;
      return reply.code(201).send({
        ...photo,
        url: `/api/photos/${photo.id}/file`,
        date: (photo.recorded_at || '').split('T')[0],
        viewType: photo.view_type,
      });
    },
  );

  /**
   * DELETE /api/photos/:id
   * Delete photo metadata and the underlying file.
   */
  fastify.delete(
    '/api/photos/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const profileId = request.profile!.id;

      const photo = db
        .prepare('SELECT * FROM progress_photos WHERE id = ? AND profile_id = ?')
        .get(id, profileId) as PhotoRow | undefined;

      if (!photo) {
        return reply.code(404).send({ error: 'Photo not found' });
      }

      db.prepare('DELETE FROM progress_photos WHERE id = ?').run(id);

      // Attempt to delete the file (non-fatal)
      try {
        const filePath = safePhotoPath(photo.filename);
        fs.unlink(filePath, () => undefined);
      } catch {
        // Ignore file system errors — the record is already gone
      }

      return reply.send({ ok: true });
    },
  );

  /**
   * GET /api/photos/:id/file
   * Serve the photo file. Auth-gated (reads file manually — not via static plugin).
   */
  fastify.get(
    '/api/photos/:id/file',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const profileId = request.profile!.id;

      const photo = db
        .prepare('SELECT * FROM progress_photos WHERE id = ? AND profile_id = ?')
        .get(id, profileId) as PhotoRow | undefined;

      if (!photo) {
        return reply.code(404).send({ error: 'Photo not found' });
      }

      let filePath: string;
      try {
        filePath = safePhotoPath(photo.filename);
      } catch {
        return reply.code(400).send({ error: 'Invalid file reference' });
      }

      if (!fs.existsSync(filePath)) {
        return reply.code(404).send({ error: 'File not found on disk' });
      }

      const stat = fs.statSync(filePath);
      reply.header('Content-Type', photo.mime_type ?? 'application/octet-stream');
      reply.header('Content-Length', stat.size);
      reply.header('Cache-Control', 'private, max-age=3600');

      return reply.send(fs.createReadStream(filePath));
    },
  );
};

export default photosRoutes;
