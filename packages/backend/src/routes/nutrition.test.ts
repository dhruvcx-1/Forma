import { describe, it, expect, beforeEach } from 'vitest';
import { fastify } from '../server.js';
import { db } from '../db/index.js';

function getSessionCookie(res: any): string {
  const cookie = res.cookies?.find((c: any) => c.name === 'session_id');
  return cookie ? `session_id=${cookie.value}` : '';
}

describe('Nutrition & Macro Plan API', () => {
  let sessionCookie: string;

  beforeEach(async () => {
    db.exec(`
      DELETE FROM sessions;
      DELETE FROM nutrition_plans;
      DELETE FROM daily_nutrition_logs;
      DELETE FROM weight_entries;
      DELETE FROM settings;
      DELETE FROM profiles;
    `);

    // Setup user
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'nutrition_user',
        password: 'password123',
      },
    });
    sessionCookie = getSessionCookie(res);

    // Save height and sex
    await fastify.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { cookie: sessionCookie },
      payload: {
        height_cm: '175',
        sex: 'male',
        unit_system: 'metric',
      },
    });

    // Record weight: 85kg (> 80kg to test max ideal weight rule)
    await fastify.inject({
      method: 'POST',
      url: '/api/weight',
      headers: { cookie: sessionCookie },
      payload: {
        value: 85,
        unit: 'kg',
        recorded_at: new Date().toISOString(),
      },
    });
  });

  it('GET /api/nutrition/plan returns default High-Protein/Low-Carb calculated plan with Max Ideal Weight rule', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/nutrition/plan',
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.calculated.dietType).toBe('high_protein_low_carb');
    // For 85 kg at 175cm, max ideal weight is 76.3 kg
    expect(body.calculated.isIdealWeightUsed).toBe(true);
    expect(body.calculated.basisWeightKg).toBeCloseTo(76.3, 1);
    expect(body.calculated.proteinGrams).toBe(168);
    expect(body.calculated.dailyCalories).toBeGreaterThan(1500);
  });

  it('PUT /api/nutrition/plan saves custom plan and GET returns it', async () => {
    const customPlan = {
      diet_type: 'keto',
      activity_level: 'moderate',
      daily_calories: 2100,
      protein_grams: 140,
      carbs_grams: 25,
      fat_grams: 160,
      protein_pct: 27,
      carbs_pct: 5,
      fat_pct: 68,
    };

    const putRes = await fastify.inject({
      method: 'PUT',
      url: '/api/nutrition/plan',
      headers: { cookie: sessionCookie },
      payload: customPlan,
    });
    expect(putRes.statusCode).toBe(200);

    const getRes = await fastify.inject({
      method: 'GET',
      url: '/api/nutrition/plan',
      headers: { cookie: sessionCookie },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().plan.diet_type).toBe('keto');
    expect(getRes.json().plan.daily_calories).toBe(2100);
  });

  it('POST & GET /api/nutrition/logs tracks daily nutrition intake', async () => {
    const today = new Date().toISOString().split('T')[0];

    const logRes = await fastify.inject({
      method: 'POST',
      url: '/api/nutrition/logs',
      headers: { cookie: sessionCookie },
      payload: {
        date: today,
        calories: 1950,
        protein_grams: 160,
        carbs_grams: 85,
        fat_grams: 70,
        notes: 'High protein dinner',
      },
    });
    expect(logRes.statusCode).toBe(200);

    const fetchRes = await fastify.inject({
      method: 'GET',
      url: `/api/nutrition/logs?date=${today}`,
      headers: { cookie: sessionCookie },
    });
    expect(fetchRes.statusCode).toBe(200);
    expect(fetchRes.json().log.calories).toBe(1950);
    expect(fetchRes.json().log.protein_grams).toBe(160);
  });
});
