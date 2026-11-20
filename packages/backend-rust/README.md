# Rust backend (staged compatibility implementation)

This service is implemented alongside the TypeScript backend. The regular
Dockerfile, production Compose service, and published image remain on
TypeScript.

## Safe local development

Use a new, disposable path for Rust development. Do not reuse the TypeScript
data directory, a production volume, or a database containing user data. The
Rust process never creates or migrates a schema: it rejects an empty database
or one without a Forma `user_version`.

From the repository root in PowerShell:

```powershell
$env:DATABASE_PATH = (Join-Path $PWD 'packages/backend-rust/data/rust-dev.db')
npm run db:migrate --workspace=@forma/backend
cargo run --manifest-path packages/backend-rust/Cargo.toml
```

The migration command initializes only the disposable path explicitly selected
in the current shell. Never run it with a production `DATABASE_PATH`. For the
Rust service itself, the default when no path is set is
`./data/forma-rust-dev.db`; it refuses to create a missing database in
production mode.

Rust enables foreign keys and WAL on its SQLite connection and checks for the
existing latest schema version. It applies no SQL migrations.

## Parity smoke check

From the repository root, run:

```powershell
./packages/backend-rust/scripts/parity.ps1
```

The script creates two uniquely named databases under
`packages/backend-rust/data/parity`, initializes them with the existing
TypeScript migrations, and runs both APIs against those separate databases.
It compares synthetic auth, read, and write behavior. Disposable databases
and logs are ignored by Git. The check covers representative behavior, not
every endpoint and edge case.

`Dockerfile.rust` builds a separate Rust image for staged review. It preserves
the `/app/data` path and existing database filename. Do not switch production
traffic yet; compatibility work is ongoing, and the TypeScript backend remains
available for comparison and rollback.
