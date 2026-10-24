# Authenticated API container

This image runs the real Fastify API against a separately managed PostgreSQL database. It does not start a database, auth provider or demo, create users, seed a business, or run migrations on startup. Browser, Android/iOS and Windows/macOS clients are built separately. Client login and live synchronization remain unfinished; deploying the server does not enable those features.

`NOTE-010` deployed this image as `business_suite-business` on the existing Mac Docker host on 2026-10-24. Follow [the shared-host handoff](shared-backend.md) for that installation; the generic commands below explain image behavior and must not create a duplicate permanent service.

## Image contents

`Dockerfile` uses Node 22 on Debian slim, compiles `@suite/core` and `@suite/api`, and installs only their locked production dependencies in the final image. Expo, Electron, the browser renderer, TypeScript and test tools are excluded. PGlite and compiled fixture definitions remain because the current database/router modules import them, although the real server uses `pg` and never seeds fixtures. The executable demo entry point is excluded. Splitting those imports is a later image-size optimization.

The default image is `node:22.23.4-bookworm-slim`. Pin a reviewed manifest digest using the `NODE_IMAGE` build argument for releases, and rebuild after reviewing security updates. The lockfile fixes npm resolutions; the versioned base tag alone is not an immutable release identifier. No deployment credentials are build arguments or copied files. `.dockerignore` admits only server manifests, source and migrations.

From the repository root:

```sh
docker build --pull -t business-suite-api:local .
```

The final process runs as UID/GID 1000 with root-owned application files. Node is the direct container process and handles SIGTERM through the API's close hook. The image has no automatic update or migration behavior. Use a unique release tag and record the resulting image ID when deploying; retain the prior image for rollback.

## Required private configuration

Keep runtime and migration environment files outside source control and iCloud notes, with owner-only file permissions. `.env.example` documents names, not deployable credentials.

| Setting | Meaning |
|---|---|
| `DATABASE_URL` | Dedicated restricted runtime login and Business Suite database, using the PostgreSQL service hostname on the private Docker network |
| `API_HOST` | Image default `0.0.0.0`, necessary to accept requests from the gateway; exposure is controlled by Docker ports/network |
| `API_PORT` | Image default 4310 |
| `API_ALLOWED_ORIGINS` | Comma-separated exact browser origins; empty means no cross-origin browser access |
| `AUTH_ISSUER` | Exact issuer in this app's verified access tokens |
| `AUTH_AUDIENCE` | Expected token audience |
| `AUTH_JWKS_URL` **or** `AUTH_JWT_SECRET` | Exactly one verification method; shared secret is server-only and at least 32 bytes; remote JWKS requires HTTPS except explicit loopback development |

The API rejects a database login that is superuser, bypasses RLS, owns public tables, or inherits their owner's privileges. Memberships, enabled modules and grants are loaded from this database after JWT verification. Header-based demo identities never activate in this entry point. Auth identities still need explicit Suite user/membership/grant provisioning; an auth account alone grants no business access.

## Explicit migrations

Back up the target database before schema changes. Use the same image as the deployment with a separate migration environment file whose `DATABASE_URL` belongs to the schema administrator. This administrator must never be the API's runtime credential.

```sh
docker run --rm --network BACKEND_NETWORK \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --env-file /absolute/private/suite-migrations.env \
  business-suite-api:local node apps/api/dist/migrate.js
```

`BACKEND_NETWORK` is a placeholder: use the existing stack's inspected network name. Migrations are included under `/app/db/migrations`, preserving the compiled runner's relative path. The runner records checksums and serializes application. It creates no fixture identities or data. After migration, provision the restricted runtime login and grants described in [database setup](../db/README.md). New migration objects may require additional explicit grants.

## Standalone process on an existing Docker network

For a loopback-only operator check, after migration and provisioning:

```sh
docker run -d --name business-suite-api-check \
  --network BACKEND_NETWORK \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --env-file /absolute/private/suite-runtime.env \
  -p 127.0.0.1:4311:4310 \
  business-suite-api:local
```

Port 4311 is an example and must be checked for availability. A `DATABASE_URL` with `localhost` points inside this container, not to the host's PostgreSQL. Use the existing PostgreSQL service hostname. Do not mount the Docker socket or database volume into the API.

For the deployed shared host, the [generator adapter](../ops/lean-backend/README.md) provides the scoped Compose service and gateway route. It sets the private app environment, existing networks, `restart: unless-stopped`, `read_only: true`, dropped capabilities, `no-new-privileges`, and resource limits. It publishes no host port; the existing gateway owns HTTP ingress. Scope updates to the Suite API/auth services and preserve other applications, volumes, gateway routes and tunnel configuration. The [shared-host handoff](shared-backend.md) distinguishes actual deployment evidence from these generic commands.

## Health and operational boundaries

The image health check calls `/healthz` inside the container and requires `{ "status": "ok", "demo": false }`. The current shared-host Compose adapter overrides this with an HTTP-success check; the public smoke check separately verifies `demo:false`. Both are process-liveness checks, **not** ongoing PostgreSQL readiness, working login, record isolation, or backups. Verify those separately using authenticated requests and the real PostgreSQL tests. API startup checks the database role, but later database outages may leave liveness green while business requests fail.

Inspect container state without printing its environment or credentials. A failed-start log should be handled as potentially sensitive because driver errors can include operational connection details. Keep private test accounts, tokens, database URLs and backups out of reports and Git history.

Roll back code by restoring the prior image only when it remains compatible with the applied schema. Migrations have checksums and no automatic down path; a database restore requires a separately reviewed recovery operation. Removing an API container does not remove database data, and removing volumes is never part of a routine rollout.

The current deployment is development infrastructure on the Mac, not a production launch. Real client sign-in, full workflows, provider/email setup, operational rate limits, off-site recovery and a future VPS cutover retain their own acceptance work.
