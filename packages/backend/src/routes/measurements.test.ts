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

  it('supports multiple entries on the same day with second precision and sorts accurately', async () => {
    // 1. Morning measurement at 07:15:20
    await fastify.inject({
      method: 'POST',
      url: '/api/measurements/entries',
      headers: { cookie: sessionCookie },
      payload: {
        entries: [
          {
            definition_id: waistDefId,
            value: 82.5,
            recorded_at: '2026-10-28T07:15:20.000Z',
            notes: 'Fasted morning measurement',
          },
        ],
      },
    });

    // 2. Evening measurement on the same day at 19:45:55
    await fastify.inject({
      method: 'POST',
      url: '/api/measurements/entries',
      headers: { cookie: sessionCookie },
      payload: {
        entries: [
          {
            definition_id: waistDefId,
            value: 83.1,
            recorded_at: '2026-10-28T19:45:55.000Z',
            notes: 'Post-dinner evening measurement',
          },
        ],
      },
    });

    // Retrieve list of entries
    const listRes = await fastify.inject({
      method: 'GET',
      url: '/api/measurements/entries',
      headers: { cookie: sessionCookie },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.length).toBe(2);
    // Evening should be first in descending order
    expect(list[0].value).toBe(83.1);
    expect(list[0].recorded_at).toBe('2026-10-28T19:45:55.000Z');
    expect(list[1].value).toBe(82.5);
    expect(list[1].recorded_at).toBe('2026-10-28T07:15:20.000Z');

    // Retrieve latest entry
    const latestRes = await fastify.inject({
      method: 'GET',
      url: '/api/measurements/entries/latest',
      headers: { cookie: sessionCookie },
    });
    expect(latestRes.statusCode).toBe(200);
    const latestList = latestRes.json();
    const latestWaist = latestList.find((e: any) => e.definition_id === waistDefId);
    expect(latestWaist).toBeDefined();
    expect(latestWaist.value).toBe(83.1);
    expect(latestWaist.recorded_at).toBe('2026-10-28T19:45:55.000Z');
  });
});
