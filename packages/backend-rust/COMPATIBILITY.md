# Rust migration compatibility status

## Source mapping

The TypeScript service is `packages/backend/src/server.ts` plus the route
plugins in `packages/backend/src/routes/`. It initializes SQLite through
`packages/backend/src/db/index.ts`, which sets WAL and foreign keys and applies
migrations 1–10 from `db/migrations.ts` at startup. Production mounts the
existing volume at `/app/data`, uses `/app/data/body-tracker.db`, and stores
photos under `/app/data/photos`.

The Rust API is implemented in `packages/backend-rust/src/main.rs` using Axum
and rusqlite. Route registrations are grouped by auth, measurements and weight,
profile and admin, photos, export/import, fasting, nutrition, body composition,
and AI. The legacy TypeScript service remains the production service.

## Database safety

- Rust requires the already migrated schema and does not execute schema SQL.
- Startup rejects a missing production database and rejects a schema version
  below 10. It does not create, seed, reset, copy, or migrate a database.
- SQLite foreign keys are enabled per connection; WAL is retained, matching the
  TypeScript connection setup. Existing tables, indexes, and data are left in
  place.
- Parity checks use uniquely named SQLite files beneath the ignored
  `packages/backend-rust/data/parity` directory. Both services point at
  separate files until the dedicated disposable cross-compatibility phase.
- No production database path or production data was read by development or
  verification.

## Verification performed

`scripts/parity.ps1` compares representative unauthenticated and authenticated
responses and synthetic writes across the two services. It also opens a
TypeScript-created disposable database in Rust, reuses its session, writes a
synthetic weight row from Rust, then reopens the same file in TypeScript and
reads that row. The checks include profile/admin/public-profile behavior,
settings, goals, measurements, nutrition, fasting, body composition, and
encrypted AI settings and memory. The current run passes.

The existing TypeScript backend suite passes 52/52 tests against a separate
disposable database. Rust formatting and `cargo check --locked` pass.

Remaining parity work includes exact Zod validation issue payloads across all
schemas, complete CRUD/error-precedence coverage for every route, multipart
photo/avatar file behavior, and provider-backed AI integration behavior. The
local Docker daemon was unavailable, so `Dockerfile.rust` has not been built
locally. These gaps prevent treating this implementation as fully verified for
production traffic.

## Staged migration plan and rollback

1. Close the remaining route and validation gaps, and expand the synthetic
   parity suite until every route has success, auth, validation, and not-found
   coverage.
2. Build and inspect the Rust image in CI/staging, then test it against a
   disposable copy with no production data.
3. Review the file diff, database safeguards, verification evidence, and
   rollback procedure before any production switch.
4. If a later approved switch fails, restore the previously deployed
   TypeScript image and keep the existing `forma_data` volume mounted at
   `/app/data`. Rust must not run migrations; do not roll back by restoring,
   deleting, or replacing the database file.

No production traffic switch, database migration, volume change, or removal
of the TypeScript service is part of this work.
