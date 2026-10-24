# Local development and deployment boundary

## Fastest safe start

```sh
npm ci
npm run demo:offline
```

Use Node22.13+ (within22),24.3+ (within24), or26+. The launcher builds `@suite/core`, `@suite/offline` and the demo web shell, then serves the build with the explicit ephemeral demo API. `npm run demo` remains the hot-reload development option; offline reopening needs the built shell. Visit `http://127.0.0.1:5178`. Ctrl-C stops both process groups. Fictional data resets on the next API start. The UI stores captured intents durably before attempting sync. Local-save acknowledgement is distinct from server acceptance. A previously downloaded authorized snapshot remains usable offline; a device without one must connect once. There is no generated-success fallback.

Demo roles are an inspection tool. They do not implement real account login. Never host the demo publicly or use it for business records. The real API entry point ignores demo identity headers.

For native setup and simulator/emulator commands read `apps/mobile/README.md`; use `npm run mobile:demo` alongside the API. Bundle checks: `npm run build:mobile` and `npm run build:mobile:demo`. Neither produces signed installable binaries.

## Desktop development and local packages

Keep the demo API running (`npm run dev:demo --workspace @suite/api`, after shared builds) and run `npm run desktop:demo` in another terminal. Screens are bundled locally, so the desktop shell does not need Vite. `npm run desktop` opens the separate setup-only variant. Default packaging commands: `npm run package:desktop:mac` and `npm run package:desktop:win`; append `:demo` for explicit fictional-demo packages. Outputs are ignored under `apps/desktop/artifacts/<mode>`. These local packages are unsigned and not notarized.

Run `npm run build:desktop:renderer` then `npm run build:desktop:demo` before `npm run test:desktop`; tests need both renderer variants and the staged demo shell. The test-only API models network loss without resetting its database. Tests use isolated temporary profiles; packaged apps ignore test profile overrides. Read `apps/desktop/README.md` before changing profiles, API transport or packaging.

## Real PostgreSQL development path (not yet live-verified)

`compose.yaml` creates a separate local database on loopback port 5439. It does not modify the existing Mac mini backend, domains or tunnels. Docker must be running; it was unavailable during initial inspection on 2026-10-23.

1. Copy `.env.example` to `.env`, set a local database-bootstrap password, and configure a separate restricted-runtime database URL. See `db/README.md` for the exact runtime grants. Do not commit `.env`.
2. Run `npm run db:start` when Docker is available.
3. Build core with `npm run build --workspace @suite/core`. Put the schema administrator URL in an ignored `.env.migrations` file as `DATABASE_URL`, then run `node --env-file=.env.migrations --import tsx apps/api/src/migrate.ts`. Do not reuse this administrator as the API account.
4. Provision a separate limited runtime role, membership and grants; test business isolation against that role. The local Compose bootstrap user is for development administration only.
5. Supply the real authentication issuer/audience and one supported verification mechanism. Validate it against the actual provider before enabling any live UI. The example hosts are placeholders.
6. Build the API with `npm run build --workspace @suite/api`, then run `node --env-file=.env apps/api/dist/server.js`. The frontend sign-in/onboarding flow remains to be implemented; a default web build shows setup information.

The migration/server commands above and `db/README.md` are provided for later integration; `verification.md` distinguishes the commands actually exercised from this unrun live-database procedure. The supplied database image is a development baseline. Production image pinning, backups/restore, permissions, monitoring, TLS/reverse proxy, bounded request rates and rollout/rollback are separate launch work.

## Useful checks

- `npm run check`: shared package build and workspace TypeScript checks.
- `npm test`: API/domain/authorization checks against embedded PostgreSQL plus durable-queue semantics using a serialized JSON store adapter.
- `npm run build`: shared packages, API and browser; default web build keeps local-demo identity disabled.
- `npm run build:demo`: explicitly demo-only browser build for local preview.
- `npm run test:e2e`: Chromium connected UI tests; installs require `npx playwright install chromium` once.

If a check fails, report the actual error and scope. Never record a written test as a passing test. PGlite can validate SQL and application paths, but it does not prove real network PostgreSQL behavior, locking under multiple connections or deployment readiness.

- `npm run test:offline`: built-shell reopening with network disabled, reload persistence, reconnect exactly once and pending completion.

## Requirements synchronization

The canonical product notes live in the Obsidian `business-suite` folder. A portable snapshot is checked into `docs/requirements` so another agent can review the project without access to this Mac's iCloud path.

```sh
node scripts/export-requirements.mjs '/absolute/path/to/obnotes/business-suite'
```

Run this only after coordinating with active documentation writers. The export includes only this product folder and records hashes, not credentials or the whole vault. Update canonical notes first, then export. Repository technical contracts and actual source/testing evidence remain distinct from product decisions.
