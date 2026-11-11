# Flutter app architecture

## Application layout

- `packages/flutter_app` is the only user interface. It builds for Flutter Web and Android and uses Material 3.
- `packages/backend` is the Fastify API and owns authentication, application rules, database access, and photo storage.
- The Web build is served by Fastify from `packages/flutter_app/build/web`; Android talks to the same API. There is no React frontend or rollback bundle in the Docker image.
- The root npm workspace contains the backend only. Flutter dependencies and commands are managed by Flutter from `packages/flutter_app`.

## Data and upgrade boundary

The API uses SQLite with WAL and foreign keys. `DATABASE_PATH` selects the database (the container default is `/app/data/body-tracker.db`); `PHOTOS_PATH` selects private uploaded photos (the container default is `/app/data/photos`). Docker persists both under `/app/data` in the `forma_data` volume. Frontend upgrades do not require schema migrations and must not change or delete this data.

Back up the database and complete photo directory before upgrades. Preserve the session cookie behavior and profile scoping in the API. The Web app should use the same origin as the API; Android uses a persistent app-private cookie jar and a self-host URL chosen on device unless a personal build has a default URL supplied at build time.

## Flutter feature-to-API map

| Feature | Flutter implementation | API areas |
|---|---|---|
| First-run setup, login, registration | `lib/screens/auth_screen.dart`, `lib/screens/onboarding_screen.dart`, `lib/state/session_state.dart` | setup status, setup/register/login/logout/me, username availability |
| Dashboard | `lib/screens/home_screen.dart` | weight, body composition, goals, nutrition, fasting |
| Weight history and trends | `lib/screens/record_screens.dart` | weight list, stats, create/update/delete |
| Measurement studio, history, and ratios | `lib/screens/record_screens.dart` | definitions, entries, batch logging, body composition |
| Goals | `lib/screens/progress_screens.dart` | goal read/write and weight stats |
| Nutrition and daily tracking | `lib/screens/progress_screens.dart` | plan recommendations, plan read/write, daily logs |
| Fasting and share widget | `lib/screens/progress_screens.dart`, `lib/screens/account_screens.dart` | fasting sessions, history, widget token and public widget |
| Progress photos, profile, settings | `lib/screens/account_screens.dart` | authenticated photo operations, profile, avatar, settings |
| Data portability and administration | `lib/screens/account_screens.dart` | backup/export/import, registration policy, user administration |
| Public progress profiles | `lib/screens/account_screens.dart` | public profile API and Flutter route aliases |

## Local development

Start the backend and Flutter Web in separate terminals. See the root README for a disposable demo database workflow. Do not run the demo seeder against a database containing real user data: it resets and repopulates the `demo` account.

For browser screenshots, sign into the seeded `demo` account (`demo` / `password123`). The seed data is synthetic. Capture documentation screenshots from the current Flutter interface only; the former React screenshots have been removed.

## Deployment

CI validates backend and Flutter, builds the Web bundle, produces a host-configurable Android APK, and publishes multi-architecture Docker images to GHCR. The Docker runtime serves the Flutter Web output and API from one origin. A personal Android APK can be built with `FORMA_API_BASE_URL`; do not use that option for the public APK.
