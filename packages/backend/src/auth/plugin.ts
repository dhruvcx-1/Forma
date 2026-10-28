import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { getSession, type Profile } from './index.js';

// ---------------------------------------------------------------------------
// Augment Fastify's request type to carry the authenticated profile
// ---------------------------------------------------------------------------
declare module 'fastify' {
  interface FastifyRequest {
    profile: Profile | null;
  }
}

// ---------------------------------------------------------------------------
// Auth plugin — decorates every request with `request.profile`
// ---------------------------------------------------------------------------
const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('profile', null);

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const sessionId = request.cookies['session_id'];
    if (sessionId) {
      request.profile = getSession(sessionId);
    } else {
      request.profile = null;
    }
  });
};

export default fp(authPlugin, { name: 'auth' });

// ---------------------------------------------------------------------------
// requireAuth — preHandler that rejects unauthenticated requests with 401
// ---------------------------------------------------------------------------
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.profile) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

// ---------------------------------------------------------------------------
// requireAdmin — preHandler that ensures the user has role 'admin'
// ---------------------------------------------------------------------------
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.profile) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  if (request.profile.role !== 'admin') {
    reply.code(403).send({ error: 'Forbidden: Admin access required' });
  }
}
