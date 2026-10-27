# Forma — Body Progress Tracker

A premium, self-hosted body measurement and weight tracking application. Privacy-first, no cloud accounts required, beautiful glassmorphism UI.

![Forma Dashboard](docs/screenshot-dashboard.png)

## Features

- **Weight tracking** — Log weight daily, view trends with moving averages
- **Body measurements** — Track waist, hips, chest, arms, legs, and custom measurements
- **Body composition** — US Navy method body fat estimation
- **Progress photos** — Private, local photo storage with before/after comparison
- **Goal tracking** — Set target weight with projected trajectory visualization
- **Data export** — Full JSON and CSV export, import, and backup
- **PWA** — Installable on mobile and desktop
- **Dark/Light themes** — Polished glassmorphism design in both modes
- **Self-hosted** — Your data stays on your server

## Quick Start

### Prerequisites
- Docker and Docker Compose
- 512 MB RAM minimum

### Deploy in 2 commands

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env — at minimum set COOKIE_SECRET to a 32+ character random string

# 2. Start the application
docker compose up -d
```

The app will be available at `http://localhost:8080`.

On first visit, you'll be prompted to create your account.

### Generate a secure COOKIE_SECRET

```bash
# Linux/macOS
openssl rand -hex 32

# PowerShell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

---

## Configuration

All configuration is via environment variables in `.env`:

| Variable | Default | Description |
|---|---|---|
| `COOKIE_SECRET` | *(required in production)* | Secret for cookie signing. Min 32 chars. |
| `PORT` | `3001` | Backend API port (internal) |
| `EXTERNAL_PORT` | `8080` | Host port mapped by Docker |
| `DATABASE_PATH` | `/app/data/body-tracker.db` | SQLite database path |
| `PHOTOS_PATH` | `/app/data/photos` | Photo storage directory |
| `NODE_ENV` | `production` | Environment mode |
| `CORS_ORIGIN` | `http://localhost:8080` | Allowed CORS origin |
| `GHCR_IMAGE` | `ghcr.io/dhruvcx-1/forma-body-tracker:latest` | Image used by production Compose |

---

## Docker Compose Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | **Production** — pulls from GHCR |
| `docker-compose.dev.yml` | **Development** — builds from local source |

### Development mode

```bash
docker compose -f docker-compose.dev.yml up --build
```

### Production mode (pull from GHCR)

```bash
# Set GHCR_IMAGE in .env or use default
docker compose pull
docker compose up -d
```

---

## Upgrades

```bash
# Pull latest image
docker compose pull

# Recreate containers (data is preserved in volumes)
docker compose up -d --force-recreate

# Verify health
docker compose ps
docker compose logs --tail=50
```

### Rollback

```bash
# Use a specific version tag
GHCR_IMAGE=ghcr.io/dhruvcx-1/forma-body-tracker:v1.0.0 docker compose up -d
```

---

## Backup and Restore

### Backup

```bash
# Stop the app (recommended for consistent backup)
docker compose stop

# Backup database and photos
docker run --rm \
  -v forma_data:/source \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/forma-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /source .

# Restart
docker compose start
```

Or use the built-in JSON export from the **Data** page in the app.

### Restore

```bash
docker compose stop

docker run --rm \
  -v forma_data:/target \
  -v $(pwd)/backups:/backup \
  alpine sh -c "cd /target && tar xzf /backup/forma-backup-YYYYMMDD-HHMMSS.tar.gz"

docker compose start
```

---

## Reverse Proxy

Forma expects to run behind a reverse proxy for HTTPS. Do **not** expose the backend port (3001) directly.

### Nginx example

```nginx
server {
    listen 443 ssl;
    server_name forma.example.com;

    ssl_certificate /etc/letsencrypt/live/forma.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/forma.example.com/privkey.pem;

    client_max_body_size 15M;  # For photo uploads

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy example

```
forma.example.com {
    reverse_proxy localhost:8080
}
```

### Traefik example

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.forma.rule=Host(`forma.example.com`)"
  - "traefik.http.routers.forma.entrypoints=websecure"
  - "traefik.http.services.forma.loadbalancer.server.port=8080"
```

> **Note**: Set `CORS_ORIGIN` in `.env` to your public domain when using a reverse proxy.

---

## GHCR Image

Published image: `ghcr.io/dhruvcx-1/forma-body-tracker`

### Authenticate to pull (if package is private)

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u dhruvcx-1 --password-stdin
```

Or with the GitHub CLI:

```bash
gh auth token | docker login ghcr.io -u dhruvcx-1 --password-stdin
```

---

## Development Setup

### Prerequisites
- Node.js 20+
- npm 9+

```bash
# Install dependencies
npm install

# Start backend + frontend in parallel
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Run tests

```bash
# Unit tests
npm test

# E2E tests (requires running app)
npm run test:e2e
```

### Build for production

```bash
npm run build
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, shadcn/ui |
| Charts | Recharts |
| Animations | Framer Motion |
| Backend | Node.js, Fastify, TypeScript |
| Database | SQLite (better-sqlite3) |
| Validation | Zod |
| Auth | Argon2 password hashing, session cookies |
| Deployment | Docker, Docker Compose |
| CI/CD | GitHub Actions → GHCR |

---

## Privacy

- No external APIs, analytics, or telemetry
- No cloud account required
- All data stored locally in SQLite and the filesystem
- Photos served auth-gated (never in a public directory)
- Passwords hashed with Argon2id

---

## License

MIT — see [LICENSE](LICENSE) for details.
