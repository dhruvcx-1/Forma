import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// System measurement definitions seeded during migration
// ---------------------------------------------------------------------------
const SYSTEM_MEASUREMENTS: Array<{
  name: string;
  slug: string;
  unit: string;
  display_order: number;
}> = [
  { name: 'Height', slug: 'height', unit: 'cm', display_order: 0 },
  { name: 'Waist', slug: 'waist', unit: 'cm', display_order: 1 },
  { name: 'Hips', slug: 'hips', unit: 'cm', display_order: 2 },
  { name: 'Chest', slug: 'chest', unit: 'cm', display_order: 3 },
  { name: 'Neck', slug: 'neck', unit: 'cm', display_order: 4 },
  { name: 'Left Upper Arm', slug: 'left_upper_arm', unit: 'cm', display_order: 5 },
  { name: 'Right Upper Arm', slug: 'right_upper_arm', unit: 'cm', display_order: 6 },
  { name: 'Left Forearm', slug: 'left_forearm', unit: 'cm', display_order: 7 },
  { name: 'Right Forearm', slug: 'right_forearm', unit: 'cm', display_order: 8 },
  { name: 'Left Thigh', slug: 'left_thigh', unit: 'cm', display_order: 9 },
  { name: 'Right Thigh', slug: 'right_thigh', unit: 'cm', display_order: 10 },
  { name: 'Left Calf', slug: 'left_calf', unit: 'cm', display_order: 11 },
  { name: 'Right Calf', slug: 'right_calf', unit: 'cm', display_order: 12 },
];

// ---------------------------------------------------------------------------
// Each migration is keyed by its version number (the version it upgrades TO).
// Migrations are run in order; the db's user_version is updated after each.
// ---------------------------------------------------------------------------
type Migration = (db: Database.Database) => void;

const migrations: Record<number, Migration> = {
  1: (db) => {
    // profiles
    db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // sessions
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // weight_entries
    db.exec(`
      CREATE TABLE IF NOT EXISTS weight_entries (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        value REAL NOT NULL,
        unit TEXT NOT NULL DEFAULT 'kg',
        recorded_at TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(profile_id, recorded_at)
      );
    `);

    // measurement_definitions
    db.exec(`
      CREATE TABLE IF NOT EXISTS measurement_definitions (
        id TEXT PRIMARY KEY,
        profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        unit TEXT NOT NULL,
        is_system INTEGER NOT NULL DEFAULT 0,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // measurement_entries
    db.exec(`
      CREATE TABLE IF NOT EXISTS measurement_entries (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        definition_id TEXT NOT NULL REFERENCES measurement_definitions(id) ON DELETE CASCADE,
        value REAL NOT NULL,
        recorded_at TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // goals
    db.exec(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        starting_weight REAL,
        starting_weight_unit TEXT DEFAULT 'kg',
        target_weight REAL,
        target_weight_unit TEXT DEFAULT 'kg',
        target_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // progress_photos
    db.exec(`
      CREATE TABLE IF NOT EXISTS progress_photos (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        view_type TEXT NOT NULL CHECK(view_type IN ('front', 'side', 'back', 'other')),
        recorded_at TEXT NOT NULL,
        notes TEXT,
        file_size INTEGER,
        mime_type TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // settings
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        UNIQUE(profile_id, key)
      );
    `);

    // Seed system measurement definitions with deterministic IDs (idempotent)
    const insertDef = db.prepare(`
      INSERT OR IGNORE INTO measurement_definitions (id, profile_id, name, slug, unit, is_system, display_order)
      VALUES (?, NULL, ?, ?, ?, 1, ?)
    `);

    for (const def of SYSTEM_MEASUREMENTS) {
      const defId = `sys_${def.slug}`;
      insertDef.run(defId, def.name, def.slug, def.unit, def.display_order);
    }
  },
  2: (db) => {
    const cols = db.pragma('table_info(profiles)') as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));

    if (!colNames.has('avatar_url')) {
      db.exec('ALTER TABLE profiles ADD COLUMN avatar_url TEXT;');
    }
    if (!colNames.has('bio')) {
      db.exec('ALTER TABLE profiles ADD COLUMN bio TEXT;');
    }
    if (!colNames.has('is_public')) {
      db.exec('ALTER TABLE profiles ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;');
    }
  },
  3: (db) => {
    const cols = db.pragma('table_info(profiles)') as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));

    if (!colNames.has('role')) {
      db.exec("ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user';");
      // Designate the earliest existing profile as admin
      db.exec(`
        UPDATE profiles
        SET role = 'admin'
        WHERE id = (
          SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1
        );
      `);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
  4: (db) => {
    // Fasting sessions
    db.exec(`
      CREATE TABLE IF NOT EXISTS fasting_sessions (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        fast_type TEXT NOT NULL DEFAULT '16:8',
        target_duration_hours REAL NOT NULL DEFAULT 16,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
        notes TEXT,
        mood TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_fasting_profile_status ON fasting_sessions(profile_id, status);
      CREATE INDEX IF NOT EXISTS idx_fasting_started ON fasting_sessions(profile_id, started_at DESC);
    `);

    // Nutrition plans
    db.exec(`
      CREATE TABLE IF NOT EXISTS nutrition_plans (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
        diet_type TEXT NOT NULL DEFAULT 'high_protein_low_carb',
        activity_level TEXT NOT NULL DEFAULT 'moderate',
        daily_calories REAL NOT NULL,
        protein_grams REAL NOT NULL,
        carbs_grams REAL NOT NULL,
        fat_grams REAL NOT NULL,
        protein_pct REAL NOT NULL,
        carbs_pct REAL NOT NULL,
        fat_pct REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Daily nutrition logs
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_nutrition_logs (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        calories REAL,
        protein_grams REAL,
        carbs_grams REAL,
        fat_grams REAL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(profile_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_nutrition_logs_date ON daily_nutrition_logs(profile_id, date DESC);
    `);
  },
};

// ---------------------------------------------------------------------------
// runMigrations — call once at startup with an open Database instance
// ---------------------------------------------------------------------------
export function runMigrations(database: Database.Database): void {
  // Enable foreign keys
  database.pragma('foreign_keys = ON');

  const currentVersion = database.pragma('user_version', { simple: true }) as number;
  const versionNumbers = Object.keys(migrations).map(Number);
  if (versionNumbers.length === 0) return;

  const targetVersion = Math.max(...versionNumbers);

  if (currentVersion >= targetVersion) {
    return;
  }

  for (let v = currentVersion + 1; v <= targetVersion; v++) {
    const migration = migrations[v];
    if (!migration) continue;

    const runMigration = database.transaction(() => {
      migration(database);
      database.pragma(`user_version = ${v}`);
    });

    runMigration();
    console.log(`[db] Applied migration v${v}`);
  }
}
