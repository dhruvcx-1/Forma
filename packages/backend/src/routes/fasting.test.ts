import { describe, it, expect, beforeEach } from 'vitest';
import { fastify } from '../server.js';
import { db } from '../db/index.js';

function getSessionCookie(res: any): string {
  const cookie = res.cookies?.find((c: any) => c.name === 'session_id');
  return cookie ? `session_id=${cookie.value}` : '';
}

describe('Fasting Tracker & History API', () => {
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
        username: 'fasting_user',
        password: 'password123',
      },
    });
    sessionCookie = getSessionCookie(res);
  });

  it('initially has no active fast', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/fasting/active',
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().activeFast).toBeNull();
  });

  it('starts a new 16:8 fast and retrieves it as active', async () => {
    const startRes = await fastify.inject({
      method: 'POST',
      url: '/api/fasting/start',
      headers: { cookie: sessionCookie },
      payload: {
        fast_type: '16:8',
        target_duration_hours: 16,
        notes: 'Starting my 16:8 fast',
      },
    });

    expect(startRes.statusCode).toBe(201);
    const fast = startRes.json();
    expect(fast.fast_type).toBe('16:8');
    expect(fast.target_duration_hours).toBe(16);
    expect(fast.status).toBe('active');

    // Verify GET /api/fasting/active returns it
    const activeRes = await fastify.inject({
      method: 'GET',
      url: '/api/fasting/active',
      headers: { cookie: sessionCookie },
    });
    expect(activeRes.statusCode).toBe(200);
    expect(activeRes.json().activeFast?.id).toBe(fast.id);
  });

  it('prevents starting two concurrent fasts', async () => {
    await fastify.inject({
      method: 'POST',
      url: '/api/fasting/start',
      headers: { cookie: sessionCookie },
      payload: { fast_type: '16:8', target_duration_hours: 16 },
    });

    const secondRes = await fastify.inject({
      method: 'POST',
      url: '/api/fasting/start',
      headers: { cookie: sessionCookie },
      payload: { fast_type: '20:4', target_duration_hours: 20 },
    });

    expect(secondRes.statusCode).toBe(409);
  });

  it('supports updating start time and target duration on active fast', async () => {
    await fastify.inject({
      method: 'POST',
      url: '/api/fasting/start',
      headers: { cookie: sessionCookie },
      payload: { fast_type: '16:8', target_duration_hours: 16 },
    });

    const newStart = new Date(Date.now() - 14 * 3600 * 1000).toISOString();
    const patchRes = await fastify.inject({
      method: 'PATCH',
      url: '/api/fasting/active',
      headers: { cookie: sessionCookie },
      payload: {
        started_at: newStart,
        target_duration_hours: 18,
        fast_type: '18:6',
      },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().started_at).toBe(newStart);
    expect(patchRes.json().target_duration_hours).toBe(18);
    expect(patchRes.json().fast_type).toBe('18:6');
  });

  it('completes an active fast and saves it in history with stats', async () => {
    const startedAt = new Date(Date.now() - 17 * 3600 * 1000).toISOString();
    await fastify.inject({
      method: 'POST',
      url: '/api/fasting/start',
      headers: { cookie: sessionCookie },
      payload: {
        fast_type: '16:8',
        target_duration_hours: 16,
        started_at: startedAt,
      },
    });

    const endRes = await fastify.inject({
      method: 'POST',
      url: '/api/fasting/end',
      headers: { cookie: sessionCookie },
      payload: {
        status: 'completed',
        mood: 'great',
        notes: 'Felt very clear and energized',
      },
    });

    expect(endRes.statusCode).toBe(200);
    expect(endRes.json().status).toBe('completed');
    expect(endRes.json().mood).toBe('great');

    // Verify active is now null
    const activeRes = await fastify.inject({
      method: 'GET',
      url: '/api/fasting/active',
      headers: { cookie: sessionCookie },
    });
    expect(activeRes.json().activeFast).toBeNull();

    // Verify history returns completed session and statistics
    const historyRes = await fastify.inject({
      method: 'GET',
      url: '/api/fasting/history',
      headers: { cookie: sessionCookie },
    });

    expect(historyRes.statusCode).toBe(200);
    const { sessions, stats } = historyRes.json();
    expect(sessions.length).toBe(1);
    expect(stats.completedFasts).toBe(1);
    expect(stats.totalHoursFasted).toBeGreaterThanOrEqual(16.9);
    expect(stats.longestFastHours).toBeGreaterThanOrEqual(16.9);
  });
});
