<div align="center">

<img src="app.png" alt="Forma" width="84" height="84">

# Forma

**A self-hosted body progress tracker for the web and Android.**

Track weight, measurements, nutrition, fasting, goals, and progress photos with a Flutter app and a Node.js API you host yourself.

[![Build and publish](https://github.com/dhruvcx-1/Forma/actions/workflows/publish.yml/badge.svg)](https://github.com/dhruvcx-1/Forma/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Flutter](https://img.shields.io/badge/Flutter-Material%203-02569B?logo=flutter)](https://flutter.dev)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js)](https://nodejs.org)

</div>

![Forma mobile app showcase](screenshots/forma-mobile-showcase.png)

See the [desktop and Android screenshot gallery](screenshots.md).

Forma is a Material 3 application built with Flutter. The same client runs in a browser and as a native Android app. A Node.js 22 and Fastify service provides the API, authentication, SQLite storage, and private photo storage. You run the server; each client connects to the Forma instance you choose.

## What you can do

- Record weight and body measurements, review history, trends, body composition estimates, and waist ratios.
- Set a weight goal and follow progress and milestones.
- Set nutrition targets and record daily calories and macronutrients.
- Track fasting sessions, history, and elapsed time.
- Store private progress photos and manage your profile and preferences.
- Export or back up your records. An administrator can manage accounts and registration settings.
- Use the app in a web browser or connect an Android app to your self-hosted server.

BMI, body-fat, energy, and ratio values are estimates based on the information entered. Forma is a tracking tool, not a medical diagnostic service.

## Self-host with Docker

The published container includes the Node.js API and the Flutter Web build. It stores the SQLite database and uploaded photos in `/app/data`.

### Run directly with Docker

This is the simplest option on a server or local machine with Docker:

```sh
docker volume create forma_data
docker run -d \
  --name forma \
  --restart unless-stopped \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -e COOKIE_SECRET="replace-with-a-long-random-secret" \
  -v forma_data:/app/data \
  ghcr.io/dhruvcx-1/forma:latest
```

Create a unique secret of at least 32 characters before deploying. Open `http://localhost:3001` on the host or `http://SERVER_ADDRESS:3001` on your network. For an internet-facing deployment, put Forma behind HTTPS using a reverse proxy, and use that HTTPS address in the Android app. The API health endpoint is `/api/health`.

The Compose file in this repository is configured for Traefik and expects an existing Docker network called `reverse-proxy`. Set `FORMA_DOMAIN`, `PUBLIC_URL`, and `COOKIE_SECRET` in `.env` before running `docker compose up -d`. If you do not use Traefik, use the Docker command above or adapt the Compose networking and labels for your reverse proxy. See [`.env.example`](.env.example) and [`docker-compose.yml`](docker-compose.yml).

### Update and back up

To update a Compose deployment, run `docker compose pull && docker compose up -d`. The `forma_data` volume contains the database and photos; back it up before upgrades and do not delete it when replacing the container. The [architecture notes](docs/flutter-migration.md) describe the storage locations and deployment boundary.

## Android app

Download the host-configurable APK from the [latest Android release](https://github.com/dhruvcx-1/Forma/releases/tag/android-latest). It does not include a server address. On first launch, enter the URL of your Forma server; the app saves that choice on the device. Use an HTTPS URL for a remote server. An APK can connect only to a server that the phone can reach.

For your own APK with a default server address, build with `FORMA_API_BASE_URL` as described below. Treat this as a convenience: the address is part of that APK and can be inspected.

## Build and run from source

### Requirements

- Node.js 22 and npm
- Flutter 3.47.9 (or a compatible stable SDK)
- Android Studio and Android SDK only if building or running Android

Install backend dependencies from the repository root:

```sh
npm ci
npm run dev
```

In another terminal, start the Flutter Web client:

```sh
cd packages/flutter_app
flutter pub get
flutter run -d chrome --dart-define=FORMA_API_BASE_URL=http://localhost:3001
```

For an Android emulator, use `http://10.0.2.2:3001` as the API address:

```sh
cd packages/flutter_app
flutter run --dart-define=FORMA_API_BASE_URL=http://10.0.2.2:3001
```

For a physical phone, the development computer and phone must be able to reach each other; use the computer's LAN address or a reachable HTTPS server. Local HTTP is intended for development.

### Build artifacts

Run these commands from `packages/flutter_app`:

```sh
# Web bundle
flutter build web --release

# Android APK that asks for the server URL on first launch
flutter build apk --release

# Personal APK with a default server URL
flutter build apk --release --dart-define=FORMA_API_BASE_URL=https://your-forma-host.example

# Android App Bundle
flutter build appbundle --release
```

The APK output is `build/app/outputs/flutter-apk/app-release.apk`. The Web bundle is `build/web`. The Docker build creates and packages the Web bundle automatically.

## Development checks

From the repository root:

```sh
npm test
npm run build
```

From `packages/flutter_app`:

```sh
flutter analyze
flutter test
```

To populate a disposable local database with demo content, set `DATABASE_PATH` to a new file before starting the backend and run `npm run db:seed`. The seeder resets and repopulates the selected database. Never point it at a database containing real user data. Demo login: `demo` / `password123`.

## How it is built

| Part | Technology |
|---|---|
| Client | Flutter and Dart, using Material 3 |
| Web and Android charts | `fl_chart` and custom Flutter widgets |
| API | Node.js 22, Fastify, TypeScript, Zod |
| Database | SQLite through `better-sqlite3`, with WAL |
| Password hashing | Argon2id |
| Packaging | Docker Compose and GitHub Actions |

GitHub Actions validates the backend and Flutter app, builds a host-configurable Android APK, and publishes multi-architecture (`amd64` and `arm64`) Docker images to [GHCR](https://github.com/dhruvcx-1/Forma/pkgs/container/forma). The Android APK is also attached to the `android-latest` prerelease. A personal APK can be built in Actions only when the repository secret `FORMA_PERSONAL_API_BASE_URL` is configured; it is kept separate from the public release APK.

More implementation details are in the [Flutter architecture notes](docs/flutter-migration.md). To connect another client to the server, use the HTTP API under `/api`; the health endpoint is `/api/health`.

## License

Forma is released under the [MIT License](LICENSE).
