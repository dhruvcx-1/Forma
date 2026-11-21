# Forma API Reference

This document describes the Forma HTTP API implemented by the Rust backend.
Paths and payloads below describe the API at `/api` and the contract used by
the Flutter clients.

## General

- Base path: `/api`
- Request and response bodies use JSON unless an endpoint says otherwise.
- Browser authentication uses the `session_id` HTTP-only cookie. Setup,
  registration, and login set it; logout clears it. In production it is Secure
  and uses `SameSite=Strict`.
- Unless marked **Public**, an endpoint requires a valid session. Admin routes
  require a session with the `admin` role.
- Validation errors use HTTP `400` with `{ "error": "Validation failed", "issues": [...] }`.
  Other common errors use `{ "error": "..." }`. Some routes have specialized
  status codes and response bodies listed below.
- CORS supports credentialed browser requests and reflects the request origin.

## Health and authentication

| Method | Path | Access | Purpose and main inputs |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Health check. Returns `{ status, timestamp }`. |
| GET | `/api/auth/status` | Public | Setup/authentication status, registration availability, and user count. |
| GET | `/api/setup/status` | Public | Alias of `/api/auth/status`. |
| GET | `/api/auth/check-username?username=...` | Public | Checks username availability. Names shorter than 3 characters return `400` and `{ available: false }`. |
| POST | `/api/auth/setup` | Public | First account setup. Body: `{ username, password, displayName? }`. Creates the first account as admin; returns `201` and sets a session cookie. Returns `409` if already set up. |
| POST | `/api/auth/register` | Public | Register an account. Same body as setup; the first registered account becomes admin. Returns `201` and a session cookie; `403` if registration is disabled, `409` for a taken username. |
| POST | `/api/auth/login` | Public | Body: `{ username, password }`. Returns `{ ok: true }` and sets a session cookie; invalid credentials return `401`. |
| POST | `/api/auth/logout` | Public | Invalidates the current session if present and clears the cookie. Returns `{ ok: true }`. |
| GET | `/api/auth/me` | Session | Returns authenticated profile fields, including snake_case and camelCase compatibility aliases. |

Account setup/registration validation: username is 3–32 characters using
letters, digits, `_`, or `-`; password is 8–128 characters; `displayName` is
optional and at most 64 characters.

## Weight and goals

| Method | Path | Access | Purpose and main inputs |
| --- | --- | --- | --- |
| GET | `/api/weight` | Session | List entries. Optional query: `from`, `to`, `limit` (1–500, default 500), `offset` (default 0), `paginate` (`true`, `false`, `1`, `0`). Paginated form: `{ entries, total, limit, offset }`; entries include `date` and normalized `weight` aliases. |
| GET | `/api/weight/stats` | Session | Aggregate current/starting weight, total and percent change, weekly average, and trend. Empty history returns these values as `null`. |
| POST | `/api/weight` | Session | Create an entry. Body: `{ value? , weight? , unit?: "kg"\|"lbs", recorded_at? , date? , notes? }`. One of `value`/`weight` and one of `recorded_at`/`date` are required. Returns `201`; duplicate timestamp returns `409` with the existing entry. |
| PUT | `/api/weight/:id` | Session | Update an entry. Optional fields: `value`, `weight`, `unit`, `recorded_at`, `date`, `notes`. Returns `404` if it does not belong to the caller; conflicting timestamp returns `409`. |
| DELETE | `/api/weight/:id` | Session | Delete an entry. Returns `{ ok: true }` or `404`. |
| GET | `/api/goals` | Session | Get the caller's current goal or `null`. |
| GET | `/api/goals/active` | Session | Alias of `/api/goals`. |
| POST | `/api/goals` | Session | Create/update a goal. Accepts `starting_weight`/`startWeight`, `target_weight`/`targetWeight`, corresponding units, `target_date`/`targetDate`, and optional `notes`. Create returns `201`; update returns `200`. |

## Measurements

| Method | Path | Access | Purpose and main inputs |
| --- | --- | --- | --- |
| GET | `/api/measurements/definitions` | Session | List system definitions and the caller's custom definitions. |
| POST | `/api/measurements/definitions` | Session | Create a custom definition. Body: `{ name, unit }`; name 1–64 chars, unit 1–16 chars. Returns `201`. |
| DELETE | `/api/measurements/definitions/:id` | Session | Delete an owned custom definition. System definitions cannot be deleted (`403`); unknown definition returns `404`. |
| GET | `/api/measurements/entries` | Session | List entries; optional query `definition_id`, `from`, `to`. Rows include definition details and date aliases. |
| GET | `/api/measurements/entries/latest` | Session | Latest entry for each definition with recorded values. |
| POST | `/api/measurements/entries` | Session | Create one or more entries. Body is an array or `{ entries: [...] }`; 1–50 entries. Entry fields: `definition_id` or `definitionId`, numeric `value`, optional `recorded_at` or `date`, optional `notes`. Returns `201` and the created rows. |
| POST | `/api/measurements/entries/batch` | Session | Alias of the batch create operation above. |
| PUT | `/api/measurements/entries/batch` | Session | Atomically create/update 1–100 entries. Body: `{ entries: [{ id? , definition_id? , value, recorded_at? , date? }] }`. Each row needs an existing `id` or a definition id. |
| PUT | `/api/measurements/entries/:id` | Session | Update an owned entry. Optional fields: `value`, `recorded_at`, `notes`. |
| DELETE | `/api/measurements/entries/:id` | Session | Delete an owned entry. |

