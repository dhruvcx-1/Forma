import { hash, verify } from '@node-rs/argon2';
import { nanoid } from 'nanoid';
import { addDays } from 'date-fns';
import { db } from '../db/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  role: 'admin' | 'user';
  created_at: string;
}

interface SessionRow {
  id: string;
  profile_id: string;
  expires_at: string;
}

interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: number;
  role?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

/**
 * Hash a plain-text password using argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: 2, // argon2id
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a plain-text password against an argon2 hash.
 */
export async function verifyPassword(
  password: string,
  hash_: string,
): Promise<boolean> {
  try {
    return await verify(hash_, password);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

const SESSION_TTL_DAYS = 30;

const stmtInsertSession = db.prepare<[string, string, string]>(`
  INSERT INTO sessions (id, profile_id, expires_at)
  VALUES (?, ?, ?)
`);

const stmtGetSession = db.prepare<[string], SessionRow>(`
  SELECT id, profile_id, expires_at
  FROM sessions
  WHERE id = ? AND expires_at > datetime('now')
`);

const stmtGetProfile = db.prepare<[string], ProfileRow>(`
  SELECT id, username, display_name, avatar_url, bio, is_public, role, created_at
  FROM profiles
  WHERE id = ?
`);

const stmtDeleteSession = db.prepare<[string]>(`
  DELETE FROM sessions WHERE id = ?
`);

const stmtDeleteExpiredSessions = db.prepare(`
  DELETE FROM sessions WHERE expires_at <= datetime('now')
`);

/**
 * Create a new session for the given profile and return the session ID.
 * Expired sessions are pruned opportunistically on each call.
 */
export function createSession(profileId: string): string {
  // Opportunistically clean up expired sessions
  stmtDeleteExpiredSessions.run();

  const sessionId = nanoid();
  const expiresAt = addDays(new Date(), SESSION_TTL_DAYS).toISOString();
  stmtInsertSession.run(sessionId, profileId, expiresAt);
  return sessionId;
}

/**
 * Validate a session cookie value and return the associated Profile, or null
 * if the session does not exist or has expired.
 */
export function getSession(sessionId: string): Profile | null {
  const session = stmtGetSession.get(sessionId);
  if (!session) return null;

  const profile = stmtGetProfile.get(session.profile_id);
  if (!profile) return null;

  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url ?? null,
    bio: profile.bio ?? null,
    is_public: Boolean(profile.is_public),
    role: (profile.role as 'admin' | 'user') || 'user',
    created_at: profile.created_at,
  };
}

/**
 * Get profile by ID directly.
 */
export function getProfileById(profileId: string): Profile | null {
  const profile = stmtGetProfile.get(profileId);
  if (!profile) return null;

  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url ?? null,
    bio: profile.bio ?? null,
    is_public: Boolean(profile.is_public),
    role: (profile.role as 'admin' | 'user') || 'user',
    created_at: profile.created_at,
  };
}

/**
 * Invalidate a session (logout).
 */
export function deleteSession(sessionId: string): void {
  stmtDeleteSession.run(sessionId);
}
