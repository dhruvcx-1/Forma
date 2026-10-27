import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db/index.js';
import { runMigrations } from '../db/migrations.js';
import fastify from '../server.js';

describe('Public Profile & Avatar Routes', () => {
  const testUsername = `testuser_${Date.now()}`;
  let profileId = '';

  beforeAll(() => {
    runMigrations(db);

    profileId = `test_prof_${Date.now()}`;
    db.prepare(`
      INSERT INTO profiles (id, username, password_hash, display_name, bio, is_public)
      VALUES (?, ?, 'hash123', 'Test User', 'My fitness journey', 0)
    `).run(profileId, testUsername);

    // Add some weight entries
    db.prepare(`
      INSERT INTO weight_entries (id, profile_id, value, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(`w1_${Date.now()}`, profileId, 85.5, '2026-01-01');

    db.prepare(`
      INSERT INTO weight_entries (id, profile_id, value, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(`w2_${Date.now()}`, profileId, 82.0, '2026-02-01');
  });

  it('returns 404 when profile is private (default)', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: `/api/public/profile/${testUsername}`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.is_public).toBe(false);
  });

  it('returns 404 for non-existent profile', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/public/profile/non_existent_user_999999',
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns public profile data and weight history when is_public is 1', async () => {
    // Set is_public to 1
    db.prepare('UPDATE profiles SET is_public = 1 WHERE id = ?').run(profileId);

    const res = await fastify.inject({
      method: 'GET',
      url: `/api/public/profile/${testUsername}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.profile.username).toBe(testUsername);
    expect(body.profile.display_name).toBe('Test User');
    expect(body.profile.bio).toBe('My fitness journey');

    expect(body.stats.start_weight).toBe(85.5);
    expect(body.stats.current_weight).toBe(82.0);
    expect(body.stats.total_change).toBe(-3.5);
    expect(body.stats.total_entries).toBe(2);

    expect(body.history).toHaveLength(2);
    expect(body.history[0].date).toBe('2026-01-01');
    expect(body.history[1].date).toBe('2026-02-01');
  });

  it('strips leading @ in username parameter correctly', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: `/api/public/profile/@${testUsername}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.profile.username).toBe(testUsername);
  });

  it('returns 404 for missing avatar file', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/profile/avatar/non_existent_avatar.png',
    });

    expect(res.statusCode).toBe(404);
  });
});