## Settings, profile, and public profiles

| Method | Path | Access | Purpose and main inputs |
| --- | --- | --- | --- |
| GET | `/api/settings` | Session | Get supported settings as `{ key: value }`. |
| PUT | `/api/settings` | Session | Upsert string settings: `unit_system` (`metric`/`imperial`), `height_cm` (numeric string), `sex` (`male`/`female`/`other`), `date_of_birth` (`YYYY-MM-DD`). Unknown keys or invalid values return `400`. |
| GET | `/api/profile` | Session | Get the current profile. |
| PUT | `/api/profile` | Session | Update `display_name`/`displayName` (nullable, max 64), `bio` (nullable, max 256), and `is_public`/`isPublic`. |
| POST | `/api/profile/avatar` | Session | Upload a JPEG, PNG, or WebP avatar as multipart form data (max 5 MB). |
| DELETE | `/api/profile/avatar` | Session | Remove the current avatar. |
| GET | `/api/profile/avatar/:filename` | Public | Fetch an avatar file. |
| GET | `/api/public/profile/:username` | Public | Fetch a public profile and public progress summary. Private or missing profiles return `404`. A leading `@` is accepted. |

## Photos and body composition

| Method | Path | Access | Purpose and main inputs |
| --- | --- | --- | --- |
| GET | `/api/photos` | Session | List the caller's progress photos. |
| POST | `/api/photos` | Session | Upload multipart form data: `view_type` (`front`, `side`, `back`, `other`), `recorded_at`, optional `notes`, and image file field `file`, `photo`, or `image`. JPEG/PNG/WebP, max 10 MB. |
| GET | `/api/photos/:id/file` | Session | Fetch an owned photo file. |
| DELETE | `/api/photos/:id` | Session | Delete an owned photo and its file. |
| GET | `/api/body-composition` | Session | Calculate BMI/body-fat history, metabolism, ratios, limb symmetry, available data, and next-measurement prompts from profile measurements and weight history. |

## Export and import

| Method | Path | Access | Purpose and response |
| --- | --- | --- | --- |
| GET | `/api/export/json` | Session | Download a JSON export containing weights, measurement definitions/entries, goals, and photos. |
| GET | `/api/export/csv/weight` | Session | Download CSV with columns `date,value,unit,notes`. |
| GET | `/api/export/csv/measurements` | Session | Download CSV with columns `date,measurement_name,value,unit,notes`. |
| POST | `/api/import/json?preview=1` | Session | Validate/import JSON data. `preview=1` returns import counts without writing. Remove `preview` to import. Accepts `weight_entries`, `measurement_entries`, and `goals`; existing records may be skipped/upserted per import rules. |

## Fasting and public widget

| Method | Path | Access | Purpose and main inputs |
| --- | --- | --- | --- |
| GET | `/api/fasting/active` | Session | Return `{ activeFast }`, where the value is a session or `null`. |
| PATCH | `/api/fasting/active` | Session | Update active fast fields: `started_at`, `target_duration_hours`, `fast_type`, `notes`. |
| DELETE | `/api/fasting/active` | Session | Discard the active fast. Returns `{ success: true }`. |
| POST | `/api/fasting/start` | Session | Body: optional `fast_type` (default `16:8`), positive `target_duration_hours` (default 16), `started_at`, and `notes` (max 500). Returns `201`; existing active session returns `409`. |
| POST | `/api/fasting/end` | Session | Optional `ended_at`, `notes`, `mood` (`great`, `good`, `neutral`, `struggling`), `status` (`completed` or `cancelled`, default `completed`). Completed fasts shorter than 8 hours are not recorded and return `{ recorded: false, reason: "minimum_duration", ... }`. |
| GET | `/api/fasting/history` | Session | Up to 100 historical sessions and aggregate statistics; completed fasts under 8 hours are excluded. |
| DELETE | `/api/fasting/:id` | Session | Delete a historical fast. Returns `{ success: true }`. |
| GET | `/api/fasting/widget-token` | Session | Get or create `{ token }` for the public widget. |
| POST | `/api/fasting/widget-token/regenerate` | Session | Rotate the widget token and revoke the old token. |
| GET | `/api/public/fasting/widget?token=...` | Public | Fetch widget status for a valid token. Alternatively use `?username=...` for a public profile. Missing/private profiles and invalid tokens return `404`. |

