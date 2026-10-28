import { describe, it, expect, beforeEach } from 'vitest';
import { fastify } from '../server.js';
import { db } from '../db/index.js';

function getSessionCookie(res: any): string {
  const cookie = res.cookies?.find((c: any) => c.name === 'session_id');
  return cookie ? `session_id=${cookie.value}` : '';
}

describe('Multi-User Registration & Admin Controls', () => {
  beforeEach(() => {
    // Reset test database for clean state
    db.exec(`
      DELETE FROM sessions;
      DELETE FROM weight_entries;
      DELETE FROM measurement_entries;
      DELETE FROM goals;
      DELETE FROM progress_photos;
      DELETE FROM settings;
      DELETE FROM system_settings;
      DELETE FROM profiles;
    `);
  });

  it('first user registered via /setup becomes admin', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'first_admin',
        password: 'password123',
        displayName: 'First Admin',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.username).toBe('first_admin');
    expect(body.role).toBe('admin');
  });

  it('subsequent users registering receive user role', async () => {
    // 1. Setup first admin
    await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'the_boss',
        password: 'password123',
      },
    });

    // 2. Register second user
    const regRes = await fastify.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'second_user',
        password: 'password123',
        displayName: 'Member Two',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const body = regRes.json();
    expect(body.username).toBe('second_user');
    expect(body.role).toBe('user');
  });

  it('reports registrationEnabled in auth/setup status', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/auth/status',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.registrationEnabled).toBe(true);
  });

  it('blocks registration when registration is disabled', async () => {
    // Disable registration in system_settings
    db.prepare(`
      INSERT INTO system_settings (key, value) VALUES ('registration_enabled', 'false')
    `).run();

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'blocked_user',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('disabled');
  });

  it('allows admin to manage settings and users, but rejects non-admin', async () => {
    // 1. Create admin
    const adminSetup = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'root_admin',
        password: 'password123',
      },
    });
    const adminCookie = getSessionCookie(adminSetup);
    expect(adminCookie).toBeTruthy();

    // 2. Create standard user
    const userReg = await fastify.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'regular_joe',
        password: 'password123',
      },
    });
    const userCookie = getSessionCookie(userReg);
    expect(userCookie).toBeTruthy();

    // 3. Non-admin trying to access admin users list -> 403
    const forbiddenRes = await fastify.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { cookie: userCookie },
    });
    expect(forbiddenRes.statusCode).toBe(403);

    // 4. Admin accessing users list -> 200
    const usersRes = await fastify.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { cookie: adminCookie },
    });
    expect(usersRes.statusCode).toBe(200);
    const users = usersRes.json();
    expect(users.length).toBe(2);
    expect(users[0].role).toBe('admin');
    expect(users[1].role).toBe('user');

    // 5. Admin toggling registration to false
    const toggleRes = await fastify.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { registration_enabled: false },
    });
    expect(toggleRes.statusCode).toBe(200);
    expect(toggleRes.json().registration_enabled).toBe(false);

    // 6. Verify status now reports registrationEnabled: false
    const statusRes = await fastify.inject({
      method: 'GET',
      url: '/api/auth/status',
    });
    expect(statusRes.json().registrationEnabled).toBe(false);

    // 7. Admin updating role of standard user to admin
    const roleRes = await fastify.inject({
      method: 'PUT',
      url: `/api/admin/users/${users[1].id}/role`,
      headers: { cookie: adminCookie },
      payload: { role: 'admin' },
    });
    expect(roleRes.statusCode).toBe(200);
    expect(roleRes.json().role).toBe('admin');
  });

  it('GET /api/auth/check-username checks username availability', async () => {
    // 1. Initial setup with 'taken_user'
    await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'taken_user',
        password: 'password123',
      },
    });

    // 2. Check existing username (case-insensitive)
    const res1 = await fastify.inject({
      method: 'GET',
      url: '/api/auth/check-username?username=TAKEN_USER',
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().available).toBe(false);

    // 3. Check available username
    const res2 = await fastify.inject({
      method: 'GET',
      url: '/api/auth/check-username?username=free_user',
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().available).toBe(true);

    // 4. Check invalid short username
    const res3 = await fastify.inject({
      method: 'GET',
      url: '/api/auth/check-username?username=ab',
    });
    expect(res3.statusCode).toBe(400);
    expect(res3.json().available).toBe(false);
  });
});
