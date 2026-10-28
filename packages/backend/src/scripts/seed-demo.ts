import path from 'node:path';
import { db } from '../db/index.js';
import { hashPassword } from '../auth/index.js';
import { nanoid } from 'nanoid';
import { subDays, format } from 'date-fns';

async function seedDemoUser() {
  console.log('[seed] Seeding demo user into body-tracker.db...');

  const username = 'demo';
  const password = 'password123';
  const displayName = 'Alex Miller';
  const bio = 'Tracking my body recomposition and intermittent fasting journey.';
  const passwordHash = await hashPassword(password);

  // Check if demo user already exists
  let profile = db
    .prepare('SELECT id FROM profiles WHERE username = ?')
    .get(username) as { id: string } | undefined;

  let profileId: string;

  if (profile) {
    profileId = profile.id;
    console.log(`[seed] Existing demo user found (id: ${profileId}). Refreshing data...`);
    db.prepare(
      `UPDATE profiles SET display_name = ?, bio = ?, is_public = 1, role = 'admin', password_hash = ? WHERE id = ?`
    ).run(displayName, bio, passwordHash, profileId);

    // Clean up old demo records for this user to ensure clean state
    db.prepare('DELETE FROM weight_entries WHERE profile_id = ?').run(profileId);
    db.prepare('DELETE FROM measurement_entries WHERE profile_id = ?').run(profileId);
    db.prepare('DELETE FROM goals WHERE profile_id = ?').run(profileId);
    db.prepare('DELETE FROM settings WHERE profile_id = ?').run(profileId);
    db.prepare('DELETE FROM fasting_sessions WHERE profile_id = ?').run(profileId);
    db.prepare('DELETE FROM nutrition_plans WHERE profile_id = ?').run(profileId);
    db.prepare('DELETE FROM daily_nutrition_logs WHERE profile_id = ?').run(profileId);
  } else {
    profileId = nanoid();
    db.prepare(
      `INSERT INTO profiles (id, username, password_hash, display_name, bio, is_public, role) 
       VALUES (?, ?, ?, ?, ?, 1, 'admin')`
    ).run(profileId, username, passwordHash, displayName, bio);
    console.log(`[seed] Created new demo user profile (id: ${profileId}).`);
  }

  // 1. Settings: Male, 178 cm, Metric, Age 32
  const settingsInsert = db.prepare(
    `INSERT INTO settings (id, profile_id, key, value) VALUES (?, ?, ?, ?)`
  );
  settingsInsert.run(nanoid(), profileId, 'unit_system', 'metric');
  settingsInsert.run(nanoid(), profileId, 'height_cm', '178');
  settingsInsert.run(nanoid(), profileId, 'sex', 'male');
  settingsInsert.run(nanoid(), profileId, 'date_of_birth', '1994-06-15');

  // 2. Goal: Lose weight from 91.5 kg down to 77.0 kg
  db.prepare(
    `INSERT INTO goals (id, profile_id, starting_weight, starting_weight_unit, target_weight, target_weight_unit, target_date, notes)
     VALUES (?, ?, 91.5, 'kg', 77.0, 'kg', ?, ?)`
  ).run(
    nanoid(),
    profileId,
    format(subDays(new Date(), -90), 'yyyy-MM-dd'),
    'Lean down to a healthy athletic BMI of 24.3 through High-Protein / Low-Carb and 16:8 IF.'
  );

  // 3. Weight Entries: 60 days of realistic weight loss with daily water-weight swings
  // Starting at 91.5 kg, trending down to 86.8 kg (overweight BMI 27.4, weight > 80kg)
  const weightInsert = db.prepare(
    `INSERT INTO weight_entries (id, profile_id, value, unit, recorded_at, notes)
     VALUES (?, ?, ?, 'kg', ?, ?)`
  );

  let currentWeight = 91.5;
  for (let i = 60; i >= 0; i--) {
    const entryDate = subDays(new Date(), i);
    const dateStr = entryDate.toISOString();

    // Natural fluctuation (-0.25 to +0.20 kg random noise) + steady downward trend (-0.08 kg/day)
    const noise = Math.sin(i * 1.5) * 0.35 + (Math.random() * 0.2 - 0.1);
    const trendDrop = (60 - i) * (4.7 / 60); // Total ~4.7 kg drop over 60 days
    const weightVal = Math.round((91.5 - trendDrop + noise) * 10) / 10;

    let note: string | null = null;
    if (i === 60) note = 'Starting baseline weight log';
    else if (i === 45) note = 'First 16:8 fast completed, feeling energized';
    else if (i === 30) note = 'One month check-in. Consistent progress';
    else if (i === 14) note = 'Noticeable waist reduction';
    else if (i === 0) note = 'Morning weigh-in after 14-hour fast';

    weightInsert.run(nanoid(), profileId, weightVal, dateStr, note);
  }
  console.log('[seed] Populated 61 daily weight records.');

  // 4. Body Measurements: 8 weeks of progress (waist, hips, chest, neck, arms, thighs, calves)
  // Retrieve system definitions
  const defs = db
    .prepare(`SELECT id, slug FROM measurement_definitions WHERE is_system = 1`)
    .all() as Array<{ id: string; slug: string }>;

  const defMap: Record<string, string> = {};
  for (const d of defs) defMap[d.slug] = d.id;

  const measInsert = db.prepare(
    `INSERT INTO measurement_entries (id, profile_id, definition_id, value, recorded_at, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  // Starting and current measurement profiles
  const measurementMilestones = [
    { daysAgo: 56, waist: 98.0, hips: 105.0, chest: 108.0, neck: 41.0, arm: 36.5, thigh: 63.0, calf: 39.0 },
    { daysAgo: 42, waist: 96.5, hips: 104.0, chest: 107.5, neck: 40.5, arm: 36.5, thigh: 62.5, calf: 39.0 },
    { daysAgo: 28, waist: 95.0, hips: 103.0, chest: 107.0, neck: 40.5, arm: 36.7, thigh: 61.8, calf: 38.8 },
    { daysAgo: 14, waist: 93.8, hips: 102.0, chest: 106.5, neck: 40.0, arm: 36.7, thigh: 61.2, calf: 38.6 },
    { daysAgo: 0,  waist: 92.5, hips: 101.0, chest: 106.0, neck: 39.5, arm: 36.8, thigh: 60.5, calf: 38.5 },
  ];

  for (const m of measurementMilestones) {
    const timeStr = subDays(new Date(), m.daysAgo).toISOString();
    if (defMap.waist) measInsert.run(nanoid(), profileId, defMap.waist, m.waist, timeStr, null);
    if (defMap.hips) measInsert.run(nanoid(), profileId, defMap.hips, m.hips, timeStr, null);
    if (defMap.chest) measInsert.run(nanoid(), profileId, defMap.chest, m.chest, timeStr, null);
    if (defMap.neck) measInsert.run(nanoid(), profileId, defMap.neck, m.neck, timeStr, null);
    if (defMap.left_upper_arm) measInsert.run(nanoid(), profileId, defMap.left_upper_arm, m.arm, timeStr, null);
    if (defMap.right_upper_arm) measInsert.run(nanoid(), profileId, defMap.right_upper_arm, m.arm, timeStr, null);
    if (defMap.left_thigh) measInsert.run(nanoid(), profileId, defMap.left_thigh, m.thigh, timeStr, null);
    if (defMap.right_thigh) measInsert.run(nanoid(), profileId, defMap.right_thigh, m.thigh, timeStr, null);
    if (defMap.left_calf) measInsert.run(nanoid(), profileId, defMap.left_calf, m.calf, timeStr, null);
    if (defMap.right_calf) measInsert.run(nanoid(), profileId, defMap.right_calf, m.calf, timeStr, null);
  }
  console.log('[seed] Populated 50 body tape measurement records across 5 bi-weekly check-ins.');

  // 5. Fasting Sessions:
  // - 1 ACTIVE FAST started ~13.5 hours ago (in Stage 4: The Metabolic Switch & Early Ketosis!)
  const activeStart = new Date(Date.now() - 13.5 * 3600 * 1000).toISOString();
  db.prepare(
    `INSERT INTO fasting_sessions (id, profile_id, fast_type, target_duration_hours, started_at, status, notes)
     VALUES (?, ?, '16:8', 16, ?, 'active', ?)`
  ).run(nanoid(), profileId, activeStart, 'Feeling sharp and focused. Had black coffee and electrolytes.');

  // - Past completed fasts
  const pastFasts = [
    { daysAgo: 1, type: '16:8', target: 16, durationHours: 16.4, mood: 'great', notes: 'Broke fast with ribeye and avocado' },
    { daysAgo: 3, type: '18:6', target: 18, durationHours: 18.2, mood: 'good', notes: 'Felt great mental clarity during afternoon work' },
    { daysAgo: 5, type: '20:4', target: 20, durationHours: 20.5, mood: 'great', notes: 'Warrior fast day, very light digestion' },
    { daysAgo: 7, type: '24:0', target: 24, durationHours: 24.3, mood: 'good', notes: 'Full 24-hour autophagy milestone achieved!' },
    { daysAgo: 9, type: '16:8', target: 16, durationHours: 16.0, mood: 'neutral', notes: 'Slight hunger pangs at hour 14 but passed quickly' },
    { daysAgo: 12, type: '16:8', target: 16, durationHours: 16.5, mood: 'great', notes: 'Smooth morning fast' },
  ];

  for (const pf of pastFasts) {
    const started = subDays(new Date(), pf.daysAgo);
    const ended = new Date(started.getTime() + pf.durationHours * 3600 * 1000);
    db.prepare(
      `INSERT INTO fasting_sessions (id, profile_id, fast_type, target_duration_hours, started_at, ended_at, status, mood, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)`
    ).run(
      nanoid(),
      profileId,
      pf.type,
      pf.target,
      started.toISOString(),
      ended.toISOString(),
      pf.mood,
      pf.notes
    );
  }
  console.log('[seed] Populated 1 active fast (Stage 4) and 6 completed historical fasts.');

  // 6. Nutrition Plan: High-Protein / Low-Carb
  // Max Ideal Weight for 178cm is 78.9 kg. 78.9 * 2.2 = 173.6g Protein!
  db.prepare(
    `INSERT INTO nutrition_plans (id, profile_id, diet_type, activity_level, daily_calories, protein_grams, carbs_grams, fat_grams, protein_pct, carbs_pct, fat_pct)
     VALUES (?, ?, 'high_protein_low_carb', 'moderate', 2050, 174, 128, 90, 34, 25, 41)`
  ).run(nanoid(), profileId);

  // 7. Daily Nutrition Logs for past 7 days
  const dailyNutritionInsert = db.prepare(
    `INSERT INTO daily_nutrition_logs (id, profile_id, date, calories, protein_grams, carbs_grams, fat_grams, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const logs = [
    { daysAgo: 0, cal: 1480, p: 135, c: 80, f: 65, notes: 'Post-workout whey shake, 4 scrambled eggs, grilled chicken breast salad' },
    { daysAgo: 1, cal: 2020, p: 175, c: 122, f: 88, notes: 'Target hit! Steak, roasted asparagus, sweet potato with butter' },
    { daysAgo: 2, cal: 1980, p: 170, c: 115, f: 92, notes: 'Salmon fillet with avocado and broccoli' },
    { daysAgo: 3, cal: 2100, p: 168, c: 135, f: 95, notes: 'Higher carb training day' },
    { daysAgo: 4, cal: 2040, p: 172, c: 125, f: 89, notes: 'Ground beef bowl with rice and guacamole' },
    { daysAgo: 5, cal: 1920, p: 166, c: 110, f: 85, notes: 'Clean eating day, felt great' },
    { daysAgo: 6, cal: 2080, p: 174, c: 130, f: 90, notes: 'Roast chicken and grilled peppers' },
  ];

  for (const l of logs) {
    const dStr = format(subDays(new Date(), l.daysAgo), 'yyyy-MM-dd');
    dailyNutritionInsert.run(nanoid(), profileId, dStr, l.cal, l.p, l.c, l.f, l.notes);
  }
  console.log('[seed] Populated 7 daily nutrition logs.');

  console.log('\n======================================================');
  console.log('🎉 DEMO USER CREATED SUCCESSFULLY!');
  console.log('======================================================');
  console.log('  Username:     demo');
  console.log('  Password:     password123');
  console.log('  Display Name: Alex Miller');
  console.log('  Sex:          Male');
  console.log('  Height:       178 cm (5\' 10")');
  console.log('  Weight:       86.8 kg (Overweight BMI 27.4, >80kg rule)');
  console.log('  Goal Target:  77.0 kg');
  console.log('  Active Fast:  16:8 Fast (Stage 4: Metabolic Switch & Ketosis)');
  console.log('  Nutrition:    High-Protein / Low-Carb (2050 kcal, 174g P)');
  console.log('======================================================\n');
}

seedDemoUser().catch((err) => {
  console.error('[seed] Error seeding demo user:', err);
  process.exit(1);
});
