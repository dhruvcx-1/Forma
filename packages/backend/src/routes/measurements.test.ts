import { describe, it, expect, beforeEach } from 'vitest';
import { fastify } from '../server.js';
import { db } from '../db/index.js';

function getSessionCookie(res: any): string {
  const cookie = res.cookies?.find((c: any) => c.name === 'session_id');
  return cookie ? `session_id=${cookie.value}` : '';
}

describe('Measurements Batch & Entry APIs', () => {
  let sessionCookie: string;
  let waistDefId: string;

  beforeEach(async () => {
    db.exec(`
      DELETE FROM sessions;
      DELETE FROM measurement_entries;
      DELETE FROM measurement_definitions WHERE is_system = 0;
      DELETE FROM settings;
      DELETE FROM profiles;
    `);

    // Setup user
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'meas_user',
        password: 'password123',
      },
    });
    sessionCookie = getSessionCookie(res);

    // Get system waist definition
    const defsRes = await fastify.inject({
      method: 'GET',
      url: '/api/measurements/definitions',
      headers: { cookie: sessionCookie },
    });
    const defs = defsRes.json();
    const waist = defs.find((d: any) => d.slug === 'waist') || defs[0];
    waistDefId = waist.id;
  });

  it('successfully creates entries via POST /api/measurements/entries', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/measurements/entries',
      headers: { cookie: sessionCookie },
      payload: {
        entries: [
          {
            definition_id: waistDefId,
            value: 82.5,
            recorded_at: '2026-10-28',
            notes: 'Morning waist measurement',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].value).toBe(82.5);
  });

  it('successfully creates entries via POST /api/measurements/entries/batch', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/measurements/entries/batch',
      headers: { cookie: sessionCookie },
      payload: {
        entries: [
          {
            definition_id: waistDefId,
            value: 81.0,
            recorded_at: '2026-10-29',
            notes: 'Batch route check',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].value).toBe(81.0);
  });
});
