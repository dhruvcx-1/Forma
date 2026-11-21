use rusqlite::{Connection, OptionalExtension, TransactionBehavior};

pub const LATEST_SCHEMA_VERSION: i64 = 10;

const INITIAL_SCHEMA: &str = r#"
CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    avatar_url TEXT,
    bio TEXT,
    is_public INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'user'
);
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE weight_entries (
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
CREATE TABLE measurement_definitions (
    id TEXT PRIMARY KEY,
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    unit TEXT NOT NULL,
    is_system INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE measurement_entries (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    definition_id TEXT NOT NULL REFERENCES measurement_definitions(id) ON DELETE CASCADE,
    value REAL NOT NULL,
    recorded_at TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE goals (
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
CREATE TABLE progress_photos (
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
CREATE TABLE settings (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    UNIQUE(profile_id, key)
);
CREATE TABLE system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE fasting_sessions (
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
CREATE INDEX idx_fasting_profile_status ON fasting_sessions(profile_id, status);
CREATE INDEX idx_fasting_started ON fasting_sessions(profile_id, started_at DESC);
CREATE TABLE nutrition_plans (
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
CREATE TABLE daily_nutrition_logs (
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
CREATE INDEX idx_nutrition_logs_date ON daily_nutrition_logs(profile_id, date DESC);
CREATE TABLE ai_provider_settings (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 0,
    base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    model TEXT NOT NULL DEFAULT '',
    coach_mode TEXT NOT NULL DEFAULT 'friend',
    custom_coach_prompt TEXT NOT NULL DEFAULT '',
    api_key_ciphertext BLOB,
    api_key_iv BLOB,
    api_key_tag BLOB,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    chat_history_limit INTEGER NOT NULL DEFAULT 20,
    coach_avatar_url TEXT,
    custom_coach_name TEXT NOT NULL DEFAULT '',
    share_user_name INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE ai_chat_messages (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sequence INTEGER
);
CREATE INDEX idx_ai_chat_profile_created ON ai_chat_messages(profile_id, created_at DESC);
CREATE UNIQUE INDEX idx_ai_chat_profile_sequence ON ai_chat_messages(profile_id, sequence);
CREATE TABLE ai_weekly_reports (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ai_reports_profile_created ON ai_weekly_reports(profile_id, created_at DESC);
CREATE TABLE ai_chat_memory (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    summary TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO measurement_definitions (id, name, slug, unit, is_system, display_order)
VALUES
    ('sys_height', 'Height', 'height', 'cm', 1, 0),
    ('sys_waist', 'Waist', 'waist', 'cm', 1, 1),
    ('sys_hips', 'Hips', 'hips', 'cm', 1, 2),
    ('sys_chest', 'Chest', 'chest', 'cm', 1, 3),
    ('sys_neck', 'Neck', 'neck', 'cm', 1, 4),
    ('sys_left_upper_arm', 'Left Upper Arm', 'left_upper_arm', 'cm', 1, 5),
    ('sys_right_upper_arm', 'Right Upper Arm', 'right_upper_arm', 'cm', 1, 6),
    ('sys_left_forearm', 'Left Forearm', 'left_forearm', 'cm', 1, 7),
    ('sys_right_forearm', 'Right Forearm', 'right_forearm', 'cm', 1, 8),
    ('sys_left_thigh', 'Left Thigh', 'left_thigh', 'cm', 1, 9),
    ('sys_right_thigh', 'Right Thigh', 'right_thigh', 'cm', 1, 10),
    ('sys_left_calf', 'Left Calf', 'left_calf', 'cm', 1, 11),
    ('sys_right_calf', 'Right Calf', 'right_calf', 'cm', 1, 12);
"#;

pub fn initialize_empty_database(conn: &mut Connection) -> Result<(), String> {
    let version = user_version(conn)?;
    if version >= LATEST_SCHEMA_VERSION {
        return verify_existing_schema(conn);
    }

    let table_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if version != 0 || table_count != 0 {
        return Err(format!(
            "Refusing to initialize a non-empty or older database (user_version={version}, tables={table_count})."
        ));
    }

    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    tx.execute_batch(INITIAL_SCHEMA)
        .map_err(|error| error.to_string())?;
    tx.pragma_update(None, "user_version", LATEST_SCHEMA_VERSION)
        .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    verify_existing_schema(conn)
}

pub fn verify_existing_schema(conn: &Connection) -> Result<(), String> {
    let version = user_version(conn)?;
    let profiles = table_exists(conn, "profiles")?;
    let sessions = table_exists(conn, "sessions")?;
    if version < LATEST_SCHEMA_VERSION || !profiles || !sessions {
        return Err(format!(
            "Expected Forma schema version {LATEST_SCHEMA_VERSION} or newer; found version {version}. Older non-empty databases are not migrated automatically."
        ));
    }
    Ok(())
}

fn user_version(conn: &Connection) -> Result<i64, String> {
    conn.pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn table_exists(conn: &Connection, name: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
        [name],
        |row| row.get(0),
    )
    .optional()
    .map(|value| value.unwrap_or(false))
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initializes_only_a_fresh_database_and_is_idempotent_at_latest_version() {
        let mut conn = Connection::open_in_memory().expect("open fixture database");

        initialize_empty_database(&mut conn).expect("initialize fresh fixture");
        assert_eq!(user_version(&conn).expect("read schema version"), 10);
        assert_eq!(
            conn.query_row(
                "SELECT count(*) FROM measurement_definitions WHERE is_system=1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count seeded measurement definitions"),
            13
        );
        initialize_empty_database(&mut conn).expect("validate current schema without changes");
    }

    #[test]
    fn refuses_to_modify_an_older_non_empty_database() {
        let mut conn = Connection::open_in_memory().expect("open fixture database");
        conn.execute_batch("CREATE TABLE profiles (id TEXT PRIMARY KEY);")
            .expect("create non-empty old schema");

        assert!(initialize_empty_database(&mut conn).is_err());
        assert_eq!(user_version(&conn).expect("read schema version"), 0);
    }
}
