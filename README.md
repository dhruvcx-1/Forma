<div align="center">

<img src="app.png" alt="Forma Logo" width="84" height="84" style="border-radius: 22px; box-shadow: 0 8px 30px rgba(124, 58, 237, 0.4);">

# Forma — Premium Body Progress Tracker

<p align="center">
  <strong>A premium, self-hosted body measurement and weight tracking web application.</strong><br>
  Privacy-first, zero telemetry, no external accounts, refined glassmorphism design.
</p>

[![CI/CD Build & Publish](https://github.com/dhruvcx-1/Forma/actions/workflows/publish.yml/badge.svg)](https://github.com/dhruvcx-1/Forma/actions/workflows/publish.yml)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Fastify](https://img.shields.io/badge/Fastify-v4-000000?logo=fastify&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)

[**📸 View Complete Screenshot Gallery & Intel →**](SCREENSHOTS.md)

</div>

---

## ✨ Features

- 📏 **Interactive Anatomical Body Map & Measurements Studio** — Visual SVG human silhouette with pulse pins across 13 anatomical sites (neck, chest, biceps, waist, hips, thighs, calves). Features real-time delta tooltips, direct site inspector, and quick session batch logger.
- ⏱️ **Second-Level Timestamp Precision** — Body measurements and weight logs support exact time-of-day timestamps (`YYYY-MM-DDTHH:mm:ss`) with a dedicated time picker and "Now" button, empowering multiple distinct daily sessions (e.g. morning fasted vs. evening post-workout).
- 🩺 **Cardiometabolic Health Risk Indicators** — Instant clinical risk evaluation for **Waist-to-Height Ratio (WHtR)** (*"keep your waist under half your height"*) and **Waist-to-Hip Ratio (WHR)** with WHO risk gauges.
- ⏱️ **Fasting Tracker & Biological Stage Engine** — Real-time countdown timer supporting intermittent (16:8, 18:6, 20:4, 24:0) and extended fasting (36h, 48h, 72h+). Dynamically highlights the **7 Biological Stages of Fasting** (Fed, Post-Absorptive, Fat Burn, Metabolic Switch & Ketosis, Autophagy, HGH Surge, and Stem Cell Reset) with live physiological notes.
- 🥗 **Macro Planning & Nutrition Engine** — Evidence-based nutritional macro engine calculating BMR (Mifflin-St Jeor), maintenance TDEE, and daily macro gram allocations across 6 Diet Archetypes (High-Protein/Low-Carb, Keto, Balanced, Mediterranean, Carnivore, and Custom).
- 🧬 **Clinical Over-80kg Ideal Weight Protocol** — If scale weight exceeds 80 kg, protein requirements automatically calculate from the user's **Max Ideal Weight** (BMI 24.9 ceiling) to optimize lean mass retention while avoiding excessive caloric load.
- 🧙 **Modern Multi-Step Onboarding Wizard** — Guided setup experience for both registration and first-run profile creation, collecting credentials, full name, biological sex, height, weight, and initial targets with smooth transitions and validation.
- ⚖️ **Weight Tracking & Trends** — Rapid daily weigh-in with ±0.1 step controls, 7-day moving averages, trend regression, and duplicate entry safeguards.
- 🧬 **Body Composition** — Deterministic US Navy Hodgdon-Beckett circumference formula & WHO BMI classification with visible formula transparent assumptions.
- 🎯 **Target Goals & Pacing** — SVG circular milestone visualizer, required weekly pace calculations, and estimated completion trajectories.
- 📸 **Private Progress Photos** — Local filesystem storage (JPEG/PNG/WebP), timeline gallery by perspective (front/side/back), and side-by-side before/after comparison.
- 👥 **Multi-User Architecture** — Full multi-user isolation with dedicated private data vaults for each account. First user is automatically assigned Admin privileges.
- 📝 **Public Registration & Toggle** — Built-in `/register` page enabled by default, controllable dynamically via Admin Settings or the `ALLOW_REGISTRATION` env variable.
- 🛡️ **Admin User Directory** — Dedicated server administration panel in Settings to manage user accounts, assign roles, and configure instance policies.
- 👤 **Custom Profiles & Avatars** — Upload and manage personal avatar pictures with automatic cleanup, custom display names, and bio snippets.
- 🌐 **Public Progress Showcase** — Opt-in public profile page (`/@username` or `/u/username`) to proudly share weight milestones, target goals, and trend charts without requiring visitors to log in. Circumferences, private notes, and photos remain strictly private.
- 📱 **Adaptive Mobile UI & PWA** — Responsive bottom bar, quick top actions, and an expandable slide-over drawer for easy access on mobile devices, plus PWA installation on iOS/Android/Desktop.
- 💎 **Refined Glassmorphism** — Translucent blurred surfaces, high-contrast dark and light modes, smooth transitions, and tabular numeral typography.
- 🔒 **Privacy-First & Self-Hosted** — 100% self-contained SQLite WAL database, Argon2id encryption, secure session cookies, zero external telemetry, zero third-party cloud calls.
- 💾 **Data Portability** — Complete JSON database backups and CSV spreadsheets for weight and measurement records.

---

## 📸 Visual Showcase

> 🌟 **Want to see every screen in high resolution? View the [Complete Screenshot Gallery (SCREENSHOTS.md)](SCREENSHOTS.md) for full intel on all 9 screens.**

### 📊 1. Unified Dashboard & Clinical Vitals
> Interactive time-series trends, WHO BMI brackets, US Navy body fat percentage, cardiometabolic risk ratios (WHtR & WHR), active fasting window, and daily nutrition targets.

<div align="center">
  <img src="screenshots/01-dashboard-overview.png" alt="Forma Dashboard Overview" width="920" style="border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);">
</div>

---

### 📏 2. Body Measurements Studio & Anatomical Silhouette
> Interactive human silhouette map with pulse pins, direct site inspector, baseline delta calculations, cardiometabolic health ratio cards, and quick batch logging with second-level timestamps.

<div align="center">
  <img src="screenshots/05-measurements-studio-silhouette.png" alt="Body Measurements Studio" width="920" style="border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);">
</div>

---

### ⏱️ 3. Fasting Tracker & 7-Stage Biological Engine
> Live fasting clock, remaining target countdown, and real-time biological transitions from early glycogen depletion into ketosis, peak autophagy, and stem cell regeneration.

<div align="center">
  <img src="screenshots/02-fasting-tracker.png" alt="Fasting Tracker & Biology" width="920" style="border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);">
</div>

---

### 🥗 4. Macro Planning & Nutrition Engine
> Scientific TDEE and BMR calculation, 6 diet archetypes (High-Protein / Low-Carb by default), clinical Over-80kg Ideal Weight protocol, and single-tap daily intake tracking.

<div align="center">
  <img src="screenshots/03-macro-nutrition-engine.png" alt="Macro Planning & Nutrition Engine" width="920" style="border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);">
</div>

---

👉 *See [SCREENSHOTS.md](SCREENSHOTS.md) for Weight Logging, Goals & Trajectory, Progress Photos, Admin Settings, and Data Portability.*

---

## 🚀 Quick Start with Docker

Forma is packaged as a lightweight, production-ready container image published to GitHub Container Registry (**GHCR**).

### Prerequisites
- Docker and Docker Compose
- Minimum 512 MB RAM

### Deploy in 2 Steps

```bash
# 1. Download docker-compose.yml and environment template
curl -sO https://raw.githubusercontent.com/dhruvcx-1/Forma/master/docker-compose.yml
curl -sO https://raw.githubusercontent.com/dhruvcx-1/Forma/master/.env.example
cp .env.example .env

# Edit .env and set COOKIE_SECRET to a random 32+ character string:
# Linux/macOS:  openssl rand -hex 32
# PowerShell:   [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# 2. Start the container
docker compose up -d
```

Open your browser at **`http://localhost:8080`**. On first launch, you will be guided through setting up your private master profile.

---

## 📂 Data Storage & Directory Options

Forma stores all persistent state inside `/app/data`:

```text
/app/data/
├── body-tracker.db       # SQLite database (profiles, weights, measurements, goals, settings)
├── body-tracker.db-wal   # SQLite Write-Ahead Log
├── body-tracker.db-shm   # SQLite Shared Memory index
└── photos/               # Uploaded progress photos and custom avatar pictures
```

You can choose between two persistence options in `docker-compose.yml`:

### Option A: Named Docker Volume (Default)
Docker manages the storage volume automatically under its volume directory:
```yaml
volumes:
  - forma_data:/app/data
```
No manual directory creation or permission configuration needed.

### Option B: Local Host Directory Bind-Mount
If you prefer having direct access to the database file and photos folder on your host machine (e.g., for direct snapshots, rsync, or off-site backups):

1. Create the data directory on your host:
   ```bash
   mkdir -p ./data/photos
   ```
2. In `docker-compose.yml`, uncomment the host directory bind mount and comment out the named volume:
   ```yaml
   volumes:
     - ./data:/app/data
     # - forma_data:/app/data
   ```
3. Start or restart the container:
   ```bash
   docker compose up -d
   ```
All database writes and uploaded photos will immediately be saved directly into `./data/` on your host machine.

---

## ⚙️ Configuration

All runtime options are managed via environment variables in `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `COOKIE_SECRET` | *(required)* | 32+ character random string for signing secure session cookies |
| `ALLOW_REGISTRATION` | `true` | Enable or disable public user registration at `/register` |
| `EXTERNAL_PORT` | `8080` | Host port exposed to your local network |
| `PORT` | `3001` | Internal Node.js Fastify listener port |
| `DATABASE_PATH` | `/app/data/body-tracker.db` | SQLite database file location inside container |
| `PHOTOS_PATH` | `/app/data/photos` | Storage directory for progress photos |
| `NODE_ENV` | `production` | Set to `production` or `development` |
| `CORS_ORIGIN` | `http://localhost:8080` | Allowed origin for CSRF and API requests |
| `GHCR_IMAGE` | `ghcr.io/dhruvcx-1/forma:latest` | Container image reference |

---

## 📦 Container Registry (GHCR)

The production multi-arch image (`linux/amd64` and `linux/arm64`) is automatically built on every commit and hosted at:

```bash
ghcr.io/dhruvcx-1/forma:latest
```

### Pulling manually:
```bash
docker pull ghcr.io/dhruvcx-1/forma:latest
```

### Upgrading your container:
```bash
docker compose pull
docker compose up -d --force-recreate
```

---

## 🔒 Security & Privacy Architecture

- **No Remote Telemetry**: No Google Analytics, Segment, Sentry, or third-party trackers.
- **Argon2id Hashing**: Password hashing uses the industry gold-standard memory-hard Argon2id algorithm.
- **Session Tokens**: 30-day cryptographically random session tokens stored in SQLite and transmitted over `HttpOnly`, `SameSite=Strict` cookies.
- **Auth-Gated Assets**: Uploaded progress photos are not exposed through public static directories; each request is authenticated before binary image streaming.
- **Strict File Upload Constraints**: Uploads are restricted to JPEG, PNG, and WebP formats up to 10MB. Filenames are assigned randomized `nanoid` identifiers to prevent path traversal attacks.

---

## 💾 Backup and Restoration

### 1. Web UI Backup
Visit the **Data** page in the application to download:
- Full JSON backup archive
- Weight History CSV
- Circumference Measurements CSV

### 2. Low-Level Docker Volume Backup
To snapshot your database and progress photos simultaneously:

```bash
# Stop container for consistency
docker compose stop

# Archive volume to a tarball
docker run --rm \
  -v forma_data:/source \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/forma-backup-$(date +%Y%m%d).tar.gz -C /source .

# Restart container
docker compose start
```

### Restoration:
```bash
docker compose stop

docker run --rm \
  -v forma_data:/target \
  -v $(pwd)/backups:/backup \
  alpine sh -c "cd /target && tar xzf /backup/forma-backup-YYYYMMDD.tar.gz"

docker compose start
```

---

## 🌐 Reverse Proxy Configuration

When exposing Forma to the public internet, place it behind a reverse proxy that terminates TLS (HTTPS).

### Nginx Example:
```nginx
server {
    listen 443 ssl http2;
    server_name forma.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/forma.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/forma.yourdomain.com/privkey.pem;

    client_max_body_size 15M; # Support photo uploads

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy Example:
```caddy
forma.yourdomain.com {
    reverse_proxy localhost:8080
}
```

> **Note**: Update `CORS_ORIGIN=https://forma.yourdomain.com` in your `.env` when deploying behind a domain.

---

## 🛠️ Local Development

### Prerequisites
- Node.js 22+
- npm 10+

```bash
# 1. Clone the repository
git clone https://github.com/dhruvcx-1/Forma.git
cd Forma

# 2. Install dependencies
npm install

# 3. (Optional) Seed realistic demo user data (demo / password123)
npm run db:seed --workspace=packages/backend

# 4. Start development servers concurrently (Fastify on 3001, Vite on 5173)
npm run dev

# 5. Run automated test suite
npm test

# 6. Build production bundle
npm run build
```

---

## 🧰 Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui primitives |
| **Data Viz** | Recharts, Custom SVG circular progress meters, Lucide Icons |
| **Animation** | Framer Motion (Motion for React) |
| **Backend** | Node.js 22, Fastify, TypeScript, Zod |
| **Database** | SQLite via `better-sqlite3` with Write-Ahead Logging (WAL) |
| **Testing** | Vitest |
| **Deployment** | Multi-stage Docker, Docker Compose, GitHub Actions (GHCR) |

---

## 📄 License

Licensed under the [MIT License](LICENSE). Built for self-hosters and privacy advocates.

---

<div align="center">
  <sub>Made with ❤️ by <strong>Dhruv Chaturvedi</strong>.</sub>
</div>
