# Flutter and Rust application architecture

## Application layout

- `packages/flutter_app` contains the Flutter and Material 3 user interface for
  Web and Android.
- `packages/backend-rust` contains the Axum API and SQLite data access layer.
- The Docker image serves Flutter Web and the API from a single Rust process
  and origin. Android connects to the same API.

## Data and upgrade boundary

The production database is `/app/data/body-tracker.db`; uploaded photos are in
`/app/data/photos`. Both live in the existing `forma_data` Docker volume. Back
up this volume before upgrades and keep it mounted when replacing the image.

The release schema is SQLite `user_version` 10. Compose runs an explicit
initializer before the service: it creates schema 10 only for an empty new
database, verifies a current database without changing it, and stops on an
older or partially initialized database. The Rust API itself never silently
migrates existing production data.

## API feature map

| Feature | Flutter implementation | API areas |
|---|---|---|
| Setup, login, registration | `lib/screens/auth_screen.dart`, `lib/screens/onboarding_screen.dart`, `lib/state/session_state.dart` | Auth and profile |
| Dashboard and weight | `lib/screens/home_screen.dart`, `lib/screens/record_screens.dart` | Weight, body composition, goals, nutrition, fasting |
| Measurements | `lib/screens/record_screens.dart` | Definitions, entries, history, batch logging |
| Goals and nutrition | `lib/screens/progress_screens.dart` | Goal and nutrition operations |
| Fasting and share widget | `lib/screens/progress_screens.dart`, `lib/screens/account_screens.dart` | Fasting sessions and public widget |
| Photos, profile, settings | `lib/screens/account_screens.dart` | Profile, photos, settings, backups, administration |
| AI coach and reports | `lib/screens/ai_screen.dart` | Provider settings, chat memory, reports |

## Local development and releases

Use a disposable SQLite database for local development. See
`packages/backend-rust/README.md` for the Rust startup commands. Release tags
build and publish the Android APK and server Docker image in parallel; regular
branch pushes do not run those release jobs.
