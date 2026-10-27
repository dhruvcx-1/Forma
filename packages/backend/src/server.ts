import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';

import authPlugin from './auth/plugin.js';

import authRoutes from './routes/auth.js';
import weightRoutes from './routes/weight.js';
import measurementsRoutes from './routes/measurements.js';
import goalsRoutes from './routes/goals.js';
import photosRoutes from './routes/photos.js';
import dataRoutes from './routes/data.js';
import settingsRoutes from './routes/settings.js';
import bodyCompositionRoutes from './routes/body-composition.js';

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isProduction = NODE_ENV === 'production';

const COOKIE_SECRET = process.env.COOKIE_SECRET ?? '';
if (isProduction && COOKIE_SECRET.length < 32) {
  console.error(
    '[server] FATAL: COOKIE_SECRET must be at least 32 characters in production. Aborting.',
  );
  process.exit(1);
}

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Fastify instance
// ---------------------------------------------------------------------------

export const fastify = Fastify({
  logger: {
    level: isProduction ? 'warn' : 'info',
    transport: isProduction
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
  },
  // Discard unknown content-type bodies gracefully
  ajv: { customOptions: { strict: false } },
});

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

// CORS — must be registered before routes
await fastify.register(fastifyCors, {
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// Cookie parsing
await fastify.register(fastifyCookie, {
  secret: COOKIE_SECRET || 'dev-secret-please-change-in-production',
  parseOptions: {},
});

// Multipart support for photo uploads (global limit; individual routes can override)
await fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
});

// Auth decorator (must be before routes that use request.profile)
await fastify.register(authPlugin);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

await fastify.register(authRoutes);
await fastify.register(weightRoutes);
await fastify.register(measurementsRoutes);
await fastify.register(goalsRoutes);
await fastify.register(photosRoutes);
await fastify.register(dataRoutes);
await fastify.register(settingsRoutes);
await fastify.register(bodyCompositionRoutes);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

fastify.get('/api/health', async (_request, reply) => {
  return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Global error handler — never expose stack traces
// ---------------------------------------------------------------------------

fastify.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode ?? 500;

  fastify.log.error({ err: error, url: request.url }, 'Unhandled error');

  // In production, never expose internal error messages for 5xx
  const message =
    isProduction && statusCode >= 500
      ? 'Internal server error'
      : (error.message ?? 'Internal server error');

  return reply.code(statusCode).send({ error: message });
});

// ---------------------------------------------------------------------------
// Static file serving for production SPA
// ---------------------------------------------------------------------------

const possibleFrontendDirs = [
  path.resolve('./packages/frontend/dist'),
  path.resolve('../frontend/dist'),
  path.resolve('./dist/frontend'),
  path.resolve('./public'),
];
const frontendDist = possibleFrontendDirs.find(
  (d) => fs.existsSync(d) && fs.existsSync(path.join(d, 'index.html')),
);

if (frontendDist) {
  await fastify.register(fastifyStatic, {
    root: frontendDist,
    prefix: '/',
    wildcard: false,
  });

  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
} else {
  // ---------------------------------------------------------------------------
  // 404 handler
  // ---------------------------------------------------------------------------
  fastify.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: 'Not found' });
  });
}

// ---------------------------------------------------------------------------
// CSRF origin check for state-changing operations
// SameSite=Strict cookie is the primary protection; this is belt-and-suspenders.
// ---------------------------------------------------------------------------

fastify.addHook('preHandler', async (request, reply) => {
  const method = request.method.toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const origin = request.headers['origin'];
    const referer = request.headers['referer'];

    // Skip CSRF check for setup and login endpoints (no cookie yet)
    const skipPaths = ['/api/auth/setup', '/api/auth/login'];
    if (!skipPaths.includes(request.url.split('?')[0]!)) {
      const allowed = CORS_ORIGIN;
      const source = origin ?? (referer ? new URL(referer).origin : null);
      const hostOrigin = request.headers.host ? `${request.protocol}://${request.headers.host}` : null;
      if (source && source !== allowed && source !== hostOrigin) {
        return reply.code(403).send({ error: 'Forbidden: invalid origin' });
      }
    }
  }
});

export default fastify;
