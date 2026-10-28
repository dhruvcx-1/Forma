import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
} from '../auth/index.js';
import { requireAuth } from '../auth/plugin.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const SetupSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  displayName: z.string().max(64).optional(),
});

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Cookie options
// ---------------------------------------------------------------------------
const SESSION_COOKIE_NAME = 'session_id';
const COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sessionCookieOptions(expiresIn = COOKIE_TTL_MS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    expires: new Date(Date.now() + expiresIn),
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/auth/status and GET /api/setup/status
   * Returns whether the app has been set up and whether the caller is authenticated.
   */
  const handleStatus = async (request: any, reply: any) => {
    const profileCount = (
      db.prepare('SELECT COUNT(*) as count FROM profiles').get() as {
        count: number;
      }
    ).count;

    return reply.send({
      isSetup: profileCount > 0,
      isAuthenticated: request.profile !== null,
      authenticated: request.profile !== null,
    });
  };

  fastify.get('/api/auth/status', handleStatus);
  fastify.get('/api/setup/status', handleStatus);

  /**
   * POST /api/auth/setup
   * First-run profile creation. Returns 409 if a profile already exists.
   */
  fastify.post('/api/auth/setup', async (request, reply) => {
    const profileCount = (
      db.prepare('SELECT COUNT(*) as count FROM profiles').get() as {
        count: number;
      }
    ).count;

    if (profileCount > 0) {
      return reply.code(409).send({ error: 'App is already set up' });
    }

    const result = SetupSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: result.error.issues,
      });
    }

    const { username, password, displayName } = result.data;
    const passwordHash = await hashPassword(password);
    const profileId = nanoid();

    db.prepare(
      'INSERT INTO profiles (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)',
    ).run(profileId, username, passwordHash, displayName ?? null);

    const sessionId = createSession(profileId);
    reply.setCookie(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions());

    return reply.code(201).send({
      id: profileId,
      username,
      displayName: displayName ?? null,
    });
  });

  /**
   * POST /api/auth/login
   */
  fastify.post('/api/auth/login', async (request, reply) => {
    const result = LoginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: result.error.issues,
      });
    }

    const { username, password } = result.data;

    const row = db
      .prepare('SELECT id, password_hash FROM profiles WHERE username = ?')
      .get(username) as { id: string; password_hash: string } | undefined;

    if (!row) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(password, row.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const sessionId = createSession(row.id);
    reply.setCookie(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions());

    return reply.send({ ok: true });
  });

  /**
   * POST /api/auth/logout
   */
  fastify.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE_NAME];
    if (sessionId) {
      deleteSession(sessionId);
    }
    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    return reply.send({ ok: true });
  });

  /**
   * GET /api/auth/me
   * Returns the authenticated profile (no password hash).
   */
  fastify.get(
    '/api/auth/me',
    { preHandler: requireAuth },
    async (request, reply) => {
      const p = request.profile!;
      const user = {
        id: p.id,
        username: p.username,
        displayName: p.display_name,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        avatarUrl: p.avatar_url,
        bio: p.bio,
        is_public: p.is_public,
        isPublic: p.is_public,
        created_at: p.created_at,
        createdAt: p.created_at,
      };
      return reply.send({
        authenticated: true,
        user,
        ...user,
      });
    },
  );
};

export default authRoutes;
