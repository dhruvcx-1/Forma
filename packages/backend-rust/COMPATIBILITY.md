# Backend and SQLite compatibility

Forma's production API is implemented in Rust using Axum and rusqlite. The
server keeps the established storage locations: SQLite at
`/app/data/body-tracker.db` and photos at `/app/data/photos`, both in the
existing `forma_data` Docker volume.

## Database behavior

- Schema version 10 is the supported release schema.
- The Compose initializer creates schema 10 only for a truly empty database.
- If the database is already schema 10 or newer, initialization verifies the
  required tables and leaves existing data untouched.
- An older or partially populated database is rejected. It is not silently
  migrated, reset, copied, or replaced.
- The API refuses to create a missing production database when run without the
  explicit initializer command.
- SQLite foreign keys and WAL are enabled by the API, preserving the established
  database behavior.

Back up `/app/data` before upgrading any self-hosted deployment. A schema older
than version 10 requires a separately planned migration before this release can
serve it.

## Release verification

Run `cargo test --locked --manifest-path packages/backend-rust/Cargo.toml` and
the Flutter checks locally. Version tags trigger independent Android APK and
multi-architecture Docker image jobs. The workflows do not run on ordinary
branch pushes.
