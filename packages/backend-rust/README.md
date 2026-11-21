# Forma Rust backend

The Axum service in `src/main.rs` is the Forma API and serves the Flutter Web
build from the same origin. SQLite is stored at `DATABASE_PATH` (default
`./data/forma-rust-dev.db`); the production container uses
`/app/data/body-tracker.db`. Photos are stored under `PHOTOS_PATH`.

## Local development

Use a disposable database path for local work. Initialization creates schema
version 10 only when the SQLite file is empty. It is idempotent on a current
schema and refuses to alter an older or partially populated database.

```powershell
$env:DATABASE_PATH = (Join-Path $PWD 'packages/backend-rust/data/rust-dev.db')
cargo run --locked --manifest-path packages/backend-rust/Cargo.toml -- --init-db
cargo run --locked --manifest-path packages/backend-rust/Cargo.toml
```

Set `COOKIE_SECRET` to at least 32 characters when running with
`NODE_ENV=production`. Rust enables SQLite foreign keys and WAL. It does not
automatically migrate existing databases.

## Production data safety

Docker Compose runs `forma-backend --init-db` as a one-shot service before the
API starts, using the same `forma_data` volume. Existing schema-10 databases
are only checked; the file, records, and photo directory are preserved. Older
schemas stop startup and require a separately planned migration.

Release workflow `.github/workflows/publish.yml` runs only for version tags. It
builds the Android APK and multi-architecture Rust server image concurrently.
