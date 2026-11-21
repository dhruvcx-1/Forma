# Forma Rust beta

The beta uses the Rust API image `ghcr.io/dhruvcx-1/forma-beta:latest` and a
separate initializer image. It does not use the production Compose file, the
production image, or the `forma_data` volume.

## Start the beta

1. Create a `.env` file in the repository directory containing a unique cookie
   secret for beta:

   ```dotenv
   FORMA_BETA_COOKIE_SECRET=replace-with-at-least-32-random-characters
   FORMA_BETA_PORT=3002
   ```

   Generate a secret with `openssl rand -hex 32`. Keep the beta secret separate
   from production secrets.

2. Authenticate to GitHub Container Registry if the packages are private:

   ```sh
   docker login ghcr.io
   ```

3. Pull and start the beta:

   ```sh
   docker compose -f docker-compose.beta.yml pull
   docker compose -f docker-compose.beta.yml up -d
   ```

The API is available on port `3002` by default. Override `FORMA_BETA_PORT` to
use another host port. The Flutter Web app is served by the Rust API image.

On the first start, the initializer runs the existing TypeScript migrations
only if `/app/data/body-tracker.db` does not exist in the isolated
`forma_beta_data` volume. If a beta database already exists, it checks
`user_version` read-only and requires version 10 or newer; it does not migrate
an existing beta database. Rust itself never migrates. The initializer has no
mount to the production volume. It is safe to start with an empty beta volume
and contains no preloaded user data.

Stop the beta while keeping beta data with:

```sh
docker compose -f docker-compose.beta.yml down
```

Do not add the production volume to this Compose file. `down -v` removes the
beta volume and its beta data.

## Build and publish

The `Build and Publish Rust Beta Images` GitHub Actions workflow runs on pushes
to `rust-dev-beta` and on manual dispatch. It checks Rust formatting and
compilation, then publishes multi-architecture backend and beta-initializer
images tagged `latest` and with the commit SHA. The existing production
workflow and production Compose image remain unchanged.

The branch and workflow must be pushed to GitHub before Actions can publish
the images. No production deployment is performed by this beta workflow.
