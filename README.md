# Forma 💪

### Your body. Your journey. Your data.

**A beautiful, self-hosted body progress tracker for the web and Android.**

Forma helps you understand your body, build healthier habits, and celebrate every bit of progress along the way. Track your weight, measurements, nutrition, fasting, goals, and progress photos — all from one place.

No subscriptions. No third-party fitness platforms. No handing over your personal data.

Just you, your progress, and a server you control.

[![Build and publish](https://github.com/dhruvcx-1/Forma/actions/workflows/publish.yml/badge.svg)](https://github.com/dhruvcx-1/Forma/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Flutter](https://img.shields.io/badge/Flutter-Material%203-02569B?logo=flutter)](https://flutter.dev)
[![Rust](https://img.shields.io/badge/Rust-stable-000000?logo=rust)](https://www.rust-lang.org)

---

![Forma mobile app showcase](screenshots/forma-mobile-showcase.png)

<p align="center">
  <a href="screenshots.md">Explore the desktop and Android screenshot gallery →</a>
</p>

---

## 🌱 Your progress, all in one place

Your fitness journey isn't just about the number on a weighing scale. It's about the little changes, the consistency, and the milestones that add up over time.

Forma brings everything together in a single, thoughtfully designed application.

### ✨ Features

| Feature | What you get |
|---|---|
| ⚖️ **Weight Tracking** | Record multiple weigh-ins per day with date and time, explore historical trends, and visualize your journey. |
| 📏 **Body Measurements** | Track body dimensions, monitor changes, and understand body composition estimates. |
| 🎯 **Goals & Milestones** | Set your target weight, follow your progress, and celebrate milestones. |
| 🥗 **Nutrition Tracking** | Set daily calorie and macronutrient targets and log your nutrition. |
| ⏱️ **Fasting Tracker** | Start fasting sessions, monitor elapsed time, and review your history. |
| 📸 **Progress Photos** | Privately store and manage photos to see how far you've come. |
| 👤 **Personal Profile** | Manage your personal information and application preferences. |
| 📦 **Data Portability** | Export and back up your records. |
| 🛡️ **Administration** | Manage accounts and registration settings as an administrator. |
| 🤖 **Optional AI coach & reports** | Bring your own compatible API provider for on-demand weekly summaries and a training coach with preset or custom personality prompts. |

### 📱 One app. Multiple platforms.

Forma is built with Flutter and Material 3, giving you a consistent experience across platforms.

- **Web:** Access Forma directly from your browser.
- **Android:** Use the native Android application.
- **Self-hosted:** Run your own backend and connect multiple clients to it.

### 🔐 Your data stays yours

Forma is designed around self-hosting and data ownership.

- Your database lives on your server.
- Your progress photos stay in your private storage.
- Your clients connect directly to the Forma instance you choose.
- No mandatory cloud account or third-party fitness subscription.

**You own the infrastructure. You control the data.**

### Optional AI features (BYOK)

AI features are off until each user enables them and configures a provider URL, model, and API token under **AI coach & reports → Setup**. The app supports OpenAI-compatible Chat Completions providers. Reports compare the latest 7 days with the preceding 7 days; coach settings include three presets and a custom system prompt. Fixed safety boundaries apply to every coach mode.

The provider token is encrypted on the Forma server. Before enabling AI, set `FORMA_AI_ENCRYPTION_KEY` to a stable base64-encoded key that decodes to exactly 32 bytes (for example, `openssl rand -base64 32`). Keep it backed up and private; replacing it makes saved provider tokens unreadable. After changing it in `.env`, recreate the container with `docker compose up -d` so the running server receives the new value. HTTPS is required for remote provider URLs.

When a user requests a report or coach reply, Forma sends relevant health records (profile health settings, weight and measurement history, goals, nutrition, and fasting) to that user’s configured provider. Account name, username, biography, avatar, and progress photos are excluded. Free-text notes and chat entries are also checked to redact the account name and username. Review the provider’s data handling terms before use; the provider may process or retain submitted data under its own policies.

> **A quick health note:** BMI, body-fat, energy, and ratio values are estimates based on the information entered. Forma is a personal tracking tool, not a medical diagnostic service.

---

## 🚀 Get started with Docker

Want to get Forma running? All you need is Docker.

The published Rust server container includes the API and Flutter Web application. Your SQLite database and uploaded photos are stored in `/app/data`.

### Option 1: Run with Docker

The quickest way to get started:

```bash
# Create persistent storage
docker volume create forma_data

# Initialize a new, empty database (safe to repeat for the current schema)
docker run --rm \
  -e DATABASE_PATH=/app/data/body-tracker.db \
  -v forma_data:/app/data \
  ghcr.io/dhruvcx-1/forma:latest /usr/local/bin/forma-backend --init-db

# Start Forma
docker run -d \
  --name forma \
  --restart unless-stopped \
  -p 3001:3001 \
  -e PORT=3001 \
  -e COOKIE_SECRET="replace-with-a-long-random-secret" \
  -v forma_data:/app/data \
  ghcr.io/dhruvcx-1/forma:latest
```

**Before you launch:**

Generate a unique secret of at least 32 characters for `COOKIE_SECRET`.

Open Forma at:

- Local machine: `http://localhost:3001`
- Network access: `http://SERVER_ADDRESS:3001`

For internet-facing deployments, put Forma behind an HTTPS-enabled reverse proxy. Use that HTTPS address when connecting your Android application.

**Health check:** `/api/health`

### Option 2: Docker Compose + Traefik

Already running Traefik? Forma has you covered.

The repository includes a Docker Compose configuration designed to work with an existing Traefik reverse proxy.

You'll need:

- An existing Docker network named `reverse-proxy`.
- A configured `FORMA_DOMAIN`.
- A configured `PUBLIC_URL`.
- A secure `COOKIE_SECRET`.

Configure your `.env` file before deployment:

```bash
cp .env.example .env
```

Edit the environment variables and launch:

```bash
docker compose up -d
```

Don't use Traefik? You can adapt the Compose networking and labels for your preferred reverse proxy, or simply use the standalone Docker command above.

**Configuration references:**
- [Environment variables](.env.example)
- [Docker Compose configuration](docker-compose.yml)

---

## 🔄 Updates & backups

Keeping Forma up to date is straightforward.

For Docker Compose deployments:

```bash
docker compose pull
docker compose up -d
```

Your persistent `forma_data` volume contains your database and uploaded photos.

**Important:** Back up this volume before upgrading. Never delete it when replacing or updating the container.

For details about storage locations and deployment boundaries, check the [Flutter migration and architecture notes](docs/flutter-migration.md).

---

## 🤖 Android application

Prefer tracking your progress on your phone?

Download the latest Android APK:

<p align="center">
  <a href="https://github.com/dhruvcx-1/Forma/releases/latest">
    <img src="https://img.shields.io/badge/Download-Android%20APK-34A853?style=for-the-badge&logo=android&logoColor=white" alt="Download Android APK">
  </a>
  <a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium%3A%2F%2Fapp%2F%257B%2522id%2522%253A%2522com.deshmesh.forma%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fgithub.com%252Fdhruvcx-1%252FForma%2522%252C%2522author%2522%253A%2522dhruvcx-1%2522%252C%2522name%2522%253A%2522Forma%2522%257D">
    <img src="https://img.shields.io/badge/Get%20it%20on-Obtainium-673AB7?style=for-the-badge&logo=android&logoColor=white" alt="Get Forma on Obtainium">
  </a>
</p>

Forma provides a host-configurable APK, which means:

1. Download and install the APK.
2. Launch Forma.
3. Enter the URL of your self-hosted Forma server.
4. Start tracking!

The public APK does not have a hardcoded server address. Your selected server URL is saved locally on your device.

**A few things to know:**
- Use HTTPS when connecting to a remote server.
- Your phone must be able to reach the configured server.
- For local network deployments, use an address accessible from your phone.

### Get updates with Obtainium

[Obtainium](https://github.com/ImranR98/Obtainium) can watch Forma's GitHub releases and install APK updates directly. See the [Obtainium Wiki](https://wiki.obtainium.imranr.dev/) and its [GitHub source options](https://wiki.obtainium.imranr.dev/sources/#github) for details.

1. Install Obtainium and tap **Add app**.
2. Choose **GitHub** as the source and enter `https://github.com/dhruvcx-1/Forma`.
3. In the app's source options, use the APK filter regex `^Forma-Android-v[0-9]+\.[0-9]+\.[0-9]+\.apk$` to select versioned public APKs.
4. Select the latest stable versioned release and add Forma.
5. Install the APK, open Forma, and enter the URL of your own Forma server.

Android requires each update to have the same signing certificate as the installed app. Versioned APK releases use the persistent release key configured in GitHub Actions; the one-time setup below is required before the first versioned release can be published.

### Configure versioned APK releases

Create a dedicated Android release keystore and keep a secure backup of both the keystore and its passwords. Losing this key prevents publishing updates that Android will accept over existing installs.

```sh
keytool -genkeypair -v -keystore forma-release.jks -storetype JKS \
  -keyalg RSA -keysize 2048 -validity 10000 -alias forma
```

In GitHub, open **Settings → Secrets and variables → Actions** and add these repository secrets:

| Secret | Value |
|---|---|
| `FORMA_ANDROID_KEYSTORE_BASE64` | Base64-encoded contents of `forma-release.jks` |
| `FORMA_ANDROID_STORE_PASSWORD` | Keystore password |
| `FORMA_ANDROID_KEY_ALIAS` | `forma` (or the alias you chose) |
| `FORMA_ANDROID_KEY_PASSWORD` | Password for the signing key |

For PowerShell, copy the encoded keystore to the clipboard with:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('.\forma-release.jks')) | Set-Clipboard
```

Never commit the keystore or its passwords. After the secrets are configured, push a version tag to build and publish that version's APK and Docker image:

```sh
git tag v1.2.3
git push origin v1.2.3
```

GitHub creates a release for the tag and attaches `Forma-Android-v1.2.3.apk`. The APK's Android version name matches the tag, and its version code increases with each Actions run. The first APK signed with your release key may not update an older APK signed with a different key; uninstall the older build once if Android rejects the update. Local APK builds continue to use the local Android debug key.

### Build an APK with your own server address

You can also build a personal APK with a default server address using `FORMA_API_BASE_URL`.

Keep in mind that this address is embedded in the APK and can be inspected.

---

## 🛠️ Build from source

Want to contribute, experiment, or build your own version of Forma?

Here's everything you need.

### Requirements

| Dependency | Version |
|---|---|
| Rust | Stable toolchain |
| Cargo | Included with Rust |
| Flutter | 3.47.9 or compatible stable SDK |
| Android Studio | Required only for Android development |
| Android SDK | Required only for Android development |

### 1. Initialize and run the Rust backend

From the repository root:

```bash
$env:DATABASE_PATH = (Join-Path $PWD 'packages/backend-rust/data/rust-dev.db')
cargo run --locked --manifest-path packages/backend-rust/Cargo.toml -- --init-db
cargo run --locked --manifest-path packages/backend-rust/Cargo.toml
```

Use a disposable database path. Initialization only creates an empty schema and refuses older or partially populated databases.

### 2. Launch the Flutter Web application

Open another terminal:

```bash
cd packages/flutter_app

flutter pub get

flutter run -d chrome \
  --dart-define=FORMA_API_BASE_URL=http://localhost:3001
```

### 3. Run on Android

For an Android emulator, use `10.0.2.2` to reach the development machine's localhost:

```bash
cd packages/flutter_app

flutter run \
  --dart-define=FORMA_API_BASE_URL=http://10.0.2.2:3001
```

For a physical Android device, make sure both devices can communicate over your network. Use your development computer's LAN address or a reachable HTTPS server.

Local HTTP is intended for development.

---

## 📦 Build production artifacts

Run the following commands from `packages/flutter_app`.

**Build for the web:**

```bash
flutter build web --release
```

**Build the host-configurable Android APK:**

```bash
flutter build apk --release
```

**Build an APK with your own default server address:**

```bash
flutter build apk --release \
  --dart-define=FORMA_API_BASE_URL=https://your-forma-host.example
```

**Build an Android App Bundle:**

```bash
flutter build appbundle --release
```

### Build outputs

| Artifact | Location |
|---|---|
| Android APK | `build/app/outputs/flutter-apk/app-release.apk` |
| Flutter Web | `build/web` |

The Docker build automatically generates and packages the Flutter Web application.

---

## 🧪 Development & testing

We want Forma to stay reliable as it grows.

Run backend checks from the repository root:

```bash
cargo test --locked --manifest-path packages/backend-rust/Cargo.toml
cargo check --locked --manifest-path packages/backend-rust/Cargo.toml
```

Run Flutter checks from `packages/flutter_app`:

```bash
flutter analyze
flutter test
```

---

## 🏗️ Under the hood

Forma combines a modern cross-platform frontend with a lightweight, self-hostable backend.

| Layer | Technology |
|---|---|
| Frontend | Flutter & Dart |
| Design system | Material 3 |
| Charts | `fl_chart` & custom Flutter widgets |
| Backend | Rust, Axum & rusqlite |
| Database | SQLite with WAL |
| Authentication | Argon2id password hashing |
| Deployment | Docker & Docker Compose |
| CI/CD | GitHub Actions |

### Architecture at a glance

```text
           ┌─────────────────────┐
           │    Forma Server    │
           │                     │
           │   Rust + Axum       │
           │                     │
           │    ┌───────────┐    │
           │    │  SQLite   │    │
           │    │ Database  │    │
           │    └───────────┘    │
           │                     │
           │   Private Photos    │
           └──────────┬──────────┘
                      │
                 HTTP API
                      │
             ┌────────┴────────┐
             │                 │
       ┌─────▼─────┐     ┌─────▼─────┐
       │   Flutter │     │  Flutter  │
       │    Web    │     │  Android  │
       └───────────┘     └───────────┘
```

### Automated builds & releases

GitHub Actions handles release distribution when a version tag is pushed.

- Builds the host-configurable Android APK and multi-architecture Rust Docker image in parallel.
- Publishes the Docker image to [GitHub Container Registry](https://github.com/dhruvcx-1/Forma/pkgs/container/forma) with both the version tag and `latest`.
- Attaches the APK to the versioned GitHub Release.
- Does not run builds or validation on ordinary branch pushes.

### Want to learn more?

Check out the [Flutter architecture and migration notes](docs/flutter-migration.md).

The backend exposes an HTTP API under `/api`, with `/api/health` available as its health endpoint.

---

## 🤝 Contributing

Forma is an open-source project, and contributions are welcome!

Whether you're fixing bugs, improving the UI, adding features, or making the documentation better, every contribution helps Forma grow.

Feel free to explore the codebase, report issues, or submit pull requests.

---

## 📄 License

Forma is proudly released under the **[MIT License](LICENSE)**.

Use it, modify it, self-host it, and make it your own.

---

<p align="center">
  <strong>Made with ❤️ for people who own their data.</strong>
  <br>
  <sub>Your journey. Your progress. Your Forma.</sub>
</p>
