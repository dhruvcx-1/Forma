import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';

interface ProfileDbRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: number;
  created_at: string;
}

interface WeightRow {
  date: string;
  weight: number;
}

interface GoalRow {
  target_weight: number;
  starting_weight: number | null;
  target_date: string | null;
}

interface SettingRow {
  value: string;
}

const publicRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/public/profile/:username
   * Public profile progress showcase
   */
  fastify.get('/api/public/profile/:username', async (request, reply) => {
    const { username } = request.params as { username: string };
    const cleanUsername = username.replace(/^@/, '').trim();

    const profile = db
      .prepare<[string], ProfileDbRow>(`
        SELECT id, username, display_name, avatar_url, bio, is_public, created_at
        FROM profiles
        WHERE LOWER(username) = LOWER(?)
      `)
      .get(cleanUsername);

    if (!profile || !profile.is_public) {
      return reply.code(404).send({
        error: 'Profile is private or does not exist',
        is_public: false,
      });
    }

    // Weight entries ordered chronologically
    const weightEntries = db
      .prepare<[string], WeightRow>(`
        SELECT recorded_at as date, value as weight
        FROM weight_entries
        WHERE profile_id = ?
        ORDER BY recorded_at ASC
      `)
      .all(profile.id);

    // Goal
    const goal = db
      .prepare<[string], GoalRow>(`
        SELECT target_weight, starting_weight, target_date
        FROM goals
        WHERE profile_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(profile.id);

    // Unit system
    const unitSetting = db
      .prepare<[string, string], SettingRow>(`
        SELECT value FROM settings WHERE profile_id = ? AND key = ?
      `)
      .get(profile.id, 'unit_system');

    const unitSystem = (unitSetting?.value === 'imperial' ? 'imperial' : 'metric') as 'metric' | 'imperial';

    const startWeight = weightEntries.length > 0
      ? weightEntries[0].weight
      : (goal?.starting_weight ?? null);

    const currentWeight = weightEntries.length > 0
      ? weightEntries[weightEntries.length - 1].weight
      : null;

    const totalChange = startWeight !== null && currentWeight !== null
      ? Math.round((currentWeight - startWeight) * 100) / 100
      : null;

    return reply.send({
      profile: {
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
        created_at: profile.created_at,
      },
      stats: {
        start_weight: startWeight,
        current_weight: currentWeight,
        total_change: totalChange,
        goal_weight: goal?.target_weight ?? null,
        goal_target_date: goal?.target_date ?? null,
        total_entries: weightEntries.length,
        first_date: weightEntries.length > 0 ? weightEntries[0].date : null,
        latest_date: weightEntries.length > 0 ? weightEntries[weightEntries.length - 1].date : null,
        unit_system: unitSystem,
      },
      history: weightEntries,
    });
  });
};

export default publicRoutes;
