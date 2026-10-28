import { describe, it, expect, beforeEach } from 'vitest';
import { fastify } from '../server.js';
import { db } from '../db/index.js';

function getSessionCookie(res: any): string {
  const cookie = res.cookies?.find((c: any) => c.name === 'session_id');
  return cookie ? `session_id=${cookie.value}` : '';
}

describe('Fasting Widget & Public Sharing API', () => {
  let sessionCookie: string;

  beforeEach(async () => {
    db.exec(`
      DELETE FROM sessions;
      DELETE FROM fasting_sessions;
      DELETE FROM weight_entries;
      DELETE FROM settings;
      DELETE FROM profiles;
    `);

    // Setup user
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'fasting_sharer',
        password: 'password123',
      },
    });
    sessionCookie = getSessionCookie(res);
  });

  it('generates a widget token on first fetch and returns the same token on subsequent fetches', async () => {
    const res1 = await fastify.inject({
      method: 'GET',
      url: '/api/fasting/widget-token',
      headers: { cookie: sessionCookie },
    });
    expect(res1.statusCode).toBe(200);
    const { token: token1 } = res1.json();
    expect(token1).toMatch(/^fwt_[A-Za-z0-9_-]+/);

    const res2 = await fastify.inject({
      method: 'GET',
      url: '/api/fasting/widget-token',
      headers: { cookie: sessionCookie },
    });
    expect(res2.statusCode).toBe(200);
    const { token: token2 } = res2.json();
    expect(token2).toBe(token1);
  });

  it('regenerates a new widget token, invalidating the old one', async () => {
    const res1 = await fastify.inject({
      method: 'GET',
      url: '/api/fasting/widget-token',
      headers: { cookie: sessionCookie },
    });
    const { token: oldToken } = res1.json();

    const regenRes = await fastify.inject({
      method: 'POST',
      url: '/api/fasting/widget-token/regenerate',
      headers: { cookie: sessionCookie },
    });
    expect(regenRes.statusCode).toBe(200);
    const { token: newToken } = regenRes.json();
    expect(newToken).toMatch(/^fwt_[A-Za-z0-9_-]+/);
    expect(newToken).not.toBe(oldToken);

    // Old token should now 404
    const oldPublicRes = await fastify.inject({
      method: 'GET',
      url: `/api/public/fasting/widget?token=${oldToken}`,
    });
    expect(oldPublicRes.statusCode).toBe(404);

    // New token should work
    const newPublicRes = await fastify.inject({
      method: 'GET',
      url: `/api/public/fasting/widget?token=${newToken}`,
    });
    expect(newPublicRes.statusCode).toBe(200);
    expect(newPublicRes.json().active).toBe(false);
  });

  it('returns active fast telemetry via public endpoint with stage and progress', async () => {
    // Get token
    const tokenRes = await fastify.inject({
      method: 'GET',
      url: '/api/fasting/widget-token',
      headers: { cookie: sessionCookie },
    });
    const { token } = tokenRes.json();

    // Start a fast 10 hours ago
    const startedAt = new Date(Date.now() - 10 * 3600 * 1000).toISOString();
    await fastify.inject({
      method: 'POST',
      url: '/api/fasting/start',
      headers: { cookie: sessionCookie },
      payload: {
        fast_type: '16:8',
        target_duration_hours: 16,
        started_at: startedAt,
        notes: 'Private personal health note',
      },
    });

    // Public widget request (unauthenticated)
    const publicRes = await fastify.inject({
      method: 'GET',
      url: `/api/public/fasting/widget?token=${token}`,
    });

    expect(publicRes.statusCode).toBe(200);
    const body = publicRes.json();
    expect(body.active).toBe(true);
    expect(body.profile.username).toBe('fasting_sharer');
    expect(body.fast.fast_type).toBe('16:8');
    expect(body.fast.target_duration_hours).toBe(16);
    expect(body.fast.elapsed_hours).toBeGreaterThanOrEqual(9.9);
    expect(body.fast.stage.name).toBe('Early Fat Burning'); // 8-12 hours
    expect(body.fast.notes).toBeUndefined(); // ensure private notes not leaked
  });
});
