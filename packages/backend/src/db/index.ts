import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from './migrations.js';

export type { DatabaseType };

// ---------------------------------------------------------------------------
// Resolve database path from environment
// ---------------------------------------------------------------------------
const dbPath = process.env.DATABASE_PATH ?? './data/body-tracker.db';
const resolvedPath = path.resolve(dbPath);

// Ensure the directory exists
const dbDir = path.dirname(resolvedPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Open / create the SQLite database
// ---------------------------------------------------------------------------
export const db: DatabaseType = new Database(resolvedPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run all pending migrations on startup
runMigrations(db);

console.log(`[db] Connected to ${resolvedPath}`);