## Nutrition

| Method | Path | Access | Purpose and main inputs |
| --- | --- | --- | --- |
| GET | `/api/nutrition/plan` | Session | Get saved plan plus a calculated recommendation. Optional query `diet_type` and `activity_level` select a preview calculation. |
| PUT | `/api/nutrition/plan` | Session | Save a plan: `diet_type`, `activity_level`, `daily_calories`, `protein_grams`, `carbs_grams`, `fat_grams`, and `protein_pct`, `carbs_pct`, `fat_pct`. The three percentage fields are 0–100. |
| GET | `/api/nutrition/logs` | Session | List up to 60 logs, optionally filtered by `from` and `to`; `?date=YYYY-MM-DD` returns `{ log }` for that day. |
| POST | `/api/nutrition/logs` | Session | Upsert a daily log: `{ date, calories?, protein_grams?, carbs_grams?, fat_grams?, notes? }`. Date uses `YYYY-MM-DD`; macro values are nonnegative or `null`. |

## Administration

All routes in this section require an admin session.

| Method | Path | Purpose and main inputs |
| --- | --- | --- |
| GET | `/api/admin/settings` | Read registration setting and whether it has a database override. |
| PUT | `/api/admin/settings` | Body: `{ registration_enabled: boolean }`; returns updated value. |
| GET | `/api/admin/users` | List accounts and activity counts. |
| PUT | `/api/admin/users/:id/role` | Body: `{ role: "admin"|"user" }`. The only admin cannot be demoted. |
| DELETE | `/api/admin/users/:id` | Delete an account and associated stored files. An admin cannot delete their own account. |

## AI coach

AI endpoints require a session. Provider requests may return `502`/`504` when
the configured service is unavailable or times out; provider credentials are
stored encrypted and are never returned in API responses.

| Method | Path | Purpose and main inputs |
| --- | --- | --- |
| GET | `/api/ai/settings` | Read provider/coach settings and booleans indicating whether a key is saved and encryption is available. |
| PUT | `/api/ai/settings` | Update `enabled`, `baseUrl`, `model`, `apiKey`, `coachMode` (`experienced`, `friend`, `edgy`, `custom`), `customCoachPrompt`, `customCoachName`, `shareUserName`, and `chatHistoryLimit` (4–100). |
| DELETE | `/api/ai/settings/key` | Remove the saved API key and disable AI. Returns public settings. |
| POST | `/api/ai/models` | List compatible provider models. Body may include `baseUrl` and `apiKey`; returns `{ models }`. |
| POST | `/api/ai/test` | Test configured provider credentials and model. |
| POST | `/api/ai/coach-avatar` | Upload a coach avatar as multipart image data (max 5 MB). |
| DELETE | `/api/ai/coach-avatar` | Remove the coach avatar. |
| GET | `/api/ai/coach-avatar/:filename` | Fetch a coach avatar. |
| POST | `/api/ai/weekly-report` | Generate and save a weekly report from the caller's data. |
| GET | `/api/ai/weekly-reports` | List saved weekly reports. |
| DELETE | `/api/ai/weekly-reports/:id` | Delete a saved report. |
| GET | `/api/ai/chat` | List chat messages. |
| POST | `/api/ai/chat` | Send `{ message }` to the coach. Message must be 1–4000 characters after trimming. |
| DELETE | `/api/ai/chat` | Clear chat history. |
| PUT | `/api/ai/chat/:id` | Edit a chat message using `{ content }` or `{ message }` (1–4000 characters). |
| DELETE | `/api/ai/chat/:id` | Delete a chat message. |
| GET | `/api/ai/chat/memory` | Get saved coach memory. |
| PUT | `/api/ai/chat/memory` | Save `{ summary }` (up to 12,000 characters). |
| POST | `/api/ai/chat/memory/generate` | Generate memory from available user data and chat history. |

## Error and compatibility notes

- `401 { "error": "Unauthorized" }`: protected endpoint called without a
  valid session.
- `403`: admin access denied, registration disabled, or an operation is not
  permitted (such as deleting a system measurement definition).
- `404`: record/file/profile not found or not visible to the caller.
- `409`: duplicate weight timestamp, existing active fast, or duplicate
  username.
- Successful delete operations generally return `{ ok: true }` or
  `{ success: true }`, as described by each route.
- This inventory does not authorize switching production traffic. See
  [Rust backend and SQLite compatibility](packages/backend-rust/COMPATIBILITY.md)
  for database safeguards, current verification, remaining parity work, and
  rollback guidance.
