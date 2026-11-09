# Forma Flutter migration inventory

## Current architecture and upgrade boundary

Forma is an npm workspace with `packages/frontend` (React 18, Vite, React Router, React Query, Recharts) and `packages/backend` (Node 22, Fastify 4, TypeScript, better-sqlite3, Argon2). The Fastify server mounts the React `dist` directory when present and owns all `/api` routes. Docker publishes one Fastify container on port 3001, exposes it through the existing `forma_data:/app/data` volume, and stores photos in `/app/data/photos`.

Database selection is `DATABASE_PATH` (default `./data/body-tracker.db`); startup enables WAL and foreign keys before applying migrations. Current schema versions are 1–4; migrations add profile fields/role, system settings, fasting sessions, nutrition plans and daily nutrition logs. Do not change the database path, `forma_data` volume, tables, session IDs or photo directory as part of frontend work. Existing React remains the rollback frontend until parity is demonstrated.

## Feature to route/API inventory

| Feature / existing React route | Frontend implementation | Backend dependencies |
|---|---|---|
| First run, login, registration | `screens/auth_screen.dart`, `state/session_state.dart` | setup status, setup/register/login/logout/me, username check; HTTP-only session cookie |
| Dashboard | `screens/home_screen.dart` | weight/stats, body composition, goals, nutrition, fasting |
| Weight log/history | `screens/record_screens.dart` | weight list/stats, create/update/delete; duplicate date response surfaced |
| Measurement studio/detail | `screens/record_screens.dart` | definitions, entries, history, batch logging, custom definitions, body composition, ratios and charts |
| Goals and trajectories | `screens/progress_screens.dart` | goals list, create/update, milestone and pace visuals |
| Nutrition and daily tracking | `screens/progress_screens.dart` | plan read/update, recommendation preview, daily logs; existing backend calculator |
| Fasting and share widget | `screens/progress_screens.dart`, `screens/account_screens.dart` | fasting session CRUD/history, widget token and public widget |
| Progress photos | `screens/account_screens.dart` | authenticated photo list/retrieval, multipart upload, delete and comparison |
| Profile/avatar and preferences | `screens/account_screens.dart` | profile, avatar, privacy and health settings, theme preference |
| Data portability | `screens/account_screens.dart` | JSON export/import preview and commit, CSV export |
| Administration | `screens/account_screens.dart` | instance registration setting, user list, role update and deletion |
| Public progress profiles | `screens/account_screens.dart` | public profile endpoints and public route aliases |

React route inventory: `/setup`, `/login`, `/register`, `/fasting/widget`, `/u/:username`, `/@username`, plus authenticated `/`, `/fasting`, `/nutrition`, `/log`, `/measurements`, `/measurements/:id`, `/goals`, `/photos`, `/settings`, `/data`.

## Compatibility and rollout notes

- Flutter Web must use same-origin `/api` and browser-managed cookies. Android must use a persistent cookie jar; do not store credentials or weaken cookie/security settings. The current session cookie is HTTP-only, SameSite=Strict, expires in 30 days, and is Secure in production. Native cleartext HTTP should only be used for local development.
- Current backend enables credentialed CORS, but a same-origin reverse-proxy deployment is preferred. Keep request/response shapes and authenticated profile scoping unchanged.
- Deploy frontend assets behind the existing Fastify API origin. Preserve environment variables, image names/ports, `/app/data`, named volume and health check. Rollback means restoring the previous image; no database rollback is required for a frontend-only deployment.
- Before production rollout, take a consistent SQLite backup using SQLite's online backup mechanism (or stop writes and copy the database plus WAL/SHM files together) and back up the complete photos directory. No production data is touched by this migration work.
- Existing test suites are backend Vitest tests and frontend unit tests. Current frontend tests cover unit conversion, health ratios, fasting stages and onboarding. CI publishes AMD64 and ARM64 GHCR images.

## Flutter delivery status

Flutter Web is the first static directory served by the production Fastify process when present; React remains a built fallback and rollback. The Android target uses the same API with cookies persisted in app-private storage. Feature pages are split between `screens/record_screens.dart`, `screens/progress_screens.dart`, and `screens/account_screens.dart`. Backend behavior and persistent storage are unchanged. Flutter analysis and widget tests, release Web build, backend tests/build, and React tests have been run locally. The APK can also be compiled locally. Real-device interaction, production signing, and production rollout remain deployment checks; this repository change does not publish an image or touch a live database/photos volume.
