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
import profileRoutes from './routes/profile.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

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

// Safely handle empty JSON bodies without throwing FST_ERR_CTP_EMPTY_JSON_BODY
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body: string, done) => {
  if (!body || body.trim() === '') {
    return done(null, {});
  }
  try {
    done(null, JSON.parse(body));
  } catch (err: any) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

// CORS — allow all origins (reflects request origin to support credentials across any domain/IP/port)
await fastify.register(fastifyCors, {
  origin: true,
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
await fastify.register(profileRoutes);
await fastify.register(publicRoutes);
await fastify.register(adminRoutes);

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
export const frontendDist = possibleFrontendDirs.find(
  (d) => fs.existsSync(d) && fs.existsSync(path.join(d, 'index.html')),
);

if (frontendDist) {
  fastify.log.info({ path: frontendDist }, 'Mounted frontend SPA static assets');
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

export default fastify;
